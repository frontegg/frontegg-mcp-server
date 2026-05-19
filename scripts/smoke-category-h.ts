#!/usr/bin/env tsx
/**
 * Smoke test for Category H — Frontegg API tokens.
 *
 * Exercises every new tool end-to-end against a real Frontegg tenant:
 *   1. list  → snapshot current tokens
 *   2. create → make `mcp-smoke-token-<ts>` (ReadOnly role)
 *   3. list  → confirm the new token is present
 *   4. revoke → guard-checked: only revokes tokens whose description
 *      starts with `mcp-smoke-`. Refuses to touch anything else.
 *   5. list  → confirm the token is gone
 *
 * Prints PASS / FAIL per step. Exits non-zero on any failure.
 *
 * Usage:
 *   set -a && source ~/Showcase/frontegg-api-creds.env && set +a
 *   FRONTEGG_TENANT_ID=<uuid> npx tsx scripts/smoke-category-h.ts
 *
 * Env vars (read directly, no .env loading):
 *   FRONTEGG_CLIENT_ID, FRONTEGG_SECRET    — vendor creds
 *   FRONTEGG_BASE_URL                      — optional, defaults to https://api.frontegg.com
 *   FRONTEGG_TENANT_ID                     — tenant UUID to act against
 *   FRONTEGG_SMOKE_ROLE_ID                 — optional; if unset, the script
 *                                            picks the "ReadOnly" role
 */

import 'dotenv/config';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggApiTokensTools } from '../src/tools/frontegg-api-tokens.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  blue: '\x1b[38;5;111m',
  yellow: '\x1b[38;5;221m',
};

function log(msg = '') {
  console.log(msg);
}
function pass(step: string, detail = '') {
  log(`${c.green}PASS${c.reset} ${step}${detail ? `  ${c.dim}${detail}${c.reset}` : ''}`);
}
function fail(step: string, detail = ''): never {
  log(`${c.red}FAIL${c.reset} ${step}${detail ? `  ${c.dim}${detail}${c.reset}` : ''}`);
  process.exit(1);
}

interface ListedToken {
  clientId: string;
  description?: string;
  roleIds?: string[];
}

function parseTokensFromOutput(text: string): ListedToken[] {
  // The list tool wraps the JSON in a ```json ... ``` fence.
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[1]!);
    return Array.isArray(parsed) ? (parsed as ListedToken[]) : [];
  } catch {
    return [];
  }
}

function parseCreatedTokenId(text: string): string | null {
  // The create tool reports: "- Client ID: `<uuid>`"
  const m = text.match(/- Client ID: `([^`]+)`/);
  return m?.[1] ?? null;
}

async function pickRoleId(
  baseUrl: string,
  vendorToken: string,
  tenantId: string
): Promise<string> {
  // Already-set env wins
  if (process.env.FRONTEGG_SMOKE_ROLE_ID) {
    return process.env.FRONTEGG_SMOKE_ROLE_ID;
  }
  const res = await fetch(`${baseUrl}/identity/resources/roles/v1`, {
    headers: {
      Authorization: `Bearer ${vendorToken}`,
      'frontegg-tenant-id': tenantId,
    },
  });
  if (!res.ok) {
    fail('pick role', `roles list returned ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  const items = Array.isArray(data)
    ? data
    : (data as { items?: unknown[] }).items ?? [];
  const roles = items as Array<{ id: string; key: string; name: string }>;
  // Prefer a read-only role to minimize blast radius if the secret leaks.
  const readonly = roles.find(
    (r) => /readonly|read-only|read_only|viewer/i.test(r.key) || /read.?only/i.test(r.name)
  );
  if (readonly) return readonly.id;
  // Fallback: any non-Admin role
  const nonAdmin = roles.find((r) => !/admin/i.test(r.key));
  if (nonAdmin) return nonAdmin.id;
  if (roles.length === 0) fail('pick role', 'tenant has no roles');
  return roles[0]!.id;
}

