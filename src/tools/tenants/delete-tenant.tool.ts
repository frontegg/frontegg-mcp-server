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

const deleteTenantSchema = z
  .object({
    tenantId: z
      .string()
      .describe(
        "The unique ID of the tenant account to delete. This is a path parameter."
      ),
  })
  .strict();

type DeleteTenantArgs = z.infer<typeof deleteTenantSchema>;

// Function to register the delete-tenant tool
export function registerDeleteTenantTool(
  server: McpServer,
  fronteggToken: string | null, // Expecting a vendor token
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-tenant",
    "Deletes a specific Frontegg tenant account by its ID using a vendor token. Note: If an account is part of a hierarchy, its sub-accounts are assigned to the deleted account's parent.",
    deleteTenantSchema.shape,
    async (args: DeleteTenantArgs) => {
      // Build the URL, including the tenantId as a path parameter
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.TENANTS_V1, // Use the base path
        args.tenantId // Pass tenantId to be appended to the path
      );

      const headers = createBaseHeaders();

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        headers,
        undefined,
        "delete-tenant"
      );

      if (response.status === 200 || response.status === 204) {
        return formatToolResponse(
          response,
          `Tenant with ID '${args.tenantId}' successfully deleted.`
        );
      }

      // Handle other potential error statuses by default
      return formatToolResponse(response);
    }
  );
}
