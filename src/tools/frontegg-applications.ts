/**
 * API-powered Frontegg application management tools.
 *
 * Three tools that call the Frontegg Management API when credentials
 * (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET) are provided:
 *
 *   frontegg_applications_list    — list all applications in the environment
 *   frontegg_applications_get     — get a single application by id
 *   frontegg_applications_create  — create a new application
 *
 * Endpoint family verified 2026-05-11:
 *   GET    /applications/resources/applications/v1        → 200 list
 *   GET    /applications/resources/applications/v1/{id}   → 200 single
 *   POST   /applications/resources/applications/v1        → 201 created
 *   DELETE /applications/resources/applications/v1/{id}   → 200 (empty body)
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

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface FronteggApplication {
  id: string;
  vendorId?: string;
  isDefault?: boolean;
  accessType?: 'FREE_ACCESS' | 'MANAGED_ACCESS' | string;
  name: string;
  loginURL?: string;
  logoURL?: string | null;
  appURL?: string;
  isActive?: boolean;
  type?: string; // 'web' | 'mobile-android' | 'mobile-ios' | 'native' | ...
  frontendStack?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown> | null;
  description?: string | null;
  appHost?: string | null;
  allowDcr?: boolean;
  allowCimd?: boolean;
  dpopEnforcementType?: string;
  [key: string]: unknown;
}

// Application type values observed from the live API. Includes the documented
// short forms (web, native) and the mobile platform-specific values returned
// by the GET endpoint.
const APPLICATION_TYPES = [
  'web',
  'native',
  'mobile-android',
  'mobile-ios',
  'mobile',
] as const;

// Frontend stack values observed in the live API. Not validated server-side
// against an enum, so we keep this as a string field but document common values.
// Examples: 'react', 'angular', 'vue', 'kotlin', 'swift', 'flutter', 'react-native'.

// ---------------------------------------------------------------------------
// applications_list
// ---------------------------------------------------------------------------

const LIST_TOOL: McpTool = {
  name: 'frontegg_applications_list',
  description:
    'List all applications configured in the Frontegg vendor environment. ' +
    'Returns the full list (web, mobile, native apps) with their ids, names, ' +
    'login URLs, app URLs, and platform metadata. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const ListArgsSchema = z.object({}).passthrough();

export async function handleList(raw: unknown) {
  try {
    ListArgsSchema.parse(raw ?? {});
    const apps = await fronteggApi<FronteggApplication[]>({
      method: 'GET',
      path: '/applications/resources/applications/v1',
    });
    const count = Array.isArray(apps) ? apps.length : 0;
    return textResult(
      `# Frontegg Applications (${count})\n\n\`\`\`json\n${json(apps)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// applications_get
// ---------------------------------------------------------------------------

const GET_TOOL: McpTool = {
  name: 'frontegg_applications_get',
  description:
    'Get a single Frontegg application by its UUID. ' +
    'Returns the full application record (name, type, URLs, frontend stack, ' +
    'app host, access type, timestamps). ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The application UUID. Required.',
      },
    },
    required: ['id'],
  },
};

const GetArgsSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export async function handleGet(raw: unknown) {
  try {
    const args = GetArgsSchema.parse(raw);
    const app = await fronteggApi<FronteggApplication>({
      method: 'GET',
      path: `/applications/resources/applications/v1/${encodeURIComponent(args.id)}`,
    });
    return textResult(
      `# Frontegg Application: ${app?.name ?? args.id}\n\n\`\`\`json\n${json(app)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// applications_create
// ---------------------------------------------------------------------------

const CREATE_TOOL: McpTool = {
  name: 'frontegg_applications_create',
  description:
    'Create a new application in the Frontegg vendor environment. ' +
    'Required fields: name, type, appURL, loginURL. ' +
    'Optional: frontendStack ("react", "kotlin", "swift", etc.), description, ' +
    'logoURL, isActive, accessType ("FREE_ACCESS" or "MANAGED_ACCESS"). ' +
    'Returns the created application with its assigned UUID and appHost. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Display name for the application. Required.',
      },
      type: {
        type: 'string',
        enum: [...APPLICATION_TYPES],
        description:
          'Application type. One of: web, native, mobile-android, mobile-ios, mobile. Required.',
      },
      appURL: {
        type: 'string',
        description:
          'URL of the customer-facing application (e.g. http://localhost:3000 or https://app.example.com). Required.',
      },
      loginURL: {
        type: 'string',
        description:
          'OAuth login URL, typically the tenant\'s Frontegg subdomain /oauth path. Required.',
      },
      frontendStack: {
        type: 'string',
        description:
          'Optional. Frontend stack hint: react, angular, vue, kotlin, swift, flutter, react-native, etc.',
      },
      description: {
        type: 'string',
        description: 'Optional human-readable description.',
      },
      logoURL: {
        type: 'string',
        description: 'Optional logo URL.',
      },
      isActive: {
        type: 'boolean',
        description: 'Optional. Whether the application is active. Defaults to API-side value.',
      },
      accessType: {
        type: 'string',
        enum: ['FREE_ACCESS', 'MANAGED_ACCESS'],
        description:
          'Optional. FREE_ACCESS = open to any user; MANAGED_ACCESS = admin-assigned access.',
      },
      metadata: {
        type: 'object',
        description: 'Optional metadata blob attached to the application.',
      },
    },
    required: ['name', 'type', 'appURL', 'loginURL'],
  },
};

const CreateArgsSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.enum(APPLICATION_TYPES),
  appURL: z.string().min(1, 'appURL is required'),
  loginURL: z.string().min(1, 'loginURL is required'),
  frontendStack: z.string().optional(),
  description: z.string().optional(),
  logoURL: z.string().optional(),
  isActive: z.boolean().optional(),
  accessType: z.enum(['FREE_ACCESS', 'MANAGED_ACCESS']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleCreate(raw: unknown) {
  try {
    const args = CreateArgsSchema.parse(raw);
    const body: Record<string, unknown> = {
      name: args.name,
      type: args.type,
      appURL: args.appURL,
      loginURL: args.loginURL,
    };
    if (args.frontendStack !== undefined) body.frontendStack = args.frontendStack;
    if (args.description !== undefined) body.description = args.description;
    if (args.logoURL !== undefined) body.logoURL = args.logoURL;
    if (args.isActive !== undefined) body.isActive = args.isActive;
    if (args.accessType !== undefined) body.accessType = args.accessType;
    if (args.metadata !== undefined) body.metadata = args.metadata;

    const created = await fronteggApi<FronteggApplication>({
      method: 'POST',
      path: '/applications/resources/applications/v1',
      body,
    });

    // If the POST returns an empty body, re-fetch the list and find by name
    // so the result is always concrete. (Precedent: configure_sessions.)
    if (!created || typeof created !== 'object' || !created.id) {
      const all = await fronteggApi<FronteggApplication[]>({
        method: 'GET',
        path: '/applications/resources/applications/v1',
      });
      const match = Array.isArray(all)
        ? all.find((a) => a.name === args.name)
        : null;
      if (match) {
        return textResult(
          `# Application Created\n\n\`\`\`json\n${json(match)}\n\`\`\``
        );
      }
      return textResult(
        `# Application Created\n\nServer returned empty body. Could not locate the new app by name in subsequent list.`
      );
    }

    return textResult(
      `# Application Created\n\nNew app **${created.name}** (id: \`${created.id}\`)\n\n\`\`\`json\n${json(created)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggApplicationsTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LIST_TOOL, handleList);
    registry.add(GET_TOOL, handleGet);
    registry.add(CREATE_TOOL, handleCreate);

    this.logger.info('Registered 3 Frontegg applications tools');
  }
}

// Exports for tests
export {
  LIST_TOOL,
  GET_TOOL,
  CREATE_TOOL,
  ListArgsSchema,
  GetArgsSchema,
  CreateArgsSchema,
};
