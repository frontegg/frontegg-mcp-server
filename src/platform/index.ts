/**
 * Frontegg platform-MCP tools (upstream surface).
 *
 * 49 tools sourced from frontegg/frontegg-mcp-server. Registered here as a
 * single bundle alongside the mobile/audit tools defined elsewhere in this
 * server. Tool names preserve upstream's kebab-case (get-users, create-role,
 * etc.) for compatibility with anyone who has built integrations against the
 * upstream server.
 *
 * Auth: shares the same FRONTEGG_CLIENT_ID + FRONTEGG_API_KEY (or
 * FRONTEGG_SECRET_KEY) env-var pair as the rest of this MCP. See
 * platform/auth.ts for details.
 *
 * Naming convention note: the mobile/audit tools (defined under
 * src/tools/frontegg-*.ts) use snake_case with a `frontegg_` prefix, while
 * these platform tools use upstream's kebab-case. We accept that
 * inconsistency in v1 in exchange for not breaking any existing client
 * integrations on either surface. A future v2 may unify.
 */

import { McpServer } from "./sdk-compat.js";

import {
  registerCreateRoleTool,
  registerGetRolesTool,
  registerDeleteRoleTool,
  registerUpdateRoleTool,
  registerSetPermissionsToRoleTool,
} from "./tools/roles/index.js";

import {
  registerGetPermissionsTool,
  registerCreatePermissionTool,
  registerDeletePermissionTool,
  registerUpdatePermissionTool,
  registerGetPermissionCategoriesTool,
  registerCreatePermissionCategoryTool,
  registerUpdatePermissionCategoryTool,
  registerDeletePermissionCategoryTool,
  registerSetPermissionToMultipleRolesTool,
  registerSetPermissionsClassificationTool,
} from "./tools/permissions/index.js";

import {
  registerCreateTokenTool,
  registerGetTokensTool,
  registerDeleteTokenTool,
  registerGetClientCredentialsTool,
  registerDeleteClientCredentialsTool,
  registerUpdateClientCredentialsTool,
  registerCreateClientCredentialsTool,
} from "./tools/api-tokens/index.js";

import {
  registerGetVendorIntegrationsTool,
  registerCreateVendorIntegrationTool,
  registerUpdateVendorIntegrationTool,
  registerDeleteVendorIntegrationTool,
  registerAssignAgentsToVendorIntegrationTool,
  registerUnassignAgentsFromVendorIntegrationTool,
} from "./tools/vendor-integrations/index.js";

import {
  registerGetFronteggIntegrationsTool,
  registerGetFronteggIntegrationTool,
} from "./tools/frontegg-integrations/index.js";

import {
  registerDeleteUserTool,
  registerGetUsersTool,
  registerInviteUserTool,
  registerUpdateUserTool,
} from "./tools/users/index.js";

import {
  registerGetUsersForApplicationTool,
  registerAssignUsersToApplicationTool,
  registerGetApplicationsTool,
  registerGetAgentApplicationsTool,
  registerCreateAgentApplicationTool,
  registerUpdateAgentApplicationTool,
} from "./tools/applications/index.js";

import {
  registerGetUserAccessTokensTool,
  registerCreateUserAccessTokenTool,
  registerDeleteUserAccessTokenTool,
  registerGetUserApiTokensTool,
  registerCreateUserApiTokenTool,
  registerDeleteUserApiTokenTool,
} from "./tools/personal-tokens/index.js";

import {
  registerCreateTenantTool,
  registerDeleteTenantTool,
  registerUpdateTenantTool,
} from "./tools/tenants/index.js";

