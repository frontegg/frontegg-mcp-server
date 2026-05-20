#!/usr/bin/env tsx
/**
 * Smoke test for the Category A tools (users / tenants / audit / roles).
 *
 * Exercises every new tool against the real Frontegg tenant whose vendor
 * credentials live in `~/Showcase/frontegg-api-creds.env`. Every artifact
 * created during the run is prefixed with `mcp-smoke-` so it's easy to
 * spot in the Frontegg portal for manual cleanup. The script also tries
 * to clean up after itself by deleting the role + user it created.
 *
 * Usage:
 *   source ~/Showcase/frontegg-api-creds.env && npx tsx scripts/smoke-category-a.ts
 *
 * Exit codes:
 *   0 — all six tools reported PASS
 *   1 — one or more tools failed (the summary at the end lists them)
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggUsersTools } from '../src/tools/frontegg-users.js';
import { FronteggTenantsTools } from '../src/tools/frontegg-tenants.js';
import { FronteggAuditTools } from '../src/tools/frontegg-audit.js';
import { FronteggRolesTools } from '../src/tools/frontegg-roles.js';
import { fronteggApi } from '../src/tools/frontegg-api-client.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;221m',
  blue: '\x1b[38;5;111m',
};

interface SmokeResult {
  tool: string;
  status: 'PASS' | 'FAIL';
  note?: string;
}

function log(msg: string) {
  console.log(msg);
}

function header(msg: string) {
  log('');
  log(`${c.bold}${c.blue}── ${msg} ──${c.reset}`);
}

function extractFirstJsonBlock(text: string): unknown {
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!);
  } catch {
    return null;
  }
}

async function main() {
  log(`${c.bold}${c.blue}=== Category A smoke test ===${c.reset}`);
  log(`${c.dim}users / tenants / audit / roles${c.reset}`);

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    log(`${c.red}FRONTEGG_CLIENT_ID / FRONTEGG_SECRET not set. Source ~/Showcase/frontegg-api-creds.env first.${c.reset}`);
    process.exit(1);
  }

  const registry = new ToolRegistry();
  new FronteggUsersTools().register(registry);
  new FronteggTenantsTools().register(registry);
  new FronteggAuditTools().register(registry);
  new FronteggRolesTools().register(registry);

  const results: SmokeResult[] = [];
  const ts = Date.now();
  const SMOKE_PREFIX = 'mcp-smoke-';

  // Track artifacts we create so we can clean up at the end
  let createdRoleId: string | null = null;
  let invitedUserId: string | null = null;
  let tenantIdForInvite: string | null = null;
  let applicationIdForInvite: string | null = null;

  // -------- 1. frontegg_tenants_list --------
  header('1. frontegg_tenants_list');
  try {
    const r = await registry.call('frontegg_tenants_list', { limit: 5 });
    const text = r.content[0]?.text ?? '';
    if (text.includes('Tenants') && !text.includes('❌')) {
      log(`${c.green}PASS${c.reset} — listed tenants`);
      results.push({ tool: 'frontegg_tenants_list', status: 'PASS' });

      const tenants = (extractFirstJsonBlock(text) as Array<{ tenantId: string }>) ?? [];
      if (tenants.length > 0) {
        tenantIdForInvite = tenants[0]!.tenantId;
        log(`${c.dim}  using tenantId=${tenantIdForInvite} for invite step${c.reset}`);
      }
    } else {
      log(`${c.red}FAIL${c.reset} — ${text.slice(0, 200)}`);
      results.push({ tool: 'frontegg_tenants_list', status: 'FAIL', note: text.slice(0, 200) });
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_tenants_list', status: 'FAIL', note: String(err) });
  }

  // -------- 2. frontegg_users_list --------
  header('2. frontegg_users_list');
  try {
    const r = await registry.call('frontegg_users_list', { limit: 3 });
    const text = r.content[0]?.text ?? '';
    if (text.includes('# Users') && !text.includes('❌')) {
      log(`${c.green}PASS${c.reset} — listed users`);
      results.push({ tool: 'frontegg_users_list', status: 'PASS' });
    } else {
      log(`${c.red}FAIL${c.reset} — ${text.slice(0, 200)}`);
      results.push({ tool: 'frontegg_users_list', status: 'FAIL', note: text.slice(0, 200) });
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_users_list', status: 'FAIL', note: String(err) });
  }

  // -------- 3. frontegg_audit_logs --------
  header('3. frontegg_audit_logs');
  try {
    const r = await registry.call('frontegg_audit_logs', { count: 3, sortDirection: 'desc' });
    const text = r.content[0]?.text ?? '';
    if (text.includes('Audit Events') && !text.includes('❌')) {
      log(`${c.green}PASS${c.reset} — listed audit events`);
      results.push({ tool: 'frontegg_audit_logs', status: 'PASS' });
    } else {
      log(`${c.red}FAIL${c.reset} — ${text.slice(0, 200)}`);
      results.push({ tool: 'frontegg_audit_logs', status: 'FAIL', note: text.slice(0, 200) });
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_audit_logs', status: 'FAIL', note: String(err) });
  }

  // -------- 4. frontegg_roles_list --------
  header('4. frontegg_roles_list');
  try {
    const r = await registry.call('frontegg_roles_list', {});
    const text = r.content[0]?.text ?? '';
    if (text.includes('# Roles') && !text.includes('❌')) {
      log(`${c.green}PASS${c.reset} — listed roles`);
      results.push({ tool: 'frontegg_roles_list', status: 'PASS' });
    } else {
      log(`${c.red}FAIL${c.reset} — ${text.slice(0, 200)}`);
      results.push({ tool: 'frontegg_roles_list', status: 'FAIL', note: text.slice(0, 200) });
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_roles_list', status: 'FAIL', note: String(err) });
  }

  // -------- 5. frontegg_roles_create --------
  header('5. frontegg_roles_create');
  try {
    const roleKey = `${SMOKE_PREFIX}role-${ts}`;
    const r = await registry.call('frontegg_roles_create', {
      key: roleKey,
      name: `${SMOKE_PREFIX}Role ${ts}`,
      description: 'created by Category A smoke test',
      level: 99,
    });
    const text = r.content[0]?.text ?? '';
    if (text.includes('Role Created') && !text.includes('❌')) {
      const role = extractFirstJsonBlock(text) as { id?: string } | null;
      createdRoleId = role?.id ?? null;
      log(`${c.green}PASS${c.reset} — created role ${roleKey} (id=${createdRoleId})`);
      results.push({ tool: 'frontegg_roles_create', status: 'PASS' });
    } else {
      log(`${c.red}FAIL${c.reset} — ${text.slice(0, 300)}`);
      results.push({ tool: 'frontegg_roles_create', status: 'FAIL', note: text.slice(0, 300) });
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_roles_create', status: 'FAIL', note: String(err) });
  }

  // -------- 6. frontegg_users_invite --------
  // Needs both a tenantId (from step 1) and an applicationId. We grab the
  // first application directly via the api-client because the applications
  // tool lives in Category B and is not loaded here.
  header('6. frontegg_users_invite');
  try {
    if (!tenantIdForInvite) {
      log(`${c.yellow}SKIP${c.reset} — no tenantId from tenants_list`);
      results.push({ tool: 'frontegg_users_invite', status: 'FAIL', note: 'no tenantId from tenants_list step' });
    } else {
      const apps = await fronteggApi<Array<{ id: string; name?: string }>>({
        method: 'GET',
        path: '/applications/resources/applications/v1',
      });
      if (Array.isArray(apps) && apps.length > 0) {
        applicationIdForInvite = apps[0]!.id;
        log(`${c.dim}  using applicationId=${applicationIdForInvite} (${apps[0]!.name ?? 'unnamed'})${c.reset}`);
      }
      if (!applicationIdForInvite) {
        log(`${c.red}FAIL${c.reset} — no applications found`);
        results.push({ tool: 'frontegg_users_invite', status: 'FAIL', note: 'no applications in environment' });
      } else {
        const email = `${SMOKE_PREFIX}test-${ts}@example.com`;
        const r = await registry.call('frontegg_users_invite', {
          email,
          tenantId: tenantIdForInvite,
          applicationId: applicationIdForInvite,
          name: `${SMOKE_PREFIX}smoke ${ts}`,
          skipInviteEmail: true,
        });
        const text = r.content[0]?.text ?? '';
        if (text.includes('User Invited') && !text.includes('❌')) {
          const user = extractFirstJsonBlock(text) as { id?: string } | null;
          invitedUserId = user?.id ?? null;
          log(`${c.green}PASS${c.reset} — invited ${email} (id=${invitedUserId})`);
          results.push({ tool: 'frontegg_users_invite', status: 'PASS' });
        } else {
          log(`${c.red}FAIL${c.reset} — ${text.slice(0, 300)}`);
          results.push({ tool: 'frontegg_users_invite', status: 'FAIL', note: text.slice(0, 300) });
        }
      }
    }
  } catch (err) {
    log(`${c.red}FAIL${c.reset} — ${err}`);
    results.push({ tool: 'frontegg_users_invite', status: 'FAIL', note: String(err) });
  }

  // -------- Cleanup --------
  header('Cleanup');
  if (createdRoleId) {
    try {
      await fronteggApi({ method: 'DELETE', path: `/identity/resources/roles/v1/${createdRoleId}` });
      log(`${c.dim}deleted role ${createdRoleId}${c.reset}`);
    } catch (err) {
      log(`${c.yellow}could not delete role ${createdRoleId}: ${err}${c.reset}`);
    }
  }
  if (invitedUserId && tenantIdForInvite && applicationIdForInvite) {
    try {
      await fronteggApi({
        method: 'DELETE',
        path: `/identity/resources/users/v1/${invitedUserId}`,
        headers: {
          'frontegg-tenant-id': tenantIdForInvite,
          'frontegg-application-id': applicationIdForInvite,
        },
      });
      log(`${c.dim}deleted user ${invitedUserId}${c.reset}`);
    } catch (err) {
      log(`${c.yellow}could not delete user ${invitedUserId}: ${err}${c.reset}`);
    }
  }

  // -------- Summary --------
  header('Summary');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  for (const r of results) {
    const tag = r.status === 'PASS' ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
    log(`  ${tag}  ${r.tool}${r.note ? `  ${c.dim}(${r.note})${c.reset}` : ''}`);
  }
  log('');
  log(`${c.bold}${passed} passed, ${failed} failed${c.reset}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
