import {McpServer} from '../../sdk-compat.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from '../../utils/api/frontegg-api.js';

export function registerGetFronteggIntegrationsTool(server: McpServer) {
  server.tool('get-frontegg-integrations', 'Fetches all Frontegg integrations', z.object({}).shape, async () => {
    const apiUrl = buildFronteggUrl(FronteggEndpoints.FRONTEGG_INTEGRATIONS);
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
