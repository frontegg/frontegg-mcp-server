/**
 * API-powered Frontegg webhook tools.
 *
 *   frontegg_webhooks_list   — list configured webhook subscriptions
 *   frontegg_webhooks_create — create a new webhook subscription
 *
 * Endpoint discovery (2026-05-11):
 *
 *   GET    /event/resources/configurations/v1            → 200, array of webhooks
 *   POST   /event/resources/configurations/v1            → 201, created webhook
 *   DELETE /event/resources/configurations/v1/{id}       → 200, deleted webhook
 *
 * All three confirmed working against the live tenant with a vendor token
 * (permission `fe.connectivity.*`).
 *
 * Required body fields on POST: `url`, `events` (string[]), `displayName`,
 * `key`. Optional: `secret`, `description`. The list response intentionally
 * hides `url`, `events`, and `secret`, returning only the metadata fields
 * (id, key, displayName, description, categoryId, vendorId, timestamps) —
 * full details are only available in the create response.
 *
 * The candidate paths from the expansion plan
 * (`/webhook/resources/configurations/v1`, `/webhooks/resources/v1`,
 * `/vendors/resources/webhooks/v1`, `/event/resources/webhook-configs/v1`)
 * all 404'd. The working path was discovered by enumerating
 * `/event/resources/*` and `/event/resources/configurations/*` variants.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { fronteggApi, FronteggApiError } from './frontegg-api-client.js';
import { Logger } from '../utils/logger.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const WEBHOOKS_PATH = '/event/resources/configurations/v1';

// Generate a Frontegg-friendly `key` from a displayName when the caller
// doesn't provide one. Keys are referenced inside Frontegg's internal event
// routing so we sanitize aggressively: ascii, lowercase, no whitespace,
// no leading digits. Length bounded to keep portal UI readable.
function deriveKey(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const sane = base.match(/^[a-z]/) ? base : `wh_${base}`;
  // Append a short timestamp suffix so re-creating an identically-named
  // webhook doesn't collide.
  return `${sane}_${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Webhook shape
// ---------------------------------------------------------------------------

interface WebhookRecord {
  id?: string;
  key?: string;
  displayName?: string;
  description?: string;
  url?: string;
  events?: string[];
  vendorId?: string;
  categoryId?: string | null;
  category?: unknown;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

const LIST_TOOL: McpTool = {
  name: 'frontegg_webhooks_list',
  description:
    'List all configured Frontegg webhook subscriptions via the Management API. ' +
    'Returns each webhook with id, key, displayName, description, and timestamps. ' +
    'Note: the Frontegg list endpoint intentionally omits the target `url`, the ' +
    'subscribed `events`, and the signing `secret` — those fields are only ' +
    'returned by the create endpoint, so capture them when creating a webhook. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

async function handleList(_raw: unknown) {
  try {
    const webhooks = await fronteggApi<WebhookRecord[]>({
      method: 'GET',
      path: WEBHOOKS_PATH,
    });
    const arr = Array.isArray(webhooks) ? webhooks : [];
    if (arr.length === 0) {
      return textResult('# Webhooks\n\nNo webhooks configured.');
    }
    const summary = arr
      .map((w) => {
        const name = w.displayName ?? w.key ?? w.id ?? 'unnamed';
        const desc = w.description ? ` — ${w.description}` : '';
        return `- **${name}** (\`${w.id}\`)${desc}`;
      })
      .join('\n');
    return textResult(
      `# Webhooks (${arr.length})\n\n${summary}\n\n## Raw\n\n\`\`\`json\n${json(arr)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

const CREATE_TOOL: McpTool = {
  name: 'frontegg_webhooks_create',
  description:
    'Create a new Frontegg webhook subscription. Required: `url` (HTTPS endpoint ' +
    'that will receive the events), `events` (array of Frontegg event names like ' +
    '"frontegg.user.created", "frontegg.user.deleted"), `displayName` (human-readable ' +
    'label shown in the Frontegg portal). Optional: `key` (auto-derived from ' +
    'displayName if omitted; must be unique per environment), `secret` (used by ' +
    'Frontegg to sign webhook payloads — recommend providing a random string ' +
    'or the API will assign one), `description`. Requires FRONTEGG_CLIENT_ID + ' +
    'FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'HTTPS endpoint that will receive Frontegg event POSTs.',
      },
      events: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Frontegg event names to subscribe to. Examples: "frontegg.user.created", ' +
          '"frontegg.user.deleted", "frontegg.tenant.created", "frontegg.user.login".',
      },
      displayName: {
        type: 'string',
        description: 'Human-readable label shown in the Frontegg portal.',
      },
      key: {
        type: 'string',
        description:
          'Optional unique identifier for the webhook within the environment. ' +
          'Auto-derived from displayName when omitted. Must be a string, no spaces.',
      },
      secret: {
        type: 'string',
        description:
          'Optional shared secret. Frontegg uses this to sign payloads so the ' +
          'receiver can verify authenticity. If omitted, Frontegg generates one.',
      },
      description: {
        type: 'string',
        description: 'Optional free-text description of the webhook purpose.',
      },
    },
    required: ['url', 'events', 'displayName'],
  },
};

const CreateArgsSchema = z.object({
  url: z.string().url({ message: 'url must be a valid URL (https://...)' }),
  events: z.array(z.string()).min(1, { message: 'events must contain at least one event name' }),
  displayName: z.string().min(1, { message: 'displayName cannot be empty' }),
  key: z.string().min(1).optional(),
  secret: z.string().optional(),
  description: z.string().optional(),
});

async function handleCreate(raw: unknown) {
  try {
    const args = CreateArgsSchema.parse(raw);

    const key = args.key ?? deriveKey(args.displayName);
    const body: Record<string, unknown> = {
      url: args.url,
      events: args.events,
      displayName: args.displayName,
      key,
    };
    if (args.secret !== undefined) body.secret = args.secret;
    if (args.description !== undefined) body.description = args.description;

    const created = await fronteggApi<WebhookRecord>({
      method: 'POST',
      path: WEBHOOKS_PATH,
      body,
    });

    return textResult(
      `# Webhook Created\n\n` +
        `**${args.displayName}** (\`${created?.id ?? '?'}\`)\n` +
        `- url: ${args.url}\n` +
        `- events: ${args.events.join(', ')}\n` +
        `- key: ${key}\n\n` +
        '## Raw response\n\n```json\n' +
        json(created) +
        '\n```\n\n' +
        '_Note: subsequent calls to `frontegg_webhooks_list` will NOT return the `url`, ' +
        '`events`, or `secret` fields — capture them from this response if you need them later._'
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggWebhooksTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LIST_TOOL, handleList);
    registry.add(CREATE_TOOL, handleCreate);
    this.logger.info('Registered 2 Frontegg webhooks tools');
  }
}

// Export internals for tests + smoke tests.
export const __test = {
  WEBHOOKS_PATH,
  handleList,
  handleCreate,
  CreateArgsSchema,
  deriveKey,
};
