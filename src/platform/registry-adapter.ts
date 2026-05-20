/**
 * RegistryAdapter — bridges upstream's high-level `McpServer.tool()` registration
 * style to this MCP server's low-level ToolRegistry.
 *
 * Why this exists
 * ---------------
 * Upstream (frontegg/frontegg-mcp-server) uses MCP SDK 1.x's `McpServer` class
 * which exposes `.tool(name, description, zodShape, handler)`. This server is
 * still on SDK 0.6.1 (low-level `Server`) and routes every tool through a
 * single ToolRegistry + bindRegistry to avoid the "last setRequestHandler
 * wins" bug.
 *
 * Rather than upgrade the SDK (high-risk, breaks existing tools) or rewrite
 * every upstream tool file (49 files), we expose this thin adapter that
 * presents the same `.tool()` surface upstream code expects, but routes the
 * registration through our ToolRegistry. The adapter handles:
 *
 *   1. Converting a zod object shape to JSON Schema (the registry stores
 *      JSON Schema, the MCP wire protocol uses JSON Schema, but upstream
 *      authors tools in zod).
 *
 *   2. Validating + coercing the args at call time using the zod schema,
 *      so upstream handlers receive a fully-typed object (not raw JSON).
 *
 *   3. Normalizing the handler's return value. Upstream returns
 *      `{ content: [{ type: 'text', text: '...' }], isError?: boolean }`
 *      which is already the MCP `tools/call` shape — we just pass through.
 */

import { z, type ZodRawShape, type ZodObject } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { ToolRegistry } from '../tools/registry.js';
import type { McpToolCallResult } from '../tools/mcp-types.js';

type UpstreamHandlerResult =
  | McpToolCallResult
  | Promise<McpToolCallResult>;

type UpstreamHandler<S extends ZodRawShape> = (
  args: z.infer<ZodObject<S>>,
) => UpstreamHandlerResult;

/**
 * Looks just enough like an `McpServer` for upstream tool files to call
 * `.tool(name, desc, shape, handler)`. Pass an instance to the upstream
 * `register*Tool(server)` functions and they will populate the wrapped
 * ToolRegistry.
 */
export class RegistryAdapter {
  constructor(private readonly registry: ToolRegistry) {}

  tool<S extends ZodRawShape>(
    name: string,
    description: string,
    shape: S,
    handler: UpstreamHandler<S>,
  ): void {
    const zodSchema = z.object(shape);

    // Convert zod shape to JSON Schema for tools/list. The registry stores
    // a flattened { type: 'object', properties, required } object.
    // Cast through `unknown` because zod-to-json-schema's generics can't
    // narrow our ZodRawShape-derived schema beyond `ZodType<any>` — the
    // resulting runtime JSON Schema is correct regardless.
    // zod-to-json-schema's type signature uses recursive zod generics that
    // TS 5 can't fully evaluate when fed a ZodObject<ZodRawShape>. We cast
    // through `any` here because the function works at runtime regardless;
    // its output shape is what we type below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullSchema = (zodToJsonSchema as any)(zodSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
      additionalProperties?: unknown;
    };

    // Runtime guard against silent schema-generation failures.
    // zodToJsonSchema is supposed to produce `{ type: "object", properties:
    // { ... } }` for a ZodObject input. If it ever returns something else
    // (upstream library change, malformed Zod schema upstream, an unsupported
    // schema kind getting passed through) we'd otherwise register a tool
    // with an empty / wrong input schema and the breakage would surface
    // much later as runtime validation errors on real callers.
    if (fullSchema.type !== 'object' || typeof fullSchema.properties !== 'object' || fullSchema.properties === null) {
      throw new Error(
        `RegistryAdapter: zodToJsonSchema did not produce an object schema for tool "${name}". ` +
          `Got type=${String(fullSchema.type)}, properties=${typeof fullSchema.properties}. ` +
          `Indicates a malformed upstream Zod schema or a zod-to-json-schema regression.`,
      );
    }

    const inputSchema = {
      type: 'object' as const,
      properties: fullSchema.properties,
      required: fullSchema.required ?? [],
    };

    this.registry.add(
      { name, description, inputSchema },
      async (args: unknown) => {
        const parsed = zodSchema.safeParse(args ?? {});
        if (!parsed.success) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Invalid arguments for tool "${name}": ${parsed.error.message}`,
              },
            ],
            isError: true,
          };
        }
        const result = await handler(parsed.data as z.infer<ZodObject<S>>);
        return result;
      },
    );
  }
}
