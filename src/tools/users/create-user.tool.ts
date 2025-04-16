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

// Schema based on POST /identity/resources/users/v2 documentation
const createUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .describe("User's email address (must be unique)."),
    metadata: z
      .string()
      .optional()
      .describe(
        'Stringified JSON object for custom metadata. Example: "{}" or \'{"key":"value"}\'.'
      ), // Corrected string literal
    name: z.string().optional().describe("User's full name."),
    password: z
      .string()
      .optional()
      .describe("User's password (check policy requirements)."), // Optional
    fronteggTenantIdHeader: z
      .string()
      .describe("Tenant ID for the frontegg-tenant-id header."), // Required header
    phoneNumber: z.string().optional().describe("User's phone number."),
    profilePictureUrl: z
      .string()
      .url()
      .optional()
      .describe("URL for the user's profile picture (max 4095 chars)."),
    provider: z
      .enum([
        "local",
        "saml",
        "google",
        "github",
        "facebook",
        "microsoft",
        "scim2",
        "slack",
        "apple",
      ])
      .optional()
      .default("local")
      .describe("Authentication provider."),
    skipInviteEmail: z
      .boolean()
      .optional()
      .describe("If true, skips sending the invitation email."),
    roleIds: z
      .array(z.string())
      .optional()
      .describe("Array of role IDs to assign to the user."),
    emailMetadata: z
      .record(z.any())
      .optional()
      .describe("Metadata for the invitation email template."),
    expirationInSeconds: z
      .number()
      .int()
      .gte(300)
      .optional()
      .describe("Temporary user expiration in seconds (min 300)."),

    // Removed 'verified' as it's not in the V2 create request body, it's in the response.
  })
  .strict();

type CreateUserArgs = z.infer<typeof createUserSchema>;

async function handleCreateUser(
  params: CreateUserArgs,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  // Destructure tenantId header separately
  const { fronteggTenantIdHeader, ...body } = params;

  // Validate metadata is a valid JSON string before sending, only if provided
  if (body.metadata) {
    try {
      JSON.parse(body.metadata);
    } catch (e) {
      logger.error(
        "Invalid metadata JSON provided for create-user-v2:",
        body.metadata
      );
      return formatToolResponse({
        success: false,
        status: 400, // Bad Request
        statusText: "Bad Request",
        data: null,
        error: "Invalid metadata: Must be a valid JSON string.",
      });
    }
  }

  const apiUrl = buildFronteggUrl(fronteggBaseUrl, FronteggEndpoints.USERS_V2);
  // Use the dedicated header field
  const headers = createBaseHeaders(fronteggToken, { fronteggTenantIdHeader });

  try {
    const response = await fetchFromFrontegg(
      HttpMethods.POST,
      apiUrl,
      headers,
      body, // Send the validated body
      "create-user-v2"
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error(`Error in create-user-v2 tool: ${error.message}`);
    return formatToolResponse({
      success: false,
      status: 500,
      statusText: "Internal Server Error",
      data: null,
      error:
        error.message ||
        "An unknown error occurred while creating the user (v2)",
    });
  }
}

export function registerCreateUserTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "create-user",
    "Creates a new user using the V2 endpoint. Requires email.",
    createUserSchema.shape,
    (params: CreateUserArgs) =>
      handleCreateUser(params, fronteggToken, fronteggBaseUrl)
  );
}
