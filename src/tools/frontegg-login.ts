/**
 * frontegg_login — OAuth 2.0 Authorization Code + PKCE login against the
 * user's Frontegg tenant. Used as a gate for the `frontegg_configure_*`
 * tools so the cinematic demo flow is:
 *
 *   1. user: "sign me in to Frontegg"
 *   2. MCP opens the real Frontegg login UI in the browser
 *   3. user authenticates
 *   4. MCP captures the loopback redirect, exchanges code for tokens,
 *      decodes the id_token, stores the session in-memory
 *   5. MCP returns "Signed in as <email>" to Cursor
 *
 * Architectural note: this is "Approach C" from the research brief — the
 * user OAuth flow ONLY gates the configure tools. The actual Management API
 * calls still use the vendor credentials (FRONTEGG_CLIENT_ID + FRONTEGG_SECRET)
 * because Management APIs require an environment token, not a user token.
 *
 * Session state is module-scoped (not global) — encapsulated below.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { z } from 'zod';
import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { Logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Session state — module-scoped singleton
// ---------------------------------------------------------------------------

export interface FronteggSession {
  email: string;
  tenantId: string;
  sub: string;
  expiresAt: number; // epoch ms
}

let session: FronteggSession | null = null;

/** Return the active session or null. Does NOT check expiry — use `isAuthenticated()` for that. */
export function getSession(): FronteggSession | null {
  return session;
}

/** True if we have a session and it hasn't expired. */
export function isAuthenticated(): boolean {
  if (!session) return false;
  if (session.expiresAt <= Date.now()) return false;
  return true;
}

/** Drop the current session — used by tests and a hypothetical logout tool. */
export function clearSession(): void {
  session = null;
}

/** Test-only: set a session directly without going through OAuth. */
export function _setSessionForTest(s: FronteggSession | null): void {
  session = s;
}

// ---------------------------------------------------------------------------
// PKCE / state helpers
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Generate a PKCE code_verifier (random 32 bytes, base64url). */
export function generateCodeVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

/** SHA-256 the verifier, base64url-encode. Per RFC 7636. */
export function generateCodeChallenge(verifier: string): string {
  return base64url(crypto.createHash('sha256').update(verifier).digest());
}

/** Random nonce for the OAuth `state` param (16 bytes). */
export function generateState(): string {
  return base64url(crypto.randomBytes(16));
}

// ---------------------------------------------------------------------------
// JWT decode (no signature verification — Frontegg already signed it, and
// we only use it for display/session-keying)
// ---------------------------------------------------------------------------

export interface JwtClaims {
  email?: string;
  tenantId?: string;
  sub?: string;
  exp?: number;
  [k: string]: unknown;
}

export function decodeJwt(token: string): JwtClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!;
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

export interface AuthorizeUrlParams {
  subdomain: string;
  appClientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}

export function buildAuthorizationUrl(p: AuthorizeUrlParams): string {
  const qs = new URLSearchParams({
    response_type: 'code',
    client_id: p.appClientId,
    redirect_uri: p.redirectUri,
    scope: 'openid email profile',
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    state: p.state,
  });
  return `https://${p.subdomain}.frontegg.com/oauth/authorize?${qs.toString()}`;
}

// ---------------------------------------------------------------------------
// Browser launch (no extra deps — platform-detect via child_process.exec)
// ---------------------------------------------------------------------------

function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let cmd: string;
    if (process.platform === 'darwin') {
      cmd = `open "${url}"`;
    } else if (process.platform === 'win32') {
      // `start ""` so the URL isn't interpreted as the window title
      cmd = `start "" "${url}"`;
    } else {
      cmd = `xdg-open "${url}"`;
    }
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Loopback callback server
// ---------------------------------------------------------------------------

export interface CallbackResult {
  code: string;
  state: string;
}

export interface CallbackError {
  error: string;
  description?: string;
}

/**
 * Builds a polished HTML success page. The email is the only PII shown —
 * the page is on camera in the showcase video, so it needs to look nice.
 */
