/**
 * Single source of truth for which MCP tools the server exposes.
 *
 * The MCP SDK keys handlers by request schema (e.g. CallToolRequestSchema)
 * and silently overwrites a previous registration for the same schema. That
 * means if six tool classes each call `server.setRequestHandler(CallTool…)`
 * only the last one wins, which is the bug we had: 5 of our 6 tools were
 * dead surface even though the README and toolDefinition advertised them.
 *
 * The registry decouples tool implementation from MCP wiring. Each tool
 * class registers its definitions + handlers with a `ToolRegistry`, then
 * `bindRegistry()` (in `./bind-registry.js`) installs ONE handler for
 * `tools/list` and ONE for `tools/call` that route by name through the
 * registry.
 *
 * Note: this file deliberately does NOT import the MCP SDK at runtime so
 * it can be exercised from Jest (the SDK ships pure ESM and Jest's ts-jest
 * transformer doesn't transpile node_modules). The SDK-binding side lives
 * in `./bind-registry.ts` and is only loaded by `src/index.ts`.
 */

import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import { Logger } from '../utils/logger.js';

export type ToolHandler = (args: unknown) => Promise<McpToolCallResult>;

export interface RegisteredTool {
  definition: McpTool;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly logger = Logger.getInstance();

  add(definition: McpTool, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      this.logger.warn('Tool re-registration overwriting prior entry', {
        name: definition.name,
      });
    }
    this.tools.set(definition.name, { definition, handler });
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): McpTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  async call(name: string, args: unknown): Promise<McpToolCallResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(
        `Unknown tool: ${name}. Known tools: ${this.names().join(', ')}`
      );
    }
    return tool.handler(args);
  }
}

/** Wrap text in the MCP `tools/call` content envelope. */
export function textResult(text: string): McpToolCallResult {
  const content: McpTextContent[] = [{ type: 'text', text }];
  return { content };
}
