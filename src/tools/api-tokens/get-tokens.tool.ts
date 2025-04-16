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

// Zod schema for the get-tokens tool arguments, based on OpenAPI spec
const getTokensSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
  })
  .strict();

type GetTokensArgs = z.infer<typeof getTokensSchema>;

// Function to register the get-tokens tool
export function registerGetTokensTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "get-tokens",
    "Fetches all tenant access tokens from Frontegg.",
    getTokensSchema.shape, // Pass the schema shape
    async (args: GetTokensArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.TENANT_ACCESS_TOKENS
      );

      const headers = createBaseHeaders(fronteggToken, {
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined,
        "get-tokens"
      );

      return formatToolResponse(response);
    }
  );
}
