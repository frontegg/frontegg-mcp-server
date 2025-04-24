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

// Zod schema based on GET /resources/applications/v1/agents query parameters
const getAgentApplicationsSchema = z
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
      .string()
      .optional()
      .describe("Filter by a comma-separated list of application IDs."),
  })
  .strict();

type GetAgentApplicationsArgs = z.infer<typeof getAgentApplicationsSchema>;

// Function to register the get-agent-applications tool
export function registerGetAgentApplicationsTool(server: McpServer) {
  server.tool(
    "get_agent_applications",
    "Fetches a list of agent applications for the environment, with optional filtering.",
    getAgentApplicationsSchema.shape,
    async (args: GetAgentApplicationsArgs) => {
      // Construct query parameters with _ prefix where needed
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
        queryParams["ids"] = args.ids;
      }

      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.APPLICATION}/agents`);
      const headers = createBaseHeaders();

      // Append query parameters to the URL for GET request
      const url = new URL(apiUrl);
      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        url,
        headers,
        undefined,
        "get-agent-applications"
      );

      return formatToolResponse(response);
    }
  );
}