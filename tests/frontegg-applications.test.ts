/**
 * Tests for the `frontegg_applications_*` tools.
 *
 * The `frontegg-api-client` module is mocked at the module level so we
 * never load `config-manager` (which depends on `import.meta.url` and
 * doesn't compile under ts-jest's commonjs target).
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
  handleList,
  handleGet,
  handleCreate,
  ListArgsSchema,
  GetArgsSchema,
  CreateArgsSchema,
} from '../src/tools/frontegg-applications.js';
import {
  fronteggApi,
  FronteggApiError,
} from '../src/tools/frontegg-api-client.js';

const fronteggApiMock = fronteggApi as unknown as jest.Mock;

beforeEach(() => {
  fronteggApiMock.mockReset();
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe('schemas', () => {
  test('ListArgsSchema accepts empty object', () => {
    expect(ListArgsSchema.parse({})).toEqual({});
  });

  test('GetArgsSchema requires id', () => {
    expect(() => GetArgsSchema.parse({})).toThrow();
    expect(GetArgsSchema.parse({ id: 'abc-123' })).toEqual({ id: 'abc-123' });
  });

  test('CreateArgsSchema requires name, type, appURL, loginURL', () => {
    expect(() => CreateArgsSchema.parse({})).toThrow();
    expect(() =>
      CreateArgsSchema.parse({
        name: 'x',
        type: 'web',
        appURL: 'http://localhost:3000',
        // loginURL missing
      })
    ).toThrow();
    const ok = CreateArgsSchema.parse({
      name: 'x',
      type: 'web',
      appURL: 'http://localhost:3000',
      loginURL: 'http://localhost:3000/oauth',
    });
    expect(ok.name).toBe('x');
  });

  test('CreateArgsSchema validates type enum', () => {
    expect(() =>
      CreateArgsSchema.parse({
        name: 'x',
        type: 'desktop', // not in enum
        appURL: 'http://localhost:3000',
        loginURL: 'http://localhost:3000/oauth',
      })
    ).toThrow();
  });

  test('CreateArgsSchema validates accessType enum when provided', () => {
    expect(() =>
      CreateArgsSchema.parse({
        name: 'x',
        type: 'web',
        appURL: 'http://localhost:3000',
        loginURL: 'http://localhost:3000/oauth',
        accessType: 'FOOBAR',
      })
    ).toThrow();
    const ok = CreateArgsSchema.parse({
      name: 'x',
      type: 'web',
      appURL: 'http://localhost:3000',
      loginURL: 'http://localhost:3000/oauth',
      accessType: 'MANAGED_ACCESS',
    });
    expect(ok.accessType).toBe('MANAGED_ACCESS');
  });
});

// ---------------------------------------------------------------------------
// handleList
// ---------------------------------------------------------------------------

describe('handleList', () => {
  test('returns the list of applications', async () => {
    const apps = [
      { id: 'a1', name: 'Web app', type: 'web' },
      { id: 'a2', name: 'iOS', type: 'mobile-ios' },
    ];
    fronteggApiMock.mockResolvedValueOnce(apps);

    const r = await handleList({});
    expect(r.content[0]?.text).toMatch(/Frontegg Applications \(2\)/);
    expect(r.content[0]?.text).toContain('Web app');
    expect(r.content[0]?.text).toContain('mobile-ios');
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/resources/applications/v1',
    });
  });

  test('surfaces a 403 from the API', async () => {
    fronteggApiMock.mockRejectedValueOnce(new FronteggApiError('forbidden', 403));
    const r = await handleList({});
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(403\)/);
  });
});

// ---------------------------------------------------------------------------
// handleGet
// ---------------------------------------------------------------------------

describe('handleGet', () => {
  test('returns a single application by id', async () => {
    const app = { id: 'abc', name: 'My Web App', type: 'web' };
    fronteggApiMock.mockResolvedValueOnce(app);

    const r = await handleGet({ id: 'abc' });
    expect(r.content[0]?.text).toContain('My Web App');
    expect(r.content[0]?.text).toContain('abc');
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/resources/applications/v1/abc',
    });
  });

  test('encodes the id in the URL', async () => {
    fronteggApiMock.mockResolvedValueOnce({ id: 'weird id', name: 'x' });
    await handleGet({ id: 'weird id' });
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'GET',
      path: '/applications/resources/applications/v1/weird%20id',
    });
  });

  test('returns a friendly error when id missing', async () => {
    const r = await handleGet({});
    // Schema-validation error caught and reported.
    expect(r.content[0]?.text).toMatch(/❌ Error/);
  });

  test('surfaces a 404 from the API', async () => {
    fronteggApiMock.mockRejectedValueOnce(
      new FronteggApiError('Application not found', 404)
    );
    const r = await handleGet({ id: 'missing' });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(404\)/);
  });
});

// ---------------------------------------------------------------------------
// handleCreate
// ---------------------------------------------------------------------------

describe('handleCreate', () => {
  test('POSTs the expected body and returns the created app', async () => {
    const created = {
      id: 'new-uuid',
      name: 'Smoke App',
      type: 'web',
      appURL: 'http://localhost:3001',
      loginURL: 'http://localhost:3001/oauth',
    };
    fronteggApiMock.mockResolvedValueOnce(created);

    const r = await handleCreate({
      name: 'Smoke App',
      type: 'web',
      appURL: 'http://localhost:3001',
      loginURL: 'http://localhost:3001/oauth',
      frontendStack: 'react',
    });
    expect(r.content[0]?.text).toMatch(/Application Created/);
    expect(r.content[0]?.text).toContain('new-uuid');
    expect(fronteggApiMock).toHaveBeenCalledTimes(1);
    expect(fronteggApiMock).toHaveBeenCalledWith({
      method: 'POST',
      path: '/applications/resources/applications/v1',
      body: {
        name: 'Smoke App',
        type: 'web',
        appURL: 'http://localhost:3001',
        loginURL: 'http://localhost:3001/oauth',
        frontendStack: 'react',
      },
    });
  });

  test('re-lists when POST returns empty body', async () => {
    fronteggApiMock
      .mockResolvedValueOnce(undefined) // POST → empty body
      .mockResolvedValueOnce([{ id: 'recovered-id', name: 'Recover Me', type: 'web' }]);

    const r = await handleCreate({
      name: 'Recover Me',
      type: 'web',
      appURL: 'http://localhost:3000',
      loginURL: 'http://localhost:3000/oauth',
    });
    expect(r.content[0]?.text).toMatch(/Application Created/);
    expect(r.content[0]?.text).toContain('recovered-id');
    expect(fronteggApiMock).toHaveBeenCalledTimes(2);
    expect(fronteggApiMock.mock.calls[1][0]).toEqual({
      method: 'GET',
      path: '/applications/resources/applications/v1',
    });
  });

  test('surfaces a 400 from the API', async () => {
    fronteggApiMock.mockRejectedValueOnce(new FronteggApiError('Invalid type', 400));
    const r = await handleCreate({
      name: 'Bad',
      type: 'web',
      appURL: 'http://localhost:3000',
      loginURL: 'http://localhost:3000/oauth',
    });
    expect(r.content[0]?.text).toMatch(/Frontegg API error \(400\)/);
  });

  test('rejects missing required fields via schema', async () => {
    const r = await handleCreate({ name: 'incomplete', type: 'web' });
    expect(r.content[0]?.text).toMatch(/❌ Error/);
    expect(fronteggApiMock).not.toHaveBeenCalled();
  });
});
