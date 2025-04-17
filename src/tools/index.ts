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
  fronteggToken: string,
  fronteggBaseUrl: string
): void {
  // Register Role Tools
  registerGetRolesTool(server, fronteggToken, fronteggBaseUrl);
  registerCreateRoleTool(server, fronteggToken, fronteggBaseUrl);
  registerDeleteRoleTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdateRoleTool(server, fronteggToken, fronteggBaseUrl);

  // Register Permission Tools
  registerGetPermissionsTool(server, fronteggToken, fronteggBaseUrl);
  registerCreatePermissionTool(server, fronteggToken, fronteggBaseUrl);
  registerDeletePermissionTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdatePermissionTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdatePermissionsBulkTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdatePermissionsClassificationTool(
    server,
    fronteggToken,
    fronteggBaseUrl
  );

  // Register Permission Category Tools
  registerGetPermissionCategoriesTool(server, fronteggToken, fronteggBaseUrl);
  registerCreatePermissionCategoryTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdatePermissionCategoryTool(server, fronteggToken, fronteggBaseUrl);
  registerDeletePermissionCategoryTool(server, fronteggToken, fronteggBaseUrl);

  //   // Register API Token Tools
  registerCreateTokenTool(server, fronteggToken, fronteggBaseUrl);
  registerGetTokensTool(server, fronteggToken, fronteggBaseUrl);
  registerDeleteTokenTool(server, fronteggToken, fronteggBaseUrl);

  // Register Client Credentials Token Tools
  registerGetClientCredentialsTool(server, fronteggToken, fronteggBaseUrl);
  registerDeleteClientCredentialsTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdateClientCredentialsTool(server, fronteggToken, fronteggBaseUrl);
  registerCreateClientCredentialsTool(server, fronteggToken, fronteggBaseUrl);

  // Register User Tools
  registerDeleteUserTool(server, fronteggToken, fronteggBaseUrl);
  registerGetUsersTool(server, fronteggToken, fronteggBaseUrl);
  registerInviteUserTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdateUserTool(server, fronteggToken, fronteggBaseUrl);

  // Register Application Tools
  registerGetUsersForApplicationTool(server, fronteggToken, fronteggBaseUrl);
  registerAssignUsersToApplicationTool(server, fronteggToken, fronteggBaseUrl);

  // // Register Tenant Tools
  registerCreateTenantTool(server, fronteggToken, fronteggBaseUrl);
  registerDeleteTenantTool(server, fronteggToken, fronteggBaseUrl);
  registerUpdateTenantTool(server, fronteggToken, fronteggBaseUrl);

  // Add other tools/resources here by importing and calling their registration functions
}
