import winston from 'winston';
import path from 'path';
import { getLogsDir } from './module-paths.js';

// All cross-runtime (ESM / CJS-under-ts-jest) path resolution lives in
// `module-paths.ts` now. Both logger.ts and config-manager.ts go through
// the same helper so the approach is consistent.
const LOGS_DIR = getLogsDir();

/**
 * Custom log format for better readability
 */
const customFormat = winston.format.printf(({ timestamp, level, message, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    // Filter out internal winston properties
    const cleanMetadata = Object.entries(metadata)
      .filter(([key]) => !key.startsWith('Symbol'))
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(cleanMetadata).length > 0) {
      msg += ` ${JSON.stringify(cleanMetadata, null, 2)}`;
    }
  }
  
  return msg;
});

/**
 * Singleton logger instance for the application
 */
export class Logger {
  private static instance: winston.Logger;

  private constructor() {}

  /**
   * Get the singleton logger instance
   */
  public static getInstance(): winston.Logger {
    if (!Logger.instance) {
      Logger.instance = Logger.createLogger();
    }
    return Logger.instance;
  }

  /**
   * Create and configure the winston logger
   */
  private static createLogger(): winston.Logger {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProduction = nodeEnv === 'production';

    const transports: winston.transport[] = [];

    // Console transport for all environments
    transports.push(
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'],
        format: winston.format.combine(
          winston.format.colorize({ all: !isProduction }),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.errors({ stack: true }),
          isProduction ? winston.format.json() : customFormat
        ),
      })
    );

    // File transport for production
    if (isProduction) {
      // Error log file
      transports.push(
        new winston.transports.File({
          filename: path.join(LOGS_DIR, 'error.log'),
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: path.join(LOGS_DIR, 'combined.log'),
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
          ),
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        })
      );
    }

    return winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: 'frontegg-support-mcp' },
      transports,
      // Don't exit on handled exceptions
      exitOnError: false,
    });
  }

  /**
   * Create a child logger with additional context
   */
  public static createChildLogger(context: Record<string, unknown>): winston.Logger {
    return Logger.getInstance().child(context);
  }

  /**
   * Log method execution time
   */
  public static async logExecutionTime<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const logger = Logger.getInstance();
    const startTime = Date.now();
    
    try {
      logger.debug(`Starting operation: ${operation}`);
      const result = await fn();
      const duration = Date.now() - startTime;
      logger.info(`Operation completed: ${operation}`, { duration: `${duration}ms` });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Operation failed: ${operation}`, { 
        duration: `${duration}ms`, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}