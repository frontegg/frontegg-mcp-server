/**
 * Tests for the Frontegg audit tool (frontegg_audit_logs).
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

import { handleAuditLogs } from '../src/tools/frontegg-audit.js';
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';

const mockedApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockedApi.mockReset();
});

describe('frontegg_audit_logs', () => {
  test('hits GET /audits/resources/audits/v2 with no query when no args', async () => {
    mockedApi.mockResolvedValueOnce({ data: [], total: 0 });
    const r = await handleAuditLogs({});
    expect(mockedApi).toHaveBeenCalledTimes(1);
    const call = mockedApi.mock.calls[0]![0];
    expect(call.method).toBe('GET');
    expect(call.path).toBe('/audits/resources/audits/v2');
    expect(r.content[0]?.text).toContain('Audit Events');
  });

  test('encodes filter params correctly', async () => {
    mockedApi.mockResolvedValueOnce({
      data: [
        {
          frontegg_id: 'evt-1',
          severity: 'Info',
          action: 'User logged in',
          description: 'demo@example.com',
          email: 'demo@example.com',
          createdAt: '2026-05-11T00:00:00Z',
          tenantId: 't1',
        },
      ],
      total: 1,
    });
    const r = await handleAuditLogs({
      tenantId: 't1',
      userId: 'u1',
      filter: 'login',
      action: 'User logged in',
      severity: 'Info',
      fromDate: '2026-05-01',
      toDate: '2026-05-12',
      sortBy: 'createdAt',
      sortDirection: 'desc',
      count: 10,
      offset: 0,
    });
    const call = mockedApi.mock.calls[0]![0];
    expect(call.path.startsWith('/audits/resources/audits/v2?')).toBe(true);
    const qs = call.path.split('?')[1] ?? '';
    expect(qs).toContain('tenantId=t1');
    expect(qs).toContain('userId=u1');
    expect(qs).toContain('filter=login');
    // Action contains spaces — should be URL-encoded
    expect(qs).toContain('action=User+logged+in');
    expect(qs).toContain('severity=Info');
    expect(qs).toContain('fromDate=2026-05-01');
    expect(qs).toContain('toDate=2026-05-12');
    expect(qs).toContain('sortBy=createdAt');
    expect(qs).toContain('sortDirection=desc');
    expect(qs).toContain('count=10');
    expect(r.content[0]?.text).toContain('User logged in');
  });

  test('rejects invalid severity enum', async () => {
    const r = await handleAuditLogs({ severity: 'WAY_TOO_HIGH' });
    expect(r.content[0]?.text).toContain('Error');
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('handles 404 cleanly', async () => {
    mockedApi.mockRejectedValueOnce(new FronteggApiError('not found', 404));
    const r = await handleAuditLogs({});
    expect(r.content[0]?.text).toContain('Frontegg API error (404)');
  });
});
