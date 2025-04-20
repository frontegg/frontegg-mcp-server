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

// Zod schema for the delete-token tool arguments, based on OpenAPI spec
const deleteTokenSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
    tokenId: z.string().describe("ID of the token to delete (required)"),
  })
  .strict();

type DeleteTokenArgs = z.infer<typeof deleteTokenSchema>;

// Function to register the delete-token tool
export function registerDeleteTokenTool(server: McpServer) {
  server.tool(
    "delete-token",
    "Deletes a tenant access token from Frontegg.",
    deleteTokenSchema.shape, // Pass the schema shape
    async (args: DeleteTokenArgs) => {
      const apiUrl = buildFronteggUrl(
        FronteggEndpoints.TENANT_ACCESS_TOKENS,
        args.tokenId
      );

      const headers = createBaseHeaders({
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        headers,
        undefined,
        "delete-token"
      );

      return formatToolResponse(response, "Token deleted successfully.");
    }
  );
}
