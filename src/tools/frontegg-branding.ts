/**
 * API-powered Frontegg branding tools.
 *
 * Two tools that call the Frontegg Management API when credentials
 * (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET) are provided:
 *
 *   frontegg_branding_get     — read the tenant branding (theme, logo, colors)
 *   frontegg_branding_update  — update branding (primaryColor, logoUrl, themeName, etc.)
 *
 * Endpoint discovery (2026-05-11):
 * Frontegg does NOT expose a dedicated `/branding/v1` endpoint to vendor
 * tokens — every plausible variant under `/branding/*` is blocked by WAF
 * (403) or 404s. After probing 40+ candidate paths, the actual storage
 * lives in the `/metadata` collection, keyed by `entityName=adminBox`:
 *
 *   GET  /metadata?entityName=adminBox
 *     → { rows: [{ configuration: { theme, themeV2, navigation, ... } }] }
 *   POST /metadata
 *     body: { entityName: "adminBox", configuration: { ... } }
 *     → 201 with the new row
 *
 * IMPORTANT: POST /metadata REPLACES the entire `configuration` field on
 * the matching row — it is NOT a deep merge. To safely update only the
 * branding pieces (primary color, logo, theme name) without nuking the
 * admin portal navigation/integrations/localization config, we read the
 * current configuration first, deep-merge the new fields in, then POST
 * the full merged blob back. This is the precedent set by
 * configure_sessions's read-after-write pattern.
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

/**
 * Recursively merge `patch` into `base`. Both must be plain objects.
 * Arrays and primitives in `patch` overwrite the value at the same key in
 * `base`. This is the merge semantics Frontegg's portal UI applies before
 * POSTing back the whole configuration blob.
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, unknown>
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const cur = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      cur &&
      typeof cur === 'object' &&
      !Array.isArray(cur)
    ) {
      out[key] = deepMerge(
        cur as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetadataRow {
  _id?: string;
  entityName?: string;
  vendorId?: string;
  configuration?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface MetadataResponse {
  rows: MetadataRow[];
}

// Branding "summary" we extract from the larger adminBox configuration so
// the tool result is digestible. The full configuration is also returned.
interface BrandingSummary {
  themeName?: string;
  primaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  name?: string;
}

function extractBrandingSummary(config: Record<string, unknown>): BrandingSummary {
  const summary: BrandingSummary = {};
  const theme = (config['theme'] as Record<string, unknown>) || {};
  const themeV2 = (config['themeV2'] as Record<string, unknown>) || {};
  const loginBox = (themeV2['loginBox'] as Record<string, unknown>) || {};
  const logo = (loginBox['logo'] as Record<string, unknown>) || {};
  const rootStyle = (loginBox['rootStyle'] as Record<string, unknown>) || {};

  if (typeof loginBox['themeName'] === 'string') summary.themeName = loginBox['themeName'] as string;
  if (typeof theme['primaryColor'] === 'string') summary.primaryColor = theme['primaryColor'] as string;
  // themeV2 primary color often lives under rootStyle or palette
  if (!summary.primaryColor && typeof rootStyle['primaryColor'] === 'string') {
    summary.primaryColor = rootStyle['primaryColor'] as string;
  }
  if (typeof logo['image'] === 'string') summary.logoUrl = logo['image'] as string;
  if (typeof theme['logoUrl'] === 'string' && !summary.logoUrl) {
    summary.logoUrl = theme['logoUrl'] as string;
  }
  if (typeof theme['faviconUrl'] === 'string') summary.faviconUrl = theme['faviconUrl'] as string;
  if (typeof theme['name'] === 'string') summary.name = theme['name'] as string;
  return summary;
}

async function fetchAdminBoxConfig(): Promise<Record<string, unknown>> {
  const res = await fronteggApi<MetadataResponse>({
    method: 'GET',
    path: '/metadata?entityName=adminBox',
  });
  const row = res?.rows?.[0];
  if (!row || !row.configuration) {
    return {};
  }
  return row.configuration;
}

// ---------------------------------------------------------------------------
// branding_get
// ---------------------------------------------------------------------------

const GET_TOOL: McpTool = {
  name: 'frontegg_branding_get',
  description:
    'Read the current Frontegg tenant branding configuration (theme, logo, ' +
    'primary color, theme name, social-login layout, signup/login disclaimers). ' +
    'Returns a parsed summary of the most-used fields plus the full raw ' +
    'configuration blob for advanced inspection. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const GetArgsSchema = z.object({}).passthrough();

export async function handleGet(raw: unknown) {
  try {
    GetArgsSchema.parse(raw ?? {});
    const config = await fetchAdminBoxConfig();
    const summary = extractBrandingSummary(config);

    const sections: string[] = ['# Frontegg Branding'];
    sections.push('\n## Summary\n\n```json\n' + json(summary) + '\n```');
    sections.push('\n## Full configuration\n\n```json\n' + json(config) + '\n```');
    return textResult(sections.join('\n'));
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// branding_update
// ---------------------------------------------------------------------------

const UPDATE_TOOL: McpTool = {
  name: 'frontegg_branding_update',
  description:
    'Update the Frontegg tenant branding (primary color, logo URL, theme name, ' +
    'favicon, application display name). Performs a safe read-modify-write: ' +
    'fetches the current adminBox configuration, deep-merges the provided ' +
    'fields, and POSTs the full blob back. Provide only the fields you want ' +
    'to change. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      primaryColor: {
        type: 'string',
        description:
          'Primary brand color as a CSS color string (hex, rgb, or named). Example: "#5C2EAD".',
      },
      logoUrl: {
        type: 'string',
        description:
          'Public URL of the brand logo image. Used in the hosted login box. Example: "https://cdn.example.com/logo.png".',
      },
      faviconUrl: {
        type: 'string',
        description: 'Public URL of the favicon image.',
      },
      themeName: {
        type: 'string',
        enum: ['light', 'dark'],
        description: 'Theme name for the login box. One of: light, dark.',
      },
      name: {
        type: 'string',
        description:
          'Display name of the application as shown on the login page (e.g. "Acme Inc").',
      },
    },
  },
};

const UpdateArgsSchema = z
  .object({
    primaryColor: z.string().optional(),
    logoUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
    themeName: z.enum(['light', 'dark']).optional(),
    name: z.string().optional(),
  })
  .refine(
    (v) =>
      v.primaryColor !== undefined ||
      v.logoUrl !== undefined ||
      v.faviconUrl !== undefined ||
      v.themeName !== undefined ||
      v.name !== undefined,
    {
      message:
        'Provide at least one of: primaryColor, logoUrl, faviconUrl, themeName, name.',
    }
  );

/**
 * Build the patch object that maps user-friendly fields to Frontegg's
 * nested adminBox configuration. The shape mirrors what the Frontegg
 * portal writes when you change settings in the UI.
 */
