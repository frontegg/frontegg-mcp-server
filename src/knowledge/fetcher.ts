import { Logger } from '../utils/logger.js';

const logger = Logger.getInstance();

/** Request timeout for individual GitHub raw file fetches. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetch a single raw file from GitHub. Returns null on 404 or network error
 * so callers can treat missing canonical files as "skip" rather than fatal.
 */
export async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'frontegg-mobile-mcp-server',
      Accept: 'text/plain, */*',
    };
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) {
      if (res.status !== 404) {
        logger.debug('fetchText non-ok', { url, status: res.status });
      }
      return null;
    }
    return await res.text();
  } catch (err) {
    logger.debug('fetchText error', { url, err: String(err) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetch the first URL from the list that returns a body. */
export async function fetchFirst(urls: string[]): Promise<{ url: string; body: string } | null> {
  for (const url of urls) {
    const body = await fetchText(url);
    if (body !== null) return { url, body };
  }
  return null;
}
