/**
 * User session management tools (Category E).
 *
 * Three tools that wrap the Frontegg user-session endpoints. All three are
 * tenant + user scoped — Frontegg's session API requires both
 * `frontegg-tenant-id` and `frontegg-user-id` request headers on top of the
 * vendor bearer token, and the path is the impersonation alias `/me`.
 *
 *   frontegg_user_sessions_list       — GET    /identity/resources/users/sessions/v1/me
 *   frontegg_user_session_revoke      — DELETE /identity/resources/users/sessions/v1/me/{sessionId}
 *   frontegg_user_sessions_revoke_all — DELETE /identity/resources/users/sessions/v1/me/all
 *
 * The last two are DESTRUCTIVE: they immediately log the target user out of
 * every device that holds the named session(s). The tool descriptions and
 * the smoke harness both flag this. There is no soft-revoke / "warn" path.
 *
 * Endpoint discovery (2026-05-11):
 *
 *   The "obvious" vendor-scoped variants — `/users/sessions/v1/users/{uid}`,
 *   `/users/{uid}/sessions/v1`, `/users/v1/{uid}/sessions`, etc. — all 404.
 *   The route that exists is `/users/sessions/v1/me` and it identifies the
 *   target user via the `frontegg-user-id` header (a user-impersonation
 *   pattern Frontegg uses for the embedded portal). A `POST /revoke` variant
 *   with `{userId, sessionId?}` in the body also works but requires the same
 *   header, so we stick to the path-based variant for clarity and to keep
 *   one body shape per operation.
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
    return textResult(`Frontegg API error (${err.status}): ${err.message}`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(`Error: ${msg}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Build the tenant + user impersonation header pair. */
function scopeHeaders(tenantId: string, userId: string): Record<string, string> {
  return {
    'frontegg-tenant-id': tenantId,
    'frontegg-user-id': userId,
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** A row returned by Frontegg /users/sessions/v1/me. */
export interface UserSession {
  id: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt?: string | null;
  /** True for the session that issued the current request. */
  current?: boolean | null;
  /** Set when this session is an impersonation session. */
  impersonated?: unknown;
  [key: string]: unknown;
}

const ListArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
});

const RevokeOneArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
  sessionId: z.string().regex(UUID_RE, 'sessionId must be a UUID'),
});

const RevokeAllArgsSchema = z.object({
  userId: z.string().regex(UUID_RE, 'userId must be a UUID'),
  tenantId: z.string().regex(UUID_RE, 'tenantId must be a UUID'),
  confirm: z
    .literal(true)
    .describe(
      "Must be the literal boolean true. This is a destructive operation that kicks the user off all of their devices."
    ),
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const LIST_TOOL: McpTool = {
  name: 'frontegg_user_sessions_list',
  description:
    'List the active sessions for a single Frontegg user. Returns one row per ' +
    'session with session id, user agent, IP address, and creation timestamp. ' +
    'Requires both userId and tenantId (Frontegg sessions are tenant-scoped — ' +
    'the same user can have separate session sets per tenant). Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description:
          'Frontegg user id (UUID). Look this up with frontegg_users_list if you only have an email.',
      },
      tenantId: {
        type: 'string',
        description:
          "Frontegg tenant id (UUID) the user belongs to. The user's `tenantId` field on the users list response.",
      },
    },
    required: ['userId', 'tenantId'],
  },
};

const REVOKE_ONE_TOOL: McpTool = {
  name: 'frontegg_user_session_revoke',
  description:
    'DESTRUCTIVE. Revoke a single active session for a Frontegg user by session ' +
    "id. This immediately logs the user out of the device that holds that " +
    'session. List the user sessions first with frontegg_user_sessions_list to ' +
    'find the session id, then call this. After the revoke succeeds the tool ' +
    're-fetches the session list so the caller sees the new state.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Frontegg user id (UUID) whose session you are revoking.',
      },
      tenantId: {
        type: 'string',
        description: "Frontegg tenant id (UUID) the user belongs to.",
      },
      sessionId: {
        type: 'string',
        description:
          "The session id (UUID) to revoke. Returned in the `id` field of each row from frontegg_user_sessions_list.",
      },
    },
    required: ['userId', 'tenantId', 'sessionId'],
  },
};

