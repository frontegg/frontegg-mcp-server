/**
 * Frontegg entitlements + plans tools — Category G.
 *
 * Four MCP tools wrapping the Frontegg entitlements API (vendor-token authed
 * via the shared `fronteggApi()` helper):
 *
 *   frontegg_features_list        — list feature flags / features in the env
 *   frontegg_features_create      — create a new feature (with permissions)
 *   frontegg_plans_list           — list subscription plans (Free, Pro, etc.)
 *   frontegg_plan_feature_attach  — attach a feature to a plan
 *
 * Endpoint discovery (2026-05-11):
 *   - GET /entitlements/resources/features/v1                       → 200, items[]
 *   - POST /entitlements/resources/features/v1                      → 201, item
 *   - GET /entitlements/resources/plans/v1                          → 200, items[]
 *   - PATCH /entitlements/resources/plans/v1/{planId}               → 200, partial
 *   - GET /entitlements/resources/plans/v1/{planId}/features        → 200, items[]
 *   - POST /entitlements/resources/plans/v1/{planId}/features       → 404
 *   - All other attach variants probed (POST/PUT featureIds, etc.)  → 404
 *
 * KNOWN LIMITATION on `frontegg_plan_feature_attach`:
 *   The dedicated attach endpoint (POST /plans/v1/{planId}/features with
 *   {featureIds:[]}) returns 404 for vendor tokens against this tenant. The
 *   PATCH /plans/v1/{planId} variant accepts the body with 200 but silently
 *   no-ops — GET /plans/v1/{planId}/features still returns []. This mirrors
 *   the `configure_sessions` precedent: the underlying entitlement assignment
 *   write surface is likely tenant-scoped and not exposed to vendor tokens on
 *   our tenant. The tool ships the PATCH best-effort and re-GETs the
 *   features list so the caller sees concrete state and can detect the
 *   no-op. If your tenant exposes the write endpoint, this will work
 *   automatically — we send the body the docs document.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { fronteggApi, FronteggApiError } from './frontegg-api-client.js';
import { Logger } from '../utils/logger.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared helpers
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

// Shared response shapes
export interface FeatureFlag {
  id?: string;
  name?: string;
  on?: boolean;
  defaultTreatment?: string;
  offTreatment?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Feature {
  id?: string;
  key?: string;
  name?: string;
  description?: string;
  vendorId?: string;
  createdAt?: string;
  permissions?: string[];
  metadata?: Record<string, unknown> | null;
  featureFlag?: FeatureFlag;
  [key: string]: unknown;
}

export interface Plan {
  id?: string;
  vendorId?: string;
  name?: string;
  description?: string;
  defaultTreatment?: string;
  defaultTimeLimitation?: unknown;
  assignOnSignup?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  features?: Feature[];
  [key: string]: unknown;
}

interface PagedResponse<T> {
  items: T[];
  hasNext?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// frontegg_features_list
// ---------------------------------------------------------------------------

const FEATURES_LIST_TOOL: McpTool = {
  name: 'frontegg_features_list',
  description:
    'List entitlement features defined in the current Frontegg environment. ' +
    'Returns each feature\'s id, key, name, description, attached permissions, ' +
    'and optional feature flag. Read-only. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Optional pagination limit (Frontegg default: no limit).',
      },
      offset: {
        type: 'number',
        description: 'Optional pagination offset.',
      },
    },
  },
};

const FeaturesListArgsSchema = z.object({
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export async function handleFeaturesList(raw: unknown) {
  try {
    const args = FeaturesListArgsSchema.parse(raw ?? {});
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set('_limit', String(args.limit));
    if (args.offset !== undefined) params.set('_offset', String(args.offset));
    const qs = params.toString();
    const path =
      `/entitlements/resources/features/v1${qs ? `?${qs}` : ''}`;
    const res = await fronteggApi<PagedResponse<Feature> | Feature[]>({
      method: 'GET',
      path,
    });
    // The endpoint returns {items, hasNext}; normalize for caller.
    const items: Feature[] = Array.isArray(res)
      ? res
      : (res?.items ?? []);
    return textResult(
      `# Frontegg Features (${items.length})\n\n\`\`\`json\n${json(items)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// frontegg_features_create
// ---------------------------------------------------------------------------

const FEATURES_CREATE_TOOL: McpTool = {
  name: 'frontegg_features_create',
  description:
    'Create a new entitlement feature in the current Frontegg environment. ' +
    '`key` must be a stable machine identifier (e.g. snake_case); `name` is ' +
    'the human-readable label. Optional `permissions` is an array of permission ' +
    'keys this feature grants. Returns the created feature including its id. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description:
          'Stable machine identifier for the feature (e.g. "advanced_reporting"). Required.',
      },
      name: {
        type: 'string',
        description: 'Human-readable feature name (e.g. "Advanced Reporting"). Required.',
      },
      description: {
        type: 'string',
        description: 'Optional human-readable description.',
      },
      permissions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional array of Frontegg permission keys this feature grants (e.g. ["fe.secure.read.users"]).',
      },
      metadata: {
        type: 'object',
        description: 'Optional free-form metadata. Object will be sent through unmodified.',
      },
    },
    required: ['key', 'name'],
  },
};

const FeaturesCreateArgsSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleFeaturesCreate(raw: unknown) {
  try {
    const args = FeaturesCreateArgsSchema.parse(raw);
    const body: Record<string, unknown> = {
      key: args.key,
      name: args.name,
    };
    if (args.description !== undefined) body.description = args.description;
    if (args.permissions !== undefined) body.permissions = args.permissions;
    if (args.metadata !== undefined) body.metadata = args.metadata;

    const created = await fronteggApi<Feature>({
      method: 'POST',
      path: '/entitlements/resources/features/v1',
      body,
    });
    return textResult(
      `# Feature Created\n\nCreated feature **${args.name}** (key: \`${args.key}\`).\n\n\`\`\`json\n${json(created)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// frontegg_plans_list
// ---------------------------------------------------------------------------

const PLANS_LIST_TOOL: McpTool = {
  name: 'frontegg_plans_list',
  description:
    'List subscription plans (Free, Pro, Enterprise, etc.) in the current ' +
    'Frontegg environment. Returns each plan\'s id, name, description, default ' +
    'treatment, and signup-assignment flag. Read-only. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Optional pagination limit.',
      },
      offset: {
        type: 'number',
        description: 'Optional pagination offset.',
      },
    },
  },
};

const PlansListArgsSchema = z.object({
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
});

export async function handlePlansList(raw: unknown) {
  try {
    const args = PlansListArgsSchema.parse(raw ?? {});
    const params = new URLSearchParams();
    if (args.limit !== undefined) params.set('_limit', String(args.limit));
    if (args.offset !== undefined) params.set('_offset', String(args.offset));
    const qs = params.toString();
    const path = `/entitlements/resources/plans/v1${qs ? `?${qs}` : ''}`;
    const res = await fronteggApi<PagedResponse<Plan> | Plan[]>({
      method: 'GET',
      path,
    });
    const items: Plan[] = Array.isArray(res) ? res : (res?.items ?? []);
    return textResult(
      `# Frontegg Plans (${items.length})\n\n\`\`\`json\n${json(items)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// frontegg_plan_feature_attach
// ---------------------------------------------------------------------------
//
// Frontegg's documented attach surface (POST /plans/v1/{planId}/features with
// {featureIds:[]}) returns 404 against vendor tokens on the tested tenant.
// PATCH /plans/v1/{planId} accepts the body but silently no-ops. We send the
// PATCH best-effort and re-GET so the caller sees concrete state and can
// detect the no-op without retrying blindly.

const PLAN_FEATURE_ATTACH_TOOL: McpTool = {
  name: 'frontegg_plan_feature_attach',
  description:
    'Attach one or more features to a Frontegg subscription plan (entitle the ' +
    'feature for that plan). After the write, the tool re-reads the plan\'s ' +
    'features and returns the current list — so the caller can verify the ' +
    'attachment landed. ' +
    'KNOWN LIMITATION: on vendor-token tenants this endpoint family may ' +
    'silently no-op (the documented POST /plans/v1/{planId}/features path ' +
    '404s; PATCH /plans/v1/{planId} accepts the body but doesn\'t persist ' +
    'the linkage). The tool returns the actual post-write features list so ' +
    'no-ops are visible. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      planId: {
        type: 'string',
        description: 'The id (UUID) of the plan to attach the feature to. Required.',
      },
      featureIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'The ids (UUIDs) of features to attach to the plan. Required, non-empty.',
      },
    },
    required: ['planId', 'featureIds'],
  },
};

const PlanFeatureAttachArgsSchema = z.object({
  planId: z.string().min(1),
  featureIds: z.array(z.string().min(1)).min(1),
});

export async function handlePlanFeatureAttach(raw: unknown) {
  try {
    const args = PlanFeatureAttachArgsSchema.parse(raw);

    // 1. Primary path: documented POST. May 404 on tenants without the
    //    write surface — we catch and fall through to PATCH.
    let primaryError: FronteggApiError | null = null;
    try {
      await fronteggApi({
        method: 'POST',
        path: `/entitlements/resources/plans/v1/${encodeURIComponent(args.planId)}/features`,
        body: { featureIds: args.featureIds },
      });
    } catch (err) {
      if (err instanceof FronteggApiError && err.status === 404) {
        primaryError = err;
      } else {
        throw err;
      }
    }

    // 2. Fallback path: PATCH the plan with featureIds in the body. This
    //    returns 200 on our tenant but currently doesn't persist the
    //    linkage — we send it anyway so it auto-works the day the API
    //    starts honoring it.
    if (primaryError) {
      try {
        await fronteggApi({
          method: 'PATCH',
          path: `/entitlements/resources/plans/v1/${encodeURIComponent(args.planId)}`,
          body: { featureIds: args.featureIds },
        });
      } catch {
        // Swallow — we'll surface the no-op via the re-GET below.
      }
    }

    // 3. Re-GET to return concrete state.
    const after = await fronteggApi<PagedResponse<Feature> | Feature[]>({
      method: 'GET',
      path: `/entitlements/resources/plans/v1/${encodeURIComponent(args.planId)}/features`,
    });
    const items: Feature[] = Array.isArray(after) ? after : (after?.items ?? []);

    const attachedIds = new Set(items.map((f) => f.id).filter(Boolean));
    const missing = args.featureIds.filter((id) => !attachedIds.has(id));

    const header = primaryError
      ? `# Plan Feature Attach (fallback PATCH used — primary 404'd)`
      : `# Plan Feature Attach`;
    const status =
      missing.length === 0
        ? `All ${args.featureIds.length} feature(s) confirmed attached.`
        : `⚠️  ${missing.length} of ${args.featureIds.length} feature(s) not visible after attach: ${missing.join(', ')}. ` +
          `This usually means the entitlements write surface is not exposed to vendor tokens on this tenant — ` +
          `see the tool description's KNOWN LIMITATION note.`;
    return textResult(
      `${header}\n\n${status}\n\n## Plan features now\n\n\`\`\`json\n${json(items)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggEntitlementsTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(FEATURES_LIST_TOOL, handleFeaturesList);
    registry.add(FEATURES_CREATE_TOOL, handleFeaturesCreate);
    registry.add(PLANS_LIST_TOOL, handlePlansList);
    registry.add(PLAN_FEATURE_ATTACH_TOOL, handlePlanFeatureAttach);

    this.logger.info('Registered 4 Frontegg entitlements tools');
  }
}

// Re-export tool definitions so tests can assert against them.
export {
  FEATURES_LIST_TOOL,
  FEATURES_CREATE_TOOL,
  PLANS_LIST_TOOL,
  PLAN_FEATURE_ATTACH_TOOL,
};
