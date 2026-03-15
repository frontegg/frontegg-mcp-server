import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from "../../utils/api/frontegg-api";

export function registerGetVendorIntegrationsTool(server: McpServer) {
  server.tool(
    "get-vendor-integrations",
    "Fetches all vendor integrations",
    z.object({}).shape,
    async () => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.VENDOR_INTEGRATIONS);
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