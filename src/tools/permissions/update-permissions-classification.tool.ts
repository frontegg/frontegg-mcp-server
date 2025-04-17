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

// Zod schema for updating permission classifications
const updatePermissionsClassificationSchema = z
  .object({
    classification: z
      .array(
        z.object({
          category: z
            .string()
            .describe("The category of the permission classification."),
          permissions: z
            .array(z.string())
            .describe("Array of permission keys for this category."),
          description: z
            .string()
            .optional()
            .describe("Optional description for this classification category."),
        })
      )
      .describe("Array of classification objects to update."),
    fronteggTenantIdHeader: z
      .string()
      .optional()
      .describe(
        "Optional tenant ID to update classifications for a specific tenant."
      ),
  })
  .strict();

type UpdatePermissionsClassificationArgs = z.infer<
  typeof updatePermissionsClassificationSchema
>;

export function registerUpdatePermissionsClassificationTool(
  server: McpServer,
  fronteggToken: string | null,
  fronteggBaseUrl: string
) {
  server.tool(
    "update-permissions-classification",
    "Updates permission classifications in Frontegg API.",
    updatePermissionsClassificationSchema.shape,
    async (args: UpdatePermissionsClassificationArgs) => {
      // Validation
      if (!args.classification || args.classification.length === 0) {
        logger.error(
          "[update-permissions-classification] Error: No classifications provided for update."
        );
        return {
          content: [
            {
              type: "text",
              text: "Error: You must provide at least one classification to update.",
            },
          ],
        };
      }

      // Construct URL for permissions classification update
      const apiUrl = buildFronteggUrl(
        fronteggBaseUrl,
        FronteggEndpoints.PERMISSIONS_CLASSIFICATION
      );
      logger.debug("[update-permissions-classification] API URL:", {
        url: apiUrl.toString(),
      });

      // Extract classification array and tenantId for the request
      const { classification, fronteggTenantIdHeader } = args;

      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders({ fronteggTenantIdHeader }),
        { classification: classification },
        "update-permissions-classification"
      );

      logger.debug("[update-permissions-classification] Response received", {
        status: response.status,
      });
      return formatToolResponse(response);
    }
  );
}
