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

export function registerGetFronteggIntegrationTool(server: McpServer) {
  server.tool(
    'get-frontegg-integration',
    'Fetches a single Frontegg integration by ID',
    z.object({
      id: z.string().describe('The ID of the Frontegg integration'),
    }).shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.FRONTEGG_INTEGRATIONS}/${encodeURIComponent(args.id)}`);
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
