/**
 * Base error class for all custom errors in the application
 */
export class BaseError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends BaseError {
  constructor(message: string = 'Authentication failed', statusCode: number = 401) {
    super(message, statusCode, true);
  }
}

/**
 * Error thrown when authorization fails
 */
export class AuthorizationError extends BaseError {
  constructor(message: string = 'Unauthorized access', statusCode: number = 403) {
    super(message, statusCode, true);
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends BaseError {
  constructor(message: string = 'Resource not found', statusCode: number = 404) {
    super(message, statusCode, true);
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends BaseError {
  public readonly errors: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    errors: Record<string, string[]> = {},
    statusCode: number = 400
  ) {
    super(message, statusCode, true);
    this.errors = errors;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

/**
 * Error thrown when there's a network issue
 */
export class NetworkError extends BaseError {
  public readonly endpoint?: string;
  public readonly method?: string;

  constructor(
    message: string = 'Network error occurred',
    statusCode: number = 503,
    endpoint?: string,
    method?: string
  ) {
    super(message, statusCode, true);
    this.endpoint = endpoint;
    this.method = method;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      endpoint: this.endpoint,
      method: this.method,
    };
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends BaseError {
  public readonly retryAfter?: number;
  public readonly limit?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    limit?: number
  ) {
    super(message, 429, true);
    this.retryAfter = retryAfter;
    this.limit = limit;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      limit: this.limit,
    };
  }
}

/**
 * Error thrown when a timeout occurs
 */
export class TimeoutError extends BaseError {
  public readonly timeout: number;

  constructor(message: string = 'Operation timed out', timeout: number) {
    super(message, 408, true);
    this.timeout = timeout;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeout: this.timeout,
    };
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends BaseError {
  public readonly configKey?: string;

  constructor(message: string, configKey?: string) {
    super(message, 500, false);
    this.configKey = configKey;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
    };
  }
}

/**
 * Error thrown when Frontegg API returns an error
 */
export class FronteggAPIError extends BaseError {
  public readonly apiResponse?: unknown;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    apiResponse?: unknown,
    requestId?: string
  ) {
    super(message, statusCode, true);
    this.apiResponse = apiResponse;
    this.requestId = requestId;
  }

  public toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      apiResponse: this.apiResponse,
      requestId: this.requestId,
    };
  }
}

/**
 * Type guard to check if an error is operational
 */
export function isOperationalError(error: unknown): error is BaseError {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Convert unknown error to BaseError
 */
export function normalizeError(error: unknown): BaseError {
  if (error instanceof BaseError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new BaseError(error.message, 500, false);
  }
  
  if (typeof error === 'string') {
    return new BaseError(error, 500, false);
  }
  
  return new BaseError('An unknown error occurred', 500, false);
}