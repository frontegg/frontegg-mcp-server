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

// Zod schema for the create-client-credentials tool arguments
const createClientCredentialsSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
    description: z.string().optional().describe("Description for the token"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Extra data that will be encoded as part of the JWT"),
    roleIds: z
      .array(z.string())
      .optional()
      .describe(
        "Array of role IDs to attach to the token. Either this or permissionIds must be provided, but not both."
      ),
    permissionIds: z
      .array(z.string())
      .optional()
      .describe(
        "Array of permission IDs to attach to the token. Either this or roleIds must be provided, but not both. roleIds will override permissionIds."
      ),
    expiresInMinutes: z
      .number()
      .min(1)
      .optional()
      .describe(
        "Token expiration time in minutes. If undefined, the token won't expire"
      ),
  })
  .strict();

type CreateClientCredentialsArgs = z.infer<
  typeof createClientCredentialsSchema
>;

// Function to register the create-client-credentials tool
export function registerCreateClientCredentialsTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "create-client-credentials",
    "Creates a new client credentials token in Frontegg.",
    createClientCredentialsSchema.shape,
    async (args: CreateClientCredentialsArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.CREATE_CLIENT_CREDENTIALS_TOKEN
      );

      // Construct Headers
      const headers = createBaseHeaders({
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      // Prepare the request body
      const body = {
        description: args.description,
        metadata: args.metadata,
        roleIds: args.roleIds,
        permissionIds: args.permissionIds,
        expiresInMinutes: args.expiresInMinutes,
      };

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        body,
        "create-client-credentials"
      );

      return formatToolResponse(response);
    }
  );
}
