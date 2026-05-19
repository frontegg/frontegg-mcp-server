import axios, { AxiosInstance, AxiosError } from 'axios';
import pRetry from 'p-retry';
import { z } from 'zod';
import { ConfigManager } from '../config/config-manager.js';
import { Logger } from '../utils/logger.js';
import { FronteggAuthService } from './frontegg-auth.service.js';
import { FronteggAPIError, NetworkError, ValidationError } from '../utils/errors.js';

/**
 * Schema for support assistant request
 */
const SupportRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(4000, 'Prompt is too long'),
  context: z
    .object({
      integrationStage: z.enum(['planning', 'implementation', 'testing', 'production']).optional(),
      technology: z.string().optional(),
      errorMessage: z.string().optional(),
      previousAttempts: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Schema for support assistant response
 */
const SupportResponseSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      category: z.enum([
        'configuration',
        'authentication',
        'api',
        'frontend',
        'backend',
        'debugging',
        'documentation',
      ]),
      estimatedTime: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      resources: z
        .array(
          z.object({
            type: z.enum(['documentation', 'example', 'api-reference', 'video']),
            url: z.string().url(),
            title: z.string(),
          })
        )
        .optional(),
    })
  ),
  summary: z.string(),
  additionalNotes: z.string().optional(),
  requestId: z.string(),
});

export type SupportRequest = z.infer<typeof SupportRequestSchema>;
export type SupportResponse = z.infer<typeof SupportResponseSchema>;
export type Task = SupportResponse['tasks'][0];

/**
 * Service for interacting with Frontegg Support Assistant API
 */
export class SupportAssistantService {
  private static instance: SupportAssistantService;
  private readonly config = ConfigManager.getInstance();
  private readonly logger = Logger.getInstance();
  private readonly authService = FronteggAuthService.getInstance();
  private readonly axiosInstance: AxiosInstance;

  private constructor() {
    const fronteggConfig = this.config.get('frontegg');

    // Initialize axios instance
    this.axiosInstance = axios.create({
      baseURL: fronteggConfig.baseUrl,
      timeout: 60000, // 60 seconds for AI responses
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Frontegg-Support-MCP/1.0.0',
      },
    });

    // Request interceptor to add authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const token = await this.authService.getAccessToken();
          config.headers.Authorization = `Bearer ${token}`;

          this.logger.debug('Support API request prepared', {
            method: config.method,
            url: config.url,
            hasAuth: !!config.headers.Authorization,
          });

