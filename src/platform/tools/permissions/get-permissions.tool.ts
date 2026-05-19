import { McpServer } from "../../sdk-compat.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  FronteggEndpoints,
  HttpMethods,
} from "../../utils/api/frontegg-api.js";

const getPermissionsSchema = z.object({}).strict();

type GetPermissionsArgs = z.infer<typeof getPermissionsSchema>;

export function registerGetPermissionsTool(server: McpServer) {
  server.tool(
    "get-permissions",
    "Fetches all permissions from the Frontegg API.",
    getPermissionsSchema.shape,
    async (_args: GetPermissionsArgs) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.PERMISSIONS);

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
