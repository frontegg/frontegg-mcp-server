/**
 * Tests for the Frontegg tenants tool (frontegg_tenants_list).
 *
 * The `frontegg-api-client` module is mocked wholesale — see the comment
 * in frontegg-users.test.ts for the rationale.
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

import { handleTenantsList } from '../src/tools/frontegg-tenants.js';
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';

const mockedApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockedApi.mockReset();
});

describe('frontegg_tenants_list', () => {
  test('default mode hits v1 and returns a flat array', async () => {
    mockedApi.mockResolvedValueOnce([
      {
        id: 'tenant-1',
        tenantId: 'tenant-1',
        name: 'Acme',
        isReseller: false,
        creatorEmail: 'a@b.com',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tenant-2',
        tenantId: 'tenant-2',
        name: 'Globex',
        isReseller: true,
        creatorEmail: null,
        createdAt: '2026-02-01T00:00:00Z',
      },
    ]);
    const r = await handleTenantsList({});
    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/tenants/resources/tenants/v1');
    expect(r.content[0]?.text).toContain('Acme');
    expect(r.content[0]?.text).toContain('Globex');
  });

  test('paginated mode hits v2 and includes metadata', async () => {
    mockedApi.mockResolvedValueOnce({
      _metadata: { totalItems: 100, totalPages: 5 },
      items: [
        {
          id: 'tenant-1',
          tenantId: 'tenant-1',
          name: 'Acme',
          createdAt: '2026-01-01',
        },
      ],
    });
    const r = await handleTenantsList({ paginated: true, limit: 20, offset: 40, filter: 'acme' });
    const call = mockedApi.mock.calls[0]![0];
    expect(call.path.startsWith('/tenants/resources/tenants/v2?')).toBe(true);
    const qs = call.path.split('?')[1] ?? '';
    expect(qs).toContain('_limit=20');
    expect(qs).toContain('_offset=40');
    expect(qs).toContain('_filter=acme');
    expect(r.content[0]?.text).toContain('"totalItems": 100');
  });

  test('rejects invalid limit type', async () => {
    const r = await handleTenantsList({ limit: -5 });
    expect(r.content[0]?.text).toContain('Error');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('surfaces 401 unauthorized through error result', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('unauthorized', 401));
    const r = await handleTenantsList({});
    expect(r.content[0]?.text).toContain('Frontegg API error (401)');
  });
});