const REVOKE_ALL_TOOL: McpTool = {
  name: 'frontegg_user_sessions_revoke_all',
  description:
    'DESTRUCTIVE. Revoke EVERY active session for a Frontegg user — mass logout. ' +
    "The user is immediately signed out of every device. Requires confirm: true " +
    'as an explicit safety. After the revoke the tool re-fetches the session ' +
    'list, which should be empty.',
  inputSchema: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'Frontegg user id (UUID) whose sessions should ALL be revoked.',
      },
      tenantId: {
        type: 'string',
        description: "Frontegg tenant id (UUID) the user belongs to.",
      },
      confirm: {
        type: 'boolean',
        enum: [true],
        description:
          'Must be the literal boolean true. Safety guard: without it the tool refuses to call the API. This is a destructive mass-logout.',
      },
    },
    required: ['userId', 'tenantId', 'confirm'],
  },
};

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleListSessions(raw: unknown) {
  try {
    const args = ListArgsSchema.parse(raw);
    const sessions = await fronteggApi<UserSession[]>({
      method: 'GET',
      path: '/identity/resources/users/sessions/v1/me',
      headers: scopeHeaders(args.tenantId, args.userId),
    });
    const rows = Array.isArray(sessions) ? sessions : [];
    if (rows.length === 0) {
      return textResult(
        `# Active Sessions\n\nUser \`${args.userId}\` has 0 active sessions in tenant \`${args.tenantId}\`.`
      );
    }
    return textResult(
      `# Active Sessions\n\nUser \`${args.userId}\` has ${rows.length} active session(s) in tenant \`${args.tenantId}\`.\n\n\`\`\`json\n${json(rows)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleRevokeSession(raw: unknown) {
  try {
    const args = RevokeOneArgsSchema.parse(raw);
    await fronteggApi<void>({
      method: 'DELETE',
      path: `/identity/resources/users/sessions/v1/me/${encodeURIComponent(args.sessionId)}`,
      headers: scopeHeaders(args.tenantId, args.userId),
    });
    // Re-GET so the caller sees concrete state.
    const remaining = await fronteggApi<UserSession[]>({
      method: 'GET',
      path: '/identity/resources/users/sessions/v1/me',
      headers: scopeHeaders(args.tenantId, args.userId),
    });
    const rows = Array.isArray(remaining) ? remaining : [];
    return textResult(
      `# Session Revoked\n\nRevoked session \`${args.sessionId}\` for user \`${args.userId}\`.\n\n` +
        `## Remaining sessions (${rows.length})\n\n\`\`\`json\n${json(rows)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

export async function handleRevokeAllSessions(raw: unknown) {
  try {
    const args = RevokeAllArgsSchema.parse(raw);
    // confirm:true is enforced by z.literal(true) above; this is defence-in-depth.
    if (args.confirm !== true) {
      return textResult(
        'Refusing to revoke all sessions without confirm:true. This is a destructive mass-logout.'
      );
    }
    await fronteggApi<void>({
      method: 'DELETE',
      path: '/identity/resources/users/sessions/v1/me/all',
      headers: scopeHeaders(args.tenantId, args.userId),
    });
    const remaining = await fronteggApi<UserSession[]>({
      method: 'GET',
      path: '/identity/resources/users/sessions/v1/me',
      headers: scopeHeaders(args.tenantId, args.userId),
    });
    const rows = Array.isArray(remaining) ? remaining : [];
    return textResult(
      `# All Sessions Revoked\n\nRevoked every active session for user \`${args.userId}\` in tenant \`${args.tenantId}\`.\n\n` +
        `## Remaining sessions (${rows.length})\n\n\`\`\`json\n${json(rows)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggUserSessionTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LIST_TOOL, handleListSessions);
    registry.add(REVOKE_ONE_TOOL, handleRevokeSession);
    registry.add(REVOKE_ALL_TOOL, handleRevokeAllSessions);

    this.logger.info('Registered 3 Frontegg user-session tools');
  }
}

// Exported for tests.
export const _internal = {
  LIST_TOOL,
  REVOKE_ONE_TOOL,
  REVOKE_ALL_TOOL,
  ListArgsSchema,
  RevokeOneArgsSchema,
  RevokeAllArgsSchema,
};
