#!/usr/bin/env tsx
/**
 * End-to-end smoke test for Category C auth-policy tools.
 *
 *   - frontegg_configure_password_policy
 *   - frontegg_configure_lockout_policy
 *   - frontegg_configure_security_rules  (CAPTCHA / bot-protection)
 *
 * For each tool:
 *   1. GET to capture original state
 *   2. UPDATE a single value to a known-different value
 *   3. GET again and assert the new value persisted
 *   4. UPDATE back to the original value
 *
 * Exits non-zero on any persistence-assertion failure so it can be wired
 * into CI / pre-merge checks.
 *
 * Usage:
 *   npx tsx scripts/smoke-category-c.ts
 *
 * Requires FRONTEGG_CLIENT_ID + FRONTEGG_SECRET in env (load via dotenv or
 * `source ~/Showcase/frontegg-api-creds.env`).
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggAuthPoliciesTools } from '../src/tools/frontegg-auth-policies.js';

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
  console.log(msg);
}

function fail(msg: string): never {
  log(`${c.red}✗ ${msg}${c.reset}`);
  process.exit(1);
}

function pass(msg: string): void {
  log(`${c.green}✓ ${msg}${c.reset}`);
}

function info(msg: string): void {
  log(`${c.dim}  ${msg}${c.reset}`);
}

/**
 * Pull the JSON block out of a tool's markdown result text. The tools all
 * wrap their JSON payload in a ```json fenced block.
 */
function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  if (!match) {
    throw new Error(`No JSON block found in tool output:\n${text}`);
  }
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

async function callTool(
  registry: ToolRegistry,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const r = await registry.call(name, args);
  const text = r.content[0]?.text ?? '';
  if (text.startsWith('❌')) {
    throw new Error(`Tool ${name} failed: ${text}`);
  }
  return extractJson(text);
}

interface SmokeResult {
  tool: string;
  ok: boolean;
  notes: string;
}

const results: SmokeResult[] = [];

