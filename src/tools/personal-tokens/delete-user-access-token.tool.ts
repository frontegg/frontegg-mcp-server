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

// Zod schema based on Frontegg API for deleting a user access token
const deleteUserAccessTokenSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (frontegg-tenant-id header)"),
    userId: z
      .string()
      .describe("The user ID identifier (frontegg-user-id header)"),
    id: z
      .string()
      .describe("The ID of the access token to delete (path parameter)"),
  })
  .strict();

type DeleteUserAccessTokenArgs = z.infer<typeof deleteUserAccessTokenSchema>;

// Function to register the delete-user-access-token tool
export function registerDeleteUserAccessTokenTool(
  server: McpServer,
  fronteggToken: string | null, // Expecting an environment/admin token
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-user-access-token",
    "Deletes a specific Frontegg user access token by its ID.",
    deleteUserAccessTokenSchema.shape,
    async (args: DeleteUserAccessTokenArgs) => {
      const { fronteggTenantIdHeader, userId, id } = args;
      // The token ID is a path parameter
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.USER_ACCESS_TOKENS,
        id // Pass the token ID as the path parameter
      );

      const headers = createBaseHeaders(fronteggToken, {
        fronteggTenantIdHeader,
        userIdHeader: userId,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        headers,
        undefined, // No body for DELETE request
        "delete-user-access-token"
      );

      // Provide a custom success message for 204 No Content
      return formatToolResponse(
        response,
        "User access token deleted successfully."
      );
    }
  );
}
