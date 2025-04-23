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

// Zod schema based on POST /resources/applications/v1/agents request body
const createAgentApplicationSchema = z
  .object({
    name: z.string().describe("The name of the agent application"),
    appURL: z.string().describe("The URL of the application"),
    loginURL: z.string().describe("The login URL of the application"),
    logoURL: z.string().optional().describe("URL to the application's logo"),
    accessType: z
      .enum(["FREE_ACCESS", "MANAGED_ACCESS"])
      .optional()
      .default("FREE_ACCESS")
      .describe("The access type for the application"),
    isDefault: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether this is the default application"),
    isActive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Whether the application is active"),
    type: z
      .enum(["web", "mobile-ios", "mobile-android", "agent", "other"])
      .default("agent")
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
      .default("react")
      .describe("The frontend technology stack used"),
    description: z.string().optional().describe("Description of the application"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional metadata for the application"),
    modelProvider: z
      .enum(["open-ai"])
      .describe("The model provider for the agent application"),
    orchestrationPlatform: z
      .enum(["crew-ai", "langchain"])
      .describe("The orchestration platform for the agent application"),
  })
  .strict();

type CreateAgentApplicationArgs = z.infer<typeof createAgentApplicationSchema>;

// Function to register the create-agent-application tool
export function registerCreateAgentApplicationTool(server: McpServer) {
  server.tool(
    "create_agent_application",
    "Creates a new agent application with the specified configuration.",
    createAgentApplicationSchema.shape,
    async (args: CreateAgentApplicationArgs) => {
      const apiUrl = buildFronteggUrl(`${FronteggEndpoints.APPLICATION}/agents`);
      const headers = createBaseHeaders();

      const response = await fetchFromFrontegg(
        HttpMethods.POST,
        apiUrl,
        headers,
        args,
        "create-agent-application"
      );

      return formatToolResponse(response);
    }
  );
}