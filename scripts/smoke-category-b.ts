#!/usr/bin/env tsx
/**
 * Smoke test for Category B tools (branding + applications).
 *
 * Exercises every tool end-to-end against the real Frontegg tenant. Tags
 * created artifacts with prefix `mcp-smoke-` for easy identification +
 * cleanup. Restores branding to its pre-test state at the end.
 *
 * Usage:
 *   source ~/Showcase/frontegg-api-creds.env
 *   npx tsx scripts/smoke-category-b.ts
 *
 * Pre-requisites: FRONTEGG_CLIENT_ID + FRONTEGG_SECRET must be set.
 *
 * Exit code 0 = all PASS, 1 = at least one FAIL.
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggBrandingTools } from '../src/tools/frontegg-branding.js';
import { FronteggApplicationsTools } from '../src/tools/frontegg-applications.js';
import { fronteggApi } from '../src/tools/frontegg-api-client.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;220m',
  blue: '\x1b[38;5;111m',
  magenta: '\x1b[38;5;213m',
};

function pad(s: string, w = 36): string {
  return s + ' '.repeat(Math.max(0, w - s.length));
}

const results: Array<{ name: string; ok: boolean; note?: string }> = [];

function pass(name: string, note?: string) {
  results.push({ name, ok: true, note });
  console.log(`${c.green}PASS${c.reset}  ${pad(name)} ${c.dim}${note ?? ''}${c.reset}`);
}

function fail(name: string, note: string) {
  results.push({ name, ok: false, note });
  console.log(`${c.red}FAIL${c.reset}  ${pad(name)} ${c.dim}${note}${c.reset}`);
}

function info(msg: string) {
  console.log(`${c.dim}      ${msg}${c.reset}`);
}

function extractText(result: { content: Array<{ text?: string }> }): string {
  return result.content[0]?.text ?? '';
}

async function main(): Promise<number> {
  const ts = Date.now();
  const smokeTag = `mcp-smoke-${ts}`;

  console.log(`${c.bold}${c.magenta}Category B smoke test${c.reset} (tag: ${smokeTag})\n`);

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    console.log(`${c.red}FRONTEGG_CLIENT_ID + FRONTEGG_SECRET required.${c.reset}`);
    return 1;
  }

  const registry = new ToolRegistry();
  new FronteggBrandingTools().register(registry);
  new FronteggApplicationsTools().register(registry);

  // -------------------------------------------------------------------------
  // 1. frontegg_applications_list
  // -------------------------------------------------------------------------
  let firstAppId: string | null = null;
  try {
    const r = await registry.call('frontegg_applications_list', {});
    const text = extractText(r);
    if (!text.includes('Frontegg Applications')) throw new Error('Missing header');
    // Parse to find an existing app id for the GET test.
    const match = text.match(/"id"\s*:\s*"([0-9a-f-]+)"/);
    if (match) firstAppId = match[1] ?? null;
    pass('frontegg_applications_list', `found existing apps${firstAppId ? `, sampled ${firstAppId.slice(0, 8)}…` : ''}`);
  } catch (e) {
    fail('frontegg_applications_list', String(e instanceof Error ? e.message : e));
  }

  // -------------------------------------------------------------------------
  // 2. frontegg_applications_get
  // -------------------------------------------------------------------------
  if (firstAppId) {
    try {
      const r = await registry.call('frontegg_applications_get', { id: firstAppId });
      const text = extractText(r);
      if (!text.includes(firstAppId)) throw new Error('Response missing app id');
      pass('frontegg_applications_get', `id=${firstAppId.slice(0, 8)}…`);
    } catch (e) {
      fail('frontegg_applications_get', String(e instanceof Error ? e.message : e));
    }
  } else {
    fail('frontegg_applications_get', 'no app id available from list');
  }

  // -------------------------------------------------------------------------
  // 3. frontegg_applications_create
  // -------------------------------------------------------------------------
  const newAppName = `${smokeTag}-app`;
  let createdAppId: string | null = null;
  try {
    const r = await registry.call('frontegg_applications_create', {
      name: newAppName,
      type: 'web',
      appURL: 'http://localhost:9999',
      loginURL: 'http://localhost:9999/oauth',
      frontendStack: 'react',
      description: 'Smoke test app — safe to delete.',
    });
    const text = extractText(r);
    const m = text.match(/"id"\s*:\s*"([0-9a-f-]+)"/);
    if (!m) throw new Error('Created app id not present in response');
    createdAppId = m[1] ?? null;
    pass('frontegg_applications_create', `created ${newAppName} (${createdAppId?.slice(0, 8)}…)`);
  } catch (e) {
    fail('frontegg_applications_create', String(e instanceof Error ? e.message : e));
  }

  // Cleanup: delete the created app (best-effort, not asserted as a tool test)
  if (createdAppId) {
    try {
      await fronteggApi({
        method: 'DELETE',
        path: `/applications/resources/applications/v1/${createdAppId}`,
      });
      info(`Cleanup: deleted smoke app ${createdAppId.slice(0, 8)}…`);
    } catch (e) {
      info(`Cleanup WARN: could not delete smoke app ${createdAppId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // -------------------------------------------------------------------------
  // 4. frontegg_branding_get (BEFORE)
  // -------------------------------------------------------------------------
  let beforePrimary: string | undefined;
  let beforeConfig: Record<string, unknown> | null = null;
  try {
    const r = await registry.call('frontegg_branding_get', {});
    const text = extractText(r);
    if (!text.includes('Frontegg Branding')) throw new Error('Missing header');
    // Parse the summary section for primaryColor.
    const m = text.match(/"primaryColor"\s*:\s*"([^"]+)"/);
    beforePrimary = m ? m[1] : undefined;
    // Save the raw configuration for restoration (last JSON block in the result)
    const rawMatch = text.match(/## Full configuration\s*\n\s*```json\s*\n([\s\S]+?)\n```/);
    if (rawMatch && rawMatch[1]) {
      beforeConfig = JSON.parse(rawMatch[1]);
    }
    pass('frontegg_branding_get', `primaryColor BEFORE = ${beforePrimary ?? '(unset)'}`);
  } catch (e) {
    fail('frontegg_branding_get', String(e instanceof Error ? e.message : e));
  }

  // -------------------------------------------------------------------------
  // 5. frontegg_branding_update — change primary color, prove it sticks
  // -------------------------------------------------------------------------
  // Cinematic: change the brand color, then re-read to confirm.
  const targetColor = '#FF6E40'; // bright Frontegg coral
  try {
    const r = await registry.call('frontegg_branding_update', {
      primaryColor: targetColor,
    });
    const text = extractText(r);
    if (!text.includes('Branding Updated')) throw new Error('Missing update confirmation');
    if (!text.includes(targetColor)) throw new Error('New color not present in summary');

    // Re-read independently to prove the change persisted.
    const after = await registry.call('frontegg_branding_get', {});
    const afterText = extractText(after);
    const m = afterText.match(/"primaryColor"\s*:\s*"([^"]+)"/);
    const afterPrimary = m ? m[1] : undefined;
    if (afterPrimary !== targetColor) {
      throw new Error(`AFTER primaryColor=${afterPrimary} != ${targetColor}`);
    }
    pass(
      'frontegg_branding_update',
      `${beforePrimary ?? '(unset)'} → ${afterPrimary} (verified by re-read)`
    );
  } catch (e) {
    fail('frontegg_branding_update', String(e instanceof Error ? e.message : e));
  }

  // -------------------------------------------------------------------------
  // Cleanup: restore branding to BEFORE state if we captured it.
  // -------------------------------------------------------------------------
  if (beforeConfig) {
    try {
      await fronteggApi({
        method: 'POST',
        path: '/metadata',
        body: { entityName: 'adminBox', configuration: beforeConfig },
      });
      info(`Cleanup: restored adminBox configuration to pre-test state`);
    } catch (e) {
      info(
        `Cleanup WARN: could not restore branding: ${e instanceof Error ? e.message : e}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${c.bold}Results:${c.reset} ${c.green}${passed} pass${c.reset}, ${
      failed > 0 ? c.red : c.dim
    }${failed} fail${c.reset}`
  );
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${c.red}Fatal:${c.reset}`, err);
    process.exit(1);
  }
);
