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

const updatePermissionCategorySchema = z
  .object({
    categoryId: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
  })
  .strict();

type UpdatePermissionCategoryArgs = z.infer<
  typeof updatePermissionCategorySchema
>;

export function registerUpdatePermissionCategoryTool(
  server: McpServer,
    fronteggBaseUrl: string
) {
  server.tool(
    "update-permission-category",
    "Updates an existing permission category in Frontegg.",
    updatePermissionCategorySchema.shape,
    async (args: UpdatePermissionCategoryArgs) => {
      const { categoryId, ...updateData } = args;

      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSION_CATEGORIES,
        categoryId
      );

      const response = await fetchFromFrontegg(
        HttpMethods.PATCH,
        apiUrl,
        createBaseHeaders(),
        updateData,
        "update-permission-category"
      );

      return formatToolResponse(response);
    }
  );
}
