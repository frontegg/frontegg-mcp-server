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

// Zod schema for a single permission object
const permissionObjectSchema = z
  .object({
    categoryId: z
      .string()
      .optional()
      .describe("The category ID for the permission."),
    name: z.string().describe("The display name of the permission."),
    description: z
      .string()
      .optional()
      .describe("A description for the permission."),
    key: z
      .string()
      .describe(
        "A unique key identifying the permission (e.g., 'fe.secure.read')."
      ),
    assignmentType: z
      .enum(["NEVER", "ALWAYS", "ASSIGNABLE"])
      .optional()
      .describe(
        "Defines the assignment behavior: NEVER, ALWAYS, or ASSIGNABLE."
      ),
  })
  .strict();

// Updated schema to accept an array of permission objects
const createPermissionsSchema = z
  .object({
    permissions: z
      .array(permissionObjectSchema)
      .min(1)
      .describe("An array of permission objects to create."),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional Tenant ID to scope the permission (uses frontegg-tenant-id header)."
      ),
  })
  .strict();

type CreatePermissionsArgs = z.infer<typeof createPermissionsSchema>;

export function registerCreatePermissionTool(server: McpServer) {
  server.tool(
    "create-permission",
    "Creates one or more new permissions in Frontegg.",
    createPermissionsSchema.shape,
    async (args: CreatePermissionsArgs) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.PERMISSIONS);

      const { fronteggTenantIdHeader, permissions } = args;

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        permissions,
        "create-permission"
      );

      return formatToolResponse(response);
    }
  );
}
