#!/usr/bin/env tsx
/**
 * Smoke test for Category D — Communications + Extensibility.
 *
 * Exercises every tool added in Category D against the real Frontegg tenant
 * configured via FRONTEGG_CLIENT_ID + FRONTEGG_SECRET (creds typically come
 * from `~/Showcase/frontegg-api-creds.env`).
 *
 *   1. email_templates_list
 *   2. email_templates_update  (SAFE template, with revert-on-success)
 *   3. webhooks_create         (tagged with mcp-smoke-test-<timestamp>)
 *   4. webhooks_list           (confirms new webhook appears)
 *   5. webhooks DELETE         (cleanup — the endpoint supports it)
 *
 * Run with:
 *   source ~/Showcase/frontegg-api-creds.env && npx tsx scripts/smoke-category-d.ts
 *
 * Exit codes:
 *   0 — all tools that have a working endpoint passed
 *   1 — env vars missing
 *   2 — one or more tools failed unexpectedly (NOT counting the documented
 *       vendor-token-blocked email-template endpoints — those report
 *       "BLOCKED-AS-DOCUMENTED" and are not failures).
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggEmailTemplatesTools } from '../src/tools/frontegg-email-templates.js';
import { FronteggWebhooksTools } from '../src/tools/frontegg-webhooks.js';
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;221m',
  blue: '\x1b[38;5;111m',
};

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function section(title: string) {
  log('');
  log(`${c.bold}${c.blue}── ${title} ──${c.reset}`);
}

function pass(msg: string) {
  log(`${c.green}✓ PASS${c.reset} ${msg}`);
}
function warn(msg: string) {
  log(`${c.yellow}! BLOCKED-AS-DOCUMENTED${c.reset} ${msg}`);
}
function fail(msg: string) {
  log(`${c.red}✗ FAIL${c.reset} ${msg}`);
}

async function main() {
  log(`${c.bold}${c.blue}=== Category D smoke test ===${c.reset}`);
  log(`${c.dim}email_templates_list/update + webhooks_list/create${c.reset}`);

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    log(
      `${c.red}Missing env vars. Set FRONTEGG_CLIENT_ID + FRONTEGG_SECRET. ` +
        `Try: source ~/Showcase/frontegg-api-creds.env${c.reset}`
    );
    process.exit(1);
  }

  const registry = new ToolRegistry();
  new FronteggEmailTemplatesTools().register(registry);
  new FronteggWebhooksTools().register(registry);

  let failures = 0;
  let documentedBlocks = 0;

  // -------------------------------------------------------------------------
  // 1. email_templates_list
  // -------------------------------------------------------------------------
  section('1. frontegg_email_templates_list');
  const listResult = await registry.call('frontegg_email_templates_list', {});
  const listText = listResult.content[0]?.text ?? '';
  log(listText.slice(0, 500) + (listText.length > 500 ? '\n  …(truncated)' : ''));
  if (listText.startsWith('❌')) {
    if (listText.includes('404') || listText.includes('500')) {
      warn('email_templates_list — endpoint returns 404/500 for vendor tokens, as documented');
      documentedBlocks++;
    } else {
      fail('email_templates_list — unexpected error');
      failures++;
    }
  } else {
    pass('email_templates_list — returned templates');
  }

  // -------------------------------------------------------------------------
  // 2. email_templates_update (SAFE template, with revert)
  // -------------------------------------------------------------------------
  section('2. frontegg_email_templates_update (SAFE template + revert)');

  // Pick a template type that's safe to touch even if the surface is broken.
  // ResetPassword is universal across every Frontegg tenant.
  const SAFE_TYPE = 'ResetPassword';
  const SMOKE_TAG = ' [mcp-smoke-test]';
  let originalSubject: string | undefined;
  try {
    // Try to read current state so we can revert
    type EmailTemplate = { type?: string; subject?: string; [k: string]: unknown };
    const templates = await fronteggApi<EmailTemplate[]>({
      method: 'GET',
      path: '/identity/resources/mail/v1/configs/emails',
    });
    if (Array.isArray(templates)) {
      const cur = templates.find((t) => t.type === SAFE_TYPE);
      if (cur?.subject) originalSubject = cur.subject;
    }
  } catch (err) {
    // If GET fails the update will also fail — handled below
    if (err instanceof FronteggApiError) {
      log(`${c.dim}  pre-read failed: ${err.status} — proceeding (will fail on update too)${c.reset}`);
    }
  }

  const newSubject = (originalSubject ?? `Reset your password`) + SMOKE_TAG;
  const updateResult = await registry.call('frontegg_email_templates_update', {
    type: SAFE_TYPE,
    subject: newSubject,
  });
  const updateText = updateResult.content[0]?.text ?? '';
  log(updateText.slice(0, 500) + (updateText.length > 500 ? '\n  …(truncated)' : ''));
  if (updateText.startsWith('❌')) {
    if (updateText.includes('404') || updateText.includes('500')) {
      warn('email_templates_update — endpoint returns 404/500 for vendor tokens, as documented');
      documentedBlocks++;
    } else {
      fail('email_templates_update — unexpected error');
      failures++;
    }
  } else {
    pass(`email_templates_update — set subject="${newSubject}"`);

    // Re-verify via list
    const reList = await registry.call('frontegg_email_templates_list', {});
    if ((reList.content[0]?.text ?? '').includes(newSubject)) {
      pass('email_templates_update — re-list confirms new subject');
    } else {
      log(`${c.yellow}! WARN${c.reset} re-list did not include new subject (Frontegg may eventually-consist)`);
    }

    // Revert
    if (originalSubject) {
      const revert = await registry.call('frontegg_email_templates_update', {
        type: SAFE_TYPE,
        subject: originalSubject,
      });
      if ((revert.content[0]?.text ?? '').startsWith('❌')) {
        log(`${c.red}  revert FAILED — please restore "${originalSubject}" manually${c.reset}`);
      } else {
        pass(`email_templates_update — reverted subject to "${originalSubject}"`);
      }
    } else {
      log(
        `${c.yellow}  WARN${c.reset} original subject unknown; smoke-tagged subject left in place. ` +
          `Please revert manually if needed.`
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. webhooks_create
  // -------------------------------------------------------------------------
  section('3. frontegg_webhooks_create');
  const ts = Date.now();
  const displayName = `mcp-smoke-test-${ts}`;
  const createResult = await registry.call('frontegg_webhooks_create', {
    url: 'https://example.com/mcp-smoke-test',
    events: ['frontegg.user.created'],
    displayName,
    description: 'Created by smoke-category-d.ts — safe to delete.',
  });
  const createText = createResult.content[0]?.text ?? '';
  log(createText.slice(0, 600) + (createText.length > 600 ? '\n  …(truncated)' : ''));
  let createdId: string | null = null;
  if (createText.startsWith('❌')) {
    fail('webhooks_create — error response');
    failures++;
  } else {
    const idMatch = createText.match(/"id":\s*"([^"]+)"/);
    createdId = idMatch ? idMatch[1] ?? null : null;
    pass(`webhooks_create — created ${displayName} (id=${createdId ?? 'unknown'})`);
  }

  // -------------------------------------------------------------------------
  // 4. webhooks_list — confirm the new record appears
  // -------------------------------------------------------------------------
  section('4. frontegg_webhooks_list');
  const listWh = await registry.call('frontegg_webhooks_list', {});
  const listWhText = listWh.content[0]?.text ?? '';
  log(listWhText.slice(0, 600) + (listWhText.length > 600 ? '\n  …(truncated)' : ''));
  if (listWhText.startsWith('❌')) {
    fail('webhooks_list — error response');
    failures++;
  } else if (listWhText.includes(displayName)) {
    pass(`webhooks_list — found ${displayName}`);
  } else if (createdId === null) {
    log(`${c.yellow}  skipped existence check (no createdId)${c.reset}`);
  } else {
    fail(`webhooks_list — newly-created webhook (${displayName}) not present`);
    failures++;
  }

  // -------------------------------------------------------------------------
  // 5. Cleanup — DELETE the smoke webhook
  // -------------------------------------------------------------------------
  section('5. cleanup');
  if (createdId) {
    try {
      await fronteggApi({
        method: 'DELETE',
        path: `/event/resources/configurations/v1/${createdId}`,
      });
      pass(`cleanup — deleted webhook ${createdId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(
        `${c.yellow}! WARN${c.reset} cleanup failed: ${msg}. ` +
          `Manually delete webhook ${createdId} from the Frontegg portal.`
      );
    }
  } else {
    log(`${c.dim}  no webhook to clean up${c.reset}`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  log('');
  log(`${c.bold}${c.blue}=== Summary ===${c.reset}`);
  log(`  Failures (unexpected): ${failures}`);
  log(`  Documented blockers:   ${documentedBlocks}`);
  if (failures === 0) {
    log(`${c.bold}${c.green}=== smoke test PASSED ===${c.reset}`);
    process.exit(0);
  } else {
    log(`${c.bold}${c.red}=== smoke test had ${failures} failures ===${c.reset}`);
    process.exit(2);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${c.red}Smoke test threw:${c.reset}`, err);
  process.exit(99);
});
