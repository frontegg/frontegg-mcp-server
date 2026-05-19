import axios from "axios";
import { logger } from "./utils/logger.js";

// Note: dotenv is loaded by the parent MCP server's config-manager, which
// scopes lookup to the MCP install directory rather than the caller's cwd.
// We do NOT call dotenv.config() here — that would re-introduce the cwd
// leak fix the parent server already addresses.

export const fronteggBaseUrl =
  process.env.FRONTEGG_API_BASE ||
  process.env.FRONTEGG_BASE_URL ||
  "https://api.frontegg.com";

let tokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

// Buffer time in seconds to refresh token before expiration (default 5 minutes)
const EXPIRATION_BUFFER = 300;

export async function authenticateFrontegg(): Promise<string> {
  const clientId = process.env.FRONTEGG_CLIENT_ID;
  // Accept both env var names: FRONTEGG_API_KEY (upstream convention) and
  // FRONTEGG_SECRET_KEY (mobile-MCP convention). The two names refer to the
  // same vendor secret; either works.
  const secret =
    process.env.FRONTEGG_API_KEY || process.env.FRONTEGG_SECRET_KEY;

  if (!clientId || !secret) {
    const errorMessage =
      "Error: FRONTEGG_CLIENT_ID and FRONTEGG_API_KEY (or FRONTEGG_SECRET_KEY) must be set in the .env file.";
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  const authUrl = `${fronteggBaseUrl}/auth/vendor/`;

  try {
    const response = await axios.post<{ token: string; expiresIn: number }>(
      authUrl,
      { clientId, secret },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    tokenCache = {
      token: response.data.token,
      expiresAt: Date.now() + response.data.expiresIn * 1000,
    };

    return response.data.token;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const errorDetails = error.response
        ? `${error.response.status} ${
            error.response.statusText
          } - ${JSON.stringify(error.response.data)}`
        : error.message;
      logger.error(`Error during Frontegg authentication: ${errorDetails}`);
    } else {
      logger.error(`Error during Frontegg authentication: ${error}`);
    }
    throw new Error(`Frontegg authentication failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets a valid Frontegg token, renewing if necessary
 */
export async function getValidToken(): Promise<string> {
  if (
    tokenCache &&
    tokenCache.expiresAt > Date.now() + EXPIRATION_BUFFER * 1000
  ) {
    return tokenCache.token;
  }

  if (tokenCache) {
    logger.info("Frontegg token expired or about to expire, refreshing...");
  }

  return authenticateFrontegg();
}
