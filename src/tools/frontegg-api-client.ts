/**
 * Shared HTTP client for the Frontegg Management API.
 *
 * Handles vendor authentication (`POST /auth/vendor`) with token caching,
 * retry with exponential backoff, and typed error responses.
 */

import { ConfigManager } from '../config/config-manager.js';
import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

interface VendorToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedToken: VendorToken | null = null;

/**
 * Authenticate with the Frontegg vendor API and return a Bearer JWT.
 * Token is cached in-memory until 60 s before expiry.
 */
async function getVendorToken(): Promise<string> {
  const config = ConfigManager.getInstance().getConfig();
  const { clientId, secret, baseUrl, authEndpoint } = config.frontegg;

  const isPlaceholder = (v: string) =>
    !v || /^(your[_-]|placeholder|xxx|changeme|TODO)/i.test(v);

  if (isPlaceholder(clientId) || isPlaceholder(secret)) {
    throw new FronteggApiError(
      'FRONTEGG_CLIENT_ID and FRONTEGG_SECRET environment variables are required for API-powered tools. ' +
        'Set them in your .env or MCP config.',
      0
    );
  }

  // Return cached token if still fresh (60 s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const url = `${baseUrl}${authEndpoint}`;
  logger.debug('Authenticating with Frontegg vendor API', { url });

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, secret }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new FronteggApiError(
      `Vendor auth failed (${res.status}): ${body || res.statusText}`,
      res.status
    );
  }

  const data = (await res.json()) as { token: string; expiresIn?: number };
  // Default to 55 min cache if expiresIn not returned
  const ttlMs = (data.expiresIn ?? 3300) * 1000;
  cachedToken = { token: data.token, expiresAt: Date.now() + ttlMs };
  logger.info('Frontegg vendor token acquired');
  return data.token;
}

const API_TIMEOUT_MS = 30_000;

/** Fetch with an AbortController timeout to prevent hanging on slow/dead servers. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new FronteggApiError(`Request timed out after ${API_TIMEOUT_MS / 1000}s: ${url}`, 0);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class FronteggApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'FronteggApiError';
  }
}

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /**
   * Extra request headers for tenant/user-scoped endpoints (e.g.
   * `frontegg-tenant-id`, `frontegg-user-id`, `frontegg-application-id`)
   * required by user invite, user session management, user MFA admin,
   * and api-tokens tools. Authorization and Content-Type are always set
   * by this client and cannot be overridden here. HTTP header names
   * are case-insensitive; values must be strings.
   */
  headers?: Record<string, string>;
}

/**
 * Make an authenticated request to the Frontegg Management API.
 * Retries once on 401 (token refresh) and applies configured retry policy.
 */
export async function fronteggApi<T = unknown>(opts: ApiRequestOptions): Promise<T> {
  const config = ConfigManager.getInstance().getConfig();
  const baseUrl = config.frontegg.baseUrl;
  const maxAttempts = config.retry.maxAttempts;
  const delayMs = config.retry.delayMs;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const token = await getVendorToken();
      const url = `${baseUrl}${opts.path}`;
      // opts.headers first (lowest priority), Authorization + Content-Type
      // last so they cannot be overridden by callers — protects against tools
      // accidentally clobbering the bearer token via a custom header dict.
      const headers: Record<string, string> = {
        ...(opts.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const fetchOpts: RequestInit = { method: opts.method, headers };
      if (opts.body !== undefined) {
        fetchOpts.body = JSON.stringify(opts.body);
      }

      logger.debug('Frontegg API request', { method: opts.method, path: opts.path, attempt });
      const res = await fetchWithTimeout(url, fetchOpts);

      // Token expired — clear cache and retry
      if (res.status === 401 && attempt < maxAttempts) {
        cachedToken = null;
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new FronteggApiError(
          `${opts.method} ${opts.path} → ${res.status}: ${body || res.statusText}`,
          res.status
        );
      }

      // Some endpoints return 204 No Content
      if (res.status === 204) return undefined as T;

      // Some PATCH endpoints return 200 with an empty body. Guard so
      // JSON.parse doesn't throw "Unexpected end of JSON input" on success.
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        return undefined as T;
      }
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on auth/config errors
      if (err instanceof FronteggApiError && err.status < 500 && err.status !== 401) {
        throw err;
      }

      if (attempt < maxAttempts) {
        const wait = delayMs * Math.pow(2, attempt - 1);
        logger.warn('Frontegg API retry', { attempt, wait, error: lastError.message });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  throw lastError ?? new Error('Frontegg API request failed');
}

/** Clear cached vendor token (useful for tests). */
export function clearTokenCache(): void {
  cachedToken = null;
}
