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

// Zod schema for the get-roles tool arguments, based on OpenAPI spec
const getRolesSchema = z
  .object({
    tenantId: z.string().optional(), // For the frontegg-tenant-id header
  })
  .strict();

type GetRolesArgs = z.infer<typeof getRolesSchema>;

// Function to register the get-roles tool
export function registerGetRolesTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "get-roles",
    "Fetches roles from Frontegg API based on provided filters.",
    getRolesSchema.shape, // Pass the schema shape
    async (args: GetRolesArgs) => {
      const apiUrl = buildFronteggUrl(fronteggBaseUrl, FronteggEndpoints.ROLES);

      const headers = createBaseHeaders({
        fronteggTenantIdHeader: args.tenantId,
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined,
        "get-roles"
      );

      return formatToolResponse(response);
    }
  );
}
