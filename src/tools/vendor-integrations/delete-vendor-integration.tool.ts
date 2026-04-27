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

export function registerDeleteVendorIntegrationTool(server: McpServer) {
  server.tool(
    'delete-vendor-integration',
    'Deletes a vendor integration',
    z.object({
      id: z.string().describe('The ID of the vendor integration to delete'),
    }).shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.VENDOR_INTEGRATIONS}/${encodeURIComponent(args.id)}`);
      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        createBaseHeaders(),
        undefined,
        'delete-vendor-integration',
      );
      return formatToolResponse(response);
    },
  );
}
