#!/usr/bin/env tsx
/**
 * Manual smoke test for the `frontegg_login` OAuth flow.
 *
 * What it does:
 *   1. Reads FRONTEGG_APP_CLIENT_ID, FRONTEGG_SUBDOMAIN, FRONTEGG_CLIENT_ID,
 *      FRONTEGG_SECRET from the environment (.env auto-loaded by config-manager).
 *   2. Calls the real `handleLogin()` — this opens your browser to the
 *      Frontegg hosted login UI, captures the loopback callback, exchanges
 *      the code for tokens, and stores an in-memory session.
 *   3. After a successful login, calls `frontegg_configure_mfa` with
 *      action="get" through the same tool registry the MCP server uses.
 *      This proves the auth gate passes and the read-only Management API
 *      call works end-to-end.
 *
 * Usage:
 *   npx tsx scripts/smoke-oauth.ts
 *
 * Pre-requisites (one-time portal setup):
 *   1. In Frontegg portal → Applications → <your app> → Settings, copy the
 *      application's Client ID. Set it as FRONTEGG_APP_CLIENT_ID in .env.
 *      (This is NOT the vendor client ID.)
 *   2. Note your tenant's subdomain (e.g. "app-acme") and set it as
 *      FRONTEGG_SUBDOMAIN.
 *   3. In Frontegg portal → Authentication → Login method → Hosted login,
 *      add `http://localhost:8765/callback` to the allowed redirect URIs.
 *   4. Make sure FRONTEGG_CLIENT_ID and FRONTEGG_SECRET (vendor creds) are
 *      already set — these are used by configure_mfa after login.
 *
 * Expected output (happy path):
 *   - Browser opens to https://<subdomain>.frontegg.com/oauth/authorize
 *   - You complete the Frontegg login UI
 *   - Browser shows the "Signed in to Frontegg" success page
 *   - This script prints "Signed in as <your-email>"
 *   - This script prints the current MFA policy as JSON
 */

import 'dotenv/config';
import { handleLogin, isAuthenticated, getSession } from '../src/tools/frontegg-login.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { FronteggConfigureTools } from '../src/tools/frontegg-configure.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[38;5;120m',
  red: '\x1b[38;5;203m',
  blue: '\x1b[38;5;111m',
};

function log(msg: string) {
  console.log(msg);
}

async function main() {
  log(`${c.bold}${c.blue}=== frontegg_login smoke test ===${c.reset}`);
  log('');

  if (!process.env.FRONTEGG_APP_CLIENT_ID || !process.env.FRONTEGG_SUBDOMAIN) {
    log(`${c.red}Missing env vars.${c.reset} Set FRONTEGG_APP_CLIENT_ID and FRONTEGG_SUBDOMAIN in .env first.`);
    log('See script header for portal setup instructions.');
    process.exit(1);
  }
  if (!process.env.FRONTEGG_CLIENT_ID || !process.env.FRONTEGG_SECRET) {
    log(`${c.red}Missing vendor env vars.${c.reset} Set FRONTEGG_CLIENT_ID and FRONTEGG_SECRET to exercise the configure_mfa step.`);
    process.exit(1);
  }

  log(`${c.dim}Subdomain:${c.reset}  ${process.env.FRONTEGG_SUBDOMAIN}`);
  log(`${c.dim}App ID:${c.reset}     ${process.env.FRONTEGG_APP_CLIENT_ID?.slice(0, 8)}…`);
  log('');
  log('Opening browser for Frontegg login… (5-minute timeout)');
  log('');

  const loginResult = await handleLogin({});
  log(loginResult.content[0]?.text ?? '');

  if (!isAuthenticated()) {
    log(`${c.red}Login did not produce an active session. Aborting.${c.reset}`);
    process.exit(2);
  }

  const session = getSession();
  log('');
  log(`${c.green}✓ Session established${c.reset}`);
  log(`${c.dim}  email:${c.reset}     ${session?.email}`);
  log(`${c.dim}  tenant:${c.reset}    ${session?.tenantId}`);
  log(`${c.dim}  sub:${c.reset}       ${session?.sub}`);
  log(`${c.dim}  expires:${c.reset}   ${new Date(session?.expiresAt ?? 0).toISOString()}`);
  log('');

  // Now exercise the gated tool path.
  log(`${c.bold}Calling frontegg_configure_mfa { action: "get" } through the registry…${c.reset}`);
  const registry = new ToolRegistry();
  new FronteggConfigureTools().register(registry);
  const mfaResult = await registry.call('frontegg_configure_mfa', { action: 'get' });
  log('');
  log(mfaResult.content[0]?.text ?? '');
  log('');

  const text = mfaResult.content[0]?.text ?? '';
  if (text.includes('Please run frontegg_login first')) {
    log(`${c.red}Auth gate rejected the call. Something is wrong.${c.reset}`);
    process.exit(3);
  }
  if (text.startsWith('❌')) {
    log(`${c.red}API call failed — but auth gate passed.${c.reset}`);
    process.exit(4);
  }

  log(`${c.green}✓ Auth gate passed and Management API responded${c.reset}`);
  log('');
  log(`${c.bold}${c.green}=== smoke test PASSED ===${c.reset}`);
}

main().catch((err) => {
  console.error(`${c.red}Smoke test threw:${c.reset}`, err);
  process.exit(99);
});
