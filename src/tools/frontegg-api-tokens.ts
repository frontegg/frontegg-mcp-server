/**
 * API-powered Frontegg API-token management tools (Category H).
 *
 * Three tools that call the real Frontegg Management API when vendor
 * credentials (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET) are provided:
 *
 *   frontegg_api_tokens_list    — list active API tokens for a tenant/user
 *   frontegg_api_tokens_create  — generate a new API token (returns secret once)
 *   frontegg_api_tokens_revoke  — DESTRUCTIVE: revoke an existing token
 *
 * Endpoint discovery (2026-05-11):
 *   - Vendor-level paths (/vendors/resources/api-tokens/v1,
 *     /vendors/api-tokens/v1, /vendor/api-tokens/v1) all return 404. There
 *     is no vendor-scoped API-tokens endpoint exposed to this MCP.
 *   - Tenant-level path /identity/resources/tenants/api-tokens/v1 works,
 *     but requires `frontegg-tenant-id` header. Vendor token is sufficient
 *     for authorization.
 *   - User-level path /identity/resources/users/api-tokens/v1 works, but
 *     requires both `frontegg-tenant-id` and `frontegg-user-id` headers.
 *   - Both create endpoints accept { description, roleIds[],
 *     expiresInMinutes? } and return { clientId, secret, ... } on 201.
 *     The `secret` is only returned at creation — subsequent list calls
 *     omit it.
 *
 * Security note: the `revoke` tool is destructive. Tokens revoked here can
 * break production integrations. There is no soft-undo. The smoke script
 * in scripts/smoke-category-h.ts guards revoke to only act on tokens whose
 * description starts with `mcp-smoke-`.
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

// Scope is either tenant-level (default) or user-level. Vendor-level is
// not supported by the Frontegg Management API at the paths we tested.
const ScopeEnum = z.enum(['tenant', 'user']);
type Scope = z.infer<typeof ScopeEnum>;

interface ApiTokenRecord {
  clientId?: string;
  description?: string;
  tenantId?: string;
  userId?: string | null;
  createdByUserId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  roleIds?: string[];
  expires?: string | null;
  // Only present on create response:
  secret?: string;
  [key: string]: unknown;
}

interface ScopeHeaders {
  path: string;
  headers: Record<string, string>;
}

/** Build the endpoint path + required scope headers for a given scope. */
function scopePath(scope: Scope, args: { tenantId?: string; userId?: string }): ScopeHeaders {
  if (scope === 'tenant') {
    if (!args.tenantId) {
      throw new Error('tenantId is required for scope="tenant".');
    }
    return {
      path: '/identity/resources/tenants/api-tokens/v1',
      headers: { 'frontegg-tenant-id': args.tenantId },
    };
  }
  // scope === 'user'
  if (!args.tenantId || !args.userId) {
    throw new Error('Both tenantId and userId are required for scope="user".');
  }
  return {
    path: '/identity/resources/users/api-tokens/v1',
    headers: {
      'frontegg-tenant-id': args.tenantId,
      'frontegg-user-id': args.userId,
    },
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const LIST_TOOL: McpTool = {
  name: 'frontegg_api_tokens_list',
  description:
    'List active Frontegg API tokens for a tenant (scope="tenant", default) or for a ' +
    'specific user (scope="user"). Returns metadata only — secrets are never disclosed by ' +
    'the list endpoint. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. ' +
    'Note: there is no vendor-scoped API-token endpoint exposed by Frontegg; this tool ' +
    'always queries tenant or user scope.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['tenant', 'user'],
        description: 'Token scope to list. Defaults to "tenant".',
      },
      tenantId: {
        type: 'string',
        description:
          'Tenant ID (UUID) the tokens belong to. Required for both scope="tenant" and ' +
          'scope="user".',
      },
      userId: {
        type: 'string',
        description: 'User ID (UUID). Required only when scope="user".',
      },
    },
    required: ['tenantId'],
  },
};

const ListArgsSchema = z.object({
  scope: ScopeEnum.optional(),
  tenantId: z.string().min(1, 'tenantId is required'),
  userId: z.string().optional(),
});

