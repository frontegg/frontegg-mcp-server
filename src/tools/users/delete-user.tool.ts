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

const deleteUserSchema = z.object({
  userId: z.string().describe("The unique identifier for the user to delete."),
  fronteggTenantIdHeader: z
    .string()
    .optional()
    .describe("Optional Tenant ID for context."),
});

type DeleteUserArgs = z.infer<typeof deleteUserSchema>;

async function handleDeleteUser(
  params: DeleteUserArgs,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  const { userId, fronteggTenantIdHeader } = params;

  const endpoint = `${FronteggEndpoints.USERS}/${userId}`;
  const apiUrl = buildFronteggUrl(fronteggBaseUrl, endpoint);
  const headers = createBaseHeaders({
    fronteggTenantIdHeader,
  });

  const response = await fetchFromFrontegg(
    HttpMethods.DELETE,
    apiUrl,
    headers,
    undefined,
    "delete-user"
  );

  if (response.status === 204) {
    return formatToolResponse(
      {
        success: true,
        status: 204,
        statusText: "No Content",
        data: { message: `User ${userId} deleted successfully.` },
      },
      `User ${userId} deleted successfully.`
    );
  } else {
    return formatToolResponse(response);
  }
}

export function registerDeleteUserTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-user",
    "Deletes a specific user by their ID.",
    deleteUserSchema.shape,
    (params: DeleteUserArgs) =>
      handleDeleteUser(params, fronteggToken, fronteggBaseUrl)
  );
}
