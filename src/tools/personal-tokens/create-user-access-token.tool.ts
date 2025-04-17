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

// Zod schema based on Frontegg API for creating a user access token
const createUserAccessTokenSchema = z
  .object({
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID identifier (frontegg-tenant-id header)"),
    userId: z
      .string()
      .describe("The user ID identifier (frontegg-user-id header)"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the token"),
    expiresInMinutes: z
      .number()
      .min(1)
      .optional()
      .describe(
        "Optional token expiration time in minutes. If undefined, token won't expire."
      ),
  })
  .strict();

type CreateUserAccessTokenArgs = z.infer<typeof createUserAccessTokenSchema>;

// Function to register the create-user-access-token tool
export function registerCreateUserAccessTokenTool(
  server: McpServer,
  
  fronteggBaseUrl: string
) {
  server.tool(
    "create-user-access-token",
    "Creates a Frontegg user access token.",
    createUserAccessTokenSchema.shape,
    async (args: CreateUserAccessTokenArgs) => {
      const { fronteggTenantIdHeader, userId, description, expiresInMinutes } =
        args;
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.USER_ACCESS_TOKENS
      );

      // Headers require tenantId and userId
      const headers = createBaseHeaders({
        fronteggTenantIdHeader: fronteggTenantIdHeader,
        userIdHeader: userId,
      });

      // Body contains optional description and expiresInMinutes
      const body: { description?: string; expiresInMinutes?: number } = {};
      if (description) {
        body.description = description;
      }
      if (expiresInMinutes) {
        body.expiresInMinutes = expiresInMinutes;
      }

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        body,
        "create-user-access-token"
      );

      return formatToolResponse(response);
    }
  );
}
