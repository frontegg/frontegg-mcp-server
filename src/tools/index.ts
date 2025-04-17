import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Import role tool registration functions
import {
  registerCreateRoleTool,
  registerGetRolesTool,
  registerDeleteRoleTool,
  registerUpdateRoleTool,
} from "./roles";

// Import permission tool registration functions
import {
  registerGetPermissionsTool,
  registerCreatePermissionTool,
  registerDeletePermissionTool,
  registerUpdatePermissionTool,
  registerUpdatePermissionsBulkTool,
  registerUpdatePermissionsClassificationTool,
  registerGetPermissionCategoriesTool,
  registerCreatePermissionCategoryTool,
  registerUpdatePermissionCategoryTool,
  registerDeletePermissionCategoryTool,
} from "./permissions";

// Import API token tool registration functions
import {
  registerCreateTokenTool,
  registerGetTokensTool,
  registerDeleteTokenTool,
  registerGetClientCredentialsTool,
  registerDeleteClientCredentialsTool,
  registerUpdateClientCredentialsTool,
  registerCreateClientCredentialsTool,
} from "./api-tokens";

// Import user tool registration functions
import {
  registerDeleteUserTool,
  registerGetUsersTool,
  registerInviteUserTool,
  registerUpdateUserTool,
} from "./users";

// Import application tool registration functions
import {
  registerGetUsersForApplicationTool,
  registerAssignUsersToApplicationTool,
} from "./applications";

// Import tenant tool registration functions
import {
  registerCreateTenantTool,
  registerDeleteTenantTool,
  registerUpdateTenantTool,
} from "./tenants";

export function registerAllTools(
  server: McpServer,
  fronteggBaseUrl: string
): void {
  // Register Role Tools
  registerGetRolesTool(server, fronteggBaseUrl);
  registerCreateRoleTool(server, fronteggBaseUrl);
  registerDeleteRoleTool(server, fronteggBaseUrl);
  registerUpdateRoleTool(server, fronteggBaseUrl);

  // Register Permission Tools
  registerGetPermissionsTool(server, fronteggBaseUrl);
  registerCreatePermissionTool(server, fronteggBaseUrl);
  registerDeletePermissionTool(server, fronteggBaseUrl);
  registerUpdatePermissionTool(server, fronteggBaseUrl);
  registerUpdatePermissionsBulkTool(server, fronteggBaseUrl);
  registerUpdatePermissionsClassificationTool(server, fronteggBaseUrl);

  // Register Permission Category Tools
  registerGetPermissionCategoriesTool(server, fronteggBaseUrl);
  registerCreatePermissionCategoryTool(server, fronteggBaseUrl);
  registerUpdatePermissionCategoryTool(server, fronteggBaseUrl);
  registerDeletePermissionCategoryTool(server, fronteggBaseUrl);

  //   // Register API Token Tools
  registerCreateTokenTool(server, fronteggBaseUrl);
  registerGetTokensTool(server, fronteggBaseUrl);
  registerDeleteTokenTool(server, fronteggBaseUrl);

  // Register Client Credentials Token Tools
  registerGetClientCredentialsTool(server, fronteggBaseUrl);
  registerDeleteClientCredentialsTool(server, fronteggBaseUrl);
  registerUpdateClientCredentialsTool(server, fronteggBaseUrl);
  registerCreateClientCredentialsTool(server, fronteggBaseUrl);

  // Register User Tools
  registerDeleteUserTool(server, fronteggBaseUrl);
  registerGetUsersTool(server, fronteggBaseUrl);
  registerInviteUserTool(server, fronteggBaseUrl);
  registerUpdateUserTool(server, fronteggBaseUrl);

  // Register Application Tools
  registerGetUsersForApplicationTool(server, fronteggBaseUrl);
  registerAssignUsersToApplicationTool(server, fronteggBaseUrl);

  // // Register Tenant Tools
  registerCreateTenantTool(server, fronteggBaseUrl);
  registerDeleteTenantTool(server, fronteggBaseUrl);
  registerUpdateTenantTool(server, fronteggBaseUrl);

  // Add other tools/resources here by importing and calling their registration functions
}
