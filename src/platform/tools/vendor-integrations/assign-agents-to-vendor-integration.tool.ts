import { McpServer } from "../../sdk-compat.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from "../../utils/api/frontegg-api.js";

const agentsSchema = z.object({
  id: z.string().describe("The ID of the vendor integration"),
  agentIds: z.array(z.string()).describe("List of agent UUIDs"),
}).strict();

export function registerAssignAgentsToVendorIntegrationTool(server: McpServer) {
  server.tool(
    "assign-agents-to-vendor-integration",
    "Assigns agents to a vendor integration",
    agentsSchema.shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.VENDOR_INTEGRATIONS}/${encodeURIComponent(args.id)}/agents/assign`);
      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders(),
        { agentIds: args.agentIds },
        "assign-agents"
      );
      return formatToolResponse(response);
    }
  );
}