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

// Zod schema based on PUT /resources/tenants/v2/{tenantId} Request Body and Path Param
const updateTenantSchema = z
  .object({
    tenantId: z
      .string()
      .describe(
        "The unique ID of the tenant account to update. This is a path parameter."
      ),
    // Request Body fields (all optional for update)
    name: z.string().optional().describe("The new display name of the tenant."),
    status: z
      .string()
      .optional()
      .describe(
        "Optional field for custom logic, not enforced in Frontegg flows."
      ),
    website: z.string().url().optional().describe("New tenant website URL."),
    applicationUrl: z
      .string()
      .url()
      .optional()
      .describe("New tenant application URL."),
    logo: z
      .string()
      .optional()
      .describe("New Base64-encoded image string for the tenant logo."),
    logoUrl: z
      .string()
      .url()
      .optional()
      .describe("New URL to the tenant logo."),
    address: z.string().optional().describe("New tenant physical address."),
    timezone: z
      .string()
      .optional()
      .describe("New tenant timezone (e.g., 'UTC')."),
    currency: z
      .string()
      .optional()
      .describe("New tenant currency (e.g., 'USD')."),
    isReseller: z
      .boolean()
      .optional()
      .describe("Update whether the tenant is a reseller."),
    parentTenantId: z
      .string()
      .optional()
      .describe("Update the parent tenant ID."),
    // Metadata field specific to V2 update
    metadata: z
      .record(z.any())
      .optional()
      .describe(
        "A key-value map for custom tenant metadata. Note: This replaces existing metadata."
      ),
  })
  .strict();

type UpdateTenantArgs = z.infer<typeof updateTenantSchema>;

// Function to register the update-tenant tool
export function registerUpdateTenantTool(
  server: McpServer,
  fronteggToken: string | null, // Expecting a vendor token
  fronteggBaseUrl: string
) {
  server.tool(
    "update-tenant",
    "Updates details for a specific Frontegg tenant account using the V2 endpoint and a vendor token.",
    updateTenantSchema.shape,
    async (args: UpdateTenantArgs) => {
      // Extract tenantId for the path parameter
      const { tenantId, ...body } = args;

      // Build the URL, including the tenantId as a path parameter using the V2 base
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.TENANTS_V2, // Use the V2 base path
        tenantId // Pass tenantId to be appended to the path
      );

      // Use vendor token for authorization
      const headers = createBaseHeaders();

      // Request body contains all other arguments
      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        headers,
        body,
        "update-tenant"
      );

      return formatToolResponse(response);
    }
  );
}
