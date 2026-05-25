/**
 * Frontegg audit-log tool.
 *
 *   frontegg_audit_logs — query the vendor-environment audit trail.
 *
 * Endpoint (verified 2026-05-11 against api.frontegg.com with a vendor token):
 *
 *   GET /audits/resources/audits/v2
 *     (the short alias `/audits` returns the same body; the documented
 *      `/audits/resources/audits/v1` and `/audits/v1` are 404'd today.)
 *     Returns `{ data: AuditEvent[], total: number }`.
 *     Query params: count, offset, filter (free-text), tenantId, userId,
 *     fromDate, toDate (ISO-8601), sortBy, sortDirection (asc|desc),
 *     severity, action.
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

interface AuditEvent {
  frontegg_id?: string;
  vendorId?: string;
  tenantId?: string;
  severity?: string;
  email?: string;
  action?: string;
  description?: string;
  userId?: string;
  userAgent?: string;
  ip?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface AuditResponse {
  data: AuditEvent[];
  total: number;
}

const AUDIT_TOOL: McpTool = {
  name: 'frontegg_audit_logs',
  description:
    'Query Frontegg vendor-environment audit logs (login/logout/failed-attempts/' +
    'config changes/SDK events). Supports filtering by tenant, user, date range, ' +
    'severity, and free-text. Page size (count) is capped at 500 to stay within ' +
    'MCP transport response-size limits — paginate via offset for larger queries. ' +
    'Endpoint: GET /audits/resources/audits/v2. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      tenantId: {
        type: 'string',
        description: 'Filter events to a single tenant.',
      },
      userId: {
        type: 'string',
        description: 'Filter events to a single user.',
      },
      filter: {
        type: 'string',
        description:
          'Free-text substring filter (matches across action/description/email).',
      },
      action: {
        type: 'string',
        description:
          'Filter by action string (e.g. "User logged in", "Updated MFA policy"). Case-sensitive substring match in Frontegg.',
      },
      severity: {
        type: 'string',
        enum: ['Info', 'Medium', 'High', 'Critical'],
        description: 'Filter by severity. Frontegg uses Title-Case values.',
      },
      fromDate: {
        type: 'string',
        description:
          'Lower bound (inclusive) on createdAt, ISO-8601 (e.g. "2026-05-01" or "2026-05-01T00:00:00Z").',
      },
      toDate: {
        type: 'string',
        description: 'Upper bound on createdAt, ISO-8601.',
      },
      sortBy: {
        type: 'string',
        description: 'Field to sort by. Defaults to createdAt.',
      },
      sortDirection: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort direction. Default desc.',
      },
      count: {
        type: 'number',
        description: 'Page size. Default 50. Capped at 500 to stay within MCP transport limits.',
      },
      offset: {
        type: 'number',
        description: 'Pagination offset. Default 0.',
      },
    },
  },
};

const AuditArgsSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  filter: z.string().optional(),
  action: z.string().optional(),
  severity: z.enum(['Info', 'Medium', 'High', 'Critical']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  // Cap page size at 500 so a careless caller can't blow past MCP
  // transport response-size limits. Larger queries should paginate
  // via offset.
  count: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
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

export async function handleAuditLogs(raw: unknown) {
  try {
    const args = AuditArgsSchema.parse(raw);
    const qs = buildQuery({
      tenantId: args.tenantId,
      userId: args.userId,
      filter: args.filter,
      action: args.action,
      severity: args.severity,
      fromDate: args.fromDate,
      toDate: args.toDate,
      sortBy: args.sortBy,
      sortDirection: args.sortDirection,
      count: args.count,
      offset: args.offset,
    });
    const res = await fronteggApi<AuditResponse>({
      method: 'GET',
      path: `/audits/resources/audits/v2${qs}`,
    });
    const events = Array.isArray(res?.data) ? res.data : [];
    const total = typeof res?.total === 'number' ? res.total : events.length;
    const summary = events.map((e) => ({
      id: e.frontegg_id ?? null,
      createdAt: e.createdAt ?? null,
      severity: e.severity ?? null,
      action: e.action ?? null,
      description: e.description ?? null,
      email: e.email ?? null,
      userId: e.userId ?? null,
      tenantId: e.tenantId ?? null,
      ip: e.ip ?? null,
    }));
    return textResult(
      `# Audit Events (returned ${events.length} of ${total})\n\n\`\`\`json\n${json({
        total,
        events: summary,
      })}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

export const AUDIT_TOOL_DEF = AUDIT_TOOL;

export class FronteggAuditTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(AUDIT_TOOL, handleAuditLogs);
    this.logger.info('Registered 1 Frontegg audit tool');
  }
}
