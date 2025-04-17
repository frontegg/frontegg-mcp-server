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
import { logger } from "../../utils/logger";

// Zod schema assuming 'key' path param and allowing updates to name/description
const updatePermissionSchema = z
  .object({
    key: z.string().describe("The unique key of the permission to update."),
    name: z
      .string()
      .optional()
      .describe("The new display name for the permission."),
    description: z
      .string()
      .optional()
      .describe("The new description for the permission."),
    // Add other updatable fields here if known from a full OpenAPI spec
  })
  .strict();

type UpdatePermissionArgs = z.infer<typeof updatePermissionSchema>;

export function registerUpdatePermissionTool(
  server: McpServer,
    fronteggBaseUrl: string
) {
  server.tool(
    "update-permission",
    "Updates specific fields of a permission in Frontegg using its key.",
    updatePermissionSchema.shape,
    async (args: UpdatePermissionArgs) => {
      // Ensure at least one field is being updated besides the key
      const { key, ...updatePayload } = args;
      if (Object.keys(updatePayload).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Error: You must provide at least one field (e.g., name, description) to update.",
            },
          ],
        };
      }

      // Construct URL with the permission key
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSIONS,
        key
      );
      logger.debug("[update-permission] API URL:", { url: apiUrl.toString() });

      const response = await fetchFromFrontegg(
        HttpMethods.PATCH,
        apiUrl,
        createBaseHeaders(),
        updatePayload,
        "update-permission"
      );

      logger.debug("[update-permission] Response received", {
        status: response.status,
      });
      return formatToolResponse(response);
    }
  );
}
