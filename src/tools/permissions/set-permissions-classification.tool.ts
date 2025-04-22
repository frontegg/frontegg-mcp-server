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

// Zod schema for setting permission assignment type
const setPermissionsAssignmentTypeSchema = z
  .object({
    permissionIds: z
      .array(z.string())
      .min(1) // Ensure at least one permission ID is provided
      .describe(
        "Array of permission IDs or keys to update the assignment type for."
      ),
    type: z
      .enum(["NEVER", "ALWAYS", "ASSIGNABLE"])
      .describe(
        "The assignment type for the permissions (NEVER, ALWAYS, ASSIGNABLE)."
      ),
  })
  .strict();

type SetPermissionsAssignmentTypeArgs = z.infer<
  typeof setPermissionsAssignmentTypeSchema
>;

export function registerSetPermissionsClassificationTool(server: McpServer) {
  server.tool(
    "set-permissions-classification",
    "Sets the classification type (assignment rule: NEVER, ALWAYS, ASSIGNABLE) for specified permissions.",
    setPermissionsAssignmentTypeSchema.shape,
    async (args: SetPermissionsAssignmentTypeArgs) => {
      // Validation happens via Zod schema check now (min(1) for permissionIds)

      // Construct URL for permissions classification/assignment type update
      const apiUrl = buildFronteggUrl(
        FronteggEndpoints.PERMISSIONS_CLASSIFICATION
      );
      logger.debug("[set-permissions-classification] API URL:", {
        url: apiUrl.toString(),
      });

      // Extract arguments for the request body
      const { permissionIds, type } = args;

      const requestBody = {
        permissionIds: permissionIds,
        type: type,
      };

      const response = await fetchFromFrontegg(
        HttpMethods.PUT,
        apiUrl,
        createBaseHeaders(),
        requestBody,
        "set-permissions-classification"
      );

      logger.debug("[set-permissions-classification] Response received", {
        status: response.status,
      });
      return formatToolResponse(response);
    }
  );
}
