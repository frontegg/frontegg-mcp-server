/**
 * Frontegg user-management tools.
 *
 *   frontegg_users_list   — page through tenant users with filter params
 *   frontegg_users_invite — invite a user by email (tenant-scoped, sends email)
 *
 * Endpoints (verified 2026-05-11 against api.frontegg.com with a vendor
 * token):
 *
 *   GET  /identity/resources/users/v3
 *     Returns paginated `{ _metadata, _links, items[] }`.
 *     Query params: _email, _filter (substring on name/email), _tenantId,
 *     _ids, _limit, _offset, _sortBy, _order, _includeSubTenants.
 *
 *   POST /identity/resources/users/v1
 *     Body: { email, name?, roleIds?, metadata?, skipInviteEmail? }
 *     REQUIRES headers `frontegg-tenant-id` AND `frontegg-application-id`
 *     (vendor token alone returns 403 with errorCode ER-00008). Application
 *     ID can be obtained from /applications/resources/applications/v1.
 *     Returns 201 with the created user JSON.
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

interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  verified?: boolean | null;
  provider?: string | null;
  mfaEnrolled?: boolean | null;
  tenantId?: string;
  tenantIds?: string[];
  isLocked?: boolean;
  createdAt?: string;
  [key: string]: unknown;
}

interface UsersListResponse {
  _metadata?: { totalItems?: number; totalPages?: number };
  _links?: Record<string, string>;
  items: UserSummary[];
}

// ---------------------------------------------------------------------------
// users_list
// ---------------------------------------------------------------------------

const USERS_LIST_TOOL: McpTool = {
  name: 'frontegg_users_list',
  description:
    'List users in the Frontegg vendor environment via the Management API. ' +
    'Supports filtering by email, tenant, free-text search, and pagination. ' +
    'Endpoint: GET /identity/resources/users/v3. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description:
          'Filter by exact email match (sent as `_email`). Useful for "does user X exist?".',
      },
      tenantId: {
        type: 'string',
        description:
          'Filter to users in a specific tenant (sent as `_tenantId`).',
      },
      filter: {
        type: 'string',
        description:
          'Free-text substring filter on name/email (sent as `_filter`).',
      },
      limit: {
        type: 'number',
        description:
          'Page size. Default 50 (Frontegg API). Maximum varies by tenant.',
      },
      offset: {
        type: 'number',
        description: 'Offset for pagination. Default 0.',
      },
      sortBy: {
        type: 'string',
        description: 'Field to sort by (e.g. "createdAt", "email", "name").',
      },
      order: {
        type: 'string',
        enum: ['ASC', 'DESC'],
        description: 'Sort order. Default DESC.',
      },
      includeSubTenants: {
        type: 'boolean',
        description:
          'When true, also include users from sub-tenants of the filtered tenant.',
      },
    },
  },
};

const UsersListArgsSchema = z.object({
  email: z.string().optional(),
  tenantId: z.string().optional(),
  filter: z.string().optional(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  sortBy: z.string().optional(),
  order: z.enum(['ASC', 'DESC']).optional(),
  includeSubTenants: z.boolean().optional(),
});

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export async function handleUsersList(raw: unknown) {
  try {
    const args = UsersListArgsSchema.parse(raw);
    const qs = buildQuery({
      _email: args.email,
      _tenantId: args.tenantId,
      _filter: args.filter,
      _limit: args.limit,
      _offset: args.offset,
      _sortBy: args.sortBy,
      _order: args.order,
      _includeSubTenants: args.includeSubTenants,
    });
    const data = await fronteggApi<UsersListResponse>({
      method: 'GET',
      path: `/identity/resources/users/v3${qs}`,
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    const summary = items.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name ?? null,
      verified: u.verified ?? null,
      provider: u.provider ?? null,
      mfaEnrolled: u.mfaEnrolled ?? null,
      isLocked: u.isLocked ?? null,
      tenantId: u.tenantId ?? null,
      createdAt: u.createdAt ?? null,
    }));
    const total = data?._metadata?.totalItems ?? items.length;
    const heading = `# Users (returned ${items.length} of ${total})`;
    return textResult(
      `${heading}\n\n\`\`\`json\n${json({
        metadata: data?._metadata ?? null,
        users: summary,
      })}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// users_invite
// ---------------------------------------------------------------------------

interface InvitedUser {
  id: string;
  email: string;
  name?: string;
  verified?: boolean | null;
  roles?: Array<{ id: string; key: string; name: string }>;
  createdAt?: string;
  [key: string]: unknown;
}

const USERS_INVITE_TOOL: McpTool = {
  name: 'frontegg_users_invite',
  description:
    'Invite a user to a tenant by email. Sends a Frontegg invitation email ' +
    'by default. ' +
    'Endpoint: POST /identity/resources/users/v1 (requires the tenant-scoped ' +
    'headers `frontegg-tenant-id` and `frontegg-application-id` — both are ' +
    'sent automatically from the tool arguments). ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Email address of the user to invite. Required.',
      },
      tenantId: {
        type: 'string',
        description:
          'Target tenant ID — the invitation will scope the user to this tenant. Required.',
      },
      applicationId: {
        type: 'string',
        description:
          'Frontegg application ID to attach the user to. Required. ' +
          'Get the value from frontegg_applications_list (Category B) or ' +
          'GET /applications/resources/applications/v1.',
      },
      name: {
        type: 'string',
        description:
          'Display name for the new user. Optional; defaults to the email address.',
      },
      roleIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Role IDs to assign on creation. Optional; defaults to the tenant default role (typically Admin).',
      },
      skipInviteEmail: {
        type: 'boolean',
        description:
          'When true, the user is created but no invitation email is sent. Default false.',
      },
      metadata: {
        type: 'object',
        description:
          'Free-form metadata to attach to the user. Optional.',
      },
    },
    required: ['email', 'tenantId', 'applicationId'],
  },
};

const UsersInviteArgsSchema = z.object({
  email: z.string().email(),
  tenantId: z.string().min(1),
  applicationId: z.string().min(1),
  name: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
  skipInviteEmail: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleUsersInvite(raw: unknown) {
  try {
    const args = UsersInviteArgsSchema.parse(raw);
    const body: Record<string, unknown> = { email: args.email };
    if (args.name !== undefined) body.name = args.name;
    if (args.roleIds !== undefined) body.roleIds = args.roleIds;
    if (args.skipInviteEmail !== undefined) body.skipInviteEmail = args.skipInviteEmail;
    if (args.metadata !== undefined) body.metadata = JSON.stringify(args.metadata);

    const created = await fronteggApi<InvitedUser>({
      method: 'POST',
      path: '/identity/resources/users/v1',
      body,
      headers: {
        'frontegg-tenant-id': args.tenantId,
        'frontegg-application-id': args.applicationId,
      },
    });
    return textResult(
      `# User Invited\n\nInvited **${args.email}** to tenant \`${args.tenantId}\`.\n\n\`\`\`json\n${json(created)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export const USERS_LIST_TOOL_DEF = USERS_LIST_TOOL;
export const USERS_INVITE_TOOL_DEF = USERS_INVITE_TOOL;

export class FronteggUsersTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(USERS_LIST_TOOL, handleUsersList);
    registry.add(USERS_INVITE_TOOL, handleUsersInvite);
    this.logger.info('Registered 2 Frontegg users tools');
  }
}
