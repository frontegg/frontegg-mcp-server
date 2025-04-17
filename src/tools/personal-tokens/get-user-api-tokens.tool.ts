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

// Zod schema based on Frontegg API for getting user API tokens (client credentials)
const getUserApiTokensSchema = z
  .object({
    tenantId: z
      .string()
      .describe("The tenant ID identifier (frontegg-tenant-id header)"),
    userId: z
      .string()
      .describe("The user ID identifier (frontegg-user-id header)"),
  })
  .strict();

type GetUserApiTokensArgs = z.infer<typeof getUserApiTokensSchema>;

// Function to register the get-user-api-tokens tool
export function registerGetUserApiTokensTool(
  server: McpServer,
  
  fronteggBaseUrl: string
) {
  server.tool(
    "get-user-api-tokens",
    "Fetches Frontegg user API tokens (client credentials tokens).",
    getUserApiTokensSchema.shape,
    async (args: GetUserApiTokensArgs) => {
      const { tenantId, userId } = args;
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.USER_API_TOKENS // Using the correct endpoint
      );

      // Headers require tenantId and userId
      const headers = createBaseHeaders({
        fronteggTenantIdHeader: tenantId,
        userIdHeader: userId,
      }) as Record<string, string>;

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined, // No body for GET request
        "get-user-api-tokens"
      );

      return formatToolResponse(response);
    }
  );
}
