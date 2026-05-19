import { Logger } from './logger.js';
import { ConfigManager } from '../config/config-manager.js';
import { FronteggAuthService } from '../services/frontegg-auth.service.js';

/**
 * Health status for individual components
 */
interface ComponentHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  checkTime: number;
  metadata?: Record<string, unknown>;
}

/**
 * Overall health status
 */
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  components: ComponentHealth[];
  version: string;
  environment: string;
}

/**
 * Health check service for monitoring application health
 */
export class HealthCheck {
  private readonly logger = Logger.getInstance();
  private readonly config = ConfigManager.getInstance();
  private readonly startTime = Date.now();

  /**
   * Perform all health checks
   */
  public async checkHealth(): Promise<HealthStatus> {
    this.logger.debug('Starting health check');
    
    const components: ComponentHealth[] = [];
    
    // Check configuration
    components.push(await this.checkConfiguration());
    
    // Check authentication service
    components.push(await this.checkAuthService());
    
    // Check external connectivity
    components.push(await this.checkExternalConnectivity());
    
    // Determine overall status
    const overallStatus = this.determineOverallStatus(components);
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      components,
      version: '1.0.0',
      environment: this.config.get('server').nodeEnv,
    };
    
    this.logger.debug('Health check completed', { status: overallStatus });
    
    return healthStatus;
  }

  /**
   * Perform startup health checks
   */
  public async performStartupChecks(): Promise<void> {
    this.logger.info('Performing startup health checks');
    
    const requiredChecks: Array<{
      name: string;
      check: () => Promise<boolean>;
    }> = [
      {
        name: 'Configuration',
        check: async () => {
          try {
            this.config.validate();
            return true;
          } catch {
            return false;
          }
        },
      },
    ];
    
    const results = await Promise.all(
      requiredChecks.map(async ({ name, check }) => {
        const passed = await check();
        if (!passed) {
          this.logger.error(`Startup check failed: ${name}`);
        } else {
          this.logger.info(`Startup check passed: ${name}`);
        }
        return { name, passed };
      })
    );
    
    const allPassed = results.every(r => r.passed);
    
    if (!allPassed) {
      const failed = results.filter(r => !r.passed).map(r => r.name);
      throw new Error(`Startup checks failed: ${failed.join(', ')}`);
    }
    
    this.logger.info('All startup health checks passed');
  }

  /**
   * Check configuration health
   */
  private async checkConfiguration(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      await this.config.validate();
      const fronteggConfig = this.config.get('frontegg');
      
      return {
        name: 'configuration',
        status: 'healthy',
        message: 'Configuration is valid',
        checkTime: Date.now() - startTime,
        metadata: {
          hasClientId: !!fronteggConfig.clientId,
          hasSecret: !!fronteggConfig.secret,
          baseUrl: fronteggConfig.baseUrl,
        },
      };
    } catch (error) {
      return {
        name: 'configuration',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Configuration check failed',
        checkTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check authentication service health
   */
  private async checkAuthService(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const authService = FronteggAuthService.getInstance();
      const isHealthy = await authService.healthCheck();
      
      if (isHealthy) {
        return {
          name: 'authentication',
          status: 'healthy',
          message: 'Authentication service is operational',
          checkTime: Date.now() - startTime,
        };
      } else {
        return {
          name: 'authentication',
          status: 'degraded',
          message: 'Authentication service is experiencing issues',
          checkTime: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        name: 'authentication',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Authentication check failed',
        checkTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Check external connectivity
   */
  private async checkExternalConnectivity(): Promise<ComponentHealth> {
    const startTime = Date.now();
    
    try {
      const fronteggConfig = this.config.get('frontegg');
      const url = new URL(fronteggConfig.baseUrl);
      
      // Simple DNS check
      const { resolve4 } = await import('dns').then(m => m.promises);
      await resolve4(url.hostname);
      
      return {
        name: 'external_connectivity',
        status: 'healthy',
        message: 'External connectivity is available',
        checkTime: Date.now() - startTime,
        metadata: {
          host: url.hostname,
        },
      };
    } catch (error) {
      return {
        name: 'external_connectivity',
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'External connectivity check failed',
        checkTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Determine overall health status based on component health
   */
  private determineOverallStatus(components: ComponentHealth[]): 'healthy' | 'unhealthy' | 'degraded' {
    const hasUnhealthy = components.some(c => c.status === 'unhealthy');
    const hasDegraded = components.some(c => c.status === 'degraded');
    
    if (hasUnhealthy) {
      return 'unhealthy';
    }
    
    if (hasDegraded) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Get system information
   */
  public getSystemInfo(): Record<string, unknown> {
    return {
      platform: process.platform,
      nodeVersion: process.version,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid,
      cwd: process.cwd(),
    };
  }

  /**
   * Create a liveness probe response
   */
  public getLivenessProbe(): { alive: boolean; timestamp: string } {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a readiness probe response
   */
  public async getReadinessProbe(): Promise<{ 
    ready: boolean; 
    timestamp: string; 
    checks: Record<string, boolean> 
  }> {
    const checks: Record<string, boolean> = {};
    
    // Check if configuration is valid
    try {
      await this.config.validate();
      checks.configuration = true;
    } catch {
      checks.configuration = false;
    }
    
    // Check if auth service is available
    try {
      const authService = FronteggAuthService.getInstance();
      checks.authentication = await authService.healthCheck();
    } catch {
      checks.authentication = false;
    }
    
    const ready = Object.values(checks).every(check => check === true);
    
    return {
      ready,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}