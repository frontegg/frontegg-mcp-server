/**
 * API-powered Frontegg email-template tools.
 *
 *   frontegg_email_templates_list   — list configured email templates
 *   frontegg_email_templates_update — update a specific template
 *
 * Endpoint discovery notes (2026-05-11):
 *
 * The documented path `/identity/resources/mail/v1/configs/emails` and every
 * sibling we probed (`/identity/resources/mail/v1/templates`,
 * `/identity/resources/email-templates/v1`,
 * `/vendors/resources/configurations/v1/email-templates`,
 * `/identity/resources/configurations/v1/emails`, plus 20+ other variants)
 * return HTTP 404 (`ER-00004`) for a vendor token, and the `/notification/*`
 * service returns blanket HTTP 500 for the same token.
 *
 * The JWT permissions list (`fe.connectivity.*`, `fe.secure.*`,
 * `fe.subscriptions.*`, `dp.*`, etc.) does NOT include a `fe.mail.*` or
 * `fe.email.*` scope, which is consistent with email-template management
 * being gated to tenant-scoped admin tokens rather than vendor tokens.
 *
 * Following the precedent set by `frontegg_configure_sessions` we:
 *   - keep the tool surface so the MCP advertises the capability
 *   - call the documented `/identity/resources/mail/v1/configs/emails` path
 *   - surface the API error verbatim so the LLM (and the user) sees that
 *     the tenant currently has no working endpoint for this operation.
 *
 * If a future vendor-token scope unlocks this surface, swap in the new
 * path here and the tests + smoke script keep working.
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

// Documented Frontegg path. Currently returns 404 for vendor tokens; the
// constant exists so a future endpoint change is a one-line update.
const EMAIL_TEMPLATES_PATH = '/identity/resources/mail/v1/configs/emails';

// Known Frontegg email template types. The Frontegg portal exposes these
// in the Email Templates UI; the values are stable identifiers used by
// the Management API. We surface the enum to the LLM so it can target a
// specific template without guessing.
const EMAIL_TEMPLATE_TYPES = [
  'ResetPassword',
  'ActivateUser',
  'InviteToTenant',
  'UserUsedInvitation',
  'PwnedPassword',
  'MagicLink',
  'OTC',
  'NewMFAMethod',
  'RemoveMFAMethod',
  'EmailVerification',
  'BulkInvitesToTenant',
  'BruteForceProtection',
  'IpRestriction',
  'SuspiciousIP',
  'MFAEnroll',
  'MFAUnenrolled',
  'NewDevice',
  'UserApiTokenCreated',
  'TenantApiTokenCreated',
  'Redirect',
] as const;

interface EmailTemplate {
  templateId?: string;
  active?: boolean;
  fromName?: string;
  fromAddress?: string;
  subject?: string;
  htmlTemplate?: string;
  successRedirectUrl?: string;
  redirectURL?: string;
  senderEmail?: string;
  type?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// LIST
// ---------------------------------------------------------------------------

const LIST_TOOL: McpTool = {
  name: 'frontegg_email_templates_list',
  description:
    'List all configured Frontegg email templates (welcome, MFA, password reset, ' +
    'magic link, etc.) via the Management API. Requires FRONTEGG_CLIENT_ID + ' +
    'FRONTEGG_SECRET env vars. ' +
    'KNOWN LIMITATION: as of 2026-05-11 the legacy `/identity/resources/mail/v1` ' +
    'endpoint returns 404 for vendor tokens on this tenant — Frontegg appears to ' +
    'have moved email-template management to a tenant-scoped auth model. The tool ' +
    'still calls the documented path; if your tenant has email-template access via ' +
    'vendor token it will return the configured templates, otherwise it surfaces ' +
    'the 404 so the caller knows to use the Frontegg portal directly.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

async function handleList(_raw: unknown) {
  try {
    const templates = await fronteggApi<EmailTemplate[]>({
      method: 'GET',
      path: EMAIL_TEMPLATES_PATH,
    });
    const arr = Array.isArray(templates) ? templates : [];
    if (arr.length === 0) {
      return textResult(
        '# Email Templates\n\nNo templates configured (empty response from Frontegg).'
      );
    }
    const summary = arr
      .map((t, i) => {
        const id = t.type ?? t.templateId ?? `template-${i}`;
        const subj = t.subject ?? '(no subject)';
        const active = t.active === false ? ' [inactive]' : '';
        return `- **${id}**${active} — subject: ${subj}`;
      })
      .join('\n');
    return textResult(
      `# Email Templates (${arr.length})\n\n${summary}\n\n## Raw\n\n\`\`\`json\n${json(arr)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

const UPDATE_TOOL: McpTool = {
  name: 'frontegg_email_templates_update',
  description:
    'Update a specific Frontegg email template (subject, sender, HTML body, ' +
    'redirect URL, active state). Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET. ' +
    '`type` is required — pick from the documented Frontegg template types. ' +
    'Provide at least one of the other fields to apply a change. ' +
    'KNOWN LIMITATION: same as `frontegg_email_templates_list` — the legacy mail ' +
    'endpoint returns 404 for vendor tokens on this tenant. The tool sends the ' +
    'POST against the documented path and surfaces the API response (success or ' +
    '404) so the caller can see whether their tenant has vendor-token access.',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [...EMAIL_TEMPLATE_TYPES],
        description:
          'Email template type to update. One of: ResetPassword, ActivateUser, ' +
          'InviteToTenant, UserUsedInvitation, PwnedPassword, MagicLink, OTC, ' +
          'NewMFAMethod, RemoveMFAMethod, EmailVerification, BulkInvitesToTenant, ' +
          'BruteForceProtection, IpRestriction, SuspiciousIP, MFAEnroll, ' +
          'MFAUnenrolled, NewDevice, UserApiTokenCreated, TenantApiTokenCreated, ' +
          'Redirect.',
      },
      subject: {
        type: 'string',
        description: 'New email subject line. Supports Frontegg merge variables like {{user.name}}.',
      },
      fromName: {
        type: 'string',
        description: 'Sender display name (e.g. "Acme Security").',
      },
      fromAddress: {
        type: 'string',
        description: 'Sender email address. Must be a verified Frontegg sender.',
      },
      senderEmail: {
        type: 'string',
        description:
          'Alternative field name some Frontegg accounts use instead of fromAddress. ' +
          'Provide the same value as fromAddress if unsure.',
      },
      htmlTemplate: {
        type: 'string',
        description: 'New HTML body for the email. Supports Frontegg merge variables.',
      },
      redirectURL: {
        type: 'string',
        description: 'Post-action redirect URL (e.g. after activating a user).',
      },
      successRedirectUrl: {
        type: 'string',
        description: 'Alternative redirect-URL field used by some template types.',
      },
      active: {
        type: 'boolean',
        description: 'Whether the template is active. Inactive templates fall back to Frontegg defaults.',
      },
    },
    required: ['type'],
  },
};

const UpdateArgsSchema = z.object({
  type: z.enum(EMAIL_TEMPLATE_TYPES),
  subject: z.string().optional(),
  fromName: z.string().optional(),
  fromAddress: z.string().optional(),
  senderEmail: z.string().optional(),
  htmlTemplate: z.string().optional(),
  redirectURL: z.string().optional(),
  successRedirectUrl: z.string().optional(),
  active: z.boolean().optional(),
});

async function handleUpdate(raw: unknown) {
  try {
    const args = UpdateArgsSchema.parse(raw);

    const body: Record<string, unknown> = { type: args.type };
    if (args.subject !== undefined) body.subject = args.subject;
    if (args.fromName !== undefined) body.fromName = args.fromName;
    if (args.fromAddress !== undefined) body.fromAddress = args.fromAddress;
    if (args.senderEmail !== undefined) body.senderEmail = args.senderEmail;
    if (args.htmlTemplate !== undefined) body.htmlTemplate = args.htmlTemplate;
    if (args.redirectURL !== undefined) body.redirectURL = args.redirectURL;
    if (args.successRedirectUrl !== undefined) body.successRedirectUrl = args.successRedirectUrl;
    if (args.active !== undefined) body.active = args.active;

    if (Object.keys(body).length === 1) {
      return textResult(
        'No fields provided to update. Pass at least one of: subject, fromName, ' +
          'fromAddress, senderEmail, htmlTemplate, redirectURL, successRedirectUrl, active.'
      );
    }

    await fronteggApi<EmailTemplate>({
      method: 'POST',
      path: EMAIL_TEMPLATES_PATH,
      body,
    });

    // Re-GET so we always return concrete current state — Frontegg PATCH/POST
    // on this surface frequently replies with 200 + empty body (same precedent
    // as `configure_sessions`).
    const templates = await fronteggApi<EmailTemplate[]>({
      method: 'GET',
      path: EMAIL_TEMPLATES_PATH,
    });
    const updated = Array.isArray(templates)
      ? templates.find((t) => t.type === args.type)
      : undefined;

    if (!updated) {
      return textResult(
        `# Email Template Update Sent\n\nUpdated **${args.type}**. Could not re-locate ` +
          `the template in the list response; full list:\n\n\`\`\`json\n${json(templates)}\n\`\`\``
      );
    }

    return textResult(
      `# Email Template Updated\n\nTemplate: **${args.type}**\n\n\`\`\`json\n${json(updated)}\n\`\`\``
    );
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggEmailTemplatesTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LIST_TOOL, handleList);
    registry.add(UPDATE_TOOL, handleUpdate);
    this.logger.info('Registered 2 Frontegg email-templates tools');
  }
}

// Export internals for tests
export const __test = {
  EMAIL_TEMPLATES_PATH,
  EMAIL_TEMPLATE_TYPES,
  handleList,
  handleUpdate,
  UpdateArgsSchema,
};
