/**
 * Centralized logger utility for the MCP tools
 * Can be configured to suppress logs when needed to prevent JSON parsing issues
 */

import pino from "pino";

// Define pino-pretty transport
const transport = pino.transport({
  target: "pino-pretty",
  options: { colorize: true, destination: 2 }, // destination: 2 is stderr
});

// Initialize pino logger
// Direct logs to stderr to avoid interfering with stdout communication
const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info", // Allow overriding log level via env var
  },
  transport // Always use the pretty transport
);

export const logger = {
  log: (message: string, ...args: any[]) => {
    // Map log to info for pino
    // Consider if a different level is more appropriate
    pinoLogger.info({ msg: message, details: args });
  },

  debug: (message: string, ...args: any[]) => {
    pinoLogger.debug({ msg: message, details: args });
  },

  error: (error: string | Error, ...args: any[]) => {
    // Pino handles Error objects well
    if (error instanceof Error) {
      pinoLogger.error({ err: error, details: args }, error.message);
    } else {
      pinoLogger.error({ msg: error, details: args });
    }
  },

  info: (message: string, ...args: any[]) => {
    pinoLogger.info({ msg: message, details: args });
  },

  warn: (message: string, ...args: any[]) => {
    pinoLogger.warn({ msg: message, details: args });
  },
};
