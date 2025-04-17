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

// Schema based on POST /identity/resources/users/v1/invite
const inviteUserSchema = z
  .object({
    email: z
      .string()
      .email()
      .describe("The email address of the user to invite."),
    name: z.string().describe("The name of the user being invited."),
    roleIds: z
      .array(z.string())
      .describe("An array of role IDs to assign to the invited user."),
    fronteggTenantIdHeader: z
      .string()
      .describe("The tenant ID to invite the user to."),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Optional custom metadata for the user."),
    expiresInMinutes: z
      .number()
      .int()
      .optional()
      .describe("Optional expiration time for the invitation in minutes."),
  })
  .strict();

type InviteUserArgs = z.infer<typeof inviteUserSchema>;

async function handleInviteUser(
  params: InviteUserArgs,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  const { fronteggTenantIdHeader, ...body } = params;
  const endpoint = `${FronteggEndpoints.USERS}/invite`; // Specific invite endpoint
  const apiUrl = buildFronteggUrl(fronteggBaseUrl, endpoint);
  const headers = createBaseHeaders({
    fronteggTenantIdHeader,
  });

  const response = await fetchFromFrontegg(
    HttpMethods.POST,
    apiUrl,
    headers,
    body, // Send the rest of the params in the body
    "invite-user"
  );

  return formatToolResponse(response);
}

export function registerInviteUserTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "invite-user",
    "Invites a new user to a specified tenant with assigned roles.",
    inviteUserSchema.shape,
    (params: InviteUserArgs) =>
      handleInviteUser(params, fronteggToken, fronteggBaseUrl)
  );
}
