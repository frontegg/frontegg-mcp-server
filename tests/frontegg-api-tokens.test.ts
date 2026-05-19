/**
 * Tests for the Category H API-tokens tools.
 *
 * `frontegg-api-client` is mocked at the module boundary so we exercise the
 * handler logic (schema, headers, body shape, error mapping) without
 * pulling in `ConfigManager` (which uses `import.meta.url` and breaks
 * Jest's CommonJS transform).
 */

// IMPORTANT: jest.mock calls are hoisted above imports, so this must be
// declared before we `import` the module under test.
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

import { _testables } from '../src/tools/frontegg-api-tokens.js';
import {
  fronteggApi,
  FronteggApiError,
} from '../src/tools/frontegg-api-client.js';

const fronteggApiMock = fronteggApi as unknown as jest.Mock;

const {
  handleList,
  handleCreate,
  handleRevoke,
  ListArgsSchema,
  CreateArgsSchema,
  RevokeArgsSchema,
} = _testables;

// Fixtures
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = '00000000-0000-0000-0000-000000000002';
const ROLE_ID = '00000000-0000-0000-0000-000000000003';
const TOKEN_CLIENT_ID = 'abcd1234-0000-0000-0000-000000000999';
const TOKEN_SECRET = '99999999-aaaa-bbbb-cccc-eeeeeeeeeeee';

beforeEach(() => {
  fronteggApiMock.mockReset();
});

describe('Schema validation', () => {
  test('ListArgsSchema rejects missing tenantId', () => {
    expect(() => ListArgsSchema.parse({})).toThrow();
  });

  test('CreateArgsSchema requires tenantId, description, and at least one roleId', () => {
    expect(() =>
      CreateArgsSchema.parse({ tenantId: TENANT_ID, description: 'x', roleIds: [] })
    ).toThrow();
    expect(() =>
      CreateArgsSchema.parse({ tenantId: TENANT_ID, roleIds: [ROLE_ID] })
    ).toThrow();
    expect(() =>
      CreateArgsSchema.parse({ description: 'x', roleIds: [ROLE_ID] })
    ).toThrow();
    const good = CreateArgsSchema.parse({
      tenantId: TENANT_ID,
      description: 'd',
      roleIds: [ROLE_ID],
    });
    expect(good.description).toBe('d');
  });

  test('RevokeArgsSchema requires confirm boolean', () => {
    expect(() =>
      RevokeArgsSchema.parse({ tenantId: TENANT_ID, tokenId: 'x' })
    ).toThrow();
    const good = RevokeArgsSchema.parse({
      tenantId: TENANT_ID,
      tokenId: 'x',
      confirm: true,
    });
    expect(good.confirm).toBe(true);
  });
});

describe('frontegg_api_tokens_list', () => {
  test('GETs the tenant API-tokens path with frontegg-tenant-id header', async () => {
    fronteggApiMock.mockResolvedValueOnce([
      {
        clientId: TOKEN_CLIENT_ID,
        description: 'existing',
        tenantId: TENANT_ID,
        roleIds: [ROLE_ID],
      },
    ]);

    const result = await handleList({ tenantId: TENANT_ID });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Frontegg API Tokens (tenant)');
    expect(text).toContain(TOKEN_CLIENT_ID);

    expect(fronteggApiMock).toHaveBeenCalledTimes(1);
    const args = fronteggApiMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.method).toBe('GET');
    expect(args.path).toBe('/identity/resources/tenants/api-tokens/v1');
    expect(args.headers).toEqual({ 'frontegg-tenant-id': TENANT_ID });
  });

  test('user scope sends both tenant- and user-id headers', async () => {
    fronteggApiMock.mockResolvedValueOnce([]);

    const result = await handleList({
      scope: 'user',
      tenantId: TENANT_ID,
      userId: USER_ID,
    });
    expect(result.content[0]?.text ?? '').toContain('No tokens configured');

    const args = fronteggApiMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.path).toBe('/identity/resources/users/api-tokens/v1');
    expect(args.headers).toEqual({
      'frontegg-tenant-id': TENANT_ID,
      'frontegg-user-id': USER_ID,
    });
  });

  test('surfaces 403 errors from the API', async () => {
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('GET /identity/resources/tenants/api-tokens/v1 → 403: forbidden', 403)
    );

    const result = await handleList({ tenantId: TENANT_ID });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('❌ Frontegg API error (403)');
  });

  test('rejects scope="user" without userId before calling the API', async () => {
    const result = await handleList({ scope: 'user', tenantId: TENANT_ID });
    expect(result.content[0]?.text ?? '').toContain('userId are required');
    expect(fronteggApiMock).not.toHaveBeenCalled();
  });
});

