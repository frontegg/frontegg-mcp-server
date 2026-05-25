/**
 * Tests for the `frontegg_login` tool and the auth gate that the
 * `frontegg_configure_*` tools call.
 *
 * Network and browser side effects are mocked — no port is bound and no
 * browser is opened during these tests.
 */

import crypto from 'node:crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  decodeJwt,
  exchangeCodeForToken,
  buildSuccessHtml,
  handleLogin,
  isAuthenticated,
  getSession,
  clearSession,
  _setSessionForTest,
} from '../src/tools/frontegg-login.js';
import { requireAuth } from '../src/tools/auth-gate.js';

// Reset session before each test so order doesn't matter.
beforeEach(() => {
  clearSession();
});

describe('PKCE generation', () => {
  test('code_verifier is base64url-encoded and high entropy', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> 43 base64url chars (no padding)
    expect(v.length).toBe(43);
    const v2 = generateCodeVerifier();
    expect(v2).not.toBe(v);
  });

  test('code_challenge is SHA-256 of verifier, base64url-encoded', () => {
    const v = 'fixed-verifier-for-determinism';
    const c = generateCodeChallenge(v);
    // Reproduce: sha256(v) -> base64url
    const expected = crypto
      .createHash('sha256')
      .update(v)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(c).toBe(expected);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('state generation', () => {
  test('state nonce is random and unique across calls', () => {
    const states = new Set<string>();
    for (let i = 0; i < 100; i++) states.add(generateState());
    expect(states.size).toBe(100);
    for (const s of states) {
      expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('buildAuthorizationUrl', () => {
  test('all required params present and properly URL-encoded', () => {
    const url = buildAuthorizationUrl({
      subdomain: 'app-acme',
      appClientId: 'client-123',
      redirectUri: 'http://localhost:8765/callback',
      codeChallenge: 'CHALLENGE_VALUE',
      state: 'STATE_VALUE',
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://app-acme.frontegg.com');
    expect(parsed.pathname).toBe('/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'http://localhost:8765/callback'
    );
    expect(parsed.searchParams.get('scope')).toBe('openid email profile');
    expect(parsed.searchParams.get('code_challenge')).toBe('CHALLENGE_VALUE');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('state')).toBe('STATE_VALUE');
  });
});

describe('decodeJwt', () => {
  test('decodes a well-formed JWT payload', () => {
    // Header.payload.signature — only middle matters.
    const payload = { email: 'a@b.com', tenantId: 't1', sub: 'u1' };
    const b64 = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const jwt = `header.${b64}.sig`;
    const claims = decodeJwt(jwt);
    expect(claims).toEqual(payload);
  });

  test('returns null for malformed input', () => {
    expect(decodeJwt('')).toBeNull();
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('one.two')).toBeNull();
    expect(decodeJwt('a.!!!!!.c')).toBeNull();
  });
});

describe('exchangeCodeForToken', () => {
  test('POSTs form-urlencoded body to /oauth/token with PKCE params', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'AT',
        id_token: 'ID',
        expires_in: 3600,
      }),
    });
    const res = await exchangeCodeForToken({
      subdomain: 'app-acme',
      appClientId: 'client-123',
      code: 'AUTHCODE',
      redirectUri: 'http://localhost:8765/callback',
      codeVerifier: 'VERIFIER',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(res.access_token).toBe('AT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://app-acme.frontegg.com/oauth/token');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Parse the body to verify all required fields
    const body = new URLSearchParams(opts.body as string);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('AUTHCODE');
    expect(body.get('redirect_uri')).toBe('http://localhost:8765/callback');
    expect(body.get('code_verifier')).toBe('VERIFIER');
    expect(body.get('client_id')).toBe('client-123');
  });

  test('throws on token-endpoint error response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Code expired',
      }),
    });
    await expect(
      exchangeCodeForToken({
        subdomain: 'app-acme',
        appClientId: 'client-123',
        code: 'AUTHCODE',
        redirectUri: 'http://localhost:8765/callback',
        codeVerifier: 'VERIFIER',
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toThrow(/Code expired/);
  });
});

describe('session lifecycle', () => {
  test('isAuthenticated() is false with no session', () => {
    clearSession();
    expect(isAuthenticated()).toBe(false);
    expect(getSession()).toBeNull();
  });

  test('isAuthenticated() returns false after expiresAt', () => {
    _setSessionForTest({
      email: 'x@y.com',
      tenantId: 't1',
      sub: 'u1',
      expiresAt: Date.now() - 1000, // already expired
    });
    expect(isAuthenticated()).toBe(false);
  });

  test('isAuthenticated() returns true when session is fresh', () => {
    _setSessionForTest({
      email: 'x@y.com',
      tenantId: 't1',
      sub: 'u1',
      expiresAt: Date.now() + 60_000,
    });
    expect(isAuthenticated()).toBe(true);
    expect(getSession()?.email).toBe('x@y.com');
  });
});

describe('requireAuth', () => {
  test('blocks when no session', () => {
    clearSession();
    const r = requireAuth();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/frontegg_login/);
  });

  test('passes when authenticated', () => {
    _setSessionForTest({
      email: 'a@b.com',
      tenantId: 't1',
      sub: 'u1',
      expiresAt: Date.now() + 60_000,
    });
    const r = requireAuth();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.email).toBe('a@b.com');
  });
});

describe('handleLogin', () => {
  function makeFetchMockWithToken(claims: Record<string, unknown>) {
    const b64 = Buffer.from(JSON.stringify(claims))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const id_token = `header.${b64}.sig`;
    return jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token, access_token: 'AT', expires_in: 3600 }),
    });
  }

  test('returns config error when env vars missing', async () => {
    const r = await handleLogin(
      {},
      {
        envReader: () => ({}), // nothing configured
      }
    );
    expect(r.content[0]?.text).toMatch(/FRONTEGG_APP_CLIENT_ID/);
    expect(r.content[0]?.text).toMatch(/FRONTEGG_SUBDOMAIN/);
  });

  test('happy path: stores session and returns email/tenant', async () => {
    const fetchMock = makeFetchMockWithToken({
      email: 'demo@frontegg.com',
      tenantId: 'tenant-xyz',
      sub: 'user-1',
    });
    const r = await handleLogin(
      {},
      {
        envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
        openBrowserImpl: async () => undefined,
        waitForCallbackImpl: async ({ expectedState }) => ({
          code: 'AUTHCODE',
          state: expectedState, // match
        }),
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );
    expect(r.content[0]?.text).toMatch(/Signed in as demo@frontegg.com/);
    expect(r.content[0]?.text).toMatch(/tenant-xyz/);
    expect(isAuthenticated()).toBe(true);
    expect(getSession()?.email).toBe('demo@frontegg.com');
  });

  test('idempotent: returns "already signed in" when session exists', async () => {
    _setSessionForTest({
      email: 'already@here.com',
      tenantId: 't1',
      sub: 'u1',
      expiresAt: Date.now() + 60_000,
    });
    const r = await handleLogin({}, {
      envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
    });
    expect(r.content[0]?.text).toMatch(/Already signed in as already@here.com/);
  });

  test('force=true re-runs the login flow', async () => {
    _setSessionForTest({
      email: 'old@here.com',
      tenantId: 't1',
      sub: 'u1',
      expiresAt: Date.now() + 60_000,
    });
    const fetchMock = makeFetchMockWithToken({
      email: 'new@here.com',
      tenantId: 't2',
      sub: 'u2',
    });
    const r = await handleLogin(
      { force: true },
      {
        envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
        openBrowserImpl: async () => undefined,
        waitForCallbackImpl: async ({ expectedState }) => ({
          code: 'AUTHCODE',
          state: expectedState,
        }),
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );
    expect(r.content[0]?.text).toMatch(/Signed in as new@here.com/);
    expect(getSession()?.email).toBe('new@here.com');
  });

  test('state-mismatch error surfaces via waitForCallback rejection', async () => {
    const fetchMock = jest.fn();
    const r = await handleLogin(
      {},
      {
        envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
        openBrowserImpl: async () => undefined,
        waitForCallbackImpl: async () => {
          throw new Error(
            'Authentication failed: state mismatch (possible CSRF). Try again.'
          );
        },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );
    expect(r.content[0]?.text).toMatch(/state mismatch/i);
    expect(isAuthenticated()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('loopback server bind failure (EADDRINUSE) surfaces as a sign-in error', async () => {
    // Audit-flagged: if port 8765 is occupied, the loopback server can't bind
    // and waitForCallback rejects. Verify the error path lands gracefully (no
    // crash, no session created) and the message references the underlying
    // problem.
    const fetchMock = jest.fn();
    const r = await handleLogin(
      {},
      {
        envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
        openBrowserImpl: async () => undefined,
        waitForCallbackImpl: async () => {
          const err = new Error(
            'listen EADDRINUSE: address already in use 127.0.0.1:8765',
          ) as NodeJS.ErrnoException;
          err.code = 'EADDRINUSE';
          throw err;
        },
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );
    expect(r.content[0]?.text).toMatch(/Sign-in failed/);
    expect(r.content[0]?.text).toMatch(/EADDRINUSE/);
    expect(isAuthenticated()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('browser-open failure surfaces a paste-URL fallback when callback also fails', async () => {
    // Audit-flagged: when the auto-launch fails (no DISPLAY in WSL, sandboxed
    // env, etc.), the loopback callback will time out — we still need to give
    // the user a copy-pasteable URL so they can sign in manually.
    const fetchMock = jest.fn();
    const r = await handleLogin(
      {},
      {
        envReader: () => ({ appClientId: 'app-1', subdomain: 'app-acme' }),
        // Browser-open fails synchronously inside the catch handler.
        openBrowserImpl: async () => {
          throw new Error('xdg-open: command not found');
        },
        waitForCallbackImpl: async () =>
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Login timed out. Try again.')), 50),
          ),
        fetchImpl: fetchMock as unknown as typeof fetch,
      },
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/Could not open browser/);
    expect(text).toMatch(/manually/);
    // The pasteable authorize URL must be in the message.
    expect(text).toMatch(/app-acme\.frontegg\.com\/oauth\/authorize/);
    expect(isAuthenticated()).toBe(false);
  });

  test('does not leak vendor secrets in error messages', async () => {
    // Populate env with vendor creds that MUST NOT appear in any output.
    const originalSecret = process.env.FRONTEGG_SECRET;
    const originalClientId = process.env.FRONTEGG_CLIENT_ID;
    process.env.FRONTEGG_SECRET = 'super-secret-vendor-key';
    process.env.FRONTEGG_CLIENT_ID = 'vendor-client-uuid';
    try {
      const r = await handleLogin(
        {},
        {
          envReader: () => ({}), // app creds missing → triggers error path
        }
      );
      const text = r.content[0]?.text ?? '';
      // Neither the vendor secret nor the vendor client ID should appear.
      expect(text).not.toContain('super-secret-vendor-key');
      expect(text).not.toContain('vendor-client-uuid');
    } finally {
      if (originalSecret === undefined) delete process.env.FRONTEGG_SECRET;
      else process.env.FRONTEGG_SECRET = originalSecret;
      if (originalClientId === undefined) delete process.env.FRONTEGG_CLIENT_ID;
      else process.env.FRONTEGG_CLIENT_ID = originalClientId;
    }
  });
});

describe('buildSuccessHtml', () => {
  test('renders email when provided', () => {
    const html = buildSuccessHtml('user@example.com');
    expect(html).toContain('user@example.com');
    expect(html).toContain('Signed in to Frontegg');
  });

  test('renders generic message without email', () => {
    const html = buildSuccessHtml();
    expect(html).not.toContain('@');
    expect(html).toContain('Signed in to Frontegg');
  });

  test('escapes HTML in email field (no XSS)', () => {
    const html = buildSuccessHtml('<script>alert(1)</script>@x.com');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// Note: configure tools no longer gate on frontegg_login. They authenticate
// directly via the FRONTEGG_CLIENT_ID / FRONTEGG_SECRET env vars on each
// call. The frontegg_login tool remains available for customers who want
// an explicit per-session sign-in, but it is not required.
