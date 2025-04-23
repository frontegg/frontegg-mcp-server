import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from '../../utils/api/frontegg-api';

const oAuthConfigSchema = z
  .object({
    clientId: z.string().describe('OAuth client ID'),
    clientSecret: z.string().describe('OAuth client secret'),
  })
  .strict();

const updateVendorIntegrationSchema = z
  .object({
    id: z.string().describe('The ID of the vendor integration to update'),
    name: z.string().optional().describe('The name of the vendor integration'),
    authenticationType: z
      .enum(['app-to-app', 'behalf-of-user'])
      .optional()
      .describe('The authentication type for the integration'),
    tools: z.array(z.string()).optional().describe('Array of tool identifiers'),
    useFronteggIntegration: z.boolean().optional().describe('Whether to use Frontegg integration'),
    isActive: z.boolean().optional().describe('Whether the integration is active'),
    oauthConfigurations: oAuthConfigSchema.optional().describe('OAuth configuration'),
  })
  .strict();

export function registerUpdateVendorIntegrationTool(server: McpServer) {
  server.tool(
    'update_vendor_integration',
    'Updates an existing vendor integration',
    updateVendorIntegrationSchema.shape,
    async (args) => {
      const {id, ...body} = args;
      const apiUrl = buildFronteggUrl(`/app-integrations/resources/vendors-integrations/v1/${id}`);
      const response = await fetchFromFrontegg(
        HttpMethods.PATCH,
        apiUrl,
        createBaseHeaders(),
        body,
        'update-vendor-integration',
      );
      return formatToolResponse(response);
    },
  );
}