async function mintVendorToken(): Promise<{ token: string; baseUrl: string }> {
  const baseUrl = process.env.FRONTEGG_BASE_URL ?? 'https://api.frontegg.com';
  const res = await fetch(`${baseUrl}/auth/vendor/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.FRONTEGG_CLIENT_ID,
      secret: process.env.FRONTEGG_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    fail('vendor auth', `${res.status}: ${body || res.statusText}`);
  }
  const data = (await res.json()) as { token: string };
  return { token: data.token, baseUrl };
}

async function main() {
  log(`${c.bold}${c.blue}=== Category H smoke test ===${c.reset}`);
  log('');

  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    fail('env', 'FRONTEGG_CLIENT_ID + FRONTEGG_SECRET must be set');
  }
  const tenantId = process.env.FRONTEGG_TENANT_ID;
  if (!tenantId) {
    fail('env', 'FRONTEGG_TENANT_ID must be set');
  }

  // Mint a vendor token just for the role-lookup helper; the MCP tools mint
  // their own internally via fronteggApi().
  const { token: vendorToken, baseUrl } = await mintVendorToken();
  const roleId = await pickRoleId(baseUrl, vendorToken, tenantId);
  pass('setup', `tenantId=${tenantId.slice(0, 8)}… roleId=${roleId.slice(0, 8)}…`);

  const registry = new ToolRegistry();
  new FronteggApiTokensTools().register(registry);

  // 1. List baseline
  log('');
  log(`${c.bold}1. list (baseline)${c.reset}`);
  const list1 = await registry.call('frontegg_api_tokens_list', { tenantId });
  const list1Text = list1.content[0]?.text ?? '';
  if (list1Text.startsWith('❌')) fail('list (baseline)', list1Text);
  const before = parseTokensFromOutput(list1Text);
  pass('list (baseline)', `${before.length} token(s) currently active`);

  // 2. Create
  const ts = Date.now();
  const description = `mcp-smoke-token-${ts}`;
  log('');
  log(`${c.bold}2. create ${description}${c.reset}`);
  const createResult = await registry.call('frontegg_api_tokens_create', {
    tenantId,
    description,
    roleIds: [roleId],
    expiresInMinutes: 30,
  });
  const createText = createResult.content[0]?.text ?? '';
  if (createText.startsWith('❌')) fail('create', createText);
  if (!/SAVE THE SECRET NOW/.test(createText)) {
    fail('create', 'response did not include the save-now banner');
  }
  const newTokenId = parseCreatedTokenId(createText);
  if (!newTokenId) fail('create', 'could not extract clientId from response');
  // Sanity: secret should be a UUID-shaped string (Frontegg returns UUIDs).
  if (!/Secret: `[a-f0-9-]{20,}`/.test(createText)) {
    fail('create', 'response did not include a secret');
  }
  pass('create', `clientId=${newTokenId.slice(0, 8)}…`);

  // 3. List confirms presence
  log('');
  log(`${c.bold}3. list (post-create)${c.reset}`);
  const list2 = await registry.call('frontegg_api_tokens_list', { tenantId });
  const list2Text = list2.content[0]?.text ?? '';
  if (list2Text.startsWith('❌')) fail('list (post-create)', list2Text);
  const after = parseTokensFromOutput(list2Text);
  const found = after.find((t) => t.clientId === newTokenId);
  if (!found) {
    fail('list (post-create)', `new token ${newTokenId} not in list`);
  }
  if (found.description !== description) {
    fail('list (post-create)', `description mismatch: got "${found.description}"`);
  }
  pass('list (post-create)', `${after.length} token(s), new one present with matching description`);

  // 4. Revoke — guarded
  log('');
  log(`${c.bold}4. revoke (guarded)${c.reset}`);
  if (!found.description?.startsWith('mcp-smoke-')) {
    fail(
      'revoke guard',
      `refusing to revoke a token whose description does not start with mcp-smoke-: "${found.description}"`
    );
  }
  pass(
    'revoke guard',
    `description "${found.description}" matches mcp-smoke- prefix`
  );
  const revokeResult = await registry.call('frontegg_api_tokens_revoke', {
    tenantId,
    tokenId: newTokenId,
    confirm: true,
  });
  const revokeText = revokeResult.content[0]?.text ?? '';
  if (revokeText.startsWith('❌')) fail('revoke', revokeText);
  pass('revoke', `clientId=${newTokenId.slice(0, 8)}… revoked`);

  // 5. List confirms absence
  log('');
  log(`${c.bold}5. list (post-revoke)${c.reset}`);
  const list3 = await registry.call('frontegg_api_tokens_list', { tenantId });
  const list3Text = list3.content[0]?.text ?? '';
  if (list3Text.startsWith('❌')) fail('list (post-revoke)', list3Text);
  const final = parseTokensFromOutput(list3Text);
  const stillThere = final.find((t) => t.clientId === newTokenId);
  if (stillThere) {
    fail('list (post-revoke)', `token ${newTokenId} is still present after revoke`);
  }
  if (final.length !== before.length) {
    log(
      `${c.yellow}warn${c.reset}  list size changed: baseline=${before.length}, final=${final.length} (other tokens may have been added/removed mid-run)`
    );
  }
  pass('list (post-revoke)', `token absent; tenant token count back to ${final.length}`);

  log('');
  log(`${c.bold}${c.green}=== Category H smoke PASSED ===${c.reset}`);
}

main().catch((err) => {
  console.error(`${c.red}Smoke test threw:${c.reset}`, err);
  process.exit(99);
});
