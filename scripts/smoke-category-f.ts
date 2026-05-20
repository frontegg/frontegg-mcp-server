#!/usr/bin/env tsx
/**
 * Category F smoke test — per-user MFA admin tools.
 *
 * Flow (against the real Frontegg tenant from
 * `~/Showcase/frontegg-api-creds.env`):
 *
 *   1. Mint a vendor token, list applications, pick a non-default one.
 *   2. Create a brand-new test user `mcp-smoke-mfa-<ts>@example.com`
 *      via `POST /identity/resources/users/v1`. `skipInviteEmail: true`
 *      keeps the user's mailbox clean.
 *   3. Hard safety guard: the smoke refuses to operate on any user whose
 *      email does NOT start with `mcp-smoke-`. Each tool call re-asserts
 *      the prefix.
 *   4. Call `frontegg_user_mfa_get` through the tool registry — confirm
 *      `mfaEnrolled: false` on the fresh user.
 *   5. Call `frontegg_user_mfa_reset` — this user has no MFA, so the
 *      tool's documented "no-op" branch should trigger.
 *   6. Call `frontegg_user_mfa_enforce` — vendor-token-blocked, so the
 *      tool returns the documented limitation message.
 *   7. Clean up: DELETE the test user.
 *
 * Prints PASS/FAIL with per-step status. Exits non-zero on any failure.
 *
 * Usage:
 *   source ~/Showcase/frontegg-api-creds.env && npx tsx scripts/smoke-category-f.ts
 */

import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggUserMfaTools } from '../src/tools/frontegg-user-mfa.js';

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

const SAFE_EMAIL_PREFIX = 'mcp-smoke-';

function assertSafeEmail(email: string): void {
  if (!email.startsWith(SAFE_EMAIL_PREFIX)) {
    throw new Error(
      `Refusing to operate on email "${email}" — Category F smoke only acts on users whose ` +
        `email starts with "${SAFE_EMAIL_PREFIX}". This guard prevents accidental MFA wipes ` +
        `on real users.`
    );
  }
}

async function mintToken(): Promise<string> {
  const clientId = process.env.FRONTEGG_CLIENT_ID;
  const secret = process.env.FRONTEGG_SECRET;
  if (!clientId || !secret) {
    throw new Error('FRONTEGG_CLIENT_ID and FRONTEGG_SECRET must be set');
  }
  const res = await fetch('https://api.frontegg.com/auth/vendor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, secret }),
  });
  if (!res.ok) {
    throw new Error(`Vendor auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

async function pickApplicationId(token: string): Promise<string> {
  const res = await fetch('https://api.frontegg.com/applications/resources/applications/v1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List apps failed: ${res.status} ${await res.text()}`);
  const apps = (await res.json()) as Array<{ id: string; name: string }>;
  if (!apps.length) throw new Error('No applications configured on this tenant');
  const appId = apps[0]!.id;
  log(`${c.dim}  using application:${c.reset} ${apps[0]!.name} (${appId.slice(0, 8)}…)`);
  return appId;
}

async function pickTenantId(token: string): Promise<string> {
  const res = await fetch('https://api.frontegg.com/identity/resources/users/v3?_limit=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`List users failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { items: Array<{ tenantId: string }> };
  if (!data.items.length) throw new Error('No users found, cannot infer tenant');
  return data.items[0]!.tenantId;
}

interface CreatedUser {
  id: string;
  email: string;
}

async function createTestUser(
  token: string,
  tenantId: string,
  applicationId: string
): Promise<CreatedUser> {
  const ts = Date.now();
  const email = `${SAFE_EMAIL_PREFIX}mfa-${ts}@example.com`;
  const res = await fetch('https://api.frontegg.com/identity/resources/users/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'frontegg-tenant-id': tenantId,
      'frontegg-application-id': applicationId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      name: 'MCP Category F Smoke',
      skipInviteEmail: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Create user failed: ${res.status} ${await res.text()}`);
  }
  const user = (await res.json()) as { id: string; email: string };
  return { id: user.id, email: user.email };
}

async function deleteUser(token: string, tenantId: string, userId: string): Promise<void> {
  const res = await fetch(`https://api.frontegg.com/identity/resources/users/v1/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'frontegg-tenant-id': tenantId,
    },
  });
  if (!res.ok && res.status !== 204) {
    log(
      `${c.yellow}⚠ DELETE user returned ${res.status}: ${await res.text()}${c.reset} ` +
        `(user may need manual cleanup)`
    );
  }
}

interface CheckResult {
  pass: boolean;
  name: string;
  detail: string;
}

