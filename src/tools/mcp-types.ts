/**
 * Local aliases for MCP Tool / TextContent types.
 *
 * The types exported from `@modelcontextprotocol/sdk/types.js` don't resolve
 * cleanly under strict TS in this project — the SDK 0.6.x types are defined
 * via `z.infer<typeof ToolSchema>` where `ToolSchema` is a `z.ZodObject`,
 * and with zod 3.25 the TS compiler reports the aliases as namespaces
 * rather than types. Using these small local interfaces sidesteps that
 * entirely and keeps the shape compatible with the MCP protocol.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpTextContent {
  type: 'text';
  text: string;
  [key: string]: unknown;
}

export interface McpToolCallResult {
  content: McpTextContent[];
  isError?: boolean;
  [key: string]: unknown;
}