export function buildSuccessHtml(email?: string): string {
  const greeting = email
    ? `You're authenticated as <strong>${escapeHtml(email)}</strong>.`
    : `You're authenticated to your Frontegg tenant.`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Signed in — Frontegg MCP</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
             background: #0f1115; color: #e6e6e6;
             display: flex; align-items: center; justify-content: center;
             min-height: 100vh; margin: 0; }
      .card { background: #1a1d24; padding: 48px 56px; border-radius: 12px;
              box-shadow: 0 24px 60px rgba(0,0,0,0.4);
              text-align: center; max-width: 480px; }
      .check { width: 64px; height: 64px; margin: 0 auto 24px;
               border-radius: 50%; background: #22c55e;
               display: flex; align-items: center; justify-content: center;
               font-size: 32px; color: #0f1115; }
      h1 { font-size: 24px; font-weight: 600; margin: 0 0 12px; }
      p { font-size: 16px; color: #9ca3af; margin: 0 0 8px; line-height: 1.5; }
      .small { font-size: 13px; color: #6b7280; margin-top: 28px; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="check">&#10003;</div>
      <h1>Signed in to Frontegg</h1>
      <p>${greeting}</p>
      <p>Return to Cursor to continue.</p>
      <div class="small">You can close this tab.</div>
    </div>
  </body>
</html>`;
}

/** Minimal error page if Frontegg redirects back with `error=...`. */
export function buildErrorHtml(error: string, description?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Sign-in failed — Frontegg MCP</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
             background: #0f1115; color: #e6e6e6;
             display: flex; align-items: center; justify-content: center;
             min-height: 100vh; margin: 0; }
      .card { background: #1a1d24; padding: 48px 56px; border-radius: 12px;
              box-shadow: 0 24px 60px rgba(0,0,0,0.4);
              text-align: center; max-width: 480px; }
      .x { width: 64px; height: 64px; margin: 0 auto 24px;
           border-radius: 50%; background: #ef4444;
           display: flex; align-items: center; justify-content: center;
           font-size: 32px; color: #0f1115; }
      h1 { font-size: 24px; font-weight: 600; margin: 0 0 12px; }
      p { font-size: 16px; color: #9ca3af; margin: 0 0 8px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="x">&#10006;</div>
      <h1>Sign-in failed</h1>
      <p>${escapeHtml(error)}</p>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      <p>Return to Cursor and try again.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Spin up an HTTP server on `port`, wait for `GET /callback`, respond with
 * the success page (or an error page), and resolve with `{ code, state }`.
 *
 * The page rendered to the browser uses `successHtml` — the caller usually
 * doesn't know the email yet when they invoke this, so the success page
 * here renders without an email. (We could swap it in later but the server
 * has to respond to the callback before we exchange the code, so we accept
 * the trade-off.)
 *
 * Rejects on timeout (default 5 minutes), state mismatch, or Frontegg
 * error redirect.
 */
export function waitForCallback(opts: {
  port: number;
  expectedState: string;
  timeoutMs?: number;
  successHtml?: string;
}): Promise<CallbackResult> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const successHtml = opts.successHtml ?? buildSuccessHtml();

  return new Promise<CallbackResult>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost:${opts.port}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }
        const error = url.searchParams.get('error');
        if (error) {
          const desc = url.searchParams.get('error_description') ?? undefined;
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildErrorHtml(error, desc));
          cleanup();
          reject(new Error(`Frontegg returned error: ${error}${desc ? ` (${desc})` : ''}`));
          return;
        }
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildErrorHtml('Missing code or state parameter'));
          cleanup();
          reject(new Error('Callback missing code or state'));
          return;
        }
        if (state !== opts.expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildErrorHtml('State mismatch (possible CSRF)'));
          cleanup();
          reject(new Error('Authentication failed: state mismatch (possible CSRF). Try again.'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(successHtml);
        cleanup();
        resolve({ code, state });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal error');
        cleanup();
        reject(err);
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Login timed out. Try again.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* ignore */
      }
    }

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });

    server.listen(opts.port, '127.0.0.1');
  });
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface TokenResponse {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForToken(opts: {
  subdomain: string;
  appClientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<TokenResponse> {
  const f = opts.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.appClientId,
  });
  const res = await f(`https://${opts.subdomain}.frontegg.com/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  // Frontegg returns JSON for both success and error
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    const msg =
      json.error_description ?? json.error ?? `Token endpoint returned HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${msg}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const LOGIN_TOOL: McpTool = {
  name: 'frontegg_login',
  description:
    'Sign in to your Frontegg tenant via OAuth 2.0 Authorization Code + PKCE. ' +
    'Opens the real Frontegg login UI in your browser, captures the callback, ' +
    'and stores an in-memory session that unlocks the frontegg_configure_* tools. ' +
    'Requires FRONTEGG_APP_CLIENT_ID and FRONTEGG_SUBDOMAIN env vars (one-time portal setup).',
  inputSchema: {
    type: 'object',
    properties: {
      subdomain: {
        type: 'string',
        description:
          'Optional Frontegg subdomain (e.g. "app-acme"). If omitted, FRONTEGG_SUBDOMAIN env var is used.',
      },
      force: {
        type: 'boolean',
        description:
          'If true, sign in again even when an active session exists. Defaults to false (no-op if already signed in).',
      },
    },
  },
};

const LoginArgsSchema = z.object({
  subdomain: z.string().optional(),
  force: z.boolean().optional(),
});

const DEFAULT_PORT = 8765;

export interface HandleLoginDeps {
  port?: number;
  fetchImpl?: typeof fetch;
  /** If provided, replaces real `openBrowser` (used by tests). */
  openBrowserImpl?: (url: string) => Promise<void>;
  /** If provided, replaces real `waitForCallback` (used by tests). */
  waitForCallbackImpl?: typeof waitForCallback;
  /** If provided, returns env vars (used by tests). */
  envReader?: () => { appClientId?: string; subdomain?: string };
}

export async function handleLogin(
  raw: unknown,
  deps: HandleLoginDeps = {}
): Promise<ReturnType<typeof textResult>> {
  const logger = Logger.getInstance();
  const args = LoginArgsSchema.parse(raw ?? {});

  // Idempotent: if already signed in and not forcing, return early.
  if (!args.force && isAuthenticated()) {
    const s = getSession()!;
    return textResult(
      `Already signed in as ${s.email} (tenant: ${s.tenantId}). ` +
        `Pass force=true to sign in again.`
    );
  }

  // Resolve config
  const envReader =
    deps.envReader ??
    (() => ({
      appClientId: process.env.FRONTEGG_APP_CLIENT_ID,
      subdomain: process.env.FRONTEGG_SUBDOMAIN,
    }));
  const env = envReader();
  const subdomain = args.subdomain ?? env.subdomain;
  const appClientId = env.appClientId;

  if (!appClientId || !subdomain) {
    const missing: string[] = [];
    if (!appClientId) missing.push('FRONTEGG_APP_CLIENT_ID');
    if (!subdomain) missing.push('FRONTEGG_SUBDOMAIN');
    return textResult(
      `frontegg_login is not configured. Missing env var${missing.length > 1 ? 's' : ''}: ${missing.join(
        ', '
      )}.\n\n` +
        `Setup (one-time):\n` +
        `  1. In the Frontegg portal go to Applications → <your app> → Settings.\n` +
        `  2. Copy the application's Client ID (NOT the vendor client ID — this is the\n` +
        `     public Application clientId) and set FRONTEGG_APP_CLIENT_ID.\n` +
        `  3. Note your subdomain (e.g. "app-acme") and set FRONTEGG_SUBDOMAIN.\n` +
        `  4. Register http://localhost:${DEFAULT_PORT}/callback as an allowed redirect URI\n` +
        `     under Authentication → Login method.\n` +
        `  5. Restart Cursor and try again.`
    );
  }

  const port = deps.port ?? DEFAULT_PORT;
  const redirectUri = `http://localhost:${port}/callback`;
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();
  const authUrl = buildAuthorizationUrl({
    subdomain,
    appClientId,
    redirectUri,
    codeChallenge: challenge,
    state,
  });

  const waitImpl = deps.waitForCallbackImpl ?? waitForCallback;
  const callbackPromise = waitImpl({
    port,
    expectedState: state,
  });

  // Fire-and-don't-block the browser open. If it fails, surface the URL so
  // the user can paste it manually.
  const openImpl = deps.openBrowserImpl ?? openBrowser;
  let browserOpenError: Error | null = null;
  openImpl(authUrl).catch((err: Error) => {
    browserOpenError = err;
    logger.warn('Failed to open browser for OAuth login', { error: err.message });
  });

  let callback: CallbackResult;
  try {
    callback = await callbackPromise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (browserOpenError) {
      return textResult(
        `Could not open browser automatically. Please open this URL manually:\n\n${authUrl}\n\n` +
          `Then sign in. (Underlying error: ${msg})`
      );
    }
    return textResult(`Sign-in failed: ${msg}`);
  }

  // Exchange code for tokens.
  let tokens: TokenResponse;
  try {
    tokens = await exchangeCodeForToken({
      subdomain,
      appClientId,
      code: callback.code,
      redirectUri,
      codeVerifier: verifier,
      fetchImpl: deps.fetchImpl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Sign-in failed: ${msg}`);
  }

  const claims = tokens.id_token ? decodeJwt(tokens.id_token) : null;
  const email = claims?.email ?? 'unknown';
  const tenantId = (claims?.tenantId as string | undefined) ?? 'unknown';
  const sub = claims?.sub ?? 'unknown';
  const expiresIn = tokens.expires_in ?? 3600;

  session = {
    email,
    tenantId,
    sub,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  logger.info('Frontegg OAuth login successful', { email, tenantId });

  return textResult(
    `Signed in as ${email} (tenant: ${tenantId}). You can now configure your Frontegg tenant.`
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export class FronteggLoginTool {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    registry.add(LOGIN_TOOL, (args) => handleLogin(args));
    this.logger.info('Registered frontegg_login tool');
  }
}
