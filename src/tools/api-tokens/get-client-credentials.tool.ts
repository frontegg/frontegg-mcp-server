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

// Zod schema for the get-client-credentials tool arguments
const getClientCredentialsSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
  })
  .strict();

type GetClientCredentialsArgs = z.infer<typeof getClientCredentialsSchema>;

// Function to register the get-client-credentials tool
export function registerGetClientCredentialsTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "get-client-credentials",
    "Fetches all client credentials tokens for a tenant from Frontegg.",
    getClientCredentialsSchema.shape,
    async (args: GetClientCredentialsArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.CLIENT_CREDENTIALS_TOKENS
      );

      const headers = createBaseHeaders(fronteggToken, {
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined,
        "get-client-credentials"
      );

      return formatToolResponse(response);
    }
  );
}
