/**
 * API-powered Frontegg authentication-policy tools.
 *
 * Three tools that call the real Frontegg Management API when credentials
 * (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET) are provided. They mirror the
 * `action: 'get' | 'update'` pattern from `frontegg-configure.ts`.
 *
 *   frontegg_configure_password_policy  — read/write password complexity
 *   frontegg_configure_lockout_policy   — read/write account-lockout policy
 *   frontegg_configure_security_rules   — read/write CAPTCHA bot-protection
 *                                         policy (the only "security rule"
 *                                         endpoint Frontegg exposes to
 *                                         vendor tokens at this time)
 *
 * Endpoint discovery (2026-05-11, vendor token against api.frontegg.com):
 *   - Password:  GET/POST /identity/resources/configurations/v1/password
 *                (404 on every /password-policy variant we tried)
 *   - Lockout:   GET/POST /identity/resources/configurations/v1/lockout-policy
 *   - CAPTCHA:   GET/POST /identity/resources/configurations/v1/captcha-policy
 *                The dedicated "security-rules" / "suspicious-activity" /
 *                "geo-restrictions" / "ip-restrictions" paths all 404 with
 *                vendor token — those are tenant-scoped surfaces or do not
 *                exist on the public Management API.
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
// Password Policy
// ---------------------------------------------------------------------------

interface PasswordPolicyOptionalTests {
  requireNumbers?: boolean;
  requireLowercase?: boolean;
  requireUppercase?: boolean;
  requireSpecialChars?: boolean;
}

interface PasswordPolicyRequiredTests {
  checkThreeRepeatedChars?: boolean;
}

interface PasswordPolicy {
  allowPassphrases?: boolean;
  minLength?: number;
  maxLength?: number;
  minPhraseLength?: number;
  minOptionalTestsToPass?: number;
  blockPwnedPasswords?: boolean;
  optionalTests?: PasswordPolicyOptionalTests;
  requiredTests?: PasswordPolicyRequiredTests;
  [key: string]: unknown;
}

const PASSWORD_POLICY_PATH = '/identity/resources/configurations/v1/password';

const PASSWORD_POLICY_TOOL: McpTool = {
  name: 'frontegg_configure_password_policy',
  description:
    'Read or update the Frontegg password complexity policy via the Management API. ' +
    'action="get" reads current policy; action="update" applies changes. ' +
    'Controls minimum/maximum length, required character classes (uppercase, ' +
    'lowercase, numbers, special characters), pwned-password blocking, and ' +
    'passphrase support. Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the password policy.',
      },
      minLength: {
        type: 'number',
        description: 'Minimum password length (Frontegg default 6). Only for action="update".',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum password length (Frontegg default 128). Only for action="update".',
      },
      allowPassphrases: {
        type: 'boolean',
        description: 'Allow passphrases (long, lower-complexity passwords). Only for action="update".',
      },
      minPhraseLength: {
        type: 'number',
        description: 'Minimum length for passphrases when allowPassphrases=true. Only for action="update".',
      },
      blockPwnedPasswords: {
        type: 'boolean',
        description: 'Block passwords known to be breached (HaveIBeenPwned). Only for action="update".',
      },
      minOptionalTestsToPass: {
        type: 'number',
        description:
          'Minimum number of optional complexity tests (require* flags below) a password must pass. ' +
          'Frontegg default is 1. Only for action="update".',
      },
      requireNumbers: {
        type: 'boolean',
        description: 'Require at least one digit. Only for action="update".',
      },
      requireLowercase: {
        type: 'boolean',
        description: 'Require at least one lowercase letter. Only for action="update".',
      },
      requireUppercase: {
        type: 'boolean',
        description: 'Require at least one uppercase letter. Only for action="update".',
      },
      requireSpecialChars: {
        type: 'boolean',
        description: 'Require at least one special character. Only for action="update".',
      },
      checkThreeRepeatedChars: {
        type: 'boolean',
        description: 'Reject passwords with three or more repeated characters in a row. Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const PasswordPolicyArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  allowPassphrases: z.boolean().optional(),
  minPhraseLength: z.number().optional(),
  blockPwnedPasswords: z.boolean().optional(),
  minOptionalTestsToPass: z.number().optional(),
  requireNumbers: z.boolean().optional(),
  requireLowercase: z.boolean().optional(),
  requireUppercase: z.boolean().optional(),
  requireSpecialChars: z.boolean().optional(),
  checkThreeRepeatedChars: z.boolean().optional(),
});

async function handlePasswordPolicy(raw: unknown) {
  try {
    const args = PasswordPolicyArgsSchema.parse(raw);
    if (args.action === 'get') {
      const policy = await fronteggApi<PasswordPolicy>({
        method: 'GET',
        path: PASSWORD_POLICY_PATH,
      });
      return textResult(`# Current Password Policy\n\n\`\`\`json\n${json(policy)}\n\`\`\``);
    }

    // Read current state so we don't clobber nested optionalTests/requiredTests
    // objects when the caller only supplies one sub-field.
    const current = await fronteggApi<PasswordPolicy>({
      method: 'GET',
      path: PASSWORD_POLICY_PATH,
    });

    const body: Record<string, unknown> = {};

    if (args.minLength !== undefined) body.minLength = args.minLength;
    if (args.maxLength !== undefined) body.maxLength = args.maxLength;
    if (args.allowPassphrases !== undefined) body.allowPassphrases = args.allowPassphrases;
    if (args.minPhraseLength !== undefined) body.minPhraseLength = args.minPhraseLength;
    if (args.blockPwnedPasswords !== undefined) body.blockPwnedPasswords = args.blockPwnedPasswords;
    if (args.minOptionalTestsToPass !== undefined) body.minOptionalTestsToPass = args.minOptionalTestsToPass;

    const optionalTestKeys: Array<keyof PasswordPolicyOptionalTests> = [
      'requireNumbers',
      'requireLowercase',
      'requireUppercase',
      'requireSpecialChars',
    ];
    const requiredTestKeys: Array<keyof PasswordPolicyRequiredTests> = [
      'checkThreeRepeatedChars',
    ];

    const touchesOptional = optionalTestKeys.some((k) => args[k] !== undefined);
    const touchesRequired = requiredTestKeys.some((k) => args[k] !== undefined);

    if (touchesOptional) {
      const merged: PasswordPolicyOptionalTests = { ...(current?.optionalTests ?? {}) };
      for (const k of optionalTestKeys) {
        if (args[k] !== undefined) merged[k] = args[k];
      }
      body.optionalTests = merged;
    }
    if (touchesRequired) {
      const merged: PasswordPolicyRequiredTests = { ...(current?.requiredTests ?? {}) };
      for (const k of requiredTestKeys) {
        if (args[k] !== undefined) merged[k] = args[k];
      }
      body.requiredTests = merged;
    }

    if (Object.keys(body).length === 0) {
      return textResult(
        'No fields provided to update. Provide at least one of: minLength, maxLength, ' +
          'allowPassphrases, minPhraseLength, blockPwnedPasswords, minOptionalTestsToPass, ' +
          'requireNumbers, requireLowercase, requireUppercase, requireSpecialChars, ' +
          'checkThreeRepeatedChars.'
      );
    }

    const updated = await fronteggApi<PasswordPolicy>({
      method: 'POST',
      path: PASSWORD_POLICY_PATH,
      body,
    });
    // POST returns 201 with the full policy. Some 2xx codepaths can return an
    // empty body — re-GET if so to keep the response concrete.
    const concrete =
      updated && Object.keys(updated as Record<string, unknown>).length > 0
        ? updated
        : await fronteggApi<PasswordPolicy>({ method: 'GET', path: PASSWORD_POLICY_PATH });
    return textResult(`# Password Policy Updated\n\n\`\`\`json\n${json(concrete)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Lockout Policy
// ---------------------------------------------------------------------------

interface LockoutPolicy {
  id?: string;
  enabled?: boolean;
  maxAttempts?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const LOCKOUT_POLICY_PATH = '/identity/resources/configurations/v1/lockout-policy';

const LOCKOUT_POLICY_TOOL: McpTool = {
  name: 'frontegg_configure_lockout_policy',
  description:
    'Read or update the Frontegg account-lockout policy via the Management API. ' +
    'action="get" reads current policy; action="update" applies changes. ' +
    'Controls whether failed-login lockout is enabled and the maximum number ' +
    'of failed attempts before a user is locked out. Requires FRONTEGG_CLIENT_ID + ' +
    'FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the lockout policy.',
      },
      enabled: {
        type: 'boolean',
        description: 'Whether the lockout policy is active. Only for action="update".',
      },
      maxAttempts: {
        type: 'number',
        description:
          'Maximum number of failed login attempts before the account is locked. ' +
          'Frontegg default is 5. Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const LockoutPolicyArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  enabled: z.boolean().optional(),
  maxAttempts: z.number().optional(),
});

async function handleLockoutPolicy(raw: unknown) {
  try {
    const args = LockoutPolicyArgsSchema.parse(raw);
    if (args.action === 'get') {
      const policy = await fronteggApi<LockoutPolicy>({
        method: 'GET',
        path: LOCKOUT_POLICY_PATH,
      });
      return textResult(`# Current Lockout Policy\n\n\`\`\`json\n${json(policy)}\n\`\`\``);
    }

    if (args.enabled === undefined && args.maxAttempts === undefined) {
      return textResult(
        'No fields provided to update. Provide at least one of: enabled, maxAttempts.'
      );
    }

    // The lockout-policy POST validates the full resource — it returns 400
    // "enabled must be a boolean value" if only maxAttempts is sent. Read the
    // current state and overlay just the supplied fields so the LLM can treat
    // this as a partial update without surprises.
    const current = await fronteggApi<LockoutPolicy>({
      method: 'GET',
      path: LOCKOUT_POLICY_PATH,
    });

    const body: Record<string, unknown> = {
      enabled: args.enabled !== undefined ? args.enabled : current?.enabled ?? false,
      maxAttempts: args.maxAttempts !== undefined ? args.maxAttempts : current?.maxAttempts ?? 5,
    };

    const updated = await fronteggApi<LockoutPolicy>({
      method: 'POST',
      path: LOCKOUT_POLICY_PATH,
      body,
    });
    // POST returns 201 with the policy. Guard against the empty-body case.
    const concrete =
      updated && Object.keys(updated as Record<string, unknown>).length > 0
        ? updated
        : await fronteggApi<LockoutPolicy>({ method: 'GET', path: LOCKOUT_POLICY_PATH });
    return textResult(`# Lockout Policy Updated\n\n\`\`\`json\n${json(concrete)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Security Rules — CAPTCHA / bot-protection policy
//
// Scope note: Frontegg's public Management API does not expose dedicated
// "security-rules" / "suspicious-activity" / "geo-restrictions" /
// "ip-restrictions" REST surfaces on vendor tokens (all 404). The closest
// vendor-accessible "security rule" is the CAPTCHA / bot-protection policy,
// which gates suspicious automated login attempts. This tool exposes that
// policy. Geo-fencing and IP-allowlist rules remain a known gap — see the
// `frontegg_configure_sessions` precedent for how we document API limits.
// ---------------------------------------------------------------------------

interface SecurityRulesPolicy {
  id?: string;
  siteKey?: string | null;
  secretKey?: string | null;
  enabled?: boolean;
  minScore?: number | null;
  ignoredEmails?: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const SECURITY_RULES_PATH = '/identity/resources/configurations/v1/captcha-policy';

const SECURITY_RULES_TOOL: McpTool = {
  name: 'frontegg_configure_security_rules',
  description:
    'Read or update Frontegg automated-abuse security rules via the Management API. ' +
    'action="get" reads the current CAPTCHA / bot-protection policy; action="update" ' +
    'applies changes. This is the surface Frontegg exposes for suspicious-activity ' +
    'detection on vendor tokens — it gates login flows behind a reCAPTCHA v3 challenge ' +
    'when the risk score is below `minScore`, with an optional ignored-emails allowlist. ' +
    'KNOWN LIMITATION (write): the captcha-policy POST endpoint validates siteKey and ' +
    'secretKey against the real Google reCAPTCHA service, so any update — even just ' +
    'changing `enabled` or `ignoredEmails` — requires real reCAPTCHA v3 keys in the ' +
    'body. Without them the API returns HTTP 400 "Site key must be valid". Treat this ' +
    'tool as read-only unless the caller has reCAPTCHA credentials. ' +
    'KNOWN LIMITATION (scope): Frontegg does not currently expose vendor-token REST ' +
    'endpoints for geo-fencing, IP-allowlists, or country blocklists — those rules can ' +
    'only be configured via the Frontegg portal UI today. ' +
    'Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET env vars.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['get', 'update'],
        description: 'Whether to read ("get") or write ("update") the security rules.',
      },
      enabled: {
        type: 'boolean',
        description:
          'Whether the CAPTCHA bot-protection policy is active. When true, ' +
          'siteKey, secretKey and minScore must also be supplied. Only for action="update".',
      },
      siteKey: {
        type: 'string',
        description:
          'reCAPTCHA v3 site key from Google. Required when enabling. Only for action="update".',
      },
      secretKey: {
        type: 'string',
        description:
          'reCAPTCHA v3 secret key from Google. Required when enabling. Only for action="update".',
      },
      minScore: {
        type: 'number',
        description:
          'Minimum reCAPTCHA risk score (0.0–1.0) below which the request is challenged. ' +
          'Required when enabling. Only for action="update".',
      },
      ignoredEmails: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Email addresses that should bypass the CAPTCHA check (e.g. test accounts). ' +
          'Only for action="update".',
      },
    },
    required: ['action'],
  },
};

const SecurityRulesArgsSchema = z.object({
  action: z.enum(['get', 'update']),
  enabled: z.boolean().optional(),
  siteKey: z.string().optional(),
  secretKey: z.string().optional(),
  minScore: z.number().optional(),
  ignoredEmails: z.array(z.string()).optional(),
});

async function handleSecurityRules(raw: unknown) {
  try {
    const args = SecurityRulesArgsSchema.parse(raw);
    if (args.action === 'get') {
      const policy = await fronteggApi<SecurityRulesPolicy>({
        method: 'GET',
        path: SECURITY_RULES_PATH,
      });
      return textResult(`# Current Security Rules (CAPTCHA / bot-protection)\n\n\`\`\`json\n${json(policy)}\n\`\`\``);
    }

    const body: Record<string, unknown> = {};
    if (args.enabled !== undefined) body.enabled = args.enabled;
    if (args.siteKey !== undefined) body.siteKey = args.siteKey;
    if (args.secretKey !== undefined) body.secretKey = args.secretKey;
    if (args.minScore !== undefined) body.minScore = args.minScore;
    if (args.ignoredEmails !== undefined) body.ignoredEmails = args.ignoredEmails;

    if (Object.keys(body).length === 0) {
      return textResult(
        'No fields provided to update. Provide at least one of: enabled, siteKey, ' +
          'secretKey, minScore, ignoredEmails.'
      );
    }

    const updated = await fronteggApi<SecurityRulesPolicy>({
      method: 'POST',
      path: SECURITY_RULES_PATH,
      body,
    });
    // Guard against empty-body 2xx — re-GET if needed.
    const concrete =
      updated && Object.keys(updated as Record<string, unknown>).length > 0
        ? updated
        : await fronteggApi<SecurityRulesPolicy>({ method: 'GET', path: SECURITY_RULES_PATH });
    return textResult(`# Security Rules Updated\n\n\`\`\`json\n${json(concrete)}\n\`\`\``);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggAuthPoliciesTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(PASSWORD_POLICY_TOOL, handlePasswordPolicy);
    registry.add(LOCKOUT_POLICY_TOOL, handleLockoutPolicy);
    registry.add(SECURITY_RULES_TOOL, handleSecurityRules);

    this.logger.info('Registered 3 Frontegg auth-policies tools');
  }
}

// Test-only exports — let tests exercise handlers + schemas without going
// through the registry shim.
export const __test__ = {
  PasswordPolicyArgsSchema,
  LockoutPolicyArgsSchema,
  SecurityRulesArgsSchema,
  handlePasswordPolicy,
  handleLockoutPolicy,
  handleSecurityRules,
  PASSWORD_POLICY_PATH,
  LOCKOUT_POLICY_PATH,
  SECURITY_RULES_PATH,
};
