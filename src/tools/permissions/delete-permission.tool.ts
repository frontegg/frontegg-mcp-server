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

// Zod schema assuming 'key' is the path parameter for deleting a permission
const deletePermissionSchema = z
  .object({
    key: z.string().describe("The unique key of the permission to delete."),
  })
  .strict();

type DeletePermissionArgs = z.infer<typeof deletePermissionSchema>;

export function registerDeletePermissionTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "delete-permission",
    "Deletes a specific permission in Frontegg using its key.",
    deletePermissionSchema.shape,
    async (args: DeletePermissionArgs) => {
      // Construct URL with the permission key
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSIONS,
        args.key
      );

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        createBaseHeaders(fronteggToken),
        undefined,
        "delete-permission"
      );

      return formatToolResponse(
        response,
        `Permission with key '${args.key}' successfully deleted.`
      );
    }
  );
}