const results: CheckResult[] = [];
function record(pass: boolean, name: string, detail: string) {
  results.push({ pass, name, detail });
  const tag = pass ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
  log(`  [${tag}] ${name}`);
  if (!pass) log(`         ${c.dim}${detail}${c.reset}`);
}

async function main() {
  log(`${c.bold}${c.blue}=== Category F smoke — per-user MFA admin tools ===${c.reset}`);
  log('');

  const token = await mintToken();
  log(`${c.green}✓ Vendor token minted${c.reset}`);

  const applicationId = await pickApplicationId(token);
  const tenantId = await pickTenantId(token);
  log(`${c.dim}  tenant:${c.reset} ${tenantId}`);
  log('');

  log(`${c.bold}Step 1 — create smoke test user${c.reset}`);
  const user = await createTestUser(token, tenantId, applicationId);
  log(`${c.green}✓ Created${c.reset} ${user.email} (${user.id.slice(0, 8)}…)`);
  assertSafeEmail(user.email);
  log('');

  // Build the registry the same way src/index.ts does.
  const registry = new ToolRegistry();
  new FronteggUserMfaTools().register(registry);

  let cleanupDone = false;
  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    log(`${c.dim}Cleaning up test user ${user.id.slice(0, 8)}…${c.reset}`);
    await deleteUser(token, tenantId, user.id);
  };

  try {
    // Step 2 — frontegg_user_mfa_get
    log(`${c.bold}Step 2 — frontegg_user_mfa_get${c.reset}`);
    assertSafeEmail(user.email);
    const getRes = await registry.call('frontegg_user_mfa_get', {
      userId: user.id,
      tenantId,
    });
    const getText = getRes.content[0]?.text ?? '';
    record(
      getText.includes('MFA Status') && getText.includes(user.email),
      'frontegg_user_mfa_get returns MFA status block',
      `output did not include "MFA Status for ${user.email}". Got: ${getText.slice(0, 200)}`
    );
    record(
      /"mfaEnrolled":\s*false/.test(getText),
      'fresh user reports mfaEnrolled: false',
      `expected mfaEnrolled false. Got: ${getText.slice(0, 200)}`
    );
    log('');

    // Step 3 — frontegg_user_mfa_reset (no-op path since fresh user has no MFA)
    log(`${c.bold}Step 3 — frontegg_user_mfa_reset (destructive)${c.reset}`);
    assertSafeEmail(user.email);
    const resetRes = await registry.call('frontegg_user_mfa_reset', {
      userId: user.id,
      tenantId,
    });
    const resetText = resetRes.content[0]?.text ?? '';
    record(
      resetText.includes('MFA Reset') && resetText.includes(user.email),
      'frontegg_user_mfa_reset surfaces a report',
      `output missing "MFA Reset" header. Got: ${resetText.slice(0, 200)}`
    );
    record(
      /User had no MFA enrolled/.test(resetText),
      'reset on un-enrolled user is a clean no-op',
      `expected no-op branch. Got: ${resetText.slice(0, 200)}`
    );
    record(
      /"mfaEnrolled":\s*false/.test(resetText),
      'post-reset re-read shows mfaEnrolled: false',
      `expected post-reset state. Got: ${resetText.slice(0, 200)}`
    );
    log('');

    // Step 4 — frontegg_user_mfa_enforce (documented limitation)
    log(`${c.bold}Step 4 — frontegg_user_mfa_enforce${c.reset}`);
    assertSafeEmail(user.email);
    const enforceRes = await registry.call('frontegg_user_mfa_enforce', {
      userId: user.id,
      tenantId,
    });
    const enforceText = enforceRes.content[0]?.text ?? '';
    record(
      /Vendor-token-blocked/i.test(enforceText),
      'enforce surfaces the vendor-token limitation',
      `expected "Vendor-token-blocked" notice. Got: ${enforceText.slice(0, 200)}`
    );
    record(
      enforceText.includes('frontegg_configure_mfa'),
      'enforce points caller at the tenant-wide workaround',
      `expected pointer to frontegg_configure_mfa. Got: ${enforceText.slice(0, 200)}`
    );
    log('');
  } finally {
    await cleanup();
    log('');
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;

  log(`${c.bold}=== Summary ===${c.reset}`);
  log(`  total: ${results.length}`);
  log(`  ${c.green}passed: ${passed}${c.reset}`);
  if (failed > 0) {
    log(`  ${c.red}failed: ${failed}${c.reset}`);
    log('');
    log(`${c.bold}${c.red}=== smoke test FAILED ===${c.reset}`);
    process.exit(1);
  }
  log('');
  log(`${c.bold}${c.green}=== smoke test PASSED ===${c.reset}`);
}

main().catch((err) => {
  console.error(`${c.red}Smoke test threw:${c.reset}`, err);
  process.exit(99);
});
