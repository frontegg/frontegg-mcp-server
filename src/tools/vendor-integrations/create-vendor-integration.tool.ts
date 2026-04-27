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

const oAuthConfigSchema = z
  .object({
    clientId: z.string().describe('OAuth client ID'),
    clientSecret: z.string().describe('OAuth client secret'),
  })
  .strict();

const createVendorIntegrationSchema = z
  .object({
    name: z.string().describe('The name of the vendor integration'),
    fronteggIntegrationId: z.string().describe('The UUID of the Frontegg integration'),
    authenticationType: z
      .enum(['app-to-app', 'behalf-of-user'])
      .describe('The authentication type for the integration'),
    tools: z.array(z.string()).describe('Array of tool identifiers'),
    useFronteggIntegration: z.boolean().default(true).describe('Whether to use Frontegg integration'),
    isActive: z.boolean().default(true).describe('Whether the integration is active'),
    oauthConfigurations: oAuthConfigSchema.optional().describe(
      'OAuth configuration, required when not using Frontegg integration',
    ),
  })
  .strict();

export function registerCreateVendorIntegrationTool(server: McpServer) {
  server.tool(
    'create-vendor-integration',
    'Creates a new vendor integration',
    createVendorIntegrationSchema.shape,
    async (args) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.VENDOR_INTEGRATIONS);
      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders(),
        args,
        'create-vendor-integration',
      );
      return formatToolResponse(response);
    },
  );
}
