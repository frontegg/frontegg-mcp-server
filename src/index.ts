import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./utils/logger";
import { getValidToken, fronteggBaseUrl } from "./auth";

import { registerAllTools } from "./tools/index";

async function main() {
  await getValidToken();

  logger.info("Starting Frontegg MCP Server...");

  const server = new McpServer({
    name: "Frontegg-MCP-Server",
    version: "0.1.0",
  });

  registerAllTools(server, fronteggBaseUrl);

  const transport = new StdioServerTransport();

  await server.connect(transport);
  logger.info("Frontegg MCP Server started successfully.");
}

main().catch((error) => {
  logger.error(`Failed to start MCP server: ${error}`);
  process.exit(1);
});
