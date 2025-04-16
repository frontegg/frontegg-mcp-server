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

// Schema based on GET /identity/resources/users/v3
const getUsersV3Schema = z
  .object({
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max items per page (default 50, max 200)."),
    includeSubTenants: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include users from sub-tenants."),
    offset: z
      .number()
      .int()
      .gte(0)
      .optional()
      .describe("Number of items to skip."),
    email: z.string().optional().describe("Filter by user email."),
    tenantId: z
      .string()
      .optional()
      .describe("Tenant ID to filter users for (also used in header)."),
    ids: z
      .string()
      .optional()
      .describe("Comma-separated list of user IDs to fetch."), // Note: API doc says string, assuming comma-separated
    sortBy: z
      .enum([
        "createdAt",
        "name",
        "email",
        "id",
        "verified",
        "isLocked",
        "provider",
        "tenantId",
      ])
      .optional()
      .describe("Field to sort by."),
    order: z
      .enum(["ASC", "DESC"])
      .optional()
      .describe("Sort order (ASC or DESC)."),
    // Header param:
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe("Tenant ID for the frontegg-tenant-id header."),
  })
  .strict();

type GetUsersV3Args = z.infer<typeof getUsersV3Schema>;

async function handleGetUsersV3(
  params: GetUsersV3Args,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  // Use the V3 endpoint
  const apiUrl = buildFronteggUrl(fronteggBaseUrl, FronteggEndpoints.USERS_V3);

  // Separate header tenantId from query tenantId
  const { fronteggTenantIdHeader, ...queryParams } = params;

  // Add query parameters (prefixed with underscore as per V3 docs)
  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined) {
      apiUrl.searchParams.append(`_${key}`, String(value));
    }
  });

  // Create headers, including tenant ID if provided
  const headers = createBaseHeaders(fronteggToken, {
    fronteggTenantIdHeader: fronteggTenantIdHeader,
  });

  try {
    const response = await fetchFromFrontegg(
      HttpMethods.GET,
      apiUrl,
      headers,
      undefined,
      "get-users-v3" // Renamed log identifier
    );

    return formatToolResponse(response);
  } catch (error: any) {
    logger.error(`Error in get-users-v3 tool: ${error.message}`);
    return formatToolResponse({
      success: false,
      status: 500,
      statusText: "Internal Server Error",
      data: null,
      error:
        error.message || "An unknown error occurred while fetching users (v3)",
    });
  }
}

export function registerGetUsersTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "get-users", // Keep the original tool name for compatibility?
    "Retrieves a list of users using the V3 endpoint based on specified filters and pagination.",
    getUsersV3Schema.shape,
    (params: GetUsersV3Args) =>
      handleGetUsersV3(params, fronteggToken, fronteggBaseUrl)
  );
}
