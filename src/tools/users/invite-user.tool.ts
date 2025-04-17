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

// Schema based on POST /identity/resources/users/v2
const createUserV2Schema = z
  .object({
    email: z
      .string()
      .email()
      .describe("The email address of the user to create/invite."),
    name: z.string().optional().describe("The name of the user."),
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID to create the user in."),
    profilePictureUrl: z
      .string()
      .optional()
      .describe("URL for the user's profile picture (max 4095 chars)."),
    password: z.string().optional().describe("User's password."),
    phoneNumber: z.string().optional().describe("User's phone number."),
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
      .default("local")
      .optional()
      .describe("Authentication provider."),
    metadata: z
      .string() // Docs specify "Stringified JSON object"
      .optional()
      .describe(
        'Optional custom metadata for the user (as a stringified JSON object, e.g., "{}").'
      ),
    skipInviteEmail: z
      .boolean()
      .optional()
      .describe("If true, suppresses the invitation email."),
    roleIds: z
      .array(z.string())
      .optional() // Making roles optional as per some interpretations, adjust if mandatory
      .describe("An array of role IDs to assign to the user."),
    emailMetadata: z
      .record(z.any()) // Assuming object, adjust if specific structure known
      .optional()
      .describe("Metadata related to email."),
    expirationInSeconds: z
      .number()
      .int()
      .min(300)
      .optional()
      .describe(
        "Optional expiration time for temporary users in seconds (>= 300)."
      ),
  })
  .strict();

type CreateUserV2Args = z.infer<typeof createUserV2Schema>;

async function handleCreateUserV2(
  params: CreateUserV2Args,
  fronteggBaseUrl: string
) {
  const { fronteggTenantIdHeader, ...body } = params;
  const endpoint = `${FronteggEndpoints.USERS_V2}`;
  const apiUrl = buildFronteggUrl(fronteggBaseUrl, endpoint);
  const headers = createBaseHeaders({
    fronteggTenantIdHeader,
  });

  // Ensure metadata is stringified if provided as an object (though schema expects string)
  if (typeof body.metadata === "object" && body.metadata !== null) {
    body.metadata = JSON.stringify(body.metadata);
  }

  const response = await fetchFromFrontegg(
    HttpMethods.POST,
    apiUrl,
    headers,
    body,
    "create-user-v2"
  );

  return formatToolResponse(response);
}

export function registerInviteUserTool(
  server: McpServer,
  fronteggBaseUrl: string
) {
  server.tool(
    "invite-user",
    "Creates/Invites a new user to a specified tenant using the V2 endpoint, optionally assigning roles and skipping the invite email.",
    createUserV2Schema.shape,
    (params: CreateUserV2Args) => handleCreateUserV2(params, fronteggBaseUrl)
  );
}
