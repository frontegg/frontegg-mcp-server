/**
 * Frontegg tenant tools.
 *
 *   frontegg_tenants_list — list tenants in the vendor environment.
 *
 * Endpoint (verified 2026-05-11 against api.frontegg.com with a vendor token):
 *
 *   GET /tenants/resources/tenants/v1
 *     Returns a JSON array of tenant objects.
 *     Query params: _limit, _offset, _filter (substring on name).
 *     There is also a /tenants/resources/tenants/v2 that returns the same
 *     data wrapped in `{ _metadata, _links, items[] }`. We use v1 by default
 *     because its flat array maps cleanly to LLM-consumable JSON; v2 is
 *     useful for clients that need pagination metadata.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { fronteggApi, FronteggApiError } from './frontegg-api-client.js';
import { Logger } from '../utils/logger.js';
import { z } from 'zod';

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorResult(err: unknown) {
  if (err instanceof FronteggApiError) {
    return textResult(`❌ Frontegg API error (${err.status}): ${err.message}`);
  }
  const msg = err instanceof Error ? err.message : String(err);
  return textResult(`❌ Error: ${msg}`);
}

interface TenantSummary {
  id: string;
  tenantId: string;
  name?: string;
  isReseller?: boolean;
  creatorEmail?: string | null;
  creatorName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  metadata?: string;
  [key: string]: unknown;
}

interface TenantsV2Response {
  _metadata?: { totalItems?: number; totalPages?: number };
  _links?: Record<string, string>;
  items: TenantSummary[];
}

const TENANTS_LIST_TOOL: McpTool = {
  name: 'frontegg_tenants_list',
  description:
    'List tenants (accounts) in the Frontegg vendor environment. ' +
    'Endpoint: GET /tenants/resources/tenants/v1 (or v2 with `paginated:true` for cursor metadata). ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description:
          'Page size (sent as `_limit`). Only honored when `paginated:true`.',
      },
      offset: {
        type: 'number',
        description: 'Page offset (sent as `_offset`). Only honored when `paginated:true`.',
      },
      filter: {
        type: 'string',
        description:
          'Substring filter on tenant name (sent as `_filter`).',
      },
      paginated: {
        type: 'boolean',
        description:
          'When true, call the v2 endpoint to get `_metadata.totalItems` + cursor links. Default false (v1 flat array).',
      },
    },
  },
};

const TenantsListArgsSchema = z.object({
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  filter: z.string().optional(),
  paginated: z.boolean().optional(),
});

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function summarize(t: TenantSummary) {
  return {
    id: t.id,
    tenantId: t.tenantId,
    name: t.name ?? null,
    isReseller: t.isReseller ?? false,
    creatorEmail: t.creatorEmail ?? null,
    createdAt: t.createdAt ?? null,
  };
}

export async function handleTenantsList(raw: unknown) {
  try {
    const args = TenantsListArgsSchema.parse(raw);
    const qs = buildQuery({
      _limit: args.limit,
      _offset: args.offset,
      _filter: args.filter,
    });

    if (args.paginated) {
      const data = await fronteggApi<TenantsV2Response>({
        method: 'GET',
        path: `/tenants/resources/tenants/v2${qs}`,
      });
      const items = Array.isArray(data?.items) ? data.items : [];
      const summary = items.map(summarize);
      const total = data?._metadata?.totalItems ?? items.length;
      return textResult(
        `# Tenants (returned ${items.length} of ${total})\n\n\`\`\`json\n${json({
          metadata: data?._metadata ?? null,
          tenants: summary,
        })}\n\`\`\``
      );
    }

    const tenants = await fronteggApi<TenantSummary[]>({
      method: 'GET',
      path: `/tenants/resources/tenants/v1${qs}`,
    });
    const arr = Array.isArray(tenants) ? tenants : [];
    const summary = arr.map(summarize);
    return textResult(
      `# Tenants (${summary.length})\n\n\`\`\`json\n${json(summary)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

export const TENANTS_LIST_TOOL_DEF = TENANTS_LIST_TOOL;

export class FronteggTenantsTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(TENANTS_LIST_TOOL, handleTenantsList);
    this.logger.info('Registered 1 Frontegg tenants tool');
  }
}
