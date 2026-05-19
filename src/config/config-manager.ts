import { z } from 'zod';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load environment variables — ONLY from a .env file colocated with the MCP
// server itself, NOT from the cwd. When this MCP is launched by an IDE
// (Cursor, Claude Code, etc.) the cwd is the user's project folder, which
// may contain its own .env (e.g. one that `frontegg_apply_diff` just created
// with placeholder credentials for the iOS/Android app). Loading that would
// override the real MCP credentials passed in via the IDE's MCP config
// (`.cursor/mcp.json`). Filed bug: a user project's FRONTEGG_BASE_URL
// placeholder was overriding the working `api.frontegg.com` default and
// breaking every Management API call until the user restarted the MCP.
//
// Resolve to a .env file next to the compiled MCP source. If it doesn't
// exist, no env is loaded — env must come from the IDE's MCP server config.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mcpServerEnvPath = resolve(__dirname, '../../.env');
dotenv.config({ path: mcpServerEnvPath, override: false });

/**
 * Configuration schema using Zod for validation
 */
const ConfigSchema = z.object({
  frontegg: z.object({
    clientId: z.string().default(''),
    secret: z.string().default(''),
    baseUrl: z.string().default('https://api.frontegg.com'),
    authEndpoint: z.string().default('/auth/vendor'),
    supportEndpoint: z.string().default('/support/assistant'),
    // OAuth user-login flow (frontegg_login tool). These are NEW — they
    // are NOT the same as `clientId`/`secret` above (those are vendor
    // creds). `appClientId` is the public client ID of an Application
    // registered in the Frontegg portal; `subdomain` is the per-tenant
    // hostname prefix (e.g. "app-acme") used for the OAuth endpoints.
    // Both default to "" so the server still starts when they're absent;
    // the login tool itself reports a friendly error if it's invoked
    // without them.
    appClientId: z.string().default(''),
    subdomain: z.string().default(''),
  }),
  server: z.object({
    nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
    logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  }),
  cache: z.object({
    authTokenTtlSeconds: z.number().int().positive().default(3600),
  }),
  retry: z.object({
    maxAttempts: z.number().int().positive().default(3),
    delayMs: z.number().int().positive().default(1000),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Singleton configuration manager for the application
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;
  private readonly logger = Logger.getInstance();

  private constructor() {}

  /**
   * Get the singleton instance of ConfigManager
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfig(): Config {
    const rawConfig = {
      frontegg: {
        clientId: process.env.FRONTEGG_CLIENT_ID || '',
        secret: process.env.FRONTEGG_SECRET || '',
        baseUrl: process.env.FRONTEGG_BASE_URL || 'https://api.frontegg.com',
        authEndpoint: process.env.FRONTEGG_AUTH_ENDPOINT || '/auth/vendor',
        supportEndpoint: process.env.FRONTEGG_SUPPORT_ENDPOINT || '/support/assistant',
        appClientId: process.env.FRONTEGG_APP_CLIENT_ID || '',
        subdomain: process.env.FRONTEGG_SUBDOMAIN || '',
      },
      server: {
        nodeEnv: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'development',
        logLevel: process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug' || 'info',
      },
      cache: {
        authTokenTtlSeconds: parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || '3600', 10),
      },
      retry: {
        maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
        delayMs: parseInt(process.env.RETRY_DELAY_MS || '1000', 10),
      },
    };

    try {
      const validatedConfig = ConfigSchema.parse(rawConfig);
      this.logger.debug('Configuration loaded successfully', { 
        config: this.sanitizeConfig(validatedConfig) 
      });
      return validatedConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`);
      }
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  public getConfig(): Config {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  /**
   * Validate configuration on startup
   */
  public async validate(): Promise<void> {
    try {
      this.getConfig();
      this.logger.info('Configuration validation successful');
    } catch (error) {
      this.logger.error('Configuration validation failed', { error });
      throw error;
    }
  }

  /**
   * Reload configuration from environment
   */
  public reload(): void {
    this.config = null;
    this.config = this.loadConfig();
    this.logger.info('Configuration reloaded');
  }

  /**
   * Get specific configuration section
   */
  public get<K extends keyof Config>(section: K): Config[K] {
    return this.getConfig()[section];
  }

  /**
   * Sanitize configuration for logging (remove sensitive data)
   */
  private sanitizeConfig(config: Config): Record<string, unknown> {
    return {
      frontegg: {
        clientId: config.frontegg.clientId ? '***' : 'not set',
        secret: config.frontegg.secret ? '***' : 'not set',
        baseUrl: config.frontegg.baseUrl,
        authEndpoint: config.frontegg.authEndpoint,
        supportEndpoint: config.frontegg.supportEndpoint,
        appClientId: config.frontegg.appClientId ? '***' : 'not set',
        subdomain: config.frontegg.subdomain || 'not set',
      },
      server: config.server,
      retry: config.retry,
    };
  }

  /**
   * Check if running in production mode
   */
  public isProduction(): boolean {
    return this.getConfig().server.nodeEnv === 'production';
  }

  /**
   * Check if running in development mode
   */
  public isDevelopment(): boolean {
    return this.getConfig().server.nodeEnv === 'development';
  }

  /**
   * Check if running in test mode
   */
  public isTest(): boolean {
    return this.getConfig().server.nodeEnv === 'test';
  }

  /**
   * Public OAuth Application client ID (used by frontegg_login).
   * Empty string when not configured — caller is responsible for handling
   * the absence gracefully.
   */
  public getAppClientId(): string {
    return this.getConfig().frontegg.appClientId;
  }

  /**
   * Tenant subdomain (e.g. "app-acme") used for OAuth endpoints.
   * Empty string when not configured.
   */
  public getSubdomain(): string {
    return this.getConfig().frontegg.subdomain;
  }
}