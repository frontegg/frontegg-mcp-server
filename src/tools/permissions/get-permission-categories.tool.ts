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

const getPermissionCategoriesSchema = z.object({}).strict();

type GetPermissionCategoriesArgs = z.infer<
  typeof getPermissionCategoriesSchema
>;

export function registerGetPermissionCategoriesTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "get-permission-categories",
    "Fetches all permission categories from the Frontegg API.",
    getPermissionCategoriesSchema.shape,
    async (args: GetPermissionCategoriesArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSION_CATEGORIES
      );

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        createBaseHeaders(),
        undefined,
        "get-permission-categories"
      );

      return formatToolResponse(response);
    }
  );
}
