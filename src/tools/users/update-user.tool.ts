import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "../../utils/logger";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from "../../utils/api/frontegg-api";

const updateUserSchema = z
  .object({
    // Headers
    userId: z
      .string()
      .describe(
        "The user ID identifier (required). Will be sent in the 'frontegg-user-id' header."
      ),
    fronteggTenantIdHeader: z
      .string()
      .describe(
        "The tenant ID identifier (required). Will be sent in the 'frontegg-tenant-id' header."
      ),
    // Body parameters
    name: z
      .string()
      .optional()
      .describe("The updated name of the user (optional)."),
    phoneNumber: z
      .string()
      .optional()
      .describe("The updated phone number (optional)."),
    profilePictureUrl: z
      .string()
      .url()
      .max(4095)
      .optional()
      .nullable()
      .describe(
        "The URL to the updated profile picture (optional, max 4095 chars)."
      ),
    metadata: z
      .string()
      .optional()
      .describe(
        "Replace the user's custom metadata (optional, stringified JSON object, e.g., '{}')."
      ),
  })
  .strict();

type UpdateUserArgs = z.infer<typeof updateUserSchema>;

async function handleUpdateUser(params: UpdateUserArgs) {
  const { userId, fronteggTenantIdHeader, ...body } = params;

  const endpoint = FronteggEndpoints.USERS;
  const apiUrl = buildFronteggUrl(endpoint);

  const headers = createBaseHeaders({
    fronteggTenantIdHeader,
    userIdHeader: userId, // Pass userId to the function
  });

  const updateBody = { ...body };

  // Remove properties that are undefined in the body, as the API might interpret them incorrectly
  Object.keys(updateBody).forEach((key) => {
    if (updateBody[key as keyof typeof updateBody] === undefined) {
      delete updateBody[key as keyof typeof updateBody];
    }
  });

  logger.debug("Update user request body", { updateBody });

  const response = await fetchFromFrontegg(
    HttpMethods.PUT,
    apiUrl,
    headers,
    updateBody,
    "update-user"
  );

  return formatToolResponse(response);
}

export function registerUpdateUserTool(server: McpServer) {
  server.tool(
    "update-user",
    "Updates the profile information for a specific user using PUT /resources/users/v1. Requires 'frontegg-user-id' and 'frontegg-tenant-id' headers.",
    updateUserSchema.shape,
    (params: UpdateUserArgs) => handleUpdateUser(params)
  );
}
