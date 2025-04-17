import axios from "axios";
import dotenv from "dotenv";
import { logger } from "./utils/logger";

dotenv.config();

export const fronteggBaseUrl =
  process.env.FRONTEGG_BASE_URL || "https://api.frontegg.com";

let tokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

// Buffer time in seconds to refresh token before expiration (default 5 minutes)
const EXPIRATION_BUFFER = 300;

export async function authenticateFrontegg(): Promise<string> {
  const clientId = process.env.FRONTEGG_CLIENT_ID;
  const secret = process.env.FRONTEGG_API_KEY;

  if (!clientId || !secret) {
    const errorMessage =
      "Error: FRONTEGG_CLIENT_ID and FRONTEGG_API_KEY must be set in the .env file.";
    logger.error(errorMessage);
    process.exit(1);
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
    process.exit(1); // Exit if authentication fails
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

  logger.info("Frontegg token expired or about to expire, refreshing...");
  return authenticateFrontegg();
}
