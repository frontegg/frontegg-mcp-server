import axios from "axios";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

let fronteggToken: string | null = null;
export const fronteggBaseUrl =
  process.env.FRONTEGG_BASE_URL || "https://api.frontegg.com";

export async function authenticateFrontegg() {
  const clientId = process.env.FRONTEGG_CLIENT_ID;
  const secret = process.env.FRONTEGG_API_KEY;

  if (!clientId || !secret) {
    logger.error(
      "Error: FRONTEGG_CLIENT_ID and FRONTEGG_API_KEY must be set in the .env file."
    );
    console.error("Error: Frontegg credentials not found in .env");
    process.exit(1);
  }

  const authUrl = `${fronteggBaseUrl}/auth/vendor/`;

  try {
    const response = await axios.post(
      authUrl,
      { clientId, secret },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    fronteggToken = response.data.token;
    logger.info("Successfully authenticated with Frontegg.");
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const errorDetails = error.response
        ? `${error.response.status} ${
            error.response.statusText
          } - ${JSON.stringify(error.response.data)}`
        : error.message;
      logger.error(
        `Error during Frontegg authentication (Axios): ${errorDetails}`
      );
    } else {
      logger.error(`Error during Frontegg authentication: ${error}`);
    }
    process.exit(1);
  }
}

export function getFronteggToken(): string | null {
  return fronteggToken;
}
