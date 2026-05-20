/**
 * Tests for the Category-E user-session tools.
 *
 * The Frontegg HTTP client is mocked end-to-end so these tests run offline
 * (no FRONTEGG_CLIENT_ID / network call required). We assert:
 *
 *   1. Zod schemas reject bad inputs (non-UUID, missing required fields,
 *      missing confirm on revoke-all).
 *   2. Each handler calls fronteggApi with the expected method + path +
 *      tenant/user headers.
 *   3. The destructive handlers re-GET the session list after writing so
 *      the LLM sees concrete state.
 *   4. FronteggApiError responses are surfaced with status code in the text.
 */

import { jest } from '@jest/globals';

// Mock the API client before importing the module under test.
const mockFronteggApi = jest.fn<(opts: unknown) => Promise<unknown>>();
jest.mock('../src/tools/frontegg-api-client.js', () => {
  // Use require here so we can ref the real FronteggApiError class (we want
  // instanceof to behave normally inside the handler).
  return {
    fronteggApi: mockFronteggApi,
    FronteggApiError: class FronteggApiError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.name = 'FronteggApiError';
        this.status = status;
      }
    },
  };
});

import {
  handleListSessions,
  handleRevokeSession,
  handleRevokeAllSessions,
  _internal,
} from '../src/tools/frontegg-user-sessions.js';
// Pull the mocked class so we can throw it from inside mock implementations.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FronteggApiError } = jest.requireMock('../src/tools/frontegg-api-client.js') as {
  FronteggApiError: new (message: string, status: number) => Error & { status: number };
};

const USER_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  mockFronteggApi.mockReset();
});

describe('schema validation', () => {
  test('list rejects non-UUID userId', () => {
    expect(() =>
      _internal.ListArgsSchema.parse({ userId: 'not-uuid', tenantId: TENANT_ID })
    ).toThrow(/userId must be a UUID/);
  });

  test('list rejects missing tenantId', () => {
    expect(() => _internal.ListArgsSchema.parse({ userId: USER_ID })).toThrow();
  });

  test('revoke-one rejects missing sessionId', () => {
    expect(() =>
      _internal.RevokeOneArgsSchema.parse({ userId: USER_ID, tenantId: TENANT_ID })
    ).toThrow();
  });

  test('revoke-all rejects confirm:false', () => {
    expect(() =>
      _internal.RevokeAllArgsSchema.parse({
        userId: USER_ID,
        tenantId: TENANT_ID,
        confirm: false,
      })
    ).toThrow();
  });

  test('revoke-all accepts confirm:true', () => {
    expect(() =>
      _internal.RevokeAllArgsSchema.parse({
        userId: USER_ID,
        tenantId: TENANT_ID,
        confirm: true,
      })
    ).not.toThrow();
  });
});

describe('handleListSessions', () => {
  test('passes tenant/user headers and renders rows', async () => {
    mockFronteggApi.mockResolvedValueOnce([
      {
        id: SESSION_ID,
        userAgent: 'Mozilla/5.0',
        ipAddress: '1.2.3.4',
        createdAt: '2026-05-11T10:00:00.000Z',
        current: false,
        impersonated: null,
      },
    ]);
    const r = await handleListSessions({ userId: USER_ID, tenantId: TENANT_ID });
    expect(mockFronteggApi).toHaveBeenCalledTimes(1);
    const call = mockFronteggApi.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/identity/resources/users/sessions/v1/me');
    expect(call.headers).toEqual({
      'frontegg-tenant-id': TENANT_ID,
      'frontegg-user-id': USER_ID,
    });
    expect(r.content[0]?.text).toMatch(/has 1 active session/);
    expect(r.content[0]?.text).toContain(SESSION_ID);
  });

  test('reports 0 sessions cleanly', async () => {
    mockFronteggApi.mockResolvedValueOnce([]);
    const r = await handleListSessions({ userId: USER_ID, tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/has 0 active sessions/);
  });

  test('surfaces FronteggApiError with status code', async () => {
    mockFronteggApi.mockRejectedValueOnce(new FronteggApiError('Forbidden', 403));
    const r = await handleListSessions({ userId: USER_ID, tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(403\)/);
  });

  test('surfaces zod validation error', async () => {
    const r = await handleListSessions({ userId: 'bad', tenantId: TENANT_ID });
    expect(r.content[0]?.text).toMatch(/userId must be a UUID/);
    expect(mockFronteggApi).not.toHaveBeenCalled();
  });
});

describe('handleRevokeSession', () => {
  test('DELETEs the session then re-GETs the list', async () => {
    mockFronteggApi
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce([]); // GET (empty after revoke)
    const r = await handleRevokeSession({
      userId: USER_ID,
      tenantId: TENANT_ID,
      sessionId: SESSION_ID,
    });
    expect(mockFronteggApi).toHaveBeenCalledTimes(2);
    const del = mockFronteggApi.mock.calls[0]![0] as Record<string, unknown>;
    expect(del.method).toBe('DELETE');
    expect(del.path).toBe(`/identity/resources/users/sessions/v1/me/${SESSION_ID}`);
    expect(del.headers).toEqual({
      'frontegg-tenant-id': TENANT_ID,
      'frontegg-user-id': USER_ID,
    });
    const get = mockFronteggApi.mock.calls[1]![0] as Record<string, unknown>;
    expect(get.method).toBe('GET');
    expect(get.path).toBe('/identity/resources/users/sessions/v1/me');
    expect(r.content[0]?.text).toMatch(/Session Revoked/);
    expect(r.content[0]?.text).toMatch(/Remaining sessions \(0\)/);
  });

  test('surfaces 404 Session not found from the API', async () => {
    mockFronteggApi.mockRejectedValueOnce(new FronteggApiError('Session not found', 404));
    const r = await handleRevokeSession({
      userId: USER_ID,
      tenantId: TENANT_ID,
      sessionId: SESSION_ID,
    });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(404\)/);
    expect(r.content[0]?.text).toMatch(/Session not found/);
  });
});

describe('handleRevokeAllSessions', () => {
  test('refuses without confirm:true', async () => {
    const r = await handleRevokeAllSessions({
      userId: USER_ID,
      tenantId: TENANT_ID,
      confirm: false,
    });
    // Zod schema rejects before the API call.
    expect(r.content[0]?.text.toLowerCase()).toMatch(/invalid|literal|confirm|true/);
    expect(mockFronteggApi).not.toHaveBeenCalled();
  });

  test('DELETEs /me/all then re-GETs the list', async () => {
    mockFronteggApi
      .mockResolvedValueOnce(undefined) // DELETE /me/all
      .mockResolvedValueOnce([]); // GET
    const r = await handleRevokeAllSessions({
      userId: USER_ID,
      tenantId: TENANT_ID,
      confirm: true,
    });
    expect(mockFronteggApi).toHaveBeenCalledTimes(2);
    const del = mockFronteggApi.mock.calls[0]![0] as Record<string, unknown>;
    expect(del.method).toBe('DELETE');
    expect(del.path).toBe('/identity/resources/users/sessions/v1/me/all');
    expect(del.headers).toEqual({
      'frontegg-tenant-id': TENANT_ID,
      'frontegg-user-id': USER_ID,
    });
    expect(r.content[0]?.text).toMatch(/All Sessions Revoked/);
  });
});
