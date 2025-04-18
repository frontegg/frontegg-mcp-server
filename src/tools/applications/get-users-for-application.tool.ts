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

// Zod schema based on GET /resources/applications/v1/{appId}/users
const getUsersForApplicationSchema = z
  .object({
    appId: z.string().describe("The ID of the application."), // Path parameter
  })
  .strict();

type GetUsersForApplicationArgs = z.infer<typeof getUsersForApplicationSchema>;

// Function to register the get-users-for-application tool
export function registerGetUsersForApplicationTool(server: McpServer) {
  server.tool(
    "get-users-for-application",
    "Fetches users assigned to a specific Frontegg application.",
    getUsersForApplicationSchema.shape,
    async (args: GetUsersForApplicationArgs) => {
      const endpointPath = `${FronteggEndpoints.APPLICATION}/${args.appId}/users`;
      const apiUrl = buildFronteggUrl(endpointPath);

      const headers = createBaseHeaders();

      const response = await fetchFromFrontegg(
        HttpMethods.GET,
        apiUrl,
        headers,
        undefined, // No body for GET request
        "get-users-for-application"
      );

      return formatToolResponse(response);
    }
  );
}
