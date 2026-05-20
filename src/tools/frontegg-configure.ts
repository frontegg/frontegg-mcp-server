/**
 * API-powered Frontegg configuration tools.
 *
 * Four tools that call the real Frontegg Management API when credentials
 * (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET) are provided:
 *
 *   frontegg_configure_mfa        — read/write MFA policy
 *   frontegg_configure_sessions   — read/write session configuration
 *   frontegg_configure_sso        — list/create SSO connections
 *   frontegg_configure_identity   — read/write identity (auth) configuration
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
// MFA Policy
// ---------------------------------------------------------------------------

interface MfaPolicy {
  enforceMFAType?: string; // 'DontForce' | 'Force' | 'ForceExceptSAML'
  allowRememberMyDevice?: boolean;
  mfaDeviceExpiration?: number;
  mfaToken?: string;
  [key: string]: unknown;
}

const MFA_TOOL: McpTool = {
  name: 'frontegg_configure_mfa',
  description:
    'Read or update the Frontegg MFA policy via the Management API. ' +
    'action="get" reads the current policy; action="update" applies changes. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the MFA policy.',
      },
      enforceMFAType: {
        type: 'string',
        enum: ['DontForce', 'Force', 'ForceExceptSAML'],
        description: 'MFA enforcement type. Only used when action="update".',
      },
      allowRememberMyDevice: {
        type: 'boolean',
        description: 'Allow users to skip MFA on trusted devices. Only for action="update".',
      },
      mfaDeviceExpiration: {
        type: 'number',
        description: 'Days before a remembered device expires. Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const MfaArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  enforceMFAType: z.enum(['DontForce', 'Force', 'ForceExceptSAML']).optional(),
  allowRememberMyDevice: z.boolean().optional(),
  mfaDeviceExpiration: z.number().optional(),
});

async function handleMfa(raw: unknown) {
  try {
    const args = MfaArgsSchema.parse(raw);
    if (args.action === 'get') {
      const policy = await fronteggApi<MfaPolicy>({
        method: 'GET',
        path: '/identity/resources/configurations/v1/mfa-policy',
      });
      return textResult(`# Current MFA Policy\n\n\`\`\`json\n${json(policy)}\n\`\`\``);
    }

    // Build update payload with only provided fields
    const body: Record<string, unknown> = {};
    if (args.enforceMFAType !== undefined) body.enforceMFAType = args.enforceMFAType;
    if (args.allowRememberMyDevice !== undefined) body.allowRememberMyDevice = args.allowRememberMyDevice;
    if (args.mfaDeviceExpiration !== undefined) body.mfaDeviceExpiration = args.mfaDeviceExpiration;

    if (Object.keys(body).length === 0) {
      return textResult('No fields provided to update. Provide at least one of: enforceMFAType, allowRememberMyDevice, mfaDeviceExpiration.');
    }

    const updated = await fronteggApi<MfaPolicy>({
      method: 'PUT',
      path: '/identity/resources/configurations/v1/mfa-policy',
      body,
    });
    return textResult(`# MFA Policy Updated\n\n\`\`\`json\n${json(updated)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

interface SessionConfig {
  [key: string]: unknown;
}

// KNOWN LIMITATION (2026-05-11):
// Vendor tokens cannot read or write the tenant session-policy via any
// /identity/resources/configurations/sessions/v1 variant we tested.
// POST returns 201 with empty body, GET returns {}, and 20+ alternative
// paths (/identity/.../session-policy, /identity/.../session-config,
// /applications/.../sessions, /team/.../sessions, etc.) all 404.
// This endpoint is likely tenant-scoped and requires a non-vendor auth
// (tenant or user token with admin role). Until Frontegg exposes a
// vendor-scoped session endpoint, this tool is best-effort — it sends
// the PATCH but the portal session policy will not update.
//
// Filed as TODO. Recording uses configure_mfa + configure_identity +
// configure_sso for tenant beats; sessions is excluded from showcases
// until the auth model is sorted out.
const SESSIONS_TOOL: McpTool = {
  name: 'frontegg_configure_sessions',
  description:
    'Read or update the Frontegg tenant session configuration via the Management API. ' +
    'action="get" reads current config; action="update" applies changes. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. ' +
    'KNOWN LIMITATION: on vendor-token tenants this endpoint may silently no-op ' +
    '(POST returns 201 / GET returns {}). The session policy likely requires a ' +
    'tenant-scoped token, which this MCP does not yet support. Prefer ' +
    'frontegg_configure_identity (token TTL, signup, JWT claims) for tenant-policy ' +
    'changes that work end-to-end.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the session config.',
      },
      maxConcurrentSessions: {
        type: 'number',
        description: 'Maximum concurrent sessions per user. 0 = unlimited. Only for action="update".',
      },
      sessionIdleTimeoutMinutes: {
        type: 'number',
        description: 'Minutes of inactivity before session expires. Only for action="update".',
      },
      sessionMaxAgeMinutes: {
        type: 'number',
        description: 'Absolute maximum session lifetime in minutes. Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const SessionsArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  maxConcurrentSessions: z.number().optional(),
  sessionIdleTimeoutMinutes: z.number().optional(),
  sessionMaxAgeMinutes: z.number().optional(),
});

async function handleSessions(raw: unknown) {
  try {
    const args = SessionsArgsSchema.parse(raw);
    if (args.action === 'get') {
      const config = await fronteggApi<SessionConfig>({
        method: 'GET',
        path: '/identity/resources/configurations/sessions/v1',
      });
      return textResult(`# Current Session Configuration\n\n\`\`\`json\n${json(config)}\n\`\`\``);
    }

    const body: Record<string, unknown> = {};
    if (args.maxConcurrentSessions !== undefined) body.maxConcurrentSessions = args.maxConcurrentSessions;
    if (args.sessionIdleTimeoutMinutes !== undefined) body.sessionIdleTimeoutMinutes = args.sessionIdleTimeoutMinutes;
    if (args.sessionMaxAgeMinutes !== undefined) body.sessionMaxAgeMinutes = args.sessionMaxAgeMinutes;

    if (Object.keys(body).length === 0) {
      return textResult('No fields provided to update. Provide at least one of: maxConcurrentSessions, sessionIdleTimeoutMinutes, sessionMaxAgeMinutes.');
    }

    await fronteggApi<SessionConfig>({
      method: 'POST',
      path: '/identity/resources/configurations/sessions/v1',
      body,
    });
    // Re-read the config so we always return concrete state, even if the
    // PATCH endpoint replies with an empty body.
    const current = await fronteggApi<SessionConfig>({
      method: 'GET',
      path: '/identity/resources/configurations/sessions/v1',
    });
    return textResult(`# Session Configuration Updated\n\n\`\`\`json\n${json(current)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Social SSO (Google, GitHub, Microsoft, etc.)
// Enterprise SAML/OIDC SSO is a separate Frontegg endpoint family that
// requires tenant-scoped tokens — not yet supported by this tool.
// ---------------------------------------------------------------------------

interface SsoConnection {
  type?: string; // 'google' | 'github' | 'microsoft' | ...
  clientId?: string;
  redirectUrl?: string;
  redirectUrlPattern?: string;
  active?: boolean;
  additionalScopes?: string[];
  [key: string]: unknown;
}

// Frontegg social login providers supported by /identity/resources/sso/v1.
// Enterprise SAML/OIDC SSO lives on a different endpoint (/team/resources/sso/v1)
// that requires tenant-scoped tokens — not supported by this tool yet.
const SOCIAL_PROVIDERS = [
  'google',
  'github',
  'microsoft',
  'facebook',
  'linkedin',
  'gitlab',
  'slack',
  'twitter',
  'apple',
] as const;

const SSO_TOOL: McpTool = {
  name: 'frontegg_configure_sso',
  description:
    'List or create a Frontegg social login provider (Google, GitHub, Microsoft, Facebook, LinkedIn, GitLab, Slack, Twitter, Apple) via the Management API. ' +
    'action="list" returns the configured providers; action="create" registers a new one. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars. ' +
    'Note: enterprise SAML/OIDC SSO is on a separate Frontegg endpoint and is not handled by this tool.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create'],
        description: 'Whether to list configured social providers ("list") or register a new one ("create").',
      },
      type: {
        type: 'string',
        enum: [...SOCIAL_PROVIDERS],
        description:
          'Social provider name. Required for action="create". One of: google, github, microsoft, facebook, linkedin, gitlab, slack, twitter, apple.',
      },
      clientId: {
        type: 'string',
        description: 'OAuth client ID from the social provider. Required for action="create".',
      },
      secret: {
        type: 'string',
        description: 'OAuth client secret from the social provider. Required for action="create".',
      },
      redirectUrl: {
        type: 'string',
        description:
          'OAuth redirect URL. Required for action="create". Typically https://<your-frontegg-domain>/oauth/account/social/success.',
      },
      active: {
        type: 'boolean',
        description: 'Whether the provider is active. Defaults to true. Optional for action="create".',
      },
      additionalScopes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra OAuth scopes to request. Optional for action="create".',
      },
    },
    required: ['action'],
  },
};

const SsoArgsSchema = z.object({
  action: z.enum(['list', 'create']),
  type: z.enum(SOCIAL_PROVIDERS).optional(),
  clientId: z.string().optional(),
  secret: z.string().optional(),
  redirectUrl: z.string().optional(),
  active: z.boolean().optional(),
  additionalScopes: z.array(z.string()).optional(),
});

async function handleSso(raw: unknown) {
  try {
    const args = SsoArgsSchema.parse(raw);
    if (args.action === 'list') {
      // Social SSO providers (environment-level)
      const socialProviders = await fronteggApi<SsoConnection[]>({
        method: 'GET',
        path: '/identity/resources/sso/v1',
      });
      const sections: string[] = ['# SSO Configuration'];

      if (socialProviders && Array.isArray(socialProviders) && socialProviders.length > 0) {
        sections.push('\n## Social Login Providers\n\n```json\n' + json(socialProviders) + '\n```');
      } else {
        sections.push('\n## Social Login Providers\n\nNo social providers configured.');
      }

      return textResult(sections.join('\n'));
    }

    if (!args.type) {
      return textResult(
        'The "type" field is required when creating a social provider. ' +
          'Use one of: google, github, microsoft, facebook, linkedin, gitlab, slack, twitter, apple.'
      );
    }
    if (!args.clientId || !args.secret || !args.redirectUrl) {
      return textResult(
        'Missing required fields for action="create". The Frontegg social SSO endpoint requires ' +
          'all of: type, clientId, secret, redirectUrl.'
      );
    }

    // Create a social login provider configuration
    const body: Record<string, unknown> = {
      type: args.type,
      clientId: args.clientId,
      secret: args.secret,
      redirectUrl: args.redirectUrl,
      active: args.active ?? true,
    };
    if (args.additionalScopes) body.additionalScopes = args.additionalScopes;

    await fronteggApi<SsoConnection>({
      method: 'POST',
      path: '/identity/resources/sso/v1',
      body,
    });
    // POST returns 201 with empty body — re-list so the tool result is concrete.
    const providers = await fronteggApi<SsoConnection[]>({
      method: 'GET',
      path: '/identity/resources/sso/v1',
    });
    return textResult(
      `# Social Provider Created\n\nAdded provider: **${args.type}**\n\n## All configured providers\n\n\`\`\`json\n${json(providers)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Identity (Auth) Configuration
// ---------------------------------------------------------------------------

interface IdentityConfig {
  defaultTokenExpiration?: number;
  defaultRefreshTokenExpiration?: number;
  authStrategy?: string;
  cookieSameSite?: string;
  allowSignups?: boolean;
  addRolesToJwt?: boolean;
  addPermissionsToJwt?: boolean;
  rotateRefreshTokens?: boolean;
  [key: string]: unknown;
}

const IDENTITY_TOOL: McpTool = {
  name: 'frontegg_configure_identity',
  description:
    'Read or update the Frontegg identity (auth) configuration via the Management API. ' +
    'action="get" reads current config; action="update" applies changes. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the identity config.',
      },
      authStrategy: {
        type: 'string',
        enum: [
          'EmailAndPassword',
          'Code',
          'MagicLink',
          'NoPassword',
          'SmsCode',
          'EmailAndPasswordOrCode',
          'EmailAndPasswordOrMagicLink',
          'MagicLinkOrCode',
          'MagicLinkOrSmsCode',
        ],
        description: 'Authentication strategy. Only for action="update".',
      },
      allowSignups: {
        type: 'boolean',
        description: 'Whether self-service signups are allowed. Only for action="update".',
      },
      defaultTokenExpiration: {
        type: 'number',
        description: 'Access token TTL in seconds. Only for action="update".',
      },
      defaultRefreshTokenExpiration: {
        type: 'number',
        description: 'Refresh token TTL in seconds. Only for action="update".',
      },
      rotateRefreshTokens: {
        type: 'boolean',
        description: 'Whether to rotate refresh tokens on use. Only for action="update".',
      },
      addRolesToJwt: {
        type: 'boolean',
        description: 'Include roles in JWT claims. Only for action="update".',
      },
      addPermissionsToJwt: {
        type: 'boolean',
        description: 'Include permissions in JWT claims. Only for action="update".',
      },
      cookieSameSite: {
        type: 'string',
        enum: ['strict', 'lax', 'none'],
        description: 'SameSite cookie policy. Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const IdentityArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  authStrategy: z.enum([
    'EmailAndPassword', 'Code', 'MagicLink', 'NoPassword', 'SmsCode',
    'EmailAndPasswordOrCode', 'EmailAndPasswordOrMagicLink',
    'MagicLinkOrCode', 'MagicLinkOrSmsCode',
  ]).optional(),
  allowSignups: z.boolean().optional(),
  defaultTokenExpiration: z.number().optional(),
  defaultRefreshTokenExpiration: z.number().optional(),
  rotateRefreshTokens: z.boolean().optional(),
  addRolesToJwt: z.boolean().optional(),
  addPermissionsToJwt: z.boolean().optional(),
  cookieSameSite: z.enum(['strict', 'lax', 'none']).optional(),
});

async function handleIdentity(raw: unknown) {
  try {
    const args = IdentityArgsSchema.parse(raw);
    if (args.action === 'get') {
      const config = await fronteggApi<IdentityConfig>({
        method: 'GET',
        path: '/identity/resources/configurations/v1',
      });
      return textResult(`# Current Identity Configuration\n\n\`\`\`json\n${json(config)}\n\`\`\``);
    }

    const body: Record<string, unknown> = {};
    if (args.authStrategy !== undefined) body.authStrategy = args.authStrategy;
    if (args.allowSignups !== undefined) body.allowSignups = args.allowSignups;
    if (args.defaultTokenExpiration !== undefined) body.defaultTokenExpiration = args.defaultTokenExpiration;
    if (args.defaultRefreshTokenExpiration !== undefined) body.defaultRefreshTokenExpiration = args.defaultRefreshTokenExpiration;
    if (args.rotateRefreshTokens !== undefined) body.rotateRefreshTokens = args.rotateRefreshTokens;
    if (args.addRolesToJwt !== undefined) body.addRolesToJwt = args.addRolesToJwt;
    if (args.addPermissionsToJwt !== undefined) body.addPermissionsToJwt = args.addPermissionsToJwt;
    if (args.cookieSameSite !== undefined) body.cookieSameSite = args.cookieSameSite;

    if (Object.keys(body).length === 0) {
      return textResult(
        'No fields provided to update. Provide at least one of: authStrategy, allowSignups, ' +
          'defaultTokenExpiration, defaultRefreshTokenExpiration, rotateRefreshTokens, ' +
          'addRolesToJwt, addPermissionsToJwt, cookieSameSite.'
      );
    }

    const updated = await fronteggApi<IdentityConfig>({
      method: 'POST',
      path: '/identity/resources/configurations/v1',
      body,
    });
    return textResult(`# Identity Configuration Updated\n\n\`\`\`json\n${json(updated)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggConfigureTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(MFA_TOOL, handleMfa);
    registry.add(SESSIONS_TOOL, handleSessions);
    registry.add(SSO_TOOL, handleSso);
    registry.add(IDENTITY_TOOL, handleIdentity);

    this.logger.info('Registered 4 Frontegg configure tools');
  }
}
