import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
} from "../../utils/api/frontegg-api";

export function registerGetVendorIntegrationsTool(server: McpServer) {
  server.tool(
    "get_vendor_integrations",
    "Fetches all vendor integrations",
    z.object({}).shape,
    async () => {
      const apiUrl = buildFronteggUrl("/app-integrations/resources/vendors-integrations/v1");
      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        createBaseHeaders(),
        undefined,
        "get-vendor-integrations"
      );
      return formatToolResponse(response);
    }
  );
}