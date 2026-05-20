/**
 * Tests for the `frontegg_email_templates_list` and
 * `frontegg_email_templates_update` tools.
 *
 * The `frontegg-api-client` module is fully mocked so config-manager
 * (which uses `import.meta.url` and is incompatible with ts-jest's
 * commonjs transform) never loads. We exercise:
 *   - schema parsing (required + optional fields, enum guards)
 *   - HTTP success: list, update flow with re-GET
 *   - HTTP error: 401/403/404 propagation
 *   - "no fields to update" guard
 *   - dispatch sequencing (POST update → GET re-read)
 */

// IMPORTANT: jest.mock must come BEFORE any import of the SUT (hoisting).
jest.mock('../src/tools/frontegg-api-client.js', () => {
  // Real class kept around for type-shape parity with the tool code
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

// utils/logger is fine — it doesn't touch config-manager
import { fronteggApi, FronteggApiError } from '../src/tools/frontegg-api-client.js';
import { __test as Et } from '../src/tools/frontegg-email-templates.js';

const mockFronteggApi = fronteggApi as jest.MockedFunction<typeof fronteggApi>;

beforeEach(() => {
  mockFronteggApi.mockReset();
});

describe('email-templates schema', () => {
  test('UpdateArgs requires `type`', () => {
    const r = Et.UpdateArgsSchema.safeParse({ subject: 'hi' });
    expect(r.success).toBe(false);
  });

  test('UpdateArgs accepts known template type + optional fields', () => {
    const r = Et.UpdateArgsSchema.safeParse({
      type: 'ResetPassword',
      subject: 'Reset your password',
      fromName: 'Acme Security',
      active: true,
    });
    expect(r.success).toBe(true);
  });

  test('UpdateArgs rejects unknown template type', () => {
    const r = Et.UpdateArgsSchema.safeParse({ type: 'NotARealTemplateType' });
    expect(r.success).toBe(false);
  });

  test('EMAIL_TEMPLATE_TYPES covers core Frontegg templates', () => {
    expect(Et.EMAIL_TEMPLATE_TYPES).toContain('ResetPassword');
    expect(Et.EMAIL_TEMPLATE_TYPES).toContain('ActivateUser');
    expect(Et.EMAIL_TEMPLATE_TYPES).toContain('MagicLink');
    expect(Et.EMAIL_TEMPLATE_TYPES).toContain('MFAEnroll');
  });
});

describe('handleList', () => {
  test('returns formatted summary on success', async () => {
    mockFronteggApi.mockResolvedValueOnce([
      { type: 'ResetPassword', subject: 'Reset your password', active: true },
      { type: 'ActivateUser', subject: 'Activate your account', active: false },
    ]);
    const result = await Et.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Email Templates \(2\)/);
    expect(text).toContain('ResetPassword');
    expect(text).toContain('Activate your account');
    expect(text).toContain('[inactive]');
    expect(mockFronteggApi).toHaveBeenCalledWith({
      method: 'GET',
      path: Et.EMAIL_TEMPLATES_PATH,
    });
  });

  test('handles empty list', async () => {
    mockFronteggApi.mockResolvedValueOnce([]);
    const result = await Et.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('No templates configured');
  });

  test('surfaces 404 (vendor-token-blocked case) as FronteggApiError', async () => {
    mockFronteggApi.mockRejectedValueOnce(
      new FronteggApiError(
        `GET ${Et.EMAIL_TEMPLATES_PATH} → 404: {"errors":["not found"]}`,
        404
      )
    );
    const result = await Et.handleList({});
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Frontegg API error \(404\)/);
    expect(text).toContain(Et.EMAIL_TEMPLATES_PATH);
  });
});

describe('handleUpdate', () => {
  test('rejects update with no fields to change', async () => {
    const result = await Et.handleUpdate({ type: 'ResetPassword' });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/No fields provided to update/);
    expect(mockFronteggApi).not.toHaveBeenCalled();
  });

  test('successful POST then re-GET returns concrete state', async () => {
    mockFronteggApi
      .mockResolvedValueOnce(undefined) // POST returns empty body
      .mockResolvedValueOnce([
        { type: 'ResetPassword', subject: 'NEW SUBJECT', active: true },
      ]); // re-GET

    const result = await Et.handleUpdate({ type: 'ResetPassword', subject: 'NEW SUBJECT' });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Email Template Updated/);
    expect(text).toContain('NEW SUBJECT');

    expect(mockFronteggApi).toHaveBeenCalledTimes(2);
    const [postCall, getCall] = mockFronteggApi.mock.calls;
    expect(postCall![0]).toMatchObject({
      method: 'POST',
      path: Et.EMAIL_TEMPLATES_PATH,
      body: { type: 'ResetPassword', subject: 'NEW SUBJECT' },
    });
    expect(getCall![0]).toMatchObject({ method: 'GET', path: Et.EMAIL_TEMPLATES_PATH });
  });

  test('handles re-GET that does not echo back the updated template', async () => {
    mockFronteggApi
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]); // template missing
    const result = await Et.handleUpdate({ type: 'MagicLink', subject: 'Hi' });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/Email Template Update Sent/);
    expect(text).toContain('MagicLink');
  });

  test('rejects unknown template type before any HTTP call', async () => {
    const result = await Et.handleUpdate({ type: 'NotReal', subject: 'x' });
    const text = result.content[0]?.text ?? '';
    expect(text).toMatch(/❌ Error/);
    expect(mockFronteggApi).not.toHaveBeenCalled();
  });
});
