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

const deletePermissionCategorySchema = z
  .object({
    categoryId: z.string().min(1),
  })
  .strict();

type DeletePermissionCategoryArgs = z.infer<
  typeof deletePermissionCategorySchema
>;

export function registerDeletePermissionCategoryTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-permission-category",
    "Deletes a permission category from Frontegg.",
    deletePermissionCategorySchema.shape,
    async (args: DeletePermissionCategoryArgs) => {
      const { categoryId } = args;

      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSION_CATEGORIES,
        categoryId
      );

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        createBaseHeaders(),
        undefined,
        "delete-permission-category"
      );

      return formatToolResponse(
        response,
        "Permission category deleted successfully."
      );
    }
  );
}
