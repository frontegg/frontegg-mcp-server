import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./utils/logger";

import {
  authenticateFrontegg,
  getFronteggToken,
  fronteggBaseUrl,
} from "./auth/fronteggAuth";

// Import the consolidated tool registration function
import { registerAllTools } from "./tools/index";

async function main() {
  await authenticateFrontegg();

  const token = getFronteggToken();
  if (!token) {
    logger.error("Failed to obtain Frontegg token. Exiting.");
    process.exit(1);
  }

  const server = new McpServer({
    name: "Frontegg-MCP-Server",
    version: "0.1.0",
  });

  registerAllTools(server, token, fronteggBaseUrl);

  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error) => {
  logger.error(`Failed to start MCP server: ${error}`);
  process.exit(1);
});