export function buildBrandingPatch(args: {
  primaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  themeName?: 'light' | 'dark';
  name?: string;
}): Record<string, unknown> {
  const theme: Record<string, unknown> = {};
  const loginBox: Record<string, unknown> = {};

  if (args.primaryColor !== undefined) {
    theme['primaryColor'] = args.primaryColor;
    // themeV2 mirror — Frontegg keeps both for backwards compat.
    loginBox['rootStyle'] = { primaryColor: args.primaryColor };
  }
  if (args.logoUrl !== undefined) {
    theme['logoUrl'] = args.logoUrl;
    loginBox['logo'] = { image: args.logoUrl };
  }
  if (args.faviconUrl !== undefined) {
    theme['faviconUrl'] = args.faviconUrl;
  }
  if (args.themeName !== undefined) {
    loginBox['themeName'] = args.themeName;
  }
  if (args.name !== undefined) {
    theme['name'] = args.name;
  }

  const patch: Record<string, unknown> = {};
  if (Object.keys(theme).length > 0) patch['theme'] = theme;
  if (Object.keys(loginBox).length > 0) {
    patch['themeV2'] = { loginBox };
  }
  return patch;
}

export async function handleUpdate(raw: unknown) {
  try {
    const args = UpdateArgsSchema.parse(raw);

    // Read current config so we don't clobber unrelated settings.
    const current = await fetchAdminBoxConfig();
    const patch = buildBrandingPatch(args);
    const merged = deepMerge(current, patch);

    // POST the merged blob. Frontegg returns the new row; we still re-GET
    // to be safe (the POST response can omit fields the read returns).
    await fronteggApi<MetadataRow>({
      method: 'POST',
      path: '/metadata',
      body: { entityName: 'adminBox', configuration: merged },
    });

    const after = await fetchAdminBoxConfig();
    const summary = extractBrandingSummary(after);

    return textResult(
      `# Branding Updated\n\nApplied: \`${json(args)}\`\n\n## New summary\n\n\`\`\`json\n${json(summary)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggBrandingTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(GET_TOOL, handleGet);
    registry.add(UPDATE_TOOL, handleUpdate);

    this.logger.info('Registered 2 Frontegg branding tools');
  }
}

// Exports for tests
export {
  GET_TOOL,
  UPDATE_TOOL,
  GetArgsSchema,
  UpdateArgsSchema,
  extractBrandingSummary,
  fetchAdminBoxConfig,
};
