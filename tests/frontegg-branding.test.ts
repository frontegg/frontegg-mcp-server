/**
 * Tests for the `frontegg_branding_*` tools.
 *
 * The `frontegg-api-client` module is mocked at the module level so we
 * never load `config-manager` (which uses `import.meta.url` and can't
 * compile under ts-jest's commonjs target).
 *
 * Frontegg's branding "endpoint" lives at /metadata?entityName=adminBox.
 * POST /metadata replaces the entire `configuration` field, so the tool
 * implements read-modify-write — these tests verify that.
 */

// Mock BEFORE importing anything from src.
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

import {
  handleGet,
  handleUpdate,
  GetArgsSchema,
  UpdateArgsSchema,
  extractBrandingSummary,
  deepMerge,
  buildBrandingPatch,
} from '../src/tools/frontegg-branding.js';
import {
  fronteggApi,
  FronteggApiError,
} from '../src/tools/frontegg-api-client.js';

const fronteggApiMock = fronteggApi as unknown as jest.Mock;

beforeEach(() => {
  fronteggApiMock.mockReset();
});

// ---------------------------------------------------------------------------
// Pure helpers (no fetch)
// ---------------------------------------------------------------------------

describe('deepMerge', () => {
  test('merges nested objects without dropping unrelated keys', () => {
    const base = {
      theme: { primaryColor: '#000', other: 'keep-me' },
      navigation: { users: 'byPermissions' },
    };
    const patch = { theme: { primaryColor: '#5C2EAD' } };
    const merged = deepMerge(base, patch);
    expect((merged.theme as Record<string, unknown>).primaryColor).toBe('#5C2EAD');
    expect((merged.theme as Record<string, unknown>).other).toBe('keep-me');
    expect((merged.navigation as Record<string, unknown>).users).toBe('byPermissions');
  });

  test('overwrites arrays (not deep-merges them)', () => {
    const merged = deepMerge({ a: [1, 2, 3] }, { a: [9] });
    expect(merged.a).toEqual([9]);
  });

  test('overwrites primitives', () => {
    const merged = deepMerge({ a: 'old' }, { a: 'new' });
    expect(merged.a).toBe('new');
  });
});

describe('extractBrandingSummary', () => {
  test('pulls themeName, primaryColor, logoUrl from typical adminBox shape', () => {
    const cfg = {
      theme: { primaryColor: '#abc123', faviconUrl: 'https://cdn/x.ico', name: 'Acme' },
      themeV2: {
        loginBox: {
          themeName: 'dark',
          logo: { image: 'https://cdn/logo.png' },
        },
      },
    };
    const s = extractBrandingSummary(cfg);
    expect(s.primaryColor).toBe('#abc123');
    expect(s.faviconUrl).toBe('https://cdn/x.ico');
    expect(s.name).toBe('Acme');
    expect(s.themeName).toBe('dark');
    expect(s.logoUrl).toBe('https://cdn/logo.png');
  });

  test('returns empty object when config has no branding fields', () => {
    const s = extractBrandingSummary({ navigation: {} });
    expect(s).toEqual({});
  });
});

