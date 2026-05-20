/**
 * Frontegg RBAC role tools.
 *
 *   frontegg_roles_list   — list roles defined for the vendor environment.
 *   frontegg_roles_create — create a new role (key + name required).
 *
 * Endpoints (verified 2026-05-11 against api.frontegg.com with a vendor token):
 *
 *   GET  /identity/resources/roles/v1
 *     Returns a flat JSON array of role objects with id, key, name,
 *     description, permissions (array of permission IDs), level, isDefault,
 *     firstUserRole.
 *
 *   POST /identity/resources/roles/v1
 *     IMPORTANT: the body must be a JSON **array** of role payloads, not a
 *     single object. With a single-object body the endpoint returns
 *     `{"errors":["Expected body to be an array"]}`. Returns 201 with the
 *     created role(s) as an array.
 *     Required fields per role: `key`, `name`. Optional: `description`,
 *     `permissions[]` (permission IDs, not keys), `isDefault`,
 *     `firstUserRole`, `level`.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { fronteggApi, FronteggApiError } from './frontegg-api-client.js';
import { Logger } from '../utils/logger.js';
import { z } from 'zod';

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

interface Role {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  firstUserRole?: boolean;
  permissions?: string[];
  level?: number;
  tenantId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// roles_list
// ---------------------------------------------------------------------------

const ROLES_LIST_TOOL: McpTool = {
  name: 'frontegg_roles_list',
  description:
    'List RBAC roles defined for the Frontegg vendor environment. ' +
    'Returns id, key, name, description, level, and permission IDs per role. ' +
    'Endpoint: GET /identity/resources/roles/v1. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleRolesList(_raw: unknown) {
  try {
    const roles = await fronteggApi<Role[]>({
      method: 'GET',
      path: '/identity/resources/roles/v1',
    });
    const arr = Array.isArray(roles) ? roles : [];
    const summary = arr.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description ?? null,
      isDefault: r.isDefault ?? false,
      firstUserRole: r.firstUserRole ?? false,
      level: r.level ?? null,
      permissionCount: Array.isArray(r.permissions) ? r.permissions.length : 0,
    }));
    return textResult(
      `# Roles (${summary.length})\n\n\`\`\`json\n${json(summary)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// roles_create
// ---------------------------------------------------------------------------

const ROLES_CREATE_TOOL: McpTool = {
  name: 'frontegg_roles_create',
  description:
    'Create a new RBAC role in the Frontegg vendor environment. ' +
    'Endpoint: POST /identity/resources/roles/v1 (body is wrapped as a single-element array, per Frontegg API contract). ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'Machine-readable role key (e.g. "support-engineer"). Unique per vendor. Required.',
      },
      name: {
        type: 'string',
        description: 'Human-readable role name. Required.',
      },
      description: {
        type: 'string',
        description: 'Optional role description.',
      },
      permissions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Permission IDs to grant. Use frontegg_roles_list (and the underlying ' +
          'permissions/v1 endpoint) to discover available IDs. Optional.',
      },
      level: {
        type: 'number',
        description:
          'Role precedence level (lower = more privileged). Optional; defaults to 0.',
      },
      isDefault: {
        type: 'boolean',
        description:
          'Whether new users in a tenant should receive this role by default.',
      },
      firstUserRole: {
        type: 'boolean',
        description:
          'Whether the first user in a tenant should receive this role automatically.',
      },
    },
    required: ['key', 'name'],
  },
};

const RolesCreateArgsSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  level: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  firstUserRole: z.boolean().optional(),
});

export async function handleRolesCreate(raw: unknown) {
  try {
    const args = RolesCreateArgsSchema.parse(raw);
    const payload: Record<string, unknown> = {
      key: args.key,
      name: args.name,
    };
    if (args.description !== undefined) payload.description = args.description;
    if (args.permissions !== undefined) payload.permissions = args.permissions;
    if (args.level !== undefined) payload.level = args.level;
    if (args.isDefault !== undefined) payload.isDefault = args.isDefault;
    if (args.firstUserRole !== undefined) payload.firstUserRole = args.firstUserRole;

    // Frontegg requires the body to be an array, even for a single role.
    const created = await fronteggApi<Role[]>({
      method: 'POST',
      path: '/identity/resources/roles/v1',
      body: [payload],
    });
    const role = Array.isArray(created) && created.length > 0 ? created[0] : created;
    return textResult(
      `# Role Created\n\nCreated role **${args.name}** (key: \`${args.key}\`).\n\n\`\`\`json\n${json(role)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

export const ROLES_LIST_TOOL_DEF = ROLES_LIST_TOOL;
export const ROLES_CREATE_TOOL_DEF = ROLES_CREATE_TOOL;

export class FronteggRolesTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(ROLES_LIST_TOOL, handleRolesList);
    registry.add(ROLES_CREATE_TOOL, handleRolesCreate);
    this.logger.info('Registered 2 Frontegg roles tools');
  }
}
