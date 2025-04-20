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

// Zod schema for the create-token tool arguments, based on OpenAPI spec
const createTokenSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (required)"),
    description: z.string().optional().describe("Description for the token"),
    expiresInMinutes: z
      .number()
      .min(1)
      .optional()
      .describe(
        "Token expiration time in minutes. If undefined, the token won't expire"
      ),
    roleIds: z
      .array(z.string())
      .optional()
      .describe("Array of role IDs to attach to the token"),
  })
  .strict();

type CreateTokenArgs = z.infer<typeof createTokenSchema>;

// Function to register the create-token tool
export function registerCreateTokenTool(server: McpServer) {
  server.tool(
    "create-token",
    "Creates a new tenant access token in Frontegg.",
    createTokenSchema.shape, // Pass the schema shape
    async (args: CreateTokenArgs) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.TENANT_ACCESS_TOKENS);

      const headers = createBaseHeaders({
        fronteggTenantIdHeader: args.fronteggTenantIdHeader,
      });

      // Prepare the request body
      const body = {
        description: args.description,
        expiresInMinutes: args.expiresInMinutes,
        roleIds: args.roleIds,
      };

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        body,
        "create-token"
      );

      return formatToolResponse(response);
    }
  );
}
