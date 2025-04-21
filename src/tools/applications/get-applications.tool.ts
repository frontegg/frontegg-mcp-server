import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
  FronteggEndpoints,
} from "../../utils/api/frontegg-api";

// Zod schema based on GET /resources/applications/v1 query parameters
const getApplicationsSchema = z
  .object({
    accessType: z
      .enum(["FREE_ACCESS", "MANAGED_ACCESS"])
      .optional()
      .describe("Filter by access type."),
    isDefault: z
      .boolean()
      .optional()
      .describe("Filter by whether the application is the default one."),
    isActive: z
      .boolean()
      .optional()
      .describe("Filter by whether the application is active."),
    ids: z
      .string() // Assuming comma-separated string based on docs; adjust if it's an array
      .optional()
      .describe("Filter by a comma-separated list of application IDs."),
  })
  .strict();

type GetApplicationsArgs = z.infer<typeof getApplicationsSchema>;

// Function to register the get-applications tool
export function registerGetApplicationsTool(server: McpServer) {
  server.tool(
    "get-applications",
    "Fetches a list of Frontegg applications for the environment, with optional filtering.",
    getApplicationsSchema.shape,
    async (args: GetApplicationsArgs) => {
      // Construct query parameters, renaming keys to match Frontegg API (_ prefix)
      const queryParams: Record<string, string | number | boolean> = {};
      if (args.accessType !== undefined) {
        queryParams["_accessType"] = args.accessType;
      }
      if (args.isDefault !== undefined) {
        queryParams["_isDefault"] = args.isDefault;
      }
      if (args.isActive !== undefined) {
        queryParams["_isActive"] = args.isActive;
      }
      if (args.ids !== undefined) {
        queryParams["ids"] = args.ids; // Note: 'ids' does not have '_' prefix in docs
      }

      const apiUrl = buildFronteggUrl(FronteggEndpoints.APPLICATION);
      const headers = createBaseHeaders();

      // Append query parameters to the URL for GET request
      const url = new URL(apiUrl);
      Object.entries(queryParams).forEach(([key, value]) => {
        // Ensure value is not undefined before appending
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        url, // Pass the URL object directly
        headers,
        undefined, // No body for GET request
        "get-applications" // 5 arguments now
      );

      return formatToolResponse(response);
    }
  );
}
