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

// Zod schema for the update-client-credentials tool arguments
const updateClientCredentialsSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
    tokenId: z.string().describe("ID of the token to update (required)"),
    description: z.string().optional().describe("Description for the token"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Extra data that will be encoded as part of the JWT"),
    roleIds: z
      .array(z.string())
      .optional()
      .describe("Array of role IDs to attach to the token"),
    permissionIds: z
      .array(z.string())
      .optional()
      .describe("Array of permission IDs to attach to the token"),
  })
  .strict();

type UpdateClientCredentialsArgs = z.infer<
  typeof updateClientCredentialsSchema
>;

// Function to register the update-client-credentials tool
export function registerUpdateClientCredentialsTool(server: McpServer) {
  server.tool(
    "update-client-credentials",
    "Updates a client credentials token in Frontegg.",
    updateClientCredentialsSchema.shape,
    async (args: UpdateClientCredentialsArgs) => {
      const apiUrl = buildFronteggUrl(
        FronteggEndpoints.CLIENT_CREDENTIALS_TOKENS,
        args.tokenId
      );

      const headers = createBaseHeaders({
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      // Prepare the request body
      const body = {
        description: args.description,
        metadata: args.metadata,
        roleIds: args.roleIds,
        permissionIds: args.permissionIds,
      };

      const response = await fetchFromFrontegg(
        HttpMethods.PATCH,
        apiUrl,
        headers,
        body,
        "update-client-credentials"
      );

      return formatToolResponse(response);
    }
  );
}
