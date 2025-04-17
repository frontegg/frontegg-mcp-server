import { logger } from "../logger"; // Corrected import path
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"; // Import axios
import type { ApiResponse, ToolResponseContent } from "./types"; // Import types
import { getValidToken } from "../../auth"; // Import token management function
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
    if (toolName) {
      logger.debug(`[${toolName}] ${method} request to ${urlString}`, {
        url: urlString,
        method: method,
        toolName: toolName,
      });
    }

    // Always get a valid token before making a request
    // This will automatically refresh if needed
    const validToken = await getValidToken();
    headers["Authorization"] = `Bearer ${validToken}`;

    // Prepare axios request config
    const config: AxiosRequestConfig = {
      method: method.toUpperCase(), // Axios methods are typically uppercase
      url: urlString,
      headers: headers,
      data: body, // Axios handles JSON stringification automatically for objects
      validateStatus: () => true, // Handle all statuses in the response logic
    };

    // Execute the axios request
    const response: AxiosResponse<T> = await axios(config);

    // Log response status if toolName is provided
    if (toolName) {
      logger.debug(
        `[${toolName}] Response: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          statusText: response.statusText,
          toolName: toolName,
        }
      );
    }

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

    if (toolName) {
      logger.error(`[${toolName}] Request failed: ${statusText}`, {
        status,
        statusText,
        error: errorData,
        toolName,
      });
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
export function buildFronteggUrl(
  fronteggBaseUrl: string,
  endpoint: string,
  pathParam?: string
): URL {
  let fullPath = `${fronteggBaseUrl}${endpoint}`;
  if (pathParam) {
    fullPath += `/${encodeURIComponent(pathParam)}`;
  }
  return new URL(fullPath);
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

    // Simplest approach:
    let responseText;

    // If custom message is provided, use it
    if (customMessage) {
      responseText = customMessage;
    }
    // Otherwise just return the API response, or status if blank
    else if (response.data) {
      responseText = JSON.stringify(response.data, null, 2);
    } else {
      responseText = `Status: ${response.status} ${response.statusText}`;
    }

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