          return config;
        } catch (error) {
          this.logger.error('Failed to add authentication to request', { error });
          throw error;
        }
      },
      (error) => {
        this.logger.error('Request interceptor error', { error });
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug('Support API response received', {
          status: response.status,
          requestId: response.headers['x-request-id'],
        });
        return response;
      },
      async (error: AxiosError) => {
        // Handle 401 errors by refreshing token
        if (error.response?.status === 401) {
          this.logger.warn('Received 401, attempting to refresh token');
          try {
            await this.authService.refreshToken();
            // Retry the original request
            const originalRequest = error.config;
            if (originalRequest) {
              const token = await this.authService.getAccessToken();
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.axiosInstance(originalRequest);
            }
          } catch (refreshError) {
            this.logger.error('Failed to refresh token', { error: refreshError });
          }
        }

        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): SupportAssistantService {
    if (!SupportAssistantService.instance) {
      SupportAssistantService.instance = new SupportAssistantService();
    }
    return SupportAssistantService.instance;
  }

  /**
   * Send a support request to the Frontegg Assistant API
   */
  public async getSupportAssistance(request: SupportRequest): Promise<SupportResponse> {
    this.logger.info('Processing support assistance request', {
      promptLength: request.prompt.length,
      hasContext: !!request.context,
    });

    // Validate request
    try {
      SupportRequestSchema.parse(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationErrors: Record<string, string[]> = {};
        error.errors.forEach((err) => {
          const path = err.path.join('.');
          if (!validationErrors[path]) {
            validationErrors[path] = [];
          }
          validationErrors[path].push(err.message);
        });
        throw new ValidationError('Invalid support request', validationErrors);
      }
      throw error;
    }

    const fronteggConfig = this.config.get('frontegg');
    const retryConfig = this.config.get('retry');

    try {
      const response = await pRetry(
        async () => {
          const result = await this.axiosInstance.post<SupportResponse>(
            fronteggConfig.supportEndpoint,
            request,
            {
              headers: {
                'X-Request-Context': JSON.stringify({
                  source: 'mcp-server',
                  version: '1.0.0',
                  timestamp: new Date().toISOString(),
                }),
              },
            }
          );
          return result;
        },
        {
          retries: retryConfig.maxAttempts,
          minTimeout: retryConfig.delayMs,
          maxTimeout: retryConfig.delayMs * 10,
          onFailedAttempt: (error) => {
            this.logger.warn(`Support API attempt ${error.attemptNumber} failed. Retrying...`, {
              retriesLeft: error.retriesLeft,
              error: error.message,
            });
          },
        }
      );

      // Validate response
      const validatedResponse = SupportResponseSchema.parse(response.data);

      this.logger.info('Support assistance response received', {
        requestId: validatedResponse.requestId,
        taskCount: validatedResponse.tasks.length,
      });

      return validatedResponse;
    } catch (error) {
      this.logger.error('Failed to get support assistance', { error });

      if (error instanceof z.ZodError) {
        throw new FronteggAPIError(
          'Invalid response format from Frontegg Support API',
          500,
          error.errors
        );
      }

      throw error;
    }
  }

  /**
   * Format tasks for display with Cursor-specific actionable items
   */
  public formatTasksForDisplay(response: SupportResponse): string {
    const lines: string[] = [];

    lines.push(`# 🛠️ Frontegg Integration Action Plan`);
    lines.push(`\n${response.summary}\n`);

    if (response.tasks.length > 0) {
      lines.push(`## 🎯 CURSOR ACTION ITEMS (${response.tasks.length} tasks)\n`);

      // Group tasks by priority
      const tasksByPriority = this.groupTasksByPriority(response.tasks);

      ['critical', 'high', 'medium', 'low'].forEach((priority) => {
        const tasks = tasksByPriority[priority as keyof typeof tasksByPriority];
        if (tasks && tasks.length > 0) {
          const emoji =
            priority === 'critical'
              ? '🚨'
              : priority === 'high'
                ? '⚠️'
                : priority === 'medium'
                  ? '📋'
                  : '💡';
          lines.push(`### ${emoji} ${priority.toUpperCase()} Priority\n`);

          tasks.forEach((task, index) => {
            lines.push(`#### Task ${index + 1}: ${task.title} [${task.category}]`);
            lines.push(`**Description**: ${task.description}\n`);

            // Add Cursor-specific instructions
            lines.push(`**🎯 Cursor Instructions**:`);
            const cursorInstructions = this.generateCursorInstructions(task);
            cursorInstructions.forEach((instruction, idx) => {
              lines.push(`${idx + 1}. ${instruction}`);
            });
            lines.push('');

            // Add code examples if available
            const codeExample = this.generateCodeExample(task);
            if (codeExample) {
              lines.push(`**💻 Code Example**:`);
              lines.push('```typescript');
              lines.push(codeExample);
              lines.push('```\n');
            }

            // Add validation steps
            const validationSteps = this.generateValidationSteps(task);
            if (validationSteps.length > 0) {
              lines.push(`**✅ Validation Steps**:`);
              validationSteps.forEach((step, idx) => {
                lines.push(`${idx + 1}. ${step}`);
              });
              lines.push('');
            }

            if (task.estimatedTime) {
              lines.push(`⏱️ **Estimated time**: ${task.estimatedTime}`);
            }

            if (task.dependencies && task.dependencies.length > 0) {
              lines.push(`📋 **Dependencies**: ${task.dependencies.join(', ')}`);
            }

            if (task.resources && task.resources.length > 0) {
              lines.push(`📚 **Resources**:`);
              task.resources.forEach((resource) => {
                lines.push(`   - [${resource.title}](${resource.url}) (${resource.type})`);
              });
            }

            lines.push('\n---\n');
          });
        }
      });
    }

    if (response.additionalNotes) {
      lines.push(`## 📝 Additional Notes\n`);
      lines.push(response.additionalNotes);
      lines.push('');
    }

    lines.push(`## 🔄 Next Steps After Completing Tasks`);
    lines.push(
      `1. **Test your integration** - Run your application and verify Frontegg functionality`
    );
    lines.push(`2. **Check for errors** - Monitor browser console and server logs`);
    lines.push(`3. **Run validation** - Use the validation steps provided above`);
    lines.push(`4. **Update documentation** - Document any configuration changes made`);
    lines.push('');

    lines.push(`---`);
    lines.push(`📋 **Request ID**: ${response.requestId}`);
    lines.push(`🤖 **Generated by**: Frontegg Mobile MCP Server`);

    return lines.join('\n');
  }

  /**
   * Generate Cursor-specific instructions based on task category
   */
  private generateCursorInstructions(task: Task): string[] {
    const instructions: string[] = [];

    switch (task.category) {
      case 'configuration':
        instructions.push('📁 **Open/Create** the configuration file mentioned in the description');
        instructions.push('✏️ **Add/Update** the configuration values as specified');
        instructions.push('💾 **Save** the file and ensure proper formatting');
        break;

      case 'authentication':
        instructions.push(
          '🔍 **Locate** authentication-related files (usually in src/auth/ or src/hooks/)'
        );
        instructions.push('🔐 **Update** authentication logic as described');
        instructions.push('🧪 **Test** login/logout functionality');
        break;

      case 'api':
        instructions.push('📡 **Find** API service files or HTTP client setup');
        instructions.push('🔧 **Modify** API calls according to the guidance');
        instructions.push('📊 **Test** API endpoints using browser dev tools');
        break;

      case 'frontend':
        instructions.push('🎨 **Locate** React/Vue/Angular components mentioned');
        instructions.push('⚛️ **Update** component code as specified');
        instructions.push('🖥️ **Test** UI changes in the browser');
        break;

      case 'backend':
        instructions.push('🖥️ **Find** server-side files (routes, middleware, controllers)');
        instructions.push('🔧 **Implement** backend changes as described');
        instructions.push('🧪 **Test** API endpoints using a tool like Postman');
        break;

      case 'debugging':
        instructions.push('🐛 **Add** console.log or debugger statements as suggested');
        instructions.push('🔍 **Check** browser console and network tab');
        instructions.push('📋 **Document** findings and error patterns');
        break;

      case 'documentation':
        instructions.push('📝 **Create/Update** documentation files');
        instructions.push('📚 **Add** code comments where necessary');
        instructions.push('✅ **Review** and verify documentation accuracy');
        break;

      default:
        instructions.push('📋 **Follow** the specific guidance provided in the task description');
        instructions.push('🧪 **Test** your changes thoroughly');
        instructions.push('📝 **Document** any modifications made');
    }

    return instructions;
  }

  /**
   * Generate code examples based on task category and description
   */
  private generateCodeExample(task: Task): string | null {
    // This would be enhanced with actual code generation logic
    // For now, providing common patterns based on category

    switch (task.category) {
      case 'configuration':
        if (task.title.toLowerCase().includes('environment')) {
          return `// .env file
FRONTEGG_APP_ID=your-app-id-here
FRONTEGG_BASE_URL=https://app-your-subdomain.frontegg.com
FRONTEGG_CLIENT_ID=your-client-id

// src/config/frontegg.config.ts
export const fronteggConfig = {
  appId: process.env.FRONTEGG_APP_ID!,
  baseUrl: process.env.FRONTEGG_BASE_URL!,
  clientId: process.env.FRONTEGG_CLIENT_ID!,
};`;
        }
        break;

      case 'authentication':
        return `// Example: Secure token handling
import { useFrontegg } from '@frontegg/react';

export const useSecureAuth = () => {
  const { user, isAuthenticated, getAccessToken } = useFrontegg();
  
  const getToken = async () => {
    try {
      const token = await getAccessToken();
      // Use secure storage instead of localStorage
      return token;
    } catch (error) {
      console.error('Failed to get access token:', error);
      throw error;
    }
  };
  
  return { user, isAuthenticated, getToken };
};`;

      case 'api':
        return `// Example: API client with error handling
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.FRONTEGG_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);`;

      default:
        return null;
    }

    return null;
  }

  /**
   * Generate validation steps for tasks
   */
  private generateValidationSteps(task: Task): string[] {
    const steps: string[] = [];

    switch (task.category) {
      case 'configuration':
        steps.push('🔍 **Check** that all environment variables are set correctly');
        steps.push('🏗️ **Run** `npm run build` to ensure no build errors');
        steps.push('🚀 **Start** your application and verify it loads');
        break;

      case 'authentication':
        steps.push('🔐 **Test** user login functionality');
        steps.push('🚪 **Test** user logout functionality');
        steps.push('🛡️ **Verify** protected routes work correctly');
        break;

      case 'api':
        steps.push('📡 **Test** API endpoints in browser dev tools');
        steps.push('📊 **Check** network tab for successful responses');
        steps.push('⚠️ **Verify** error handling works as expected');
        break;

      case 'frontend':
        steps.push('🎨 **Check** UI renders correctly');
        steps.push('🖱️ **Test** user interactions and events');
        steps.push('📱 **Verify** responsiveness on different screen sizes');
        break;

      case 'backend':
        steps.push('🧪 **Test** API endpoints using Postman or curl');
        steps.push('📋 **Check** server logs for errors');
        steps.push('🔍 **Verify** database operations if applicable');
        break;

      default:
        steps.push('✅ **Verify** the task requirements are met');
        steps.push('🧪 **Test** the functionality thoroughly');
    }

    return steps;
  }

  /**
   * Group tasks by priority
   */
  private groupTasksByPriority(tasks: Task[]): Record<string, Task[]> {
    return tasks.reduce(
      (acc, task) => {
        (acc[task.priority] ||= []).push(task);
        return acc;
      },
      {} as Record<string, Task[]>
    );
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: AxiosError): void {
    const requestId = error.response?.headers['x-request-id'] as string | undefined;

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      this.logger.error('Frontegg Support API error', {
        status,
        data,
        requestId,
      });

      let message = 'Frontegg Support API error';
      if (typeof data === 'object' && data !== null && 'message' in data) {
        message = (data as any).message;
      }

      throw new FronteggAPIError(message, status, data, requestId);
    } else if (error.request) {
      this.logger.error('No response from Frontegg Support API', {
        message: error.message,
      });
      throw new NetworkError('No response from Frontegg Support API', 503);
    } else {
      this.logger.error('Error setting up request to Frontegg Support API', {
        message: error.message,
      });
      throw new NetworkError(`Failed to setup request: ${error.message}`, 500);
    }
  }

  /**
   * Health check for the service
   */
  public async healthCheck(): Promise<boolean> {
    try {
      // Try to get a token to verify auth is working
      const token = await this.authService.getAccessToken();
      return !!token;
    } catch (error) {
      this.logger.error('Support Assistant service health check failed', { error });
      return false;
    }
  }
}
