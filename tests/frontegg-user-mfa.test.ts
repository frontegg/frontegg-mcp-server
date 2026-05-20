/**
 * Tests for the per-user MFA admin tools (Category F).
 *
 * The api-client module is mocked so we don't pull in config-manager
 * (which depends on `import.meta.url`, unavailable under jest's CJS
 * transform). Test logic exercises the per-tool handler shape, schema
 * validation, header propagation, and known error cases (the
 * "MFA is not enrolled" no-op path in particular).
 */

import { FronteggApiError } from '../src/tools/frontegg-api-client.js';

interface RecordedCall {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

// Mock the api-client BEFORE importing the SUT so the SUT picks up the mock.
const recordedCalls: RecordedCall[] = [];
// Each entry is wrapped so `undefined` is a valid response value
// (used when the SUT calls fronteggApi for an endpoint that returns an
// empty body — fronteggApi resolves to `undefined`).
const mockResponses: Array<{ value?: unknown; throws?: () => unknown }> = [];

jest.mock('../src/tools/frontegg-api-client.js', () => {
  // Re-export FronteggApiError as a real class so `instanceof` works in the SUT.
  class FronteggApiErrorMock extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
      this.name = 'FronteggApiError';
    }
  }
  return {
    FronteggApiError: FronteggApiErrorMock,
    fronteggApi: jest.fn(async (opts: RecordedCall) => {
      recordedCalls.push({
        method: opts.method,
        path: opts.path,
        body: opts.body,
        headers: opts.headers,
      });
      const next = mockResponses.shift();
      if (!next) {
        throw new Error(`fronteggApi mock exhausted at ${opts.method} ${opts.path}`);
      }
      if (next.throws) {
        throw next.throws();
      }
      return next.value;
    }),
    clearTokenCache: jest.fn(),
  };
});

// Now import the SUT (after the mock is registered).
import {
  _handleGet,
  _handleReset,
  _handleEnforce,
  _GET_TOOL,
  _RESET_TOOL,
  _ENFORCE_TOOL,
  _GetArgsSchema,
  _ResetArgsSchema,
  _EnforceArgsSchema,
} from '../src/tools/frontegg-user-mfa.js';

const USER_ID = '0e725758-b82c-4f05-b32d-76ed37c6c572';
const TENANT_ID = '37e011cb-e82d-41bb-9a04-4d8b1bb4ff48';

const FAKE_USER = {
  id: USER_ID,
  email: 'demo@example.com',
  name: 'Demo User',
  verified: true,
  phoneNumber: null,
  mfaEnrolled: false,
  isLocked: false,
  provider: 'local',
  tenantId: TENANT_ID,
  lastLogin: '2026-04-28T06:33:41.000Z',
};

const FAKE_USER_ENROLLED = { ...FAKE_USER, mfaEnrolled: true, phoneNumber: '+15555550100' };

/** Plain value resolves; passing `() => Error` causes the mock to throw. */
function ok(value: unknown) {
  return { value };
}
function throws(fn: () => unknown) {
  return { throws: fn };
}
function queueResponses(...responses: Array<{ value?: unknown; throws?: () => unknown }>): void {
  mockResponses.length = 0;
  mockResponses.push(...responses);
}

beforeEach(() => {
  recordedCalls.length = 0;
  mockResponses.length = 0;
});

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe('input schemas', () => {
  test('GetArgsSchema rejects non-UUID userId', () => {
    expect(() => _GetArgsSchema.parse({ userId: 'not-a-uuid', tenantId: TENANT_ID })).toThrow(
      /userId must be a UUID/
    );
  });

  test('GetArgsSchema rejects missing tenantId', () => {
    expect(() => _GetArgsSchema.parse({ userId: USER_ID })).toThrow();
  });

  test('ResetArgsSchema accepts valid UUIDs', () => {
    const parsed = _ResetArgsSchema.parse({ userId: USER_ID, tenantId: TENANT_ID });
    expect(parsed.userId).toBe(USER_ID);
    expect(parsed.tenantId).toBe(TENANT_ID);
  });

  test('EnforceArgsSchema rejects empty input', () => {
    expect(() => _EnforceArgsSchema.parse({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tool registry shape
// ---------------------------------------------------------------------------

describe('tool definitions', () => {
  test('exposes the three Category F tool names', () => {
    expect(_GET_TOOL.name).toBe('frontegg_user_mfa_get');
    expect(_RESET_TOOL.name).toBe('frontegg_user_mfa_reset');
    expect(_ENFORCE_TOOL.name).toBe('frontegg_user_mfa_enforce');
  });

  test('every tool requires userId and tenantId', () => {
    for (const tool of [_GET_TOOL, _RESET_TOOL, _ENFORCE_TOOL]) {
      expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['userId', 'tenantId']));
    }
  });

  test('reset tool description flags it as destructive', () => {
    expect(_RESET_TOOL.description).toMatch(/DESTRUCTIVE/);
  });

  test('enforce tool description documents the vendor-token limitation', () => {
    expect(_ENFORCE_TOOL.description).toMatch(/(LIMITATION|404|vendor-token)/i);
  });
});

// ---------------------------------------------------------------------------
// frontegg_user_mfa_get
// ---------------------------------------------------------------------------

describe('frontegg_user_mfa_get', () => {
  test('happy path: returns MFA summary and sends tenant header', async () => {
    queueResponses(ok(FAKE_USER_ENROLLED));

    const r = await _handleGet({ userId: USER_ID, tenantId: TENANT_ID });
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/MFA Status for demo@example.com/);
    expect(text).toMatch(/"mfaEnrolled": true/);
    expect(text).toMatch(/"phoneNumber": "\+15555550100"/);
    expect(text).toMatch(/per-factor detail/);

    expect(recordedCalls).toHaveLength(1);
    const call = recordedCalls[0]!;
    expect(call.method).toBe('GET');
    expect(call.path).toBe(`/identity/resources/users/v1/${USER_ID}`);
    expect(call.headers).toEqual({ 'frontegg-tenant-id': TENANT_ID });
  });

  test('returns error envelope on 404', async () => {
    queueResponses(
      throws(
        () => new FronteggApiError('GET /identity/resources/users/v1/... → 404: User not found', 404)
      )
    );

    const r = await _handleGet({ userId: USER_ID, tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(404\)/);
  });

  test('rejects invalid input via zod', async () => {
    const r = await _handleGet({ userId: 'oops', tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/userId must be a UUID/);
  });
});

// ---------------------------------------------------------------------------
// frontegg_user_mfa_reset
// ---------------------------------------------------------------------------

describe('frontegg_user_mfa_reset', () => {
  test('happy path: POSTs to mfa/disable with user+tenant headers, then re-reads', async () => {
    // POST returns empty body → undefined; then GET resolves to user.
    queueResponses(ok(undefined), ok(FAKE_USER));

    const r = await _handleReset({ userId: USER_ID, tenantId: TENANT_ID });
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/MFA Reset/);
    expect(text).toMatch(/MFA enrollment cleared/);
    expect(text).toMatch(/Post-reset MFA state/);
    expect(text).toMatch(/"mfaEnrolled": false/);

    expect(recordedCalls).toHaveLength(2);
    const post = recordedCalls[0]!;
    expect(post.method).toBe('POST');
    expect(post.path).toBe('/identity/resources/users/v1/mfa/disable');
    expect(post.headers).toEqual({
      'frontegg-user-id': USER_ID,
      'frontegg-tenant-id': TENANT_ID,
    });
    const get = recordedCalls[1]!;
    expect(get.method).toBe('GET');
    expect(get.headers).toEqual({ 'frontegg-tenant-id': TENANT_ID });
  });

  test('treats 400 "MFA is not enrolled" as a clean no-op', async () => {
    queueResponses(
      throws(
        () =>
          new FronteggApiError(
            'POST /identity/resources/users/v1/mfa/disable → 400: {"errors":["MFA is not enrolled"],"errorCode":"ER-01097"}',
            400
          )
      ),
      ok(FAKE_USER)
    );

    const r = await _handleReset({ userId: USER_ID, tenantId: TENANT_ID });
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/User had no MFA enrolled/);
    expect(text).toMatch(/Post-reset MFA state/);
  });

  test('surfaces an unexpected 4xx as an error and skips re-read', async () => {
    queueResponses(throws(() => new FronteggApiError('POST ... → 403: Forbidden', 403)));

    const r = await _handleReset({ userId: USER_ID, tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(403\)/);
    // Only the POST was attempted; the post-reset GET should be skipped.
    expect(recordedCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// frontegg_user_mfa_enforce
// ---------------------------------------------------------------------------

describe('frontegg_user_mfa_enforce', () => {
  test('reports the vendor-token limitation and the tenant-wide workaround', async () => {
    queueResponses(ok(FAKE_USER));

    const r = await _handleEnforce({ userId: USER_ID, tenantId: TENANT_ID });
    const text = r.content[0]?.text ?? '';
    expect(text).toMatch(/Vendor-token-blocked/);
    expect(text).toMatch(/frontegg_configure_mfa/);
    expect(text).toMatch(/Current MFA state for this user/);
    expect(text).toMatch(/demo@example.com/);
  });

  test('surfaces a 404 cleanly when the user lookup fails', async () => {
    queueResponses(throws(() => new FronteggApiError('GET ... → 404: Not found', 404)));

    const r = await _handleEnforce({ userId: USER_ID, tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(404\)/);
  });
});
