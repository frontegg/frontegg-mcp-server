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

// Zod schema based on Frontegg API for getting user access tokens
const getUserAccessTokensSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (frontegg-tenant-id header)"),
    userId: z
      .string()
      .describe("The user ID identifier (frontegg-user-id header)"),
  })
  .strict();

type GetUserAccessTokensArgs = z.infer<typeof getUserAccessTokensSchema>;

// Function to register the get-user-access-tokens tool
export function registerGetUserAccessTokensTool(server: McpServer) {
  server.tool(
    "get-user-access-tokens",
    "Fetches Frontegg user access tokens.",
    getUserAccessTokensSchema.shape,
    async (args: GetUserAccessTokensArgs) => {
      const { fronteggTenantIdHeader, userId } = args;
      const apiUrl = buildFronteggUrl(FronteggEndpoints.USER_ACCESS_TOKENS);

      const headers = createBaseHeaders({
        fronteggTenantIdHeader,
        userIdHeader: userId,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined, // No body for GET request
        "get-user-access-tokens"
      );

      return formatToolResponse(response);
    }
  );
}
