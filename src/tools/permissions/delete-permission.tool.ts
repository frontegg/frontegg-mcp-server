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

// Zod schema using 'permissionId' as the path parameter
const deletePermissionSchema = z
  .object({
    permissionId: z
      .string()
      .describe("The unique ID of the permission to delete."),
  })
  .strict();

type DeletePermissionArgs = z.infer<typeof deletePermissionSchema>;

export function registerDeletePermissionTool(server: McpServer) {
  server.tool(
    "delete-permission",
    "Deletes a specific permission in Frontegg using its ID.",
    deletePermissionSchema.shape,
    async (args: DeletePermissionArgs) => {
      // Construct URL with the permission ID
      const apiUrl = buildFronteggUrl(
        FronteggEndpoints.PERMISSIONS,
        args.permissionId
      );

      const response = await fetchFromFrontegg(
        HttpMethods.DELETE,
        apiUrl,
        createBaseHeaders(),
        undefined,
        "delete-permission"
      );

      return formatToolResponse(
        response,
        `Permission with ID '${args.permissionId}' successfully deleted.`
      );
    }
  );
}
