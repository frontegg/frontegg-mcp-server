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

// Zod schema based on POST /resources/tenants/v1 Request Body
const createTenantSchema = z
  .object({
    tenantId: z
      .string()
      .optional()
      .describe(
        "Optional: Your own unique tenant ID. If omitted, Frontegg will auto-generate a UUID."
      ),
    name: z.string().optional().describe("The display name of the tenant."),
    status: z
      .string()
      .optional()
      .describe(
        "Optional field for custom logic, not enforced in Frontegg flows."
      ),
    website: z.string().url().optional().describe("Tenant's website URL."),
    applicationUrl: z
      .string()
      .url()
      .optional()
      .describe("Tenant's application URL."),
    logo: z
      .string()
      .optional()
      .describe("Base64-encoded image string for the tenant logo."),
    logoUrl: z.string().url().optional().describe("URL to the tenant logo."),
    address: z.string().optional().describe("Tenant's physical address."),
    timezone: z
      .string()
      .optional()
      .describe("Tenant's timezone (e.g., 'UTC')."),
    currency: z
      .string()
      .optional()
      .describe("Tenant's currency (e.g., 'USD')."),
    creatorName: z
      .string()
      .optional()
      .describe("Name of the person creating the tenant."),
    creatorEmail: z
      .string()
      .email()
      .optional()
      .describe("Email of the person creating the tenant."),
    isReseller: z
      .boolean()
      .optional()
      .describe("Whether the tenant is a reseller."),
    parentTenantId: z
      .string()
      .optional()
      .describe("ID of the parent tenant for creating a sub-account."),
  })
  .strict();

type CreateTenantArgs = z.infer<typeof createTenantSchema>;

// Function to register the create-tenant tool
export function registerCreateTenantTool(
  server: McpServer,
  fronteggBaseUrl: string
) {
  server.tool(
    "create-tenant",
    "Creates a new Frontegg tenant account using a vendor token. If an account with the given ID previously existed and was deleted, this action reactivates it.",
    createTenantSchema.shape,
    async (args: CreateTenantArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.TENANTS_V1 // Endpoint for creating tenants
      );

      // Use vendor token for authorization
      const headers = createBaseHeaders();

      // Request body contains all arguments
      const body = args;

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        body,
        "create-tenant"
      );

      // Return the API response as is
      return formatToolResponse(response);
    }
  );
}
