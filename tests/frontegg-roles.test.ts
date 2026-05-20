/**
 * Tests for the Frontegg roles tools (frontegg_roles_list / frontegg_roles_create).
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

import { handleRolesList, handleRolesCreate } from '../src/tools/frontegg-roles.js';
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';

const mockedApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockedApi.mockReset();
});

describe('frontegg_roles_list', () => {
  test('hits GET /identity/resources/roles/v1', async () => {
    mockedApi.mockResolvedValueOnce([
      {
        id: 'role-1',
        key: 'admin',
        name: 'Admin',
        description: 'tenant admin',
        permissions: ['p1', 'p2'],
        level: 0,
        isDefault: true,
      },
    ]);
    const r = await handleRolesList({});
    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/identity/resources/roles/v1');
    expect(r.content[0]?.text).toContain('admin');
    expect(r.content[0]?.text).toContain('"permissionCount": 2');
  });

  test('surfaces 403 with status code', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('forbidden', 403));
    const r = await handleRolesList({});
    expect(r.content[0]?.text).toContain('Frontegg API error (403)');
  });
});

describe('frontegg_roles_create', () => {
  test('rejects payload missing required fields', async () => {
    const r = await handleRolesCreate({ name: 'just-a-name' });
    expect(r.content[0]?.text).toContain('Error');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('wraps payload in an array as Frontegg requires', async () => {
    mockedApi.mockResolvedValueOnce([
      {
        id: 'new-role-id',
        key: 'support-engineer',
        name: 'Support Engineer',
        description: 'L1 support',
        permissions: ['p1'],
        level: 5,
      },
    ]);
    const r = await handleRolesCreate({
      key: 'support-engineer',
      name: 'Support Engineer',
      description: 'L1 support',
      permissions: ['p1'],
      level: 5,
      isDefault: false,
    });
    expect(r.content[0]?.text).toContain('Role Created');
    expect(r.content[0]?.text).toContain('support-engineer');

    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/identity/resources/roles/v1');
    const body = call.body as unknown[];
    expect(Array.isArray(body)).toBe(true);
    const role = body[0] as Record<string, unknown>;
    expect(role.key).toBe('support-engineer');
    expect(role.name).toBe('Support Engineer');
    expect(role.permissions).toEqual(['p1']);
  });

  test('surfaces 400 errors from create endpoint', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('key already exists', 400));
    const r = await handleRolesCreate({ key: 'duplicate', name: 'Dupe' });
    expect(r.content[0]?.text).toContain('Frontegg API error (400)');
  });

  test('returns role from array response', async () => {
    mockedApi.mockResolvedValueOnce([{ id: 'r1', key: 'k1', name: 'N1' }]);
    const r = await handleRolesCreate({ key: 'k1', name: 'N1' });
    expect(r.content[0]?.text).toContain('"id": "r1"');
    expect(r.content[0]?.text).toContain('"key": "k1"');
  });
});
