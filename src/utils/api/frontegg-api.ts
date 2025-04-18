import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"; // Import axios
import { logger } from "../logger"; // Corrected import path
import type { ApiResponse, ToolResponseContent } from "./types"; // Import types
import { fronteggBaseUrl, getValidToken } from "../../auth"; // Import token management function
export { HttpMethods, FronteggEndpoints } from "./constants"; // Import constants

/**
 * Create base headers for Frontegg API requests without Authorization
 * Authorization will be added separately with a valid token
 */
export function createBaseHeaders(options?: {
  fronteggTenantIdHeader?: string;
  userIdHeader?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.fronteggTenantIdHeader) {
    headers["frontegg-tenant-id"] = options.fronteggTenantIdHeader;
  }

  if (options?.userIdHeader) {
    headers["frontegg-user-id"] = options.userIdHeader;
  }

  return headers;
}

/**
 * Simplified fetch wrapper for Frontegg API calls, now using axios
 * Automatically refreshes token before making the request if needed
 */
export async function fetchFromFrontegg<T = any>(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body?: any,
  toolName?: string
): Promise<ApiResponse<T>> {
  try {
    const urlString = url.toString();

    const validToken = await getValidToken();
    headers["Authorization"] = `Bearer ${validToken}`;

    // Prepare axios request config
    const config: AxiosRequestConfig = {
      method,
      url: urlString,
      headers: headers,
      data: body,
      validateStatus: () => true, // Handle all statuses in the response logic
    };

    // Execute the axios request
    const response: AxiosResponse<T> = await axios(config);

    const isSuccess = response.status >= 200 && response.status < 300;

    return {
      success: isSuccess,
      status: response.status,
      statusText: response.statusText,
      data: response.data,
      error: !isSuccess ? response.data : undefined,
    };
  } catch (error) {
    let status = 0;
    let statusText = "Network Error";
    let errorData: any = error instanceof Error ? error.message : String(error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      status = axiosError.response?.status || 0;
      statusText = axiosError.response?.statusText || "Axios Error";
      errorData = axiosError.response?.data || axiosError.message;
    }

    return {
      success: false,
      status,
      statusText,
      data: null,
      error: errorData,
    };
  }
}

/**
 * Builds a complete Frontegg API URL
 */
export function buildFronteggUrl(endpoint: string, pathParam?: string): URL {
  let fullPath = `${fronteggBaseUrl}${endpoint}`;
  if (pathParam) {
    fullPath += `/${encodeURIComponent(pathParam)}`;
  }
  return new URL(fullPath);
}

/**
 * Determines the text representation of an API response.
 * @param response The API response object.
 * @param customMessage An optional custom message to override the default text.
 * @returns The string representation of the response.
 */
function _getResponseText(
  response: ApiResponse<any>,
  customMessage?: string
): string {
  // If custom message is provided, use it
  if (customMessage) {
    return customMessage;
  }
  // Otherwise just return the API response, or status if blank
  else if (response.data) {
    return JSON.stringify(response.data, null, 2);
  } else {
    return `Status: ${response.status} ${response.statusText}`;
  }
}

/**
 * Format API response for tool output
 */
export function formatToolResponse(
  response: ApiResponse<any>,
  customMessage?: string
): ToolResponseContent {
  try {
    if (!response.success) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${response.status} ${
              response.statusText
            } - ${JSON.stringify(response.error)}`,
          },
        ],
        isError: true,
      };
    }

    const responseText = _getResponseText(response, customMessage);

    return {
      content: [
        {
          type: "text",
          text: responseText,
        },
      ],
      isError: false,
    };
  } catch (error) {
    // Fallback for any unexpected errors during formatting
    logger.error(`Error formatting tool response: ${error}`, {
      originalResponse: response,
    });
    return {
      content: [
        {
          type: "text",
          text: `Internal error formatting response: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