export function registerPlatformTools(server: McpServer): void {
  // Roles (5)
  registerGetRolesTool(server);
  registerCreateRoleTool(server);
  registerDeleteRoleTool(server);
  registerUpdateRoleTool(server);
  registerSetPermissionsToRoleTool(server);

  // Permissions (10)
  registerGetPermissionsTool(server);
  registerCreatePermissionTool(server);
  registerDeletePermissionTool(server);
  registerUpdatePermissionTool(server);
  registerSetPermissionToMultipleRolesTool(server);
  registerSetPermissionsClassificationTool(server);
  registerGetPermissionCategoriesTool(server);
  registerCreatePermissionCategoryTool(server);
  registerUpdatePermissionCategoryTool(server);
  registerDeletePermissionCategoryTool(server);

  // API Tokens (3 vendor + 4 client-credentials)
  registerCreateTokenTool(server);
  registerGetTokensTool(server);
  registerDeleteTokenTool(server);
  registerGetClientCredentialsTool(server);
  registerDeleteClientCredentialsTool(server);
  registerUpdateClientCredentialsTool(server);
  registerCreateClientCredentialsTool(server);

  // Vendor Integrations (6)
  registerGetVendorIntegrationsTool(server);
  registerCreateVendorIntegrationTool(server);
  registerUpdateVendorIntegrationTool(server);
  registerDeleteVendorIntegrationTool(server);
  registerAssignAgentsToVendorIntegrationTool(server);
  registerUnassignAgentsFromVendorIntegrationTool(server);

  // Frontegg Integrations (2)
  registerGetFronteggIntegrationsTool(server);
  registerGetFronteggIntegrationTool(server);

  // Users (4)
  registerDeleteUserTool(server);
  registerGetUsersTool(server);
  registerInviteUserTool(server);
  registerUpdateUserTool(server);

  // Applications (6)
  registerGetUsersForApplicationTool(server);
  registerAssignUsersToApplicationTool(server);
  registerGetApplicationsTool(server);
  registerGetAgentApplicationsTool(server);
  registerCreateAgentApplicationTool(server);
  registerUpdateAgentApplicationTool(server);

  // Personal Tokens (6)
  registerGetUserAccessTokensTool(server);
  registerCreateUserAccessTokenTool(server);
  registerDeleteUserAccessTokenTool(server);
  registerGetUserApiTokensTool(server);
  registerCreateUserApiTokenTool(server);
  registerDeleteUserApiTokenTool(server);

  // Tenants (3 — create/update/delete; list lives on the mobile-MCP surface)
  registerCreateTenantTool(server);
  registerDeleteTenantTool(server);
  registerUpdateTenantTool(server);
}

/**
 * Canonical list of platform tool names. Kept in sync with the registrations
 * above. Exported so the skill-linter and any external tooling can reference
 * the authoritative list rather than re-scraping registration code.
 */
export const PLATFORM_TOOL_NAMES = [
  // roles
  "get-roles",
  "create-role",
  "delete-role",
  "update-role",
  "set-permissions-to-role",
  // permissions
  "get-permissions",
  "create-permission",
  "delete-permission",
  "update-permission",
  "set-permission-to-multiple-roles",
  "set-permissions-classification",
  "get-permission-categories",
  "create-permission-category",
  "update-permission-category",
  "delete-permission-category",
  // api-tokens
  "create-token",
  "get-tokens",
  "delete-token",
  "get-client-credentials",
  "delete-client-credentials",
  "update-client-credentials",
  "create-client-credentials",
  // vendor-integrations
  "get-vendor-integrations",
  "create-vendor-integration",
  "update-vendor-integration",
  "delete-vendor-integration",
  "assign-agents-to-vendor-integration",
  "unassign-agents-from-vendor-integration",
  // frontegg-integrations
  "get-frontegg-integrations",
  "get-frontegg-integration",
  // users
  "delete-user",
  "get-users",
  "invite-user",
  "update-user",
  // applications
  "get-users-for-application",
  "assign-users-to-application",
  "get-applications",
  "get-agent-applications",
  "create-agent-application",
  "update-agent-application",
  // personal-tokens
  "get-user-access-tokens",
  "create-user-access-token",
  "delete-user-access-token",
  "get-user-api-tokens",
  "create-user-api-token",
  "delete-user-api-token",
  // tenants
  "create-tenant",
  "delete-tenant",
  "update-tenant",
] as const;
