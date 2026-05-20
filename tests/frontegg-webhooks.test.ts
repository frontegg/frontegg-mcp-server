/**
 * Tests for the `frontegg_webhooks_list` and `frontegg_webhooks_create` tools.
 *
 * The `frontegg-api-client` module is fully mocked. Coverage:
 *   - schema parsing (required fields, URL validity, non-empty events)
 *   - list: empty + non-empty list
 *   - create: full POST body + auto-derived key + 201 response handling
 *   - error propagation (4xx)
 *   - deriveKey helper sanitizes display names correctly
 */

jest.mock('../src/tools/frontegg-api-client.js', () => {
  class FronteggApiError extends Error {
    public readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'FronteggApiError';
      this.status = status;
    }
  }
  return {
    __esModule: true,
    fronteggApi: jest.fn(),
    FronteggApiError,
    clearTokenCache: jest.fn(),
  };
});

import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';
import { __test as Wh } from '../src/tools/frontegg-webhooks.js';

const mockFronteggApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockFronteggApi.mockReset();
});

describe('deriveKey helper', () => {
  test('sanitizes whitespace and special chars', () => {
    const k = Wh.deriveKey('My Awesome Webhook!');
    expect(k.startsWith('my_awesome_webhook_')).toBe(true);
    expect(k).toMatch(/^[a-z][a-z0-9_]+$/);
  });

  test('prefixes wh_ when display name starts with digit', () => {
    const k = Wh.deriveKey('123 hooks');
    expect(k.startsWith('wh_')).toBe(true);
  });

  test('produces different keys on subsequent calls (timestamp suffix)', () => {
    const k1 = Wh.deriveKey('same name');
    const until = Date.now() + 5;
    while (Date.now() < until) {
      /* busy wait so Date.now() advances */
    }
    const k2 = Wh.deriveKey('same name');
    expect(k1).not.toBe(k2);
  });
});

describe('webhooks schema', () => {
  test('rejects missing url/events/displayName', () => {
    expect(Wh.CreateArgsSchema.safeParse({}).success).toBe(false);
    expect(
      Wh.CreateArgsSchema.safeParse({ url: 'https://x', events: [], displayName: 'x' }).success
    ).toBe(false);
    expect(
      Wh.CreateArgsSchema.safeParse({ url: 'not-a-url', events: ['a'], displayName: 'x' }).success
    ).toBe(false);
  });

  test('accepts minimal valid input', () => {
    const r = Wh.CreateArgsSchema.safeParse({
      url: 'https://example.com/hook',
      events: ['frontegg.user.created'],
      displayName: 'My Hook',
    });
    expect(r.success).toBe(true);
  });
});

describe('handleList', () => {
  test('returns formatted summary on success', async () => {
    mockFronteggApi.mockResolvedValueOnce([
      {
        id: 'wh-1',
        key: 'k1',
        displayName: 'User created',
        description: 'when a user signs up',
        vendorId: 'v1',
        createdAt: '2026-05-11T00:00:00Z',
        updatedAt: '2026-05-11T00:00:00Z',
      },
    ]);
    const result = await Wh.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Webhooks \(1\)/);
    expect(text).toContain('User created');
    expect(text).toContain('wh-1');
    expect(mockFronteggApi).toHaveBeenCalledWith({
      method: 'GET',
      path: Wh.WEBHOOKS_PATH,
    });
  });

  test('handles empty list', async () => {
    mockFronteggApi.mockResolvedValueOnce([]);
    const result = await Wh.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('No webhooks configured');
  });

  test('surfaces HTTP error', async () => {
    mockFronteggApi.mockRejectedValueOnce(new FronteggApiError('forbidden', 403));
    const result = await Wh.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Frontegg API error \(403\)/);
  });
});

describe('handleCreate', () => {
  test('POSTs canonical body shape, includes derived key', async () => {
    mockFronteggApi.mockResolvedValueOnce({
      id: 'new-wh',
      key: 'auto',
      displayName: 'demo',
      description: 'd',
      vendorId: 'v',
      createdAt: '2026-05-11T00:00:00Z',
      updatedAt: '2026-05-11T00:00:00Z',
    });
    const result = await Wh.handleCreate({
      url: 'https://example.com/hook',
      events: ['frontegg.user.created'],
      displayName: 'demo',
    });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Webhook Created/);
    expect(text).toContain('https://example.com/hook');
    expect(text).toContain('frontegg.user.created');

    expect(mockFronteggApi).toHaveBeenCalledTimes(1);
    const call = mockFronteggApi.mock.calls[0]![0] as {
      method: string;
      path: string;
      body: Record<string, unknown>;
    };
    expect(call.method).toBe('POST');
    expect(call.path).toBe(Wh.WEBHOOKS_PATH);
    expect(call.body.url).toBe('https://example.com/hook');
    expect(call.body.events).toEqual(['frontegg.user.created']);
    expect(call.body.displayName).toBe('demo');
    expect(typeof call.body.key).toBe('string');
    expect((call.body.key as string).length).toBeGreaterThan(0);
  });

  test('honors caller-supplied key when provided', async () => {
    mockFronteggApi.mockResolvedValueOnce({ id: 'wh-x', key: 'caller_key' });
    await Wh.handleCreate({
      url: 'https://example.com/hook',
      events: ['frontegg.user.created'],
      displayName: 'demo',
      key: 'caller_key',
      secret: 'shh',
      description: 'desc',
    });
    const body = mockFronteggApi.mock.calls[0]![0] as { body: Record<string, unknown> };
    expect(body.body.key).toBe('caller_key');
    expect(body.body.secret).toBe('shh');
    expect(body.body.description).toBe('desc');
  });

  test('surfaces 400 validation error from Frontegg', async () => {
    mockFronteggApi.mockRejectedValueOnce(
      new FronteggApiError('POST /event/resources/configurations/v1 → 400: key must be a string', 400)
    );
    const result = await Wh.handleCreate({
      url: 'https://example.com/hook',
      events: ['frontegg.user.created'],
      displayName: 'demo',
    });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Frontegg API error \(400\)/);
    expect(text).toContain('key must be a string');
  });

  test('schema error when url is not a URL', async () => {
    const result = await Wh.handleCreate({
      url: 'not-a-url',
      events: ['frontegg.user.created'],
      displayName: 'demo',
    });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/❌ Error/);
    expect(mockFronteggApi).not.toHaveBeenCalled();
  });
});