async function handleList(raw: unknown) {
  try {
    const args = ListArgsSchema.parse(raw);
    const scope: Scope = args.scope ?? 'tenant';
    const { path, headers } = scopePath(scope, { tenantId: args.tenantId, userId: args.userId });

    const tokens = await fronteggApi<ApiTokenRecord[]>({
      method: 'GET',
      path,
      headers,
    });

    const list = Array.isArray(tokens) ? tokens : [];
    if (list.length === 0) {
      return textResult(`# Frontegg API Tokens (${scope})\n\nNo tokens configured.`);
    }
    return textResult(
      `# Frontegg API Tokens (${scope})\n\n${list.length} token(s) returned.\n\n\`\`\`json\n${json(list)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const CREATE_TOOL: McpTool = {
  name: 'frontegg_api_tokens_create',
  description:
    'Generate a new Frontegg API token at tenant scope (default) or user scope. ' +
    'The response includes the token\'s `secret` — this is the ONLY time the secret is ' +
    'shown by the Frontegg API. Subsequent list calls return only metadata. Save the ' +
    'secret immediately on receipt. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. ' +
    'Security-sensitive: every token created here grants real API access until revoked.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['tenant', 'user'],
        description: 'Token scope. Defaults to "tenant".',
      },
      tenantId: {
        type: 'string',
        description: 'Tenant ID (UUID). Required for both scopes.',
      },
      userId: {
        type: 'string',
        description: 'User ID (UUID). Required only when scope="user".',
      },
      description: {
        type: 'string',
        description:
          'Human-readable label for the token. Surfaces in the Frontegg portal token list. ' +
          'Required.',
      },
      roleIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Role IDs to attach to the token. Determines the token\'s permissions. Required.',
      },
      expiresInMinutes: {
        type: 'number',
        description:
          'Optional token lifetime in minutes. Omit for a non-expiring token (the default).',
      },
    },
    required: ['tenantId', 'description', 'roleIds'],
  },
};

const CreateArgsSchema = z.object({
  scope: ScopeEnum.optional(),
  tenantId: z.string().min(1, 'tenantId is required'),
  userId: z.string().optional(),
  description: z.string().min(1, 'description is required'),
  roleIds: z.array(z.string().min(1)).min(1, 'At least one roleId is required'),
  expiresInMinutes: z.number().positive().optional(),
});

async function handleCreate(raw: unknown) {
  try {
    const args = CreateArgsSchema.parse(raw);
    const scope: Scope = args.scope ?? 'tenant';
    const { path, headers } = scopePath(scope, { tenantId: args.tenantId, userId: args.userId });

    const body: Record<string, unknown> = {
      description: args.description,
      roleIds: args.roleIds,
    };
    if (args.expiresInMinutes !== undefined) {
      body.expiresInMinutes = args.expiresInMinutes;
    }

    const created = await fronteggApi<ApiTokenRecord>({
      method: 'POST',
      path,
      headers,
      body,
    });

    if (!created || !created.clientId || !created.secret) {
      return textResult(
        `# API Token Created (${scope})\n\n` +
          `Token was created but the response was missing expected fields. ` +
          `Re-list tokens to confirm.\n\n\`\`\`json\n${json(created)}\n\`\`\``
      );
    }

    return textResult(
      `# API Token Created (${scope})\n\n` +
        `⚠️ **SAVE THE SECRET NOW — it will not be shown again.**\n\n` +
        `- Client ID: \`${created.clientId}\`\n` +
        `- Secret: \`${created.secret}\`\n` +
        `- Description: ${created.description ?? '(none)'}\n` +
        `- Roles: ${(created.roleIds ?? []).join(', ') || '(none)'}\n` +
        `- Expires: ${created.expires ?? 'never'}\n\n` +
        `Full response:\n\n\`\`\`json\n${json(created)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Revoke (DESTRUCTIVE)
// ---------------------------------------------------------------------------

const REVOKE_TOOL: McpTool = {
  name: 'frontegg_api_tokens_revoke',
  description:
    'Revoke (delete) a Frontegg API token by its client ID. **DESTRUCTIVE** — the token ' +
    'is immediately invalidated and cannot be restored. Any integrations using this token ' +
    'will break. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. Caller must ' +
    'explicitly opt in with confirm=true to avoid accidental revocation.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['tenant', 'user'],
        description: 'Scope of the token being revoked. Defaults to "tenant".',
      },
      tenantId: {
        type: 'string',
        description: 'Tenant ID (UUID) the token belongs to.',
      },
      userId: {
        type: 'string',
        description: 'User ID (UUID). Required only when scope="user".',
      },
      tokenId: {
        type: 'string',
        description:
          'The `clientId` of the token to revoke (NOT the secret). Find via ' +
          'frontegg_api_tokens_list.',
      },
      confirm: {
        type: 'boolean',
        description:
          'Must be set to true to authorize the destructive revoke. Required guard.',
      },
    },
    required: ['tenantId', 'tokenId', 'confirm'],
  },
};

const RevokeArgsSchema = z.object({
  scope: ScopeEnum.optional(),
  tenantId: z.string().min(1, 'tenantId is required'),
  userId: z.string().optional(),
  tokenId: z.string().min(1, 'tokenId is required'),
  confirm: z.boolean(),
});

async function handleRevoke(raw: unknown) {
  try {
    const args = RevokeArgsSchema.parse(raw);
    if (args.confirm !== true) {
      return textResult(
        '❌ Refusing to revoke: confirm=true must be passed explicitly. Revocation is ' +
          'destructive and cannot be undone.'
      );
    }
    const scope: Scope = args.scope ?? 'tenant';
    const { path, headers } = scopePath(scope, { tenantId: args.tenantId, userId: args.userId });

    await fronteggApi<void>({
      method: 'DELETE',
      path: `${path}/${encodeURIComponent(args.tokenId)}`,
      headers,
    });

    return textResult(
      `# API Token Revoked\n\n` +
        `Token \`${args.tokenId}\` revoked at ${scope} scope. Any clients using its secret ` +
        `will now receive 401s.`
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggApiTokensTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LIST_TOOL, handleList);
    registry.add(CREATE_TOOL, handleCreate);
    registry.add(REVOKE_TOOL, handleRevoke);

    this.logger.info('Registered 3 Frontegg API-tokens tools');
  }
}

// Exported for tests
export const _testables = {
  LIST_TOOL,
  CREATE_TOOL,
  REVOKE_TOOL,
  handleList,
  handleCreate,
  handleRevoke,
  ListArgsSchema,
  CreateArgsSchema,
  RevokeArgsSchema,
};
