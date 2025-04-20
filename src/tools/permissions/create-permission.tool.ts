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

// Zod schema based on AddPermissionRequest in OpenAPI spec
const createPermissionSchema = z
  .object({
    categoryId: z.string().describe("The category ID for the permission."),
    name: z.string().describe("The display name of the permission."),
    description: z.string().describe("A description for the permission."),
    key: z
      .string()
      .describe(
        "A unique key identifying the permission (e.g., 'fe.secure.read')."
      ),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional Tenant ID to scope the permission (uses frontegg-tenant-id header)."
      ),
  })
  .strict();

type CreatePermissionArgs = z.infer<typeof createPermissionSchema>;

export function registerCreatePermissionTool(server: McpServer) {
  server.tool(
    "create-permission",
    "Creates a new permission in Frontegg.",
    createPermissionSchema.shape,
    async (args: CreatePermissionArgs) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.PERMISSIONS);

      const { fronteggTenantIdHeader, ...bodyPayload } = args;

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        bodyPayload,
        "create-permission"
      );

      return formatToolResponse(response);
    }
  );
}
