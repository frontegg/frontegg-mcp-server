/**
 * Tests for Category C auth-policy tools:
 *   - frontegg_configure_password_policy
 *   - frontegg_configure_lockout_policy
 *   - frontegg_configure_security_rules
 *
 * The Frontegg HTTP client (`fronteggApi`) is mocked at the module boundary
 * so these tests never hit the network and don't need vendor credentials.
 */

import { jest } from '@jest/globals';

// Reimplement FronteggApiError in-test so the mock factory doesn't have to
// pull in the real module — which transitively imports `config-manager.ts`
// and breaks under ts-jest's commonjs transform (`import.meta` parse error).
class FronteggApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'FronteggApiError';
  }
}

jest.mock('../src/tools/frontegg-api-client.js', () => ({
  __esModule: true,
  FronteggApiError,
  fronteggApi: jest.fn(),
  clearTokenCache: jest.fn(),
}));

import { fronteggApi } from '../src/tools/frontegg-api-client.js';
import { __test__ } from '../src/tools/frontegg-auth-policies.js';

// Cast to a parameter-less Mock — `fronteggApi` is generic, which makes
// `.mockResolvedValueOnce(...)` infer `never` for the value type unless we
// erase the signature here.
const mockedFronteggApi = fronteggApi as unknown as jest.MockedFunction<
  (opts: unknown) => Promise<unknown>
>;

const {
  PasswordPolicyArgsSchema,
  LockoutPolicyArgsSchema,
  SecurityRulesArgsSchema,
  handlePasswordPolicy,
  handleLockoutPolicy,
  handleSecurityRules,
  PASSWORD_POLICY_PATH,
  LOCKOUT_POLICY_PATH,
  SECURITY_RULES_PATH,
} = __test__;

beforeEach(() => {
  mockedFronteggApi.mockReset();
});

describe('schema parsing', () => {
  test('password policy schema rejects unknown action', () => {
    expect(() =>
      PasswordPolicyArgsSchema.parse({ action: 'delete' })
    ).toThrow();
  });

  test('password policy schema accepts a full update payload', () => {
    const parsed = PasswordPolicyArgsSchema.parse({
      action: 'update',
      minLength: 12,
      requireUppercase: true,
      checkThreeRepeatedChars: false,
    });
    expect(parsed.minLength).toBe(12);
    expect(parsed.requireUppercase).toBe(true);
    expect(parsed.checkThreeRepeatedChars).toBe(false);
  });

  test('lockout policy schema rejects non-boolean enabled', () => {
    expect(() =>
      LockoutPolicyArgsSchema.parse({ action: 'update', enabled: 'yes' })
    ).toThrow();
  });

  test('security rules schema accepts ignoredEmails array', () => {
    const parsed = SecurityRulesArgsSchema.parse({
      action: 'update',
      ignoredEmails: ['a@b.com', 'c@d.com'],
    });
    expect(parsed.ignoredEmails).toEqual(['a@b.com', 'c@d.com']);
  });
});

describe('frontegg_configure_password_policy', () => {
  test('GET path hits the password endpoint and returns its body', async () => {
    mockedFronteggApi.mockResolvedValueOnce({
      minLength: 8,
      maxLength: 128,
      optionalTests: { requireNumbers: true },
    });

    const result = await handlePasswordPolicy({ action: 'get' });

    expect(mockedFronteggApi).toHaveBeenCalledTimes(1);
    expect(mockedFronteggApi).toHaveBeenCalledWith({
      method: 'GET',
      path: PASSWORD_POLICY_PATH,
    });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Current Password Policy');
    expect(text).toContain('"minLength": 8');
  });

  test('UPDATE merges nested optionalTests with current state', async () => {
    // First call: GET current state so the handler can merge.
    mockedFronteggApi.mockResolvedValueOnce({
      minLength: 6,
      optionalTests: { requireNumbers: true, requireLowercase: false },
      requiredTests: { checkThreeRepeatedChars: true },
    });
    // Second call: POST update — returns the full policy.
    mockedFronteggApi.mockResolvedValueOnce({
      minLength: 12,
      optionalTests: { requireNumbers: true, requireLowercase: false, requireUppercase: true },
      requiredTests: { checkThreeRepeatedChars: true },
    });

    const result = await handlePasswordPolicy({
      action: 'update',
      minLength: 12,
      requireUppercase: true,
    });

    expect(mockedFronteggApi).toHaveBeenCalledTimes(2);
    const postCall = mockedFronteggApi.mock.calls[1]![0] as {
      method: string;
      path: string;
      body: { minLength: number; optionalTests: Record<string, boolean> };
    };
    expect(postCall.method).toBe('POST');
    expect(postCall.path).toBe(PASSWORD_POLICY_PATH);
    expect(postCall.body.minLength).toBe(12);
    // Pre-existing keys preserved; new key added.
    expect(postCall.body.optionalTests).toEqual({
      requireNumbers: true,
      requireLowercase: false,
      requireUppercase: true,
    });

    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Password Policy Updated');
    expect(text).toContain('"minLength": 12');
  });

  test('UPDATE re-GETs when POST returns empty body', async () => {
    // GET current
    mockedFronteggApi.mockResolvedValueOnce({ minLength: 6 });
    // POST returns undefined (empty body sentinel from api-client)
    mockedFronteggApi.mockResolvedValueOnce(undefined);
    // Re-GET after empty POST
    mockedFronteggApi.mockResolvedValueOnce({ minLength: 14 });

    const result = await handlePasswordPolicy({ action: 'update', minLength: 14 });

    expect(mockedFronteggApi).toHaveBeenCalledTimes(3);
    // The third call must be a GET (re-read for concrete state).
    expect(mockedFronteggApi.mock.calls[2]![0]).toEqual({
      method: 'GET',
      path: PASSWORD_POLICY_PATH,
    });
    expect(result.content[0]?.text).toContain('"minLength": 14');
  });

  test('surfaces FronteggApiError as a formatted error message', async () => {
    mockedFronteggApi.mockRejectedValueOnce(
      new FronteggApiError('GET /password → 403: forbidden', 403)
    );
    const result = await handlePasswordPolicy({ action: 'get' });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Frontegg API error (403)');
    expect(text).toContain('forbidden');
  });
});

describe('frontegg_configure_lockout_policy', () => {
  test('GET path returns current policy', async () => {
    mockedFronteggApi.mockResolvedValueOnce({
      id: 'lock-id',
      enabled: true,
      maxAttempts: 5,
    });

    const result = await handleLockoutPolicy({ action: 'get' });

    expect(mockedFronteggApi).toHaveBeenCalledWith({
      method: 'GET',
      path: LOCKOUT_POLICY_PATH,
    });
    expect(result.content[0]?.text).toContain('"maxAttempts": 5');
  });

  test('UPDATE reads current state and POSTs the merged full body', async () => {
    // GET current state — the handler reads first so it can fill in fields
    // the caller omitted (the Frontegg endpoint validates the full resource).
    mockedFronteggApi.mockResolvedValueOnce({
      id: 'lock-id',
      enabled: false,
      maxAttempts: 5,
    });
    // POST returns the updated resource.
    mockedFronteggApi.mockResolvedValueOnce({
      id: 'lock-id',
      enabled: false,
      maxAttempts: 3,
    });

    const result = await handleLockoutPolicy({
      action: 'update',
      maxAttempts: 3,
    });

    expect(mockedFronteggApi).toHaveBeenCalledTimes(2);
    const getCall = mockedFronteggApi.mock.calls[0]![0] as {
      method: string;
      path: string;
    };
    expect(getCall.method).toBe('GET');
    expect(getCall.path).toBe(LOCKOUT_POLICY_PATH);

    const postCall = mockedFronteggApi.mock.calls[1]![0] as {
      method: string;
      path: string;
      body: Record<string, unknown>;
    };
    expect(postCall.method).toBe('POST');
    expect(postCall.path).toBe(LOCKOUT_POLICY_PATH);
    // The caller only supplied maxAttempts; the handler must overlay it onto
    // the current `enabled` value so the API doesn't reject the request.
    expect(postCall.body).toEqual({ enabled: false, maxAttempts: 3 });
    expect(result.content[0]?.text).toContain('Lockout Policy Updated');
  });

  test('UPDATE without any field returns a no-op message', async () => {
    const result = await handleLockoutPolicy({ action: 'update' });
    expect(mockedFronteggApi).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toMatch(/No fields provided/);
  });
});

describe('frontegg_configure_security_rules', () => {
  test('GET path returns the CAPTCHA policy', async () => {
    mockedFronteggApi.mockResolvedValueOnce({
      id: 'capt-1',
      enabled: false,
      siteKey: null,
      secretKey: null,
      minScore: null,
      ignoredEmails: [],
    });

    const result = await handleSecurityRules({ action: 'get' });

    expect(mockedFronteggApi).toHaveBeenCalledWith({
      method: 'GET',
      path: SECURITY_RULES_PATH,
    });
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('CAPTCHA');
    expect(text).toContain('"enabled": false');
  });

  test('UPDATE forwards ignoredEmails verbatim and re-GETs on empty body', async () => {
    // POST returns empty body
    mockedFronteggApi.mockResolvedValueOnce(undefined);
    // Re-GET
    mockedFronteggApi.mockResolvedValueOnce({
      id: 'capt-1',
      enabled: false,
      ignoredEmails: ['demo@example.com'],
    });

    const result = await handleSecurityRules({
      action: 'update',
      ignoredEmails: ['demo@example.com'],
    });

    expect(mockedFronteggApi).toHaveBeenCalledTimes(2);
    const postCall = mockedFronteggApi.mock.calls[0]![0] as {
      method: string;
      path: string;
      body: Record<string, unknown>;
    };
    expect(postCall.method).toBe('POST');
    expect(postCall.path).toBe(SECURITY_RULES_PATH);
    expect(postCall.body).toEqual({ ignoredEmails: ['demo@example.com'] });

    // Second call must be the GET fallback.
    expect(mockedFronteggApi.mock.calls[1]![0]).toEqual({
      method: 'GET',
      path: SECURITY_RULES_PATH,
    });
    expect(result.content[0]?.text).toContain('demo@example.com');
  });
});