async function smokePasswordPolicy(registry: ToolRegistry): Promise<void> {
  const TOOL = 'frontegg_configure_password_policy';
  log('');
  log(`${c.bold}${c.blue}[1/3] ${TOOL}${c.reset}`);

  try {
    const original = await callTool(registry, TOOL, { action: 'get' });
    const origMinLength = original.minLength as number;
    info(`original minLength = ${origMinLength}`);

    const target = origMinLength === 14 ? 12 : 14;
    info(`updating minLength → ${target}`);
    await callTool(registry, TOOL, { action: 'update', minLength: target });

    const after = await callTool(registry, TOOL, { action: 'get' });
    const afterMin = after.minLength as number;
    info(`re-GET minLength = ${afterMin}`);

    if (afterMin !== target) {
      results.push({
        tool: TOOL,
        ok: false,
        notes: `WRITE did not persist (expected ${target}, got ${afterMin})`,
      });
      log(`${c.red}✗ persistence assertion failed${c.reset}`);
    } else {
      results.push({ tool: TOOL, ok: true, notes: `minLength ${origMinLength} → ${target} → revert` });
      pass(`minLength write persisted`);
    }

    info(`reverting minLength → ${origMinLength}`);
    await callTool(registry, TOOL, { action: 'update', minLength: origMinLength });
    const final = await callTool(registry, TOOL, { action: 'get' });
    if (final.minLength !== origMinLength) {
      log(`${c.yellow}!  revert did not restore minLength (left at ${final.minLength as number}, expected ${origMinLength})${c.reset}`);
    } else {
      info(`revert OK`);
    }
  } catch (err) {
    results.push({
      tool: TOOL,
      ok: false,
      notes: err instanceof Error ? err.message : String(err),
    });
    log(`${c.red}✗ smoke threw: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
  }
}

async function smokeLockoutPolicy(registry: ToolRegistry): Promise<void> {
  const TOOL = 'frontegg_configure_lockout_policy';
  log('');
  log(`${c.bold}${c.blue}[2/3] ${TOOL}${c.reset}`);

  try {
    const original = await callTool(registry, TOOL, { action: 'get' });
    const origAttempts = original.maxAttempts as number;
    const origEnabled = original.enabled as boolean;
    info(`original enabled=${origEnabled} maxAttempts=${origAttempts}`);

    const target = origAttempts === 3 ? 7 : 3;
    info(`updating maxAttempts → ${target}`);
    await callTool(registry, TOOL, { action: 'update', maxAttempts: target });

    const after = await callTool(registry, TOOL, { action: 'get' });
    const afterAttempts = after.maxAttempts as number;
    info(`re-GET maxAttempts = ${afterAttempts}`);

    if (afterAttempts !== target) {
      results.push({
        tool: TOOL,
        ok: false,
        notes: `WRITE did not persist (expected ${target}, got ${afterAttempts})`,
      });
      log(`${c.red}✗ persistence assertion failed${c.reset}`);
    } else {
      results.push({
        tool: TOOL,
        ok: true,
        notes: `maxAttempts ${origAttempts} → ${target} → revert`,
      });
      pass(`maxAttempts write persisted`);
    }

    info(`reverting → enabled=${origEnabled} maxAttempts=${origAttempts}`);
    await callTool(registry, TOOL, {
      action: 'update',
      enabled: origEnabled,
      maxAttempts: origAttempts,
    });
    const final = await callTool(registry, TOOL, { action: 'get' });
    if (final.maxAttempts !== origAttempts) {
      log(`${c.yellow}!  revert did not restore maxAttempts (left at ${final.maxAttempts as number})${c.reset}`);
    } else {
      info(`revert OK`);
    }
  } catch (err) {
    results.push({
      tool: TOOL,
      ok: false,
      notes: err instanceof Error ? err.message : String(err),
    });
    log(`${c.red}✗ smoke threw: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
  }
}

async function smokeSecurityRules(registry: ToolRegistry): Promise<void> {
  const TOOL = 'frontegg_configure_security_rules';
  log('');
  log(`${c.bold}${c.blue}[3/3] ${TOOL}${c.reset}`);

  try {
    const original = await callTool(registry, TOOL, { action: 'get' });
    const origSiteKey = original.siteKey as string | null | undefined;
    const origSecretKey = original.secretKey as string | null | undefined;
    info(
      `original siteKey=${origSiteKey ? '<set>' : 'null'} secretKey=${
        origSecretKey ? '<set>' : 'null'
      } enabled=${original.enabled as boolean}`
    );

    // KNOWN LIMITATION: the captcha-policy POST validates siteKey/secretKey
    // against the real Google reCAPTCHA service, so we cannot mutate this
    // resource from smoke without real keys. We exercise the GET path only
    // and surface this as a documented limitation rather than a smoke failure.
    if (!origSiteKey || !origSecretKey) {
      results.push({
        tool: TOOL,
        ok: true,
        notes:
          'GET succeeded; WRITE skipped — captcha-policy POST requires real reCAPTCHA ' +
          'siteKey/secretKey (tenant has none configured). Documented limitation.',
      });
      pass(
        `GET works; WRITE path requires real reCAPTCHA keys — skipped (documented in tool description)`
      );
      return;
    }

    // If real keys are present, exercise an ignoredEmails round-trip.
    const origIgnored = (original.ignoredEmails as string[] | undefined) ?? [];
    const MARKER = 'mcp-smoke-category-c@example.com';
    const target = origIgnored.includes(MARKER)
      ? origIgnored.filter((e) => e !== MARKER)
      : [...origIgnored, MARKER];

    info(`updating ignoredEmails → ${JSON.stringify(target)}`);
    await callTool(registry, TOOL, {
      action: 'update',
      enabled: original.enabled as boolean,
      siteKey: origSiteKey,
      secretKey: origSecretKey,
      minScore: (original.minScore as number | null) ?? 0.5,
      ignoredEmails: target,
    });

    const after = await callTool(registry, TOOL, { action: 'get' });
    const afterIgnored = (after.ignoredEmails as string[] | undefined) ?? [];
    info(`re-GET ignoredEmails = ${JSON.stringify(afterIgnored)}`);

    const persisted =
      target.every((e) => afterIgnored.includes(e)) &&
      afterIgnored.length === target.length;

    if (!persisted) {
      results.push({
        tool: TOOL,
        ok: false,
        notes: `WRITE did not persist (expected ${JSON.stringify(target)}, got ${JSON.stringify(afterIgnored)})`,
      });
      log(`${c.red}✗ persistence assertion failed${c.reset}`);
    } else {
      results.push({
        tool: TOOL,
        ok: true,
        notes: `ignoredEmails round-trip ok (marker ${MARKER})`,
      });
      pass(`ignoredEmails write persisted`);
    }

    // Revert
    await callTool(registry, TOOL, {
      action: 'update',
      enabled: original.enabled as boolean,
      siteKey: origSiteKey,
      secretKey: origSecretKey,
      minScore: (original.minScore as number | null) ?? 0.5,
      ignoredEmails: origIgnored,
    });
  } catch (err) {
    results.push({
      tool: TOOL,
      ok: false,
      notes: err instanceof Error ? err.message : String(err),
    });
    log(`${c.red}✗ smoke threw: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
  }
}

async function main() {
  log(`${c.bold}${c.blue}=== Category C smoke test ===${c.reset}`);

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    fail(
      'FRONTEGG_CLIENT_ID and FRONTEGG_SECRET must be set. ' +
        'Run: source ~/Showcase/frontegg-api-creds.env'
    );
  }
  info(`tenant clientId = ${process.env.FRONTEGG_CLIENT_ID?.slice(0, 8)}…`);

  const registry = new ToolRegistry();
  new FronteggAuthPoliciesTools().register(registry);

  await smokePasswordPolicy(registry);
  await smokeLockoutPolicy(registry);
  await smokeSecurityRules(registry);

  // Summary
  log('');
  log(`${c.bold}=== Summary ===${c.reset}`);
  let allOk = true;
  for (const r of results) {
    if (r.ok) {
      log(`${c.green}PASS${c.reset} ${r.tool} — ${r.notes}`);
    } else {
      allOk = false;
      log(`${c.red}FAIL${c.reset} ${r.tool} — ${r.notes}`);
    }
  }
  log('');
  if (allOk) {
    log(`${c.bold}${c.green}=== smoke PASSED (3/3) ===${c.reset}`);
    process.exit(0);
  } else {
    const failed = results.filter((r) => !r.ok).length;
    log(`${c.bold}${c.red}=== smoke FAILED (${failed}/${results.length} failed) ===${c.reset}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${c.red}Smoke runner threw:${c.reset}`, err);
  process.exit(99);
});
