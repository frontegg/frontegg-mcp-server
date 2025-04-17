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

const getPermissionsSchema = z.object({}).strict();

type GetPermissionsArgs = z.infer<typeof getPermissionsSchema>;

export function registerGetPermissionsTool(
  server: McpServer,
    fronteggBaseUrl: string
) {
  server.tool(
    "get-permissions",
    "Fetches all permissions from the Frontegg API.",
    getPermissionsSchema.shape,
    async (args: GetPermissionsArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSIONS
      );

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        createBaseHeaders(),
        undefined,
        "get-permissions"
      );

      return formatToolResponse(response);
    }
  );
}