describe('buildBrandingPatch', () => {
  test('maps primaryColor to both theme and themeV2 paths', () => {
    const p = buildBrandingPatch({ primaryColor: '#FF0000' });
    expect(p.theme).toEqual({ primaryColor: '#FF0000' });
    expect(p.themeV2).toEqual({ loginBox: { rootStyle: { primaryColor: '#FF0000' } } });
  });

  test('maps logoUrl to both theme and themeV2.loginBox.logo.image', () => {
    const p = buildBrandingPatch({ logoUrl: 'https://x.com/y.png' });
    expect((p.theme as Record<string, unknown>).logoUrl).toBe('https://x.com/y.png');
    const tv2 = p.themeV2 as { loginBox: { logo: { image: string } } };
    expect(tv2.loginBox.logo.image).toBe('https://x.com/y.png');
  });

  test('themeName only writes themeV2.loginBox.themeName', () => {
    const p = buildBrandingPatch({ themeName: 'light' });
    expect(p.theme).toBeUndefined();
    const tv2 = p.themeV2 as { loginBox: { themeName: string } };
    expect(tv2.loginBox.themeName).toBe('light');
  });

  test('builds an empty patch when nothing provided', () => {
    expect(buildBrandingPatch({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe('schemas', () => {
  test('GetArgsSchema accepts empty object', () => {
    expect(() => GetArgsSchema.parse({})).not.toThrow();
  });

  test('UpdateArgsSchema rejects when no fields provided', () => {
    expect(() => UpdateArgsSchema.parse({})).toThrow();
  });

  test('UpdateArgsSchema accepts a single field', () => {
    expect(() => UpdateArgsSchema.parse({ primaryColor: '#123' })).not.toThrow();
  });

  test('UpdateArgsSchema validates themeName enum', () => {
    expect(() => UpdateArgsSchema.parse({ themeName: 'neon' })).toThrow();
    expect(() => UpdateArgsSchema.parse({ themeName: 'light' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

describe('handleGet', () => {
  test('returns summary + raw config from /metadata?entityName=adminBox', async () => {
    const config = {
      theme: { primaryColor: '#5C2EAD' },
      themeV2: {
        loginBox: { themeName: 'dark', logo: { image: 'https://cdn/l.png' } },
      },
      navigation: { users: { visibility: 'byPermissions' } },
    };
    fronteggApiMock.mockResolvedValueOnce({ rows: [{ configuration: config }] });

    const r = await handleGet({});
    expect(r.content[0]?.text).toMatch(/Frontegg Branding/);
    expect(r.content[0]?.text).toContain('#5C2EAD');
    expect(r.content[0]?.text).toContain('dark');
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/metadata?entityName=adminBox',
    });
  });

  test('handles empty rows gracefully', async () => {
    fronteggApiMock.mockResolvedValueOnce({ rows: [] });
    const r = await handleGet({});
    expect(r.content[0]?.text).toMatch(/Frontegg Branding/);
  });

  test('surfaces a 403 from the API', async () => {
    fronteggApiMock.mockRejectedValueOnce(new FronteggApiError('forbidden', 403));
    const r = await handleGet({});
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(403\)/);
  });
});

describe('handleUpdate', () => {
  test('read-modify-writes: preserves existing nav config when changing primaryColor', async () => {
    const before = {
      navigation: { users: { visibility: 'byPermissions' } },
      theme: { primaryColor: '#000000' },
      themeV2: { loginBox: { themeName: 'dark' } },
    };
    const after = {
      navigation: { users: { visibility: 'byPermissions' } }, // preserved
      theme: { primaryColor: '#FF00AA' },
      themeV2: {
        loginBox: {
          themeName: 'dark',
          rootStyle: { primaryColor: '#FF00AA' },
        },
      },
    };

    fronteggApiMock
      .mockResolvedValueOnce({ rows: [{ configuration: before }] }) // read before
      .mockResolvedValueOnce(undefined) // POST update
      .mockResolvedValueOnce({ rows: [{ configuration: after }] }); // read after

    const r = await handleUpdate({ primaryColor: '#FF00AA' });
    expect(r.content[0]?.text).toMatch(/Branding Updated/);
    expect(r.content[0]?.text).toContain('#FF00AA');

    // Verify the POST body deep-merged the new color INTO the existing config
    expect(fronteggApiMock).toHaveBeenCalledTimes(3);
    const postCall = fronteggApiMock.mock.calls[1][0];
    expect(postCall.method).toBe('POST');
    expect(postCall.path).toBe('/metadata');
    expect(postCall.body.entityName).toBe('adminBox');
    expect(postCall.body.configuration.navigation.users.visibility).toBe('byPermissions');
    expect(postCall.body.configuration.theme.primaryColor).toBe('#FF00AA');
    expect(postCall.body.configuration.themeV2.loginBox.themeName).toBe('dark');
    expect(postCall.body.configuration.themeV2.loginBox.rootStyle.primaryColor).toBe('#FF00AA');
  });

  test('rejects when no fields provided', async () => {
    // Schema error caught and returned to LLM.
    const r = await handleUpdate({});
    expect(r.content[0]?.text).toMatch(/❌ Error/);
    expect(fronteggApiMock).not.toHaveBeenCalled();
  });

  test('surfaces a 500 from the API on the initial read', async () => {
    fronteggApiMock.mockRejectedValueOnce(new FronteggApiError('boom', 500));
    const r = await handleUpdate({ primaryColor: '#000' });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(500\)/);
  });
});
