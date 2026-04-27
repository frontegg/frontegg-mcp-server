import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from '../../utils/api/frontegg-api';

const agentsSchema = z
  .object({
    id: z.string().describe('The ID of the vendor integration'),
    agentIds: z.array(z.string()).describe('List of agent UUIDs'),
  })
  .strict();

export function registerUnassignAgentsFromVendorIntegrationTool(server: McpServer) {
  server.tool(
    'unassign-agents-from-vendor-integration',
    'Unassigns agents from a vendor integration',
    agentsSchema.shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.VENDOR_INTEGRATIONS}/${encodeURIComponent(args.id)}/agents/unassign`);
      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders(),
        {agentIds: args.agentIds},
        'unassign-agents',
      );
      return formatToolResponse(response);
    },
  );
}
