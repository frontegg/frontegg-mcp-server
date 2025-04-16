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

// Zod schema based on Frontegg v1 Create Roles API
const createRoleSchema = z
  .object({
    key: z.string().describe("Unique identifier for the role"),
    name: z.string().describe("Display name of the role"),
    description: z.string().optional().describe("Description for the role"),
    isDefault: z
      .boolean()
      .optional()
      .describe("Assigns this role to users added without specified roles"),
    migrateRole: z
      .boolean()
      .optional()
      .describe("Set true with isDefault to assign this role to all users"),
    firstUserRole: z
      .boolean()
      .optional()
      .describe("Assigns this role to the first user of new tenants"),
    level: z
      .number()
      .int()
      .min(0)
      .max(32767)
      .describe("Role level (0-32767), lower is stronger"),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional Tenant ID to associate the role with. If provided, it will be used in the request header."
      ),
  })
  .strict();

type CreateRoleArgs = z.infer<typeof createRoleSchema>;

// Function to register the create-role tool
export function registerCreateRoleTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "create-role",
    "Creates a new role (using v1 API) for a specific Frontegg tenant via header.", // Updated description
    createRoleSchema.shape, // Pass the schema shape
    async (args: CreateRoleArgs) => {
      // Tenant ID is used for the header if provided
      const fronteggTenantIdHeader = args.fronteggTenantIdHeader;

      // Build API URL using centralized utility
      const apiUrl = buildFronteggUrl(fronteggBaseUrl, FronteggEndpoints.ROLES);

      const { fronteggTenantIdHeader: _fronteggTenantIdHeader, ...roleData } =
        args;
      const requestBodyArray = [roleData]; // v1 expects an array of roles

      // Using centralized fetch utility
      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders(fronteggToken, { fronteggTenantIdHeader }),
        requestBodyArray,
        "create-role"
      );

      // Use the generic formatToolResponse function
      return formatToolResponse(response, "Role creation successful.");
    }
  );
}
