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

// Zod schema for the delete-client-credentials tool arguments
const deleteClientCredentialsSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
    tokenId: z.string().describe("ID of the token to delete (required)"),
  })
  .strict();

type DeleteClientCredentialsArgs = z.infer<
  typeof deleteClientCredentialsSchema
>;

// Function to register the delete-client-credentials tool
export function registerDeleteClientCredentialsTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-client-credentials",
    "Deletes a client credentials token from Frontegg.",
    deleteClientCredentialsSchema.shape,
    async (args: DeleteClientCredentialsArgs) => {
      const { fronteggTenantIdHeader, tokenId } = args;

      // Construct URL
      const url = buildFronteggUrl(
        fronteggBaseUrl,
        `${FronteggEndpoints.CLIENT_CREDENTIALS_TOKENS}/${tokenId}`
      );

      const headers = createBaseHeaders(fronteggToken, {
        fronteggTenantIdHeader,
      });

      // Make API Call
      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        url,
        headers,
        undefined,
        "delete-client-credentials"
      );

      return formatToolResponse(
        response,
        "Client credentials token deleted successfully."
      );
    }
  );
}
