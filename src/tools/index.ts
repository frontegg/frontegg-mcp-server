import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Import role tool registration functions
import {
  registerCreateRoleTool,
  registerGetRolesTool,
  registerDeleteRoleTool,
  registerUpdateRoleTool,
  registerSetPermissionsToRoleTool,
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
  registerGetApplicationsTool,
} from "./applications";

// Import tenant tool registration functions
import {
  registerCreateTenantTool,
  registerDeleteTenantTool,
  registerUpdateTenantTool,
} from "./tenants";

export function registerAllTools(server: McpServer): void {
  // Register Role Tools
  registerGetRolesTool(server);
  registerCreateRoleTool(server);
  registerDeleteRoleTool(server);
  registerUpdateRoleTool(server);
  registerSetPermissionsToRoleTool(server);

  // Register Permission Tools
  registerGetPermissionsTool(server);
  registerCreatePermissionTool(server);
  registerDeletePermissionTool(server);
  registerUpdatePermissionTool(server);
  registerUpdatePermissionsBulkTool(server);
  registerUpdatePermissionsClassificationTool(server);

  // Register Permission Category Tools
  registerGetPermissionCategoriesTool(server);
  registerCreatePermissionCategoryTool(server);
  registerUpdatePermissionCategoryTool(server);
  registerDeletePermissionCategoryTool(server);

  //   // Register API Token Tools
  registerCreateTokenTool(server);
  registerGetTokensTool(server);
  registerDeleteTokenTool(server);

  // Register Client Credentials Token Tools
  registerGetClientCredentialsTool(server);
  registerDeleteClientCredentialsTool(server);
  registerUpdateClientCredentialsTool(server);
  registerCreateClientCredentialsTool(server);

  // Register User Tools
  registerDeleteUserTool(server);
  registerGetUsersTool(server);
  registerInviteUserTool(server);
  registerUpdateUserTool(server);

  // Register Application Tools
  registerGetUsersForApplicationTool(server);
  registerAssignUsersToApplicationTool(server);
  registerGetApplicationsTool(server);

  // // Register Tenant Tools
  registerCreateTenantTool(server);
  registerDeleteTenantTool(server);
  registerUpdateTenantTool(server);

  // Add other tools/resources here by importing and calling their registration functions
}