describe('frontegg_api_tokens_create', () => {
  test('POSTs body with description+roleIds and surfaces the secret once', async () => {
    fronteggApiMock.mockResolvedValueOnce({
      clientId: TOKEN_CLIENT_ID,
      description: 'mcp-smoke-token-test',
      tenantId: TENANT_ID,
      roleIds: [ROLE_ID],
      secret: TOKEN_SECRET,
      expires: null,
      createdAt: '2026-05-11T00:00:00.000Z',
    });

    const result = await handleCreate({
      tenantId: TENANT_ID,
      description: 'mcp-smoke-token-test',
      roleIds: [ROLE_ID],
    });
    const text = result.content[0]?.text ?? '';

    // Returns the secret ONCE with a clear save-now banner
    expect(text).toContain(TOKEN_SECRET);
    expect(text).toContain('SAVE THE SECRET NOW');
    expect(text).toContain(TOKEN_CLIENT_ID);

    const args = fronteggApiMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.method).toBe('POST');
    expect(args.path).toBe('/identity/resources/tenants/api-tokens/v1');
    const body = args.body as { description: string; roleIds: string[]; expiresInMinutes?: number };
    expect(body.description).toBe('mcp-smoke-token-test');
    expect(body.roleIds).toEqual([ROLE_ID]);
    expect(body.expiresInMinutes).toBeUndefined();
  });

  test('includes expiresInMinutes when provided', async () => {
    fronteggApiMock.mockResolvedValueOnce({
      clientId: TOKEN_CLIENT_ID,
      secret: TOKEN_SECRET,
      description: 'mcp-smoke-ttl',
      roleIds: [ROLE_ID],
      expires: '2026-05-11T01:00:00.000Z',
    });

    await handleCreate({
      tenantId: TENANT_ID,
      description: 'mcp-smoke-ttl',
      roleIds: [ROLE_ID],
      expiresInMinutes: 60,
    });

    const body = fronteggApiMock.mock.calls[0]?.[0]?.body as {
      expiresInMinutes?: number;
    };
    expect(body.expiresInMinutes).toBe(60);
  });

  test('rejects empty roleIds via schema before any HTTP call', async () => {
    const result = await handleCreate({
      tenantId: TENANT_ID,
      description: 'x',
      roleIds: [],
    });
    expect(result.content[0]?.text ?? '').toMatch(/^❌ Error: /);
    expect(fronteggApiMock).not.toHaveBeenCalled();
  });
});

describe('frontegg_api_tokens_revoke', () => {
  test('DELETEs the token when confirm=true', async () => {
    fronteggApiMock.mockResolvedValueOnce(undefined);

    const result = await handleRevoke({
      tenantId: TENANT_ID,
      tokenId: TOKEN_CLIENT_ID,
      confirm: true,
    });
    expect(result.content[0]?.text ?? '').toContain('API Token Revoked');

    const args = fronteggApiMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.method).toBe('DELETE');
    expect(args.path).toBe(
      `/identity/resources/tenants/api-tokens/v1/${TOKEN_CLIENT_ID}`
    );
    expect(args.headers).toEqual({ 'frontegg-tenant-id': TENANT_ID });
  });

  test('refuses to revoke when confirm is false (no HTTP issued)', async () => {
    const result = await handleRevoke({
      tenantId: TENANT_ID,
      tokenId: TOKEN_CLIENT_ID,
      confirm: false,
    });
    expect(result.content[0]?.text ?? '').toContain('Refusing to revoke');
    expect(fronteggApiMock).not.toHaveBeenCalled();
  });

  test('surfaces 404 if tokenId does not exist', async () => {
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('DELETE /...token → 404: not found', 404)
    );

    const result = await handleRevoke({
      tenantId: TENANT_ID,
      tokenId: 'does-not-exist',
      confirm: true,
    });
    expect(result.content[0]?.text ?? '').toContain('❌ Frontegg API error (404)');
  });
});
