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

// Zod schema based on Frontegg API for creating a user API token (client credentials)
const createUserApiTokenSchema = z
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
      .describe("Optional description for the API token"),
    // Note: The API doesn't mention expiration for this token type
  })
  .strict();

type CreateUserApiTokenArgs = z.infer<typeof createUserApiTokenSchema>;

// Function to register the create-user-api-token tool
export function registerCreateUserApiTokenTool(server: McpServer) {
  server.tool(
    "create-user-api-token",
    "Creates a Frontegg user API token (client credentials token).",
    createUserApiTokenSchema.shape,
    async (args: CreateUserApiTokenArgs) => {
      const { fronteggTenantIdHeader, userId, description } = args;
      const apiUrl = buildFronteggUrl(
        FronteggEndpoints.USER_API_TOKENS // Using the correct endpoint
      );

      // Headers require tenantId and userId
      const headers = createBaseHeaders({
        fronteggTenantIdHeader: fronteggTenantIdHeader, // Use correct key for tenantId
        userIdHeader: userId, // Pass userId as userIdHeader
      });

      // Body contains optional description
      const body: { description?: string } = {};
      if (description) {
        body.description = description;
      }

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        Object.keys(body).length > 0 ? body : undefined, // Send body only if description is present
        "create-user-api-token"
      );

      return formatToolResponse(response);
    }
  );
}
