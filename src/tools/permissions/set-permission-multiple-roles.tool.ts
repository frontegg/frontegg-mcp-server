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
import { logger } from "../../utils/logger";

// Zod schema for setting roles to a permission
// Corresponds to "Set a permission to multiple roles" in Frontegg docs
const setPermissionToMultipleRolesSchema = z
  .object({
    permissionId: z
      .string()
      .describe("The ID of the permission to set roles for."),
    roleIds: z
      .array(z.string())
      .describe(
        "Array of role IDs to associate with the permission. This will override any existing roles."
      ),
  })
  .strict();

type SetPermissionToMultipleRolesArgs = z.infer<
  typeof setPermissionToMultipleRolesSchema
>;

export function registerSetPermissionToMultipleRolesTool(server: McpServer) {
  server.tool(
    "set-permission-to-multiple-roles",
    "Associates a permission with multiple roles using PUT /resources/permissions/v1/{permissionId}/roles. This replaces all existing roles for the permission.",
    setPermissionToMultipleRolesSchema.shape,
    async (args: SetPermissionToMultipleRolesArgs) => {
      const { permissionId, roleIds } = args;

      // Validation
      if (!permissionId) {
        logger.error(
          "[set-permission-to-multiple-roles] Error: permissionId is required."
        );
        return {
          content: [
            { type: "text", text: "Error: permissionId must be provided." },
          ],
        };
      }
      if (!roleIds) {
        logger.error(
          "[set-permission-to-multiple-roles] Error: roleIds are required."
        );
        return {
          content: [{ type: "text", text: "Error: roleIds must be provided." }],
        };
      }

      // Construct URL
      const apiUrl = buildFronteggUrl(
        `${FronteggEndpoints.PERMISSIONS}/${permissionId}/roles`
      );
      logger.debug("[set-permission-to-multiple-roles] API URL:", {
        url: apiUrl.toString(),
      });

      // Request body
      const body = { roleIds };

      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders({}),
        body,
        "set-permission-to-multiple-roles"
      );

      logger.debug("[set-permission-to-multiple-roles] Response received", {
        status: response.status,
      });
      return formatToolResponse(response);
    }
  );
}
