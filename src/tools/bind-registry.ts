/**
 * Binds a `ToolRegistry` to a live MCP `Server` instance — installs one
 * handler for `tools/list` and one for `tools/call` that dispatch through
 * the registry by name.
 *
 * This is split out from `./registry.ts` because the MCP SDK ships as pure
 * ESM, which ts-jest can't transpile in the current config. Keeping the SDK
 * import isolated to this single file means tests can exercise the registry
 * (and any tool module) without pulling the SDK into the import graph.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpTextContent } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { Logger } from '../utils/logger.js';

export function bindRegistry(server: Server, registry: ToolRegistry): void {
  const logger = Logger.getInstance();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('tools/list', { count: registry.names().length });
    return { tools: registry.list() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const name = request.params?.name as string;
    const args = request.params?.arguments;
    logger.debug('tools/call', { name });
    try {
      return await registry.call(name, args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('tools/call failed', { name, error: message });
      return {
        isError: true,
        content: [{ type: 'text', text: `Error: ${message}` } as McpTextContent],
      };
    }
  });
}
