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

// Zod schema for the update-role tool arguments
const updateRoleSchema = z
  .object({
    roleId: z.string().describe("The ID of the role to update."), // Path parameter
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe("The tenant ID associated with the role, if applicable."), // Header
    // Body parameters (all optional for PATCH)
    isDefault: z
      .boolean()
      .optional()
      .describe("Assign this role to all new users."),
    firstUserRole: z
      .boolean()
      .optional()
      .describe("Assign this role to the first user of a new tenant."),
    migrateRole: z
      .boolean()
      .optional()
      .describe("Assign this role to all existing users (use with isDefault)."),
    level: z
      .number()
      .int()
      .min(0)
      .max(32767)
      .optional()
      .describe("Role level for elevation (lower is stronger)."),
    key: z.string().optional().describe("Unique key for the role."),
    name: z.string().optional().describe("Display name for the role."),
    description: z.string().optional().describe("Description of the role."),
  })
  .strict();

type UpdateRoleArgs = z.infer<typeof updateRoleSchema>;

// Function to register the update-role tool
export function registerUpdateRoleTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "update-role",
    "Updates an existing role by its ID using a PATCH request.",
    updateRoleSchema.shape, // Pass the schema shape
    async (args: UpdateRoleArgs) => {
      const { roleId, fronteggTenantIdHeader, ...bodyArgs } = args;

      // Prepare the request body, only including provided fields
      const requestBody = Object.entries(bodyArgs).reduce(
        (acc, [key, value]) => {
          if (value !== undefined) {
            // @ts-ignore // Ignore implicit any type error for dynamic assignment
            acc[key] = value;
          }
          return acc;
        },
        {} as Partial<Omit<UpdateRoleArgs, "roleId" | "fronteggTenantIdHeader">>
      );

      if (Object.keys(requestBody).length === 0) {
        console.error(
          "[update-role] Error: No update fields provided in the request body."
        );
        return {
          content: [
            {
              type: "text",
              text: "Error: No fields provided to update the role.",
            },
          ],
        };
      }

      // Build API URL using centralized utility
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.ROLES,
        roleId
      );

      // Using centralized fetch utility
      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        requestBody,
        "update-role"
      );

      return formatToolResponse(
        response,
        `Role with ID '${roleId}' successfully updated.`
      );
    }
  );
}
