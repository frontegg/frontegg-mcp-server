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

// Schema based on PUT /identity/resources/users/v1/{userId}
const updateUserSchema = z
  .object({
    userId: z
      .string()
      .describe("The unique identifier for the user to update."),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe("Optional Tenant ID context for the request."),
    name: z.string().optional().describe("The updated name of the user."),
    email: z
      .string()
      .email()
      .optional()
      .describe("The updated email address (must be unique)."),
    phoneNumber: z.string().optional().describe("The updated phone number."),
    profilePictureUrl: z
      .string()
      .url()
      .optional()
      .describe("The URL to the updated profile picture."),
    verified: z
      .boolean()
      .optional()
      .describe("Set the user's email verification status."),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Replace the user's custom metadata."),
    // Note: Other fields like 'provider', 'mfaEnrolled', 'isLocked' might be read-only
    // or require different endpoints/permissions.
  })
  .strict();

type UpdateUserArgs = z.infer<typeof updateUserSchema>;

async function handleUpdateUser(
  params: UpdateUserArgs,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  const { userId, fronteggTenantIdHeader, ...body } = params;

  const endpoint = `${FronteggEndpoints.USERS}/${userId}`;
  const apiUrl = buildFronteggUrl(fronteggBaseUrl, endpoint);
  const headers = createBaseHeaders(fronteggToken, {
    fronteggTenantIdHeader,
  });

  try {
    // Ensure we don't send userId or tenantId in the body
    const updateBody = { ...body };

    const response = await fetchFromFrontegg(
      HttpMethods.PUT,
      apiUrl,
      headers,
      updateBody,
      "update-user"
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error(`Error in update-user tool for ${userId}: ${error.message}`);
    return formatToolResponse({
      success: false,
      status: 500,
      statusText: "Internal Server Error",
      data: null,
      error:
        error.message || "An unknown error occurred while updating the user",
    });
  }
}

export function registerUpdateUserTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "update-user",
    "Updates the profile information for a specific user.",
    updateUserSchema.shape,
    (params: UpdateUserArgs) =>
      handleUpdateUser(params, fronteggToken, fronteggBaseUrl)
  );
}
