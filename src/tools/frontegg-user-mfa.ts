/**
 * API-powered Frontegg per-user MFA admin tools.
 *
 * Three tools for managing MFA enrollment on a specific user:
 *
 *   frontegg_user_mfa_get      — read MFA enrollment + factors for a user
 *   frontegg_user_mfa_reset    — DESTRUCTIVE: clear a user's MFA enrollment
 *   frontegg_user_mfa_enforce  — force-require MFA on a specific user
 *
 * Endpoint discovery (2026-05-11, vendor-token probes against the real
 * Frontegg tenant from ~/Showcase/frontegg-api-creds.env):
 *
 *   GET  /identity/resources/users/v1/{userId}                 → 200 ✓
 *     Returns the full user record including `mfaEnrolled`,
 *     `phoneNumber`, `verified` — the only MFA-related fields a vendor
 *     token can see. Per-factor detail (TOTP secret, recovery codes,
 *     passkey credential IDs) is not exposed on any path we tested.
 *     Requires `frontegg-tenant-id` header.
 *
 *   POST /identity/resources/users/v1/mfa/disable              → 200 ✓
 *     Clears MFA enrollment for the user supplied via the
 *     `frontegg-user-id` header. Returns 400 "MFA is not enrolled"
 *     (errorCode ER-01097) when the user has no MFA. Empty JSON body.
 *
 *   No vendor-token endpoint for per-user force-MFA. Every candidate
 *   (`/users/v1/{id}/forceMfa`, `/users/v1/mfa/enforce`, `/users/v1/force-mfa`,
 *   `/users/mfa/v1/force-mfa`, `/users/v1/mfa/required`, etc.) returned
 *   404 or 403. The closest available knob is the **tenant-wide** MFA
 *   policy via `frontegg_configure_mfa` (`enforceMFAType: "Force"`),
 *   which forces MFA on every user in the tenant. The `*_enforce` tool
 *   below surfaces this limitation cleanly and points the LLM at the
 *   tenant-wide tool when per-user enforcement isn't available.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { fronteggApi, FronteggApiError } from './frontegg-api-client.js';
import { Logger } from '../utils/logger.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorResult(err: unknown) {
  if (err instanceof FronteggApiError) {
    return textResult(`❌ Frontegg API error (${err.status}): ${err.message}`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(`❌ Error: ${msg}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface FronteggUser {
  id: string;
  email: string;
  name?: string;
  verified?: boolean | null;
  phoneNumber?: string | null;
  mfaEnrolled?: boolean;
  isLocked?: boolean;
  provider?: string;
  tenantId?: string;
  tenantIds?: string[];
  lastLogin?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Pull the MFA-relevant slice out of a Frontegg user record. The vendor
 * token cannot read per-factor detail (TOTP secret / recovery codes /
 * passkey credential IDs) — `mfaEnrolled` + `phoneNumber` is everything
 * the management API exposes for a single user.
 */
function summariseMfa(user: FronteggUser) {
  return {
    userId: user.id,
    email: user.email,
    mfaEnrolled: user.mfaEnrolled ?? false,
    phoneNumber: user.phoneNumber ?? null,
    verified: user.verified ?? null,
    isLocked: user.isLocked ?? false,
    provider: user.provider ?? null,
    tenantId: user.tenantId ?? null,
    lastLogin: user.lastLogin ?? null,
  };
}

// ---------------------------------------------------------------------------
// frontegg_user_mfa_get
// ---------------------------------------------------------------------------

const GET_TOOL: McpTool = {
  name: 'frontegg_user_mfa_get',
  description:
    'Read a user\'s MFA enrollment status via the Frontegg Management API. ' +
    'Returns whether the user has MFA enrolled, their phone number (if SMS factor is set up), ' +
    'verification state, and lock status. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. ' +
    'KNOWN LIMITATION: vendor tokens cannot read per-factor detail (TOTP secret, recovery codes, ' +
    'passkey credential IDs) — the Frontegg Management API does not expose those endpoints to ' +
    'vendor-token callers. This tool returns the MFA enrollment flag and any phone number ' +
    'configured for SMS, which is everything the vendor surface offers.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Frontegg user UUID. Required.',
      },
      tenantId: {
        type: 'string',
        description:
          'Frontegg tenant UUID. Required — the GET-user endpoint is tenant-scoped and ' +
          'returns 403 without `frontegg-tenant-id`.',
      },
    },
    required: ['userId', 'tenantId'],
  },
};

const GetArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
});

async function handleGet(raw: unknown) {
  try {
    const args = GetArgsSchema.parse(raw);
    const user = await fronteggApi<FronteggUser>({
      method: 'GET',
      path: `/identity/resources/users/v1/${args.userId}`,
      headers: { 'frontegg-tenant-id': args.tenantId },
    });
    const summary = summariseMfa(user);
    return textResult(
      `# MFA Status for ${user.email}\n\n` +
        `\`\`\`json\n${json(summary)}\n\`\`\`\n\n` +
        `_Note: per-factor detail (TOTP secret, recovery codes, passkey IDs) is not exposed ` +
        `via the vendor-token surface. Only the \`mfaEnrolled\` flag and \`phoneNumber\` ` +
        `(SMS factor) are readable._`
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// frontegg_user_mfa_reset (destructive)
// ---------------------------------------------------------------------------

const RESET_TOOL: McpTool = {
  name: 'frontegg_user_mfa_reset',
  description:
    'DESTRUCTIVE: clear a user\'s MFA enrollment so they re-enroll on next sign-in. ' +
    'Use this when a user has lost their TOTP device or recovery codes and needs an admin to ' +
    'unlock them. Calls POST /identity/resources/users/v1/mfa/disable with the user supplied via ' +
    'the `frontegg-user-id` header. Returns 400 "MFA is not enrolled" cleanly if the user had no ' +
    'MFA configured. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET. After reset the tool re-reads ' +
    'the user record so the caller sees the post-reset state.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Frontegg user UUID whose MFA enrollment to clear. Required.',
      },
      tenantId: {
        type: 'string',
        description:
          'Frontegg tenant UUID. Required for the post-reset re-read of the user record.',
      },
    },
    required: ['userId', 'tenantId'],
  },
};

const ResetArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
});

async function handleReset(raw: unknown) {
  try {
    const args = ResetArgsSchema.parse(raw);

    let disableNote = '';
    try {
      await fronteggApi<unknown>({
        method: 'POST',
        path: '/identity/resources/users/v1/mfa/disable',
        body: {},
        headers: {
          'frontegg-user-id': args.userId,
          'frontegg-tenant-id': args.tenantId,
        },
      });
      disableNote = '✅ MFA enrollment cleared.';
    } catch (e) {
      // 400 ER-01097 "MFA is not enrolled" is an expected no-op outcome.
      if (e instanceof FronteggApiError && e.status === 400 && /MFA is not enrolled/i.test(e.message)) {
        disableNote = 'ℹ️ User had no MFA enrolled — nothing to reset.';
      } else {
        throw e;
      }
    }

    // Re-read so the LLM sees the concrete post-reset state.
    const user = await fronteggApi<FronteggUser>({
      method: 'GET',
      path: `/identity/resources/users/v1/${args.userId}`,
      headers: { 'frontegg-tenant-id': args.tenantId },
    });
    const summary = summariseMfa(user);

    return textResult(
      `# MFA Reset — ${user.email}\n\n${disableNote}\n\n` +
        `## Post-reset MFA state\n\n\`\`\`json\n${json(summary)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// frontegg_user_mfa_enforce
// ---------------------------------------------------------------------------

const ENFORCE_TOOL: McpTool = {
  name: 'frontegg_user_mfa_enforce',
  description:
    'Force-require MFA on a specific user. ' +
    'KNOWN LIMITATION: no Frontegg vendor-token endpoint exposes per-user MFA enforcement — ' +
    'every candidate path (/users/v1/{id}/forceMfa, /users/v1/mfa/enforce, /users/v1/mfa/required, ' +
    '/users/mfa/v1/force-mfa, etc.) returns 404 with a vendor token, mirroring the pattern we ' +
    'documented for configure_sessions. The closest available knob is the **tenant-wide** MFA ' +
    'policy via frontegg_configure_mfa (action="update", enforceMFAType="Force"), which forces ' +
    'MFA on every user in the tenant. This tool surfaces that limitation and points at the ' +
    'tenant-wide tool. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Frontegg user UUID to force-enable MFA on. Required (for the lookup + report).',
      },
      tenantId: {
        type: 'string',
        description: 'Frontegg tenant UUID. Required to look up the user record.',
      },
    },
    required: ['userId', 'tenantId'],
  },
};

const EnforceArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
});

async function handleEnforce(raw: unknown) {
  try {
    const args = EnforceArgsSchema.parse(raw);
    // Confirm the user exists so the caller gets a meaningful response
    // instead of a generic 404 from the missing per-user endpoint.
    const user = await fronteggApi<FronteggUser>({
      method: 'GET',
      path: `/identity/resources/users/v1/${args.userId}`,
      headers: { 'frontegg-tenant-id': args.tenantId },
    });

    return textResult(
      `# Per-user MFA enforcement — ${user.email}\n\n` +
        `⚠️ **Vendor-token-blocked.** No Frontegg Management API endpoint exposes per-user ` +
        `force-MFA to vendor-token callers. Every candidate path returns 404 — same pattern ` +
        `as the documented \`configure_sessions\` limitation.\n\n` +
        `## Workarounds\n\n` +
        `1. **Tenant-wide enforcement** — use \`frontegg_configure_mfa\` with ` +
        `\`action="update"\` and \`enforceMFAType="Force"\`. This forces MFA on every user in ` +
        `the tenant, not just this one.\n` +
        `2. **Portal admin action** — toggle force-MFA for this user via the Frontegg portal ` +
        `(Users → ${user.email} → MFA). The portal uses a tenant-scoped admin JWT, which the ` +
        `vendor-token-only MCP doesn't support yet.\n\n` +
        `## Current MFA state for this user\n\n\`\`\`json\n${json(summariseMfa(user))}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggUserMfaTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(GET_TOOL, handleGet);
    registry.add(RESET_TOOL, handleReset);
    registry.add(ENFORCE_TOOL, handleEnforce);

    this.logger.info('Registered 3 Frontegg user-MFA tools');
  }
}

// Exports for tests
export {
  handleGet as _handleGet,
  handleReset as _handleReset,
  handleEnforce as _handleEnforce,
  GET_TOOL as _GET_TOOL,
  RESET_TOOL as _RESET_TOOL,
  ENFORCE_TOOL as _ENFORCE_TOOL,
  GetArgsSchema as _GetArgsSchema,
  ResetArgsSchema as _ResetArgsSchema,
  EnforceArgsSchema as _EnforceArgsSchema,
};
