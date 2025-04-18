import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  FronteggEndpoints,
  formatToolResponse,
  HttpMethods,
} from "../../utils/api/frontegg-api";

// Zod schema for the delete-role tool arguments
const deleteRoleSchema = z
  .object({
    roleId: z.string().describe("The ID of the role to delete."), // Path parameter
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe("The tenant ID associated with the role, if applicable."), // Header
  })
  .strict();

type DeleteRoleArgs = z.infer<typeof deleteRoleSchema>;

// Function to register the delete-role tool
export function registerDeleteRoleTool(server: McpServer) {
  server.tool(
    "delete-role",
    "Deletes a specific role by its ID.",
    deleteRoleSchema.shape, // Pass the schema shape
    async (args: DeleteRoleArgs) => {
      const { roleId, fronteggTenantIdHeader } = args;

      // Build API URL using centralized utility
      const apiUrl = buildFronteggUrl(FronteggEndpoints.ROLES, roleId);

      // Using centralized fetch utility
      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        undefined,
        "delete-role"
      );

      // Use the generic formatToolResponse with custom 204 message
      return formatToolResponse(
        response,
        `Role with ID '${roleId}' successfully deleted.`
      );
    }
  );
}
