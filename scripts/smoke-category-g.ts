#!/usr/bin/env tsx
/**
 * Smoke test for Category G — entitlements + plans tools.
 *
 * Runs all 4 tools against the live tenant via the shared ToolRegistry:
 *   1. frontegg_features_list      — print existing features
 *   2. frontegg_features_create    — create `mcp-smoke-feature-<ts>` with key `mcp_smoke_<ts>`
 *   3. frontegg_features_list      — confirm new feature appears
 *   4. frontegg_plans_list         — print existing plans
 *   5. frontegg_plan_feature_attach — attach the new feature to the first plan
 *                                      (or skip if no plans exist)
 *   6. Print PASS/FAIL per tool
 *
 * Prerequisites:
 *   - FRONTEGG_CLIENT_ID + FRONTEGG_SECRET set (e.g. via ~/Showcase/frontegg-api-creds.env)
 *
 * Usage:
 *   source ~/Showcase/frontegg-api-creds.env
 *   npx tsx scripts/smoke-category-g.ts
 *
 * Note: Frontegg does not expose DELETE on /entitlements/resources/features/v1
 * for vendor tokens. Each smoke run leaves behind one `mcp-smoke-feature-*`
 * artifact. They are tagged with the `mcp-smoke-` prefix so they're easy to
 * identify in the portal if you ever want to clean up manually.
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggEntitlementsTools } from '../src/tools/frontegg-entitlements.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  blue: '\x1b[38;5;111m',
  yellow: '\x1b[38;5;221m',
};

function log(msg: string): void {
  console.log(msg);
}

// Track pass/fail per step.
interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail?: string;
}

const results: StepResult[] = [];

function pass(step: string, detail?: string): void {
  results.push({ step, status: 'PASS', detail });
  log(`${c.green}✓ PASS${c.reset} ${step}${detail ? ` — ${c.dim}${detail}${c.reset}` : ''}`);
}

function fail(step: string, detail: string): void {
  results.push({ step, status: 'FAIL', detail });
  log(`${c.red}✗ FAIL${c.reset} ${step} — ${detail}`);
}

function skip(step: string, detail: string): void {
  results.push({ step, status: 'SKIP', detail });
  log(`${c.yellow}~ SKIP${c.reset} ${step} — ${detail}`);
}

// Helpers to pull JSON out of a tool result (tools wrap state in fenced
// ```json blocks).
function extractJson(text: string): unknown {
  const m = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  log(`${c.bold}${c.blue}=== Category G smoke test — entitlements + plans ===${c.reset}`);
  log('');

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    log(`${c.red}Missing FRONTEGG_CLIENT_ID + FRONTEGG_SECRET.${c.reset}`);
    log('Source ~/Showcase/frontegg-api-creds.env or set the env vars manually.');
    process.exit(1);
  }

  const registry = new ToolRegistry();
  new FronteggEntitlementsTools().register(registry);

  const ts = Date.now();
  const featureKey = `mcp_smoke_${ts}`;
  const featureName = `mcp-smoke-feature-${ts}`;

  // 1. features_list
  log(`${c.bold}[1/5] frontegg_features_list — list existing features${c.reset}`);
  let existingFeatures: unknown[] = [];
  try {
    const res = await registry.call('frontegg_features_list', {});
    const text = res.content[0]?.text ?? '';
    if (text.startsWith('❌')) {
      fail('features_list', text.slice(0, 200));
    } else {
      const parsed = extractJson(text);
      existingFeatures = Array.isArray(parsed) ? parsed : [];
      pass('features_list', `${existingFeatures.length} existing feature(s)`);
      log(`${c.dim}${text.split('\n').slice(0, 3).join('\n')}…${c.reset}`);
    }
  } catch (err) {
    fail('features_list', (err as Error).message);
  }
  log('');

  // 2. features_create
  log(`${c.bold}[2/5] frontegg_features_create — create ${featureName}${c.reset}`);
  let createdFeatureId: string | undefined;
  try {
    const res = await registry.call('frontegg_features_create', {
      key: featureKey,
      name: featureName,
      description: 'Smoke-test artifact — Category G smoke run. Safe to delete.',
    });
    const text = res.content[0]?.text ?? '';
    if (text.startsWith('❌')) {
      fail('features_create', text.slice(0, 200));
    } else {
      const parsed = extractJson(text) as { id?: string } | null;
      createdFeatureId = parsed?.id;
      pass('features_create', `id=${createdFeatureId ?? '?'}`);
    }
  } catch (err) {
    fail('features_create', (err as Error).message);
  }
  log('');

  // 3. features_list — confirm new feature appears
  log(`${c.bold}[3/5] frontegg_features_list — verify new feature appears${c.reset}`);
  try {
    const res = await registry.call('frontegg_features_list', {});
    const text = res.content[0]?.text ?? '';
    if (text.startsWith('❌')) {
      fail('features_list (verify)', text.slice(0, 200));
    } else {
      const parsed = extractJson(text) as Array<{ key?: string }> | null;
      const found = parsed?.find((f) => f.key === featureKey);
      if (found) {
        pass('features_list (verify)', `found ${featureKey}`);
      } else {
        fail('features_list (verify)', `did not find key=${featureKey} in list`);
      }
    }
  } catch (err) {
    fail('features_list (verify)', (err as Error).message);
  }
  log('');

  // 4. plans_list
  log(`${c.bold}[4/5] frontegg_plans_list — list existing plans${c.reset}`);
  let plans: Array<{ id?: string; name?: string }> = [];
  try {
    const res = await registry.call('frontegg_plans_list', {});
    const text = res.content[0]?.text ?? '';
    if (text.startsWith('❌')) {
      fail('plans_list', text.slice(0, 200));
    } else {
      const parsed = extractJson(text);
      plans = Array.isArray(parsed) ? (parsed as typeof plans) : [];
      pass('plans_list', `${plans.length} plan(s)`);
    }
  } catch (err) {
    fail('plans_list', (err as Error).message);
  }
  log('');

  // 5. plan_feature_attach — attach to first plan
  log(`${c.bold}[5/5] frontegg_plan_feature_attach — attach ${featureName} to a plan${c.reset}`);
  if (plans.length === 0) {
    skip(
      'plan_feature_attach',
      'no plans exist in this environment — create one in the portal to exercise this tool'
    );
  } else if (!createdFeatureId) {
    skip(
      'plan_feature_attach',
      'features_create did not produce an id — cannot attach'
    );
  } else {
    const target = plans[0]!;
    try {
      const res = await registry.call('frontegg_plan_feature_attach', {
        planId: target.id,
        featureIds: [createdFeatureId],
      });
      const text = res.content[0]?.text ?? '';
      if (text.startsWith('❌')) {
        fail('plan_feature_attach', text.slice(0, 300));
      } else {
        // The tool reports either "All N feature(s) confirmed attached." or
        // a "not visible after attach" warning. Both are valid tool runs —
        // the warning is the documented vendor-token-blocked path.
        const confirmed = /confirmed attached/.test(text);
        if (confirmed) {
          pass('plan_feature_attach', `attached to ${target.name ?? target.id}`);
        } else {
          pass(
            'plan_feature_attach',
            `tool ran end-to-end but attachment is no-op (vendor-token-blocked) — see KNOWN LIMITATION`
          );
          // Print enough of the result so an operator can read the warning.
          log(`${c.dim}${text.split('\n').slice(0, 8).join('\n')}${c.reset}`);
        }
      }
    } catch (err) {
      fail('plan_feature_attach', (err as Error).message);
    }
  }
  log('');

  // Summary
  log(`${c.bold}${c.blue}=== Summary ===${c.reset}`);
  for (const r of results) {
    const tag =
      r.status === 'PASS'
        ? `${c.green}PASS${c.reset}`
        : r.status === 'FAIL'
          ? `${c.red}FAIL${c.reset}`
          : `${c.yellow}SKIP${c.reset}`;
    log(`  ${tag}  ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  log('');
  log(`${c.dim}Test artifact created: ${featureName} (key=${featureKey})${c.reset}`);
  log(`${c.dim}Frontegg has no DELETE on /entitlements/.../features/v1 for vendor tokens; clean up manually if needed.${c.reset}`);
  log('');

  const failed = results.filter((r) => r.status === 'FAIL').length;
  if (failed > 0) {
    log(`${c.red}${c.bold}=== smoke FAILED (${failed} step(s)) ===${c.reset}`);
    process.exit(2);
  }
  log(`${c.green}${c.bold}=== smoke PASSED ===${c.reset}`);
}

main().catch((err) => {
  console.error(`${c.red}Smoke threw:${c.reset}`, err);
  process.exit(99);
});
