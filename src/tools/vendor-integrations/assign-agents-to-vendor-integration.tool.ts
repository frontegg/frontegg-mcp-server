import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from "../../utils/api/frontegg-api";

const agentsSchema = z.object({
  id: z.string().describe("The ID of the vendor integration"),
  agentIds: z.array(z.string()).describe("List of agent UUIDs"),
}).strict();

export function registerAssignAgentsToVendorIntegrationTool(server: McpServer) {
  server.tool(
    "assign_agents_to_vendor_integration",
    "Assigns agents to a vendor integration",
    agentsSchema.shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`/app-integrations/resources/vendors-integrations/v1/${args.id}/agents/assign`);
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