import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from '../../utils/api/frontegg-api';

export function registerGetFronteggIntegrationTool(server: McpServer) {
  server.tool(
    'get_frontegg_integration',
    'Fetches a single Frontegg integration by ID',
    z.object({
      id: z.string().describe('The ID of the Frontegg integration'),
    }).shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`/app-integrations/resources/frontegg-integrations/v1/${args.id}`);
      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        createBaseHeaders(),
        undefined, // no body for GET requests
        'get-frontegg-integration',
      );
      return formatToolResponse(response);
    },
  );
}
