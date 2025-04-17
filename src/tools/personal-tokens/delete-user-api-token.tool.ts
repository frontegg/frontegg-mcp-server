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

// Zod schema based on Frontegg API for deleting a user API token (client credentials)
const deleteUserApiTokenSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (frontegg-tenant-id header)"),
    userId: z
      .string()
      .describe("The user ID identifier (frontegg-user-id header)"),
    id: z
      .string()
      .describe("The ID of the API token to delete (path parameter)"),
  })
  .strict();

type DeleteUserApiTokenArgs = z.infer<typeof deleteUserApiTokenSchema>;

// Function to register the delete-user-api-token tool
export function registerDeleteUserApiTokenTool(
  server: McpServer,
  fronteggToken: string | null, // Expecting an environment/admin token
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-user-api-token",
    "Deletes a specific Frontegg user API token (client credentials token) by its ID.",
    deleteUserApiTokenSchema.shape,
    async (args: DeleteUserApiTokenArgs) => {
      const { fronteggTenantIdHeader, userId, id } = args;
      // The token ID is a path parameter
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.USER_API_TOKENS, // Using the correct endpoint
        id // Pass the token ID as the path parameter
      );

      const headers = createBaseHeaders({
        fronteggTenantIdHeader,
        userIdHeader: userId,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        headers,
        undefined, // No body for DELETE request
        "delete-user-api-token"
      );

      // Provide a custom success message for 204 No Content
      return formatToolResponse(
        response,
        "User API token deleted successfully."
      );
    }
  );
}
