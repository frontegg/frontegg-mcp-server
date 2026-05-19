import axios, { AxiosInstance, AxiosError } from 'axios';
import NodeCache from 'node-cache';
import pRetry from 'p-retry';
import { ConfigManager } from '../config/config-manager.js';
import { Logger } from '../utils/logger.js';
import { AuthenticationError, NetworkError } from '../utils/errors.js';

/**
 * Interface for authentication response from Frontegg
 */
interface AuthResponse {
  token: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Interface for cached token data
 */
interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Service responsible for authenticating with Frontegg API
 * Implements token caching and automatic retry logic
 */
export class FronteggAuthService {
  private static instance: FronteggAuthService;
  private readonly config = ConfigManager.getInstance();
  private readonly logger = Logger.getInstance();
  private readonly axiosInstance: AxiosInstance;
  private readonly tokenCache: NodeCache;
  private readonly cacheKey = 'frontegg_auth_token';

  private constructor() {
    const fronteggConfig = this.config.get('frontegg');
    // const retryConfig = this.config.get('retry'); // TODO: Use for retry configuration
    const cacheConfig = this.config.get('cache');

    // Initialize axios instance with base configuration
    this.axiosInstance = axios.create({
      baseURL: fronteggConfig.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Initialize token cache
    this.tokenCache = new NodeCache({
      stdTTL: cacheConfig.authTokenTtlSeconds,
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false,
    });

    // Set up request interceptor for logging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.logger.debug('Making request to Frontegg', {
          method: config.method,
          url: config.url,
          headers: this.sanitizeHeaders(config.headers),
        });
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', { error });
        return Promise.reject(error);
      }
    );

    // Set up response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug('Received response from Frontegg', {
          status: response.status,
          statusText: response.statusText,
        });
        return response;
      },
      (error: AxiosError) => {
        this.handleAxiosError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the singleton instance of FronteggAuthService
   */
  public static getInstance(): FronteggAuthService {
    if (!FronteggAuthService.instance) {
      FronteggAuthService.instance = new FronteggAuthService();
    }
    return FronteggAuthService.instance;
  }

  /**
   * Authenticate with Frontegg and get access token
   * Uses caching to minimize API calls
   */
  public async getAccessToken(): Promise<string> {
    // Check cache first
    const cachedToken = this.getCachedToken();
    if (cachedToken) {
      this.logger.debug('Using cached authentication token');
      return cachedToken;
    }

    // If no cached token, authenticate
    this.logger.info('Authenticating with Frontegg API');
    const token = await this.authenticate();
    return token;
  }

  /**
   * Force re-authentication, bypassing cache
   */
  public async refreshToken(): Promise<string> {
    this.logger.info('Force refreshing authentication token');
    this.clearCache();
    return await this.authenticate();
  }

  /**
   * Clear the authentication token cache
   */
  public clearCache(): void {
    this.tokenCache.del(this.cacheKey);
    this.logger.debug('Authentication cache cleared');
  }

  /**
   * Perform authentication with Frontegg
   */
  private async authenticate(): Promise<string> {
    const fronteggConfig = this.config.get('frontegg');
    const retryConfig = this.config.get('retry');

    try {
      const response = await pRetry(
        async () => {
          const result = await this.axiosInstance.post<AuthResponse>(fronteggConfig.authEndpoint, {
            clientId: fronteggConfig.clientId,
            secret: fronteggConfig.secret,
          });
          return result;
        },
        {
          retries: retryConfig.maxAttempts,
          minTimeout: retryConfig.delayMs,
          maxTimeout: retryConfig.delayMs * 10,
          onFailedAttempt: (error) => {
            this.logger.warn(`Authentication attempt ${error.attemptNumber} failed. Retrying...`, {
              retriesLeft: error.retriesLeft,
              error: error.message,
            });
          },
        }
      );

      const { token, expiresIn } = response.data;

      // Cache the token
      this.cacheToken(token, expiresIn);

      this.logger.info('Successfully authenticated with Frontegg');
      return token;
    } catch (error) {
      this.logger.error('Failed to authenticate with Frontegg', { error });

      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw new AuthenticationError(
            'Invalid Frontegg credentials. Please check your client ID and secret.',
            error.response.status
          );
        }

        throw new NetworkError(
          `Failed to connect to Frontegg API: ${error.message}`,
          error.response?.status
        );
      }

      throw error;
    }
  }

  /**
   * Cache the authentication token
   */
  private cacheToken(token: string, expiresIn: number): void {
    // Calculate expiration time (subtract 60 seconds for safety margin)
    const expiresAt = Date.now() + (expiresIn - 60) * 1000;

    const tokenData: CachedToken = {
      token,
      expiresAt,
    };

    // Store in cache with TTL
    const ttl = Math.max(1, expiresIn - 60);
    this.tokenCache.set(this.cacheKey, tokenData, ttl);

    this.logger.debug('Token cached successfully', {
      expiresIn: `${ttl} seconds`,
    });
  }

  /**
   * Get token from cache if valid
   */
  private getCachedToken(): string | null {
    const cachedData = this.tokenCache.get<CachedToken>(this.cacheKey);

    if (!cachedData) {
      return null;
    }

    // Check if token is still valid
    if (Date.now() >= cachedData.expiresAt) {
      this.logger.debug('Cached token has expired');
      this.tokenCache.del(this.cacheKey);
      return null;
    }

    return cachedData.token;
  }

  /**
   * Handle axios errors
   */
  private handleAxiosError(error: AxiosError): void {
    if (error.response) {
      // Server responded with error
      this.logger.error('Frontegg API error response', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    } else if (error.request) {
      // Request made but no response
      this.logger.error('No response from Frontegg API', {
        message: error.message,
      });
    } else {
      // Error in request setup
      this.logger.error('Error setting up request to Frontegg', {
        message: error.message,
      });
    }
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized = { ...headers };

    // Remove or mask sensitive headers
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer ***';
    }
    if (sanitized['x-api-key']) {
      sanitized['x-api-key'] = '***';
    }

    return sanitized;
  }

  /**
   * Check if service is healthy
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      this.logger.error('Health check failed for auth service', { error });
      return false;
    }
  }
}
