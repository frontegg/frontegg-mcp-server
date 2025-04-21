import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from "../../utils/api/frontegg-api";

// Zod schema for the set-permissions-to-role tool arguments
const setPermissionsToRoleSchema = z
  .object({
    roleId: z.string().describe("The ID of the role to set permissions for."), // Path parameter
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional Tenant ID to associate the role with. If provided, it will be used in the request header."
      ),
    permissionIds: z
      .array(z.string())
      .describe(
        "Array of permission IDs to attach to the role. This will override any existing permissions."
      ),
  })
  .strict();

type SetPermissionsToRoleArgs = z.infer<typeof setPermissionsToRoleSchema>;

// Function to register the set-permissions-to-role tool
export function registerSetPermissionsToRoleTool(server: McpServer) {
  server.tool(
    "set-permissions-to-role",
    "Assigns permissions to a role. This will replace all existing permissions for the role with the new set.",
    setPermissionsToRoleSchema.shape, // Pass the schema shape
    async (args: SetPermissionsToRoleArgs) => {
      const { roleId, fronteggTenantIdHeader, permissionIds } = args;

      // Prepare the request body
      const requestBody = {
        permissionIds,
      };

      // Build API URL using centralized utility
      const apiUrl = buildFronteggUrl(
        `${FronteggEndpoints.ROLES}/${roleId}/permissions`
      );

      // Using centralized fetch utility
      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        requestBody,
        "set-permissions-to-role"
      );

      return formatToolResponse(
        response,
        `Permissions successfully assigned to role with ID '${roleId}'.`
      );
    }
  );
}
