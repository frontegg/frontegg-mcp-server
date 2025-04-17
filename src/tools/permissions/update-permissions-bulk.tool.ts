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

// Zod schema for bulk permission updates
const updatePermissionsBulkSchema = z
  .object({
    permissions: z
      .array(
        z.object({
          key: z.string().describe("The unique key of the permission."),
          name: z
            .string()
            .optional()
            .describe("The display name for the permission."),
          description: z
            .string()
            .optional()
            .describe("The description of the permission."),
          // Add other fields as needed based on the OpenAPI spec
        })
      )
      .describe("Array of permission objects to update."),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional tenant ID to update permissions for a specific tenant."
      ),
  })
  .strict();

type UpdatePermissionsBulkArgs = z.infer<typeof updatePermissionsBulkSchema>;

export function registerUpdatePermissionsBulkTool(
  server: McpServer,
    fronteggBaseUrl: string
) {
  server.tool(
    "update-permissions-bulk",
    "Updates multiple permissions in a single request to Frontegg.",
    updatePermissionsBulkSchema.shape,
    async (args: UpdatePermissionsBulkArgs) => {
      // Validation
      if (!args.permissions || args.permissions.length === 0) {
        logger.error(
          "[update-permissions-bulk] Error: No permissions provided for update."
        );
        return {
          content: [
            {
              type: "text",
              text: "Error: You must provide at least one permission to update.",
            },
          ],
        };
      }

      // Construct URL for bulk permissions update
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSIONS
      );
      logger.debug("[update-permissions-bulk] API URL:", {
        url: apiUrl.toString(),
      });

      // Extract permissions array for the request body
      const { permissions, fronteggTenantIdHeader } = args;

      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        permissions,
        "update-permissions-bulk"
      );

      logger.debug("[update-permissions-bulk] Response received", {
        status: response.status,
      });
      return formatToolResponse(response);
    }
  );
}
