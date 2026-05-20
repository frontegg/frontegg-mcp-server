/**
 * Tests for the Frontegg users tools (frontegg_users_list / frontegg_users_invite).
 *
 * We mock the `frontegg-api-client` module wholesale rather than `global.fetch`,
 * because the real client imports `ConfigManager`, which executes
 * `import.meta.url` at module init — and ts-jest currently transpiles to
 * CommonJS, so that line throws TS1343. Mocking the client also keeps these
 * tests focused on the handler logic (param shaping, body building,
 * response parsing) without spinning up the vendor-token round-trip.
 */

jest.mock('../src/tools/frontegg-api-client.js', () => {
  class FronteggApiError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
      this.name = 'FronteggApiError';
    }
  }
  return {
    __esModule: true,
    FronteggApiError,
    fronteggApi: jest.fn(),
    clearTokenCache: jest.fn(),
  };
});

import { handleUsersList, handleUsersInvite } from '../src/tools/frontegg-users.js';
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';

const mockedApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockedApi.mockReset();
});

describe('frontegg_users_list', () => {
  test('hits GET /identity/resources/users/v3 with no query when no args', async () => {
    mockedApi.mockResolvedValueOnce({
      _metadata: { totalItems: 0 },
      items: [],
    });
    const r = await handleUsersList({});
    expect(r.content[0]?.text).toContain('# Users');
    expect(mockedApi).toHaveBeenCalledWith({
      method: 'GET',
      path: '/identity/resources/users/v3',
    });
  });

  test('encodes filter params with the _ prefix expected by Frontegg', async () => {
    mockedApi.mockResolvedValueOnce({
      _metadata: { totalItems: 1 },
      items: [
        {
          id: 'u1',
          email: 'a@b.com',
          name: 'Alice',
          verified: true,
          provider: 'local',
          mfaEnrolled: false,
          tenantId: 'tenant-1',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const r = await handleUsersList({
      email: 'a@b.com',
      tenantId: 'tenant-1',
      filter: 'al',
      limit: 25,
      offset: 50,
      sortBy: 'createdAt',
      order: 'DESC',
      includeSubTenants: true,
    });
    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path.startsWith('/identity/resources/users/v3?')).toBe(true);
    const qs = call.path.split('?')[1] ?? '';
    expect(qs).toContain('_email=a%40b.com');
    expect(qs).toContain('_tenantId=tenant-1');
    expect(qs).toContain('_filter=al');
    expect(qs).toContain('_limit=25');
    expect(qs).toContain('_offset=50');
    expect(qs).toContain('_sortBy=createdAt');
    expect(qs).toContain('_order=DESC');
    expect(qs).toContain('_includeSubTenants=true');
    expect(r.content[0]?.text).toContain('a@b.com');
  });

  test('rejects invalid types via zod', async () => {
    const r = await handleUsersList({ limit: 'not-a-number' });
    expect(r.content[0]?.text).toContain('Error');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('surfaces 4xx errors with status code', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('forbidden', 403));
    const r = await handleUsersList({});
    expect(r.content[0]?.text).toContain('Frontegg API error (403)');
  });
});

describe('frontegg_users_invite', () => {
  test('requires email + tenantId + applicationId', async () => {
    const r = await handleUsersInvite({});
    expect(r.content[0]?.text).toContain('Error');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('POSTs to /identity/resources/users/v1 with tenant + application headers', async () => {
    mockedApi.mockResolvedValueOnce({
      id: 'new-user-id',
      email: 'invitee@example.com',
      name: 'invitee@example.com',
    });
    const r = await handleUsersInvite({
      email: 'invitee@example.com',
      tenantId: 'tenant-1',
      applicationId: 'app-1',
      roleIds: ['role-1'],
      skipInviteEmail: false,
      metadata: { source: 'mcp-test' },
    });
    expect(r.content[0]?.text).toContain('User Invited');
    expect(r.content[0]?.text).toContain('invitee@example.com');

    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/identity/resources/users/v1');
    expect(call.headers).toEqual({
      'frontegg-tenant-id': 'tenant-1',
      'frontegg-application-id': 'app-1',
    });
    const body = call.body as Record<string, unknown>;
    expect(body.email).toBe('invitee@example.com');
    expect(body.roleIds).toEqual(['role-1']);
    expect(body.skipInviteEmail).toBe(false);
    expect(typeof body.metadata).toBe('string'); // Frontegg expects metadata as a JSON string
  });

  test('surfaces 400 errors from invite endpoint', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('email must be an email', 400));
    const r = await handleUsersInvite({
      email: 'still-must-pass-zod@example.com',
      tenantId: 'tenant-1',
      applicationId: 'app-1',
    });
    expect(r.content[0]?.text).toContain('Frontegg API error (400)');
  });
});
