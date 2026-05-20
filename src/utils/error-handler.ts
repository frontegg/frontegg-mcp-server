import { Logger } from './logger.js';
import { BaseError, isOperationalError } from './errors.js';

/**
 * Centralized error handler for the application
 */
export class ErrorHandler {
  private readonly logger = Logger.getInstance();

  /**
   * Handle errors and decide whether to crash the application
   */
  public handleError(error: unknown): void {
    this.logger.error('Error handled by central error handler', {
      error: this.formatError(error),
    });

    if (!isOperationalError(error)) {
      this.handleCriticalError(error);
    }
  }

  /**
   * Handle critical errors that should crash the application
   */
  private handleCriticalError(error: unknown): void {
    this.logger.error('CRITICAL ERROR - Application will terminate', {
      error: this.formatError(error),
    });

    // Perform cleanup if necessary
    this.performCleanup();

    // Exit the process
    process.exit(1);
  }

  /**
   * Format error for logging
   */
  public formatError(error: unknown): Record<string, unknown> {
    if (error instanceof BaseError) {
      return error.toJSON();
    }

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (typeof error === 'object' && error !== null) {
      return {
        type: 'object',
        value: JSON.stringify(error),
      };
    }

    return {
      type: typeof error,
      value: String(error),
    };
  }

  /**
   * Setup process-level error handlers
   */
  public setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught Exception', {
        error: this.formatError(error),
      });
      this.handleCriticalError(error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      this.logger.error('Unhandled Promise Rejection', {
        reason: this.formatError(reason),
        promise: promise.toString(),
      });
      this.handleCriticalError(reason);
    });

    // Handle warnings
    process.on('warning', (warning: Error) => {
      this.logger.warn('Process Warning', {
        warning: this.formatError(warning),
      });
    });

    // Graceful shutdown on SIGTERM
    process.on('SIGTERM', () => {
      this.logger.info('SIGTERM received, initiating graceful shutdown');
      this.gracefulShutdown();
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      this.logger.info('SIGINT received, initiating graceful shutdown');
      this.gracefulShutdown();
    });

    this.logger.info('Process error handlers configured');
  }

  /**
   * Perform graceful shutdown
   */
  private async gracefulShutdown(): Promise<void> {
    try {
      this.logger.info('Starting graceful shutdown...');

      // Set a timeout for graceful shutdown
      const shutdownTimeout = setTimeout(() => {
        this.logger.error('Graceful shutdown timeout exceeded, forcing exit');
        process.exit(1);
      }, 10000); // 10 seconds timeout

      // Perform cleanup
      await this.performCleanup();

      // Clear the timeout
      clearTimeout(shutdownTimeout);

      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', {
        error: this.formatError(error),
      });
      process.exit(1);
    }
  }

  /**
   * Perform cleanup operations
   */
  private performCleanup(): void {
    try {
      this.logger.info('Performing cleanup operations...');
      
      // Add any cleanup operations here
      // For example: close database connections, save state, etc.
      
      this.logger.info('Cleanup operations completed');
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: this.formatError(error),
      });
    }
  }

  /**
   * Create an error response for API errors
   */
  public createErrorResponse(error: unknown): {
    error: {
      message: string;
      code?: string;
      statusCode: number;
      timestamp: string;
      requestId?: string;
    };
  } {
    const timestamp = new Date().toISOString();
    
    if (error instanceof BaseError) {
      return {
        error: {
          message: error.message,
          code: error.name,
          statusCode: error.statusCode,
          timestamp,
        },
      };
    }

    if (error instanceof Error) {
      return {
        error: {
          message: error.message,
          code: 'INTERNAL_ERROR',
          statusCode: 500,
          timestamp,
        },
      };
    }

    return {
      error: {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR',
        statusCode: 500,
        timestamp,
      },
    };
  }

  /**
   * Log error with context
   */
  public logError(error: unknown, context?: Record<string, unknown>): void {
    const errorDetails = this.formatError(error);
    
    if (isOperationalError(error)) {
      this.logger.warn('Operational error occurred', {
        ...errorDetails,
        context,
      });
    } else {
      this.logger.error('Unexpected error occurred', {
        ...errorDetails,
        context,
      });
    }
  }
}