import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildFronteggUrl,
  createBaseHeaders,
  fetchFromFrontegg,
  formatToolResponse,
  HttpMethods,
  FronteggEndpoints,
} from "../../utils/api/frontegg-api";

// Zod schema based on POST /resources/applications/v1
const assignUsersToApplicationSchema = z
  .object({
    appId: z.string().describe("The ID of the application."),
    tenantId: z
      .string()
      .describe("The ID of the tenant within the request body."),
    userIds: z
      .array(z.string())
      .min(1)
      .describe("An array of user IDs to assign."),
  })
  .strict();

type AssignUsersToApplicationArgs = z.infer<
  typeof assignUsersToApplicationSchema
>;

// Function to register the assign-users-to-application tool
export function registerAssignUsersToApplicationTool(server: McpServer) {
  server.tool(
    "assign-users-to-application",
    "Assigns one or more users to a specific Frontegg application within a tenant.",
    assignUsersToApplicationSchema.shape,
    async (args: AssignUsersToApplicationArgs) => {
      const apiUrl = buildFronteggUrl(FronteggEndpoints.IDENTITY_APPLICATION);

      // Use optional headerTenantId for the header, separate from the body tenantId
      const headers = createBaseHeaders();

      // Construct the request body
      const body = {
        appId: args.appId,
        tenantId: args.tenantId,
        userIds: args.userIds,
      };

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        body,
        "assign-users-to-application"
      );

      // Frontegg API returns 201 Created for this endpoint upon success
      if (response.status === 201) {
        return formatToolResponse(
          response,
          "Users successfully assigned to the application."
        );
      }
      // Handle other potential success/error statuses by default
      return formatToolResponse(response);
    }
  );
}
