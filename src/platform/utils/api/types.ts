/**
 * Type definitions for Frontegg API interactions
 */

// Define the response content type for tools
export type ToolResponseContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

// Generic API response structure
export type ApiResponse<T> = {
  success: boolean;
  status: number;
  statusText: string;
  data: T | null;
  error?: any;
};
