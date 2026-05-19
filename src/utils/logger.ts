import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve this module's directory in a way that works under both:
//   - ESM runtime (Node loads `dist/utils/logger.js` as ESM in production)
//   - CommonJS-style transpilation (ts-jest's default transformer emits
//     CJS, and the TS compiler rejects bare `import.meta` under
//     `module: commonjs`).
//
// `resolveModuleDir()` deliberately hides `import.meta` behind a Function
// constructor so the TS compiler doesn't see it at type-check time. The
// expression returns `undefined` when invoked under CJS (where
// `import.meta` is genuinely unavailable), and the URL string otherwise.
// Falls back to `process.cwd()` when ESM-resolution fails.
//
// We use `MODULE_DIR` rather than the conventional `__dirname` to avoid
// colliding with the CJS-injected `__dirname` global when this file is
// loaded under ts-jest's CommonJS-style transform.
const MODULE_DIR = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const getMetaUrl = new Function('try { return import.meta.url; } catch { return undefined; }');
    const url = getMetaUrl() as string | undefined;
    if (url) return path.dirname(fileURLToPath(url));
  } catch {
    /* fallthrough */
  }
  return process.cwd();
})();

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
          filename: path.join(MODULE_DIR, '../../logs/error.log'),
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
          filename: path.join(MODULE_DIR, '../../logs/combined.log'),
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