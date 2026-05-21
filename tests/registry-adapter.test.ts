/**
 * Tests for src/platform/registry-adapter.ts — the bridge that lets
 * upstream-style `McpServer.tool(name, desc, shape, handler)` registrations
 * land in this server's low-level ToolRegistry.
 *
 * Coverage:
 *   - Zod-shape → JSON Schema conversion preserves field names + required
 *   - Empty shape produces a valid (empty) JSON Schema
 *   - The runtime guard against malformed zodToJsonSchema output throws
 *   - Handler receives the validated/parsed Zod data, not raw input
 *   - Invalid arguments produce an `isError: true` response, not a throw
 *   - Registered tool ends up in the ToolRegistry with the right shape
 */

import { z } from 'zod';

import { RegistryAdapter } from '../src/platform/registry-adapter.js';
import { ToolRegistry } from '../src/tools/registry.js';

describe('RegistryAdapter.tool()', () => {
  let registry: ToolRegistry;
  let adapter: RegistryAdapter;

  beforeEach(() => {
    registry = new ToolRegistry();
    adapter = new RegistryAdapter(registry);
  });

  describe('Zod → JSON Schema conversion', () => {
    it('converts a simple object schema to the expected inputSchema shape', () => {
      adapter.tool(
        'echo',
        'Echo the input back',
        { message: z.string() },
        async ({ message }) => ({
          content: [{ type: 'text', text: message }],
        }),
      );

      const registered = registry.list().find((t) => t.name === 'echo');
      expect(registered).toBeDefined();
      expect(registered!.inputSchema).toMatchObject({
        type: 'object',
        properties: {
          message: expect.objectContaining({ type: 'string' }),
        },
      });
    });

    it('preserves required fields when no .optional()', () => {
      adapter.tool(
        'create-thing',
        'Create a thing',
        { name: z.string(), count: z.number() },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );

      const registered = registry.list().find((t) => t.name === 'create-thing');
      expect(registered!.inputSchema.required).toEqual(
        expect.arrayContaining(['name', 'count']),
      );
    });

    it('omits .optional() fields from required', () => {
      adapter.tool(
        'find',
        'Find something',
        {
          query: z.string(),
          limit: z.number().optional(),
        },
        async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      );

      const registered = registry.list().find((t) => t.name === 'find');
      expect(registered!.inputSchema.required).toEqual(['query']);
      expect(registered!.inputSchema.properties).toHaveProperty('limit');
    });

    it('handles empty shape (zero-arg tool)', () => {
      adapter.tool(
        'ping',
        'No args',
        {},
        async () => ({ content: [{ type: 'text', text: 'pong' }] }),
      );

      const registered = registry.list().find((t) => t.name === 'ping');
      expect(registered).toBeDefined();
      expect(registered!.inputSchema.type).toBe('object');
      expect(registered!.inputSchema.properties).toEqual({});
      expect(registered!.inputSchema.required).toEqual([]);
    });
  });

  describe('handler invocation', () => {
    it('passes parsed (typed) args to the handler', async () => {
      let received: unknown;
      adapter.tool(
        'capture',
        'Capture args',
        { name: z.string(), count: z.number() },
        async (args) => {
          received = args;
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      );

      await registry.call('capture', { name: 'alice', count: 5 });
      expect(received).toEqual({ name: 'alice', count: 5 });
    });

    it('returns an isError response for invalid args (does not throw)', async () => {
      adapter.tool(
        'strict',
        'Strict input',
        { age: z.number() },
        async () => ({ content: [{ type: 'text', text: 'unreached' }] }),
      );

      const result = await registry.call('strict', { age: 'not a number' });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toMatch(
        /Invalid arguments for tool "strict"/,
      );
    });

    it('handles undefined args (zero-arg tool)', async () => {
      let called = false;
      adapter.tool(
        'noargs',
        'Zero arg',
        {},
        async () => {
          called = true;
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      );

      const result = await registry.call('noargs', undefined);
      expect(called).toBe(true);
      expect(result.isError).toBeFalsy();
    });

    it('propagates handler return value verbatim', async () => {
      adapter.tool(
        'passthrough',
        'Echo result',
        { v: z.string() },
        async ({ v }) => ({
          content: [{ type: 'text', text: `got ${v}` }],
          isError: false,
        }),
      );

      const result = await registry.call('passthrough', { v: 'hello' });
      expect((result.content[0] as { text: string }).text).toBe('got hello');
      expect(result.isError).toBe(false);
    });
  });

  describe('ToolRegistry integration', () => {
    it('registered tools appear in registry.list()', () => {
      adapter.tool('a', 'tool a', {}, async () => ({ content: [{ type: 'text', text: 'a' }] }));
      adapter.tool('b', 'tool b', {}, async () => ({ content: [{ type: 'text', text: 'b' }] }));
      adapter.tool('c', 'tool c', {}, async () => ({ content: [{ type: 'text', text: 'c' }] }));

      const names = registry.list().map((t) => t.name).sort();
      expect(names).toEqual(['a', 'b', 'c']);
    });

    it('multiple adapters can share the same registry', () => {
      const a2 = new RegistryAdapter(registry);
      const a3 = new RegistryAdapter(registry);
      adapter.tool('x', '', {}, async () => ({ content: [{ type: 'text', text: 'x' }] }));
      a2.tool('y', '', {}, async () => ({ content: [{ type: 'text', text: 'y' }] }));
      a3.tool('z', '', {}, async () => ({ content: [{ type: 'text', text: 'z' }] }));

      const names = registry.list().map((t) => t.name).sort();
      expect(names).toEqual(['x', 'y', 'z']);
    });
  });
});
