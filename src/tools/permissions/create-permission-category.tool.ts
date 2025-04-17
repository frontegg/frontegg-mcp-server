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

const createPermissionCategorySchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    id: z.string().optional(),
  })
  .strict();

type CreatePermissionCategoryArgs = z.infer<
  typeof createPermissionCategorySchema
>;

export function registerCreatePermissionCategoryTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "create-permission-category",
    "Creates a new permission category in Frontegg.",
    createPermissionCategorySchema.shape,
    async (args: CreatePermissionCategoryArgs) => {
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSION_CATEGORIES
      );

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        createBaseHeaders(),
        args,
        "create-permission-category"
      );

      return formatToolResponse(response);
    }
  );
}
