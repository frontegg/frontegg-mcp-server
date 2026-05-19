import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';
import { SupportAssistantService, SupportRequest } from '../services/support-assistant.service.js';
import { normalizeError } from '../utils/errors.js';
import { withPreamble } from '../prompts/tool-preambles.js';

/**
 * Schema for the Frontegg support tool arguments
 */
const FronteggSupportArgsSchema = z.object({
  prompt: z.string().describe('Description of the Frontegg integration issue or question'),
  integrationStage: z
    .enum(['planning', 'implementation', 'testing', 'production'])
    .optional()
    .describe('Current stage of the integration process'),
  technology: z
    .string()
    .optional()
    .describe('Technology stack being used (e.g., React, Node.js, Python)'),
  errorMessage: z.string().optional().describe('Specific error message encountered, if any'),
  previousAttempts: z
    .array(z.string())
    .optional()
    .describe('List of previous attempts or solutions tried'),
});

type FronteggSupportArgs = z.infer<typeof FronteggSupportArgsSchema>;

/**
 * MCP Tool handler for Frontegg support assistance
 */
export class FronteggSupportTool {
  private readonly logger = Logger.getInstance();
  private readonly supportService = SupportAssistantService.getInstance();
  private readonly toolName = 'frontegg_support';

  /**
   * Tool definition for MCP
   */
  private readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_support',
      'Get AI-powered support assistance for Frontegg integration issues. Returns a prioritized list of tasks to resolve the integration problem.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Description of the Frontegg integration issue or question',
          minLength: 1,
          maxLength: 4000,
        },
        integrationStage: {
          type: 'string',
          description: 'Current stage of the integration process',
          enum: ['planning', 'implementation', 'testing', 'production'],
        },
        technology: {
          type: 'string',
          description: 'Technology stack being used (e.g., React, Node.js, Python)',
        },
        errorMessage: {
          type: 'string',
          description: 'Specific error message encountered, if any',
        },
        previousAttempts: {
          type: 'array',
          description: 'List of previous attempts or solutions tried',
          items: {
            type: 'string',
          },
        },
      },
      required: ['prompt'],
    },
  };

  /**
   * Register the tool with the central registry.
   */
  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg support tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    this.logger.info('Executing Frontegg support tool');
    try {
      const args = await this.validateArguments(rawArgs);
      const result = await this.execute(args);
      return { content: [result] };
    } catch (error) {
      this.logger.error('Tool execution failed', { error });
      const normalizedError = normalizeError(error);
      throw new Error(`Frontegg support tool failed: ${normalizedError.message}`);
    }
  }

  /**
   * Validate tool arguments
   */
  private async validateArguments(args: unknown): Promise<FronteggSupportArgs> {
    try {
      const validated = FronteggSupportArgsSchema.parse(args);

      this.logger.debug('Tool arguments validated', {
        promptLength: validated.prompt.length,
        hasIntegrationStage: !!validated.integrationStage,
        hasTechnology: !!validated.technology,
        hasErrorMessage: !!validated.errorMessage,
        previousAttemptsCount: validated.previousAttempts?.length || 0,
      });

      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        throw new Error(`Invalid arguments: ${errorMessages.join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Execute the tool and get support assistance
   */
  private async execute(args: FronteggSupportArgs): Promise<McpTextContent> {
    this.logger.info('Processing Frontegg support request', {
      promptPreview: args.prompt.substring(0, 100),
    });

    try {
      // Prepare the request
      const request: SupportRequest = {
        prompt: args.prompt,
        context: {
          integrationStage: args.integrationStage,
          technology: args.technology,
          errorMessage: args.errorMessage,
          previousAttempts: args.previousAttempts,
        },
      };

      // Get support assistance
      const response = await this.supportService.getSupportAssistance(request);

      // Format the response for display
      const formattedResponse = this.supportService.formatTasksForDisplay(response);

      this.logger.info('Support assistance provided successfully', {
        requestId: response.requestId,
        taskCount: response.tasks.length,
      });

      return {
        type: 'text',
        text: formattedResponse,
      };
    } catch (error) {
      this.logger.error('Failed to get support assistance', { error });

      // Re-throw the error to be handled by the error handler
      throw error;
    }
  }

  /**
   * Get tool metadata
   */
  public getMetadata(): {
    name: string;
    description: string;
    version: string;
    capabilities: string[];
  } {
    return {
      name: this.toolName,
      description: this.toolDefinition.description || '',
      version: '1.0.0',
      capabilities: [
        'Integration troubleshooting',
        'Error diagnosis',
        'Task prioritization',
        'Resource recommendations',
        'Multi-stage support (planning to production)',
      ],
    };
  }

  /**
   * Health check for the tool
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    tool: string;
    checks: Record<string, boolean>;
  }> {
    const checks: Record<string, boolean> = {};

    try {
      // Check if support service is healthy
      checks.supportService = await this.supportService.healthCheck();

      const healthy = Object.values(checks).every((check) => check === true);

      return {
        healthy,
        tool: this.toolName,
        checks,
      };
    } catch (error) {
      this.logger.error('Tool health check failed', { error });

      return {
        healthy: false,
        tool: this.toolName,
        checks,
      };
    }
  }
}
