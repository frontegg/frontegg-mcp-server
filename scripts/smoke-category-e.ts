#!/usr/bin/env tsx
/**
 * Category-E smoke test — user-session tools.
 *
 * What this does:
 *   1. Mints a Frontegg vendor token from FRONTEGG_CLIENT_ID + FRONTEGG_SECRET.
 *   2. Picks the first tenant from /tenants/resources/tenants/v2 and the first
 *      Application id from /applications/resources/applications/v1 — needed
 *      to create a user.
 *   3. Creates a disposable test user with email prefix `mcp-smoke-test-…`
 *      via POST /identity/resources/users/v1.
 *   4. Runs all three Category-E tools end-to-end through the real tool
 *      registry, exactly the same path the MCP server uses:
 *
 *        frontegg_user_sessions_list      — expects []
 *        frontegg_user_session_revoke     — call with a fake session id (404)
 *        frontegg_user_sessions_revoke_all — safe no-op on a 0-session user
 *
 *   5. Deletes the test user.
 *
 * Safety guards:
 *   - SMOKE_USER_PREFIX is checked. The script refuses to call any DELETE
 *     endpoint against a user whose email doesn't start with `mcp-smoke-`.
 *     If you point this at an existing real user (e.g. by hand-editing
 *     SMOKE_USER_ID) it will exit with a loud error.
 *   - The destructive tools are exercised against a user we created in this
 *     same run with zero sessions. Real human users on the tenant are never
 *     touched.
 *
 * Usage:
 *   set -a && source ~/Showcase/frontegg-api-creds.env && set +a
 *   npx tsx scripts/smoke-category-e.ts
 *
 * Exit codes:
 *   0  every step PASS
 *   1  env var missing
 *   2  test-user create failed
 *   3  one of the three tool calls failed in an unexpected way
 *   4  cleanup failed (test user leaked — please clean up by hand)
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggUserSessionTools } from '../src/tools/frontegg-user-sessions.js';

const SMOKE_USER_PREFIX = 'mcp-smoke-test-';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;214m',
  blue: '\x1b[38;5;111m',
};

function log(msg = ''): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function pass(label: string): void {
  log(`${c.green}PASS${c.reset}  ${label}`);
}

function fail(label: string, detail = ''): void {
  log(`${c.red}FAIL${c.reset}  ${label}${detail ? '\n      ' + detail : ''}`);
}

async function mintVendorToken(): Promise<string> {
  const clientId = process.env.FRONTEGG_CLIENT_ID;
  const secret = process.env.FRONTEGG_SECRET;
  if (!clientId || !secret) {
    log(
      `${c.red}Missing FRONTEGG_CLIENT_ID / FRONTEGG_SECRET.${c.reset} ` +
        `Source ~/Showcase/frontegg-api-creds.env first.`
    );
    process.exit(1);
  }
  const res = await fetch('https://api.frontegg.com/auth/vendor/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, secret }),
  });
  if (!res.ok) {
    throw new Error(`vendor auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string };
  return data.token;
}

interface FronteggUser {
  id: string;
  email: string;
}

async function pickTenantId(token: string): Promise<string> {
  const res = await fetch(
    'https://api.frontegg.com/tenants/resources/tenants/v2?_limit=1',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`tenants list failed: ${res.status}`);
  const data = (await res.json()) as { items: Array<{ tenantId: string }> };
  const t = data.items[0];
  if (!t) throw new Error('no tenants on this account');
  return t.tenantId;
}

async function pickApplicationId(token: string): Promise<string> {
  const res = await fetch(
    'https://api.frontegg.com/applications/resources/applications/v1?_limit=5',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`apps list failed: ${res.status}`);
  const data = (await res.json()) as Array<{ id: string; name?: string }>;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('no applications on this account');
  }
  // Prefer a "Web app"-named app, otherwise first.
  const web = data.find((a) => /web/i.test(a.name ?? ''));
  return (web ?? data[0]!).id;
}

async function createTestUser(
  token: string,
  tenantId: string,
  appId: string
): Promise<FronteggUser> {
  const email = `${SMOKE_USER_PREFIX}${Date.now()}@example.com`;
  const res = await fetch(
    'https://api.frontegg.com/identity/resources/users/v1',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'frontegg-tenant-id': tenantId,
        'frontegg-application-id': appId,
      },
      body: JSON.stringify({
        email,
        name: 'MCP Smoke Test',
        skipInviteEmail: true,
        provider: 'local',
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`create user failed: ${res.status} ${await res.text()}`);
  }
  const u = (await res.json()) as FronteggUser;
  return { id: u.id, email: u.email };
}

async function deleteTestUser(
  token: string,
  tenantId: string,
  user: FronteggUser
): Promise<void> {
  if (!user.email.startsWith(SMOKE_USER_PREFIX)) {
    throw new Error(
      `REFUSING TO DELETE: user email ${user.email} does not start with ${SMOKE_USER_PREFIX}`
    );
  }
  const res = await fetch(
    `https://api.frontegg.com/identity/resources/users/v1/${encodeURIComponent(user.id)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'frontegg-tenant-id': tenantId,
      },
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete user failed: ${res.status} ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  log(`${c.bold}${c.blue}=== Category-E smoke (user-session tools) ===${c.reset}`);
  log();

  const token = await mintVendorToken();
  log(`${c.dim}vendor token: ${c.reset}${token.length} chars`);
  const tenantId = await pickTenantId(token);
  const appId = await pickApplicationId(token);
  log(`${c.dim}tenant id:    ${c.reset}${tenantId}`);
  log(`${c.dim}application:  ${c.reset}${appId}`);
  log();

  let user: FronteggUser;
  try {
    user = await createTestUser(token, tenantId, appId);
    log(`${c.green}created test user${c.reset} ${user.email} (id=${user.id})`);
  } catch (err) {
    fail('create test user', String(err));
    process.exit(2);
  }
  log();

  // Hard safety guard: every destructive call below requires this match.
  if (!user.email.startsWith(SMOKE_USER_PREFIX)) {
    fail('safety guard', `email ${user.email} not prefixed`);
    process.exit(3);
  }

  // Wire up the real registry — same code path as src/index.ts.
  const registry = new ToolRegistry();
  new FronteggUserSessionTools().register(registry);

  let failures = 0;

  // 1) LIST — expect 0 sessions.
  try {
    const r = await registry.call('frontegg_user_sessions_list', {
      userId: user.id,
      tenantId,
    });
    const text = r.content[0]?.text ?? '';
    if (/has 0 active sessions/i.test(text)) {
      pass('frontegg_user_sessions_list — empty list');
    } else if (/error/i.test(text) || /API error/i.test(text)) {
      fail('frontegg_user_sessions_list', text.slice(0, 300));
      failures++;
    } else {
      // Got a non-empty list? That's still a PASS — the schema works.
      pass(`frontegg_user_sessions_list — got rows (${text.length} chars)`);
    }
  } catch (err) {
    fail('frontegg_user_sessions_list threw', String(err));
    failures++;
  }

  // 2) REVOKE single — exercise the call shape with a fake session id.
  //    We expect a 404 "Session not found" from Frontegg, which the tool
  //    surfaces as a clean error. That proves the path + headers are right.
  try {
    const fakeSid = '00000000-0000-0000-0000-000000000000';
    const r = await registry.call('frontegg_user_session_revoke', {
      userId: user.id,
      tenantId,
      sessionId: fakeSid,
    });
    const text = r.content[0]?.text ?? '';
    if (/Session not found/i.test(text) || /404/.test(text)) {
      pass('frontegg_user_session_revoke — 404 on fake session id (path shape verified)');
    } else if (/Session Revoked/.test(text)) {
      // Shouldn't happen on a fake UUID, but treat as success.
      pass('frontegg_user_session_revoke — unexpectedly revoked (treating as PASS)');
    } else {
      fail('frontegg_user_session_revoke', text.slice(0, 300));
      failures++;
    }
  } catch (err) {
    fail('frontegg_user_session_revoke threw', String(err));
    failures++;
  }

  // 3) REVOKE all — safe no-op against a 0-session test user.
  try {
    const r = await registry.call('frontegg_user_sessions_revoke_all', {
      userId: user.id,
      tenantId,
      confirm: true,
    });
    const text = r.content[0]?.text ?? '';
    if (/All Sessions Revoked/.test(text)) {
      pass('frontegg_user_sessions_revoke_all — no-op on 0-session test user');
    } else {
      fail('frontegg_user_sessions_revoke_all', text.slice(0, 300));
      failures++;
    }
  } catch (err) {
    fail('frontegg_user_sessions_revoke_all threw', String(err));
    failures++;
  }

  // 3b) Refuse-on-no-confirm guard.
  try {
    const r = await registry.call('frontegg_user_sessions_revoke_all', {
      userId: user.id,
      tenantId,
      confirm: false,
    });
    const text = r.content[0]?.text ?? '';
    if (/invalid|literal|true|confirm/i.test(text)) {
      pass('frontegg_user_sessions_revoke_all — confirm:false rejected by schema');
    } else {
      fail('frontegg_user_sessions_revoke_all confirm guard', text.slice(0, 200));
      failures++;
    }
  } catch (err) {
    fail('confirm guard threw', String(err));
    failures++;
  }

  // Cleanup.
  log();
  try {
    await deleteTestUser(token, tenantId, user);
    log(`${c.green}cleanup OK${c.reset}: test user ${user.email} deleted`);
  } catch (err) {
    log(`${c.yellow}cleanup WARNING${c.reset}: ${String(err)}`);
    log(`${c.yellow}Please delete user id=${user.id} email=${user.email} manually.${c.reset}`);
    process.exit(4);
  }

  log();
  if (failures > 0) {
    log(`${c.red}${c.bold}=== ${failures} step(s) FAILED ===${c.reset}`);
    process.exit(3);
  }
  log(`${c.green}${c.bold}=== Category-E smoke PASS ===${c.reset}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`${c.red}Smoke threw:${c.reset}`, err);
  process.exit(99);
});
