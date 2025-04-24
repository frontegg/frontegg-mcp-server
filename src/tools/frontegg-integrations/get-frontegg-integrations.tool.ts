import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from '../../utils/api/frontegg-api';

export function registerGetFronteggIntegrationsTool(server: McpServer) {
  server.tool('get_frontegg_integrations', 'Fetches all Frontegg integrations', z.object({}).shape, async () => {
    const apiUrl = buildFronteggUrl('/app-integrations/resources/frontegg-integrations/v1');
    const response = await fetchFromFrontegg(
      HttpMethods.GET,
      apiUrl,
      createBaseHeaders(),
      undefined, // no body for GET requests
      'get-frontegg-integrations',
    );
    return formatToolResponse(response);
  });
}
