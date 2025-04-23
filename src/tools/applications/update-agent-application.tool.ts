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

// Zod schema based on PATCH /resources/applications/v1/agents/{id} request body
const updateAgentApplicationSchema = z
  .object({
    id: z.string().describe("The ID of the agent application to update"),
    name: z.string().optional().describe("The name of the agent application"),
    appURL: z.string().optional().describe("The URL of the application"),
    loginURL: z.string().optional().describe("The login URL of the application"),
    logoURL: z.string().optional().describe("URL to the application's logo"),
    accessType: z
      .enum(["FREE_ACCESS", "MANAGED_ACCESS"])
      .optional()
      .describe("The access type for the application"),
    isDefault: z
      .boolean()
      .optional()
      .describe("Whether this is the default application"),
    isActive: z
      .boolean()
      .optional()
      .describe("Whether the application is active"),
    type: z
      .enum(["web", "mobile-ios", "mobile-android", "agent", "other"])
      .optional()
      .describe("The type of application"),
    frontendStack: z
      .enum([
        "react",
        "vue",
        "angular",
        "next.js",
        "vanilla.js",
        "ionic",
        "flutter",
        "react-native",
        "kotlin",
        "swift",
      ])
      .optional()
      .describe("The frontend technology stack used"),
    description: z.string().optional().describe("Description of the application"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional metadata for the application"),
    modelProvider: z
      .enum(["open-ai"])
      .optional()
      .describe("The model provider for the agent application"),
    orchestrationPlatform: z
      .enum(["crew-ai", "langchain"])
      .optional()
      .describe("The orchestration platform for the agent application"),
  })
  .strict();

type UpdateAgentApplicationArgs = z.infer<typeof updateAgentApplicationSchema>;

// Function to register the update-agent-application tool
export function registerUpdateAgentApplicationTool(server: McpServer) {
  server.tool(
    "update_agent_application",
    "Updates an existing agent application with the specified configuration.",
    updateAgentApplicationSchema.shape,
    async (args: UpdateAgentApplicationArgs) => {
      const { id, ...updateData } = args;
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.APPLICATION}/agents/${id}`);
      const headers = createBaseHeaders();

      const response = await fetchFromFrontegg(
        HttpMethods.PATCH,
        apiUrl,
        headers,
        updateData,
        "update-agent-application"
      );

      return formatToolResponse(response);
    }
  );
}