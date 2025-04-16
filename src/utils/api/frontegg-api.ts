/**
 * Centralized utilities for Frontegg API operations
 */
import { logger } from "../logger"; // Corrected import path
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios"; // Import axios

// Define the response content type for tools
export type ToolResponseContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ApiResponse<T> = {
  success: boolean;
  status: number;
  statusText: string;
  data: T | null;
  error?: any;
};

/**
 * HTTP Method constants
 */
export const HttpMethods = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
};

/**
 * Create base headers for Frontegg API requests
 */
export function createBaseHeaders(
  fronteggToken: string | null,
  options?: { fronteggTenantIdHeader?: string; userIdHeader?: string } // Renamed userId to userIdHeader
): HeadersInit {
  const headers: HeadersInit = {
    Authorization: `Bearer ${fronteggToken}`,
    "Content-Type": "application/json",
  };

  // Add tenant ID header if provided
  if (options?.fronteggTenantIdHeader) {
    headers["frontegg-tenant-id"] = options.fronteggTenantIdHeader;
  }

  // Add user ID header if provided
  if (options?.userIdHeader) {
    // Check for userIdHeader
    headers["frontegg-user-id"] = options.userIdHeader; // Use userIdHeader
  }

  return headers;
}

/**
 * Simplified fetch wrapper for Frontegg API calls, now using axios
 */
export async function fetchFromFrontegg<T = any>(
  method: string,
  url: URL,
  headers: HeadersInit, // Keep HeadersInit for compatibility, but convert to AxiosHeaders
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

    // Prepare axios request config
    const config: AxiosRequestConfig = {
      method: method.toUpperCase(), // Axios methods are typically uppercase
      url: urlString,
      headers: headers as Record<string, string>, // Convert HeadersInit
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
      data: response.data, // Axios directly provides parsed data
      error: !isSuccess ? response.data : undefined, // Include response data as error details on failure
    };
  } catch (error) {
    let status = 0;
    let statusText = "Network Error";
    let errorData: any = error instanceof Error ? error.message : String(error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      status = axiosError.response?.status || 0;
      statusText = axiosError.response?.statusText || "Axios Error";
      errorData = axiosError.response?.data || axiosError.message; // Prefer response data if available
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
 * Common endpoints for Frontegg API
 */
export const FronteggEndpoints = {
  ROLES: "/identity/resources/roles/v1",
  PERMISSIONS: "/identity/resources/permissions/v1",
  PERMISSIONS_CLASSIFICATION:
    "/identity/resources/permissions/v1/classification",
  PERMISSION_CATEGORIES: "/identity/resources/permissions/v1/categories",
  USERS: "/identity/resources/users/v1",
  USERS_V2: "/identity/resources/users/v2",
  USERS_V3: "/identity/resources/users/v3",
  TENANT_ACCESS_TOKENS: "/identity/resources/tenants/access-tokens/v1",
  CLIENT_CREDENTIALS_TOKENS: "/identity/resources/tenants/api-tokens/v1",
  CREATE_CLIENT_CREDENTIALS_TOKEN: "/identity/resources/tenants/api-tokens/v2",
  USER_ACCESS_TOKENS: "/identity/resources/users/access-tokens/v1",
  USER_API_TOKENS: "/identity/resources/users/api-tokens/v1",
  GET_USERS_FOR_APPLICATION:
    "/identity/resources/applications/v1/{appId}/users",
  ASSIGN_USERS_TO_APPLICATION: "/identity/resources/applications/v1",
};

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

    // Special case for 204 No Content responses
    if (response.status === 204) {
      return {
        content: [
          {
            type: "text",
            text:
              customMessage || "Operation completed successfully (No Content).",
          },
        ],
      };
    }

    // Return properly formatted JSON data
    return {
      content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }],
    };
  } catch (error) {
    // Fallback for any unexpected errors
    return {
      content: [
        {
          type: "text",
          text:
            customMessage ||
            "Operation completed, but response could not be formatted.",
        },
      ],
    };
  }
}
