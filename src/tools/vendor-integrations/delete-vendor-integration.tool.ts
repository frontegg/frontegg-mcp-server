import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from '../../utils/api/frontegg-api';

export function registerDeleteVendorIntegrationTool(server: McpServer) {
  server.tool(
    'delete_vendor_integration',
    'Deletes a vendor integration',
    z.object({
      id: z.string().describe('The ID of the vendor integration to delete'),
    }).shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(`/app-integrations/resources/vendors-integrations/v1/${args.id}`);
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
