#!/usr/bin/env node

/**
 * Main entry point for the Frontegg Mobile MCP Server
 * Provides AI-powered diagnosis + fix diffs for Frontegg mobile SDK integrations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ConfigManager } from './config/config-manager.js';
import { Logger } from './utils/logger.js';
import { WorkspaceTools } from './tools/workspace-tools.js';
import { FronteggAutoTool } from './tools/frontegg-auto.js';
import { FronteggApplyDiffTool } from './tools/frontegg-apply-diff.js';
import { FeatureGuideTool } from './tools/feature-guide.js';
import { FronteggConfigureTools } from './tools/frontegg-configure.js';
import { FronteggAuthPoliciesTools } from './tools/frontegg-auth-policies.js';
import { FronteggEmailTemplatesTools } from './tools/frontegg-email-templates.js';
import { FronteggWebhooksTools } from './tools/frontegg-webhooks.js';
import { FronteggUserMfaTools } from './tools/frontegg-user-mfa.js';
import { FronteggEntitlementsTools } from './tools/frontegg-entitlements.js';
import { FronteggApiTokensTools } from './tools/frontegg-api-tokens.js';
import { FronteggLoginTool } from './tools/frontegg-login.js';
// Category A — Users, tenants, audit, roles
import { FronteggUsersTools } from './tools/frontegg-users.js';
import { FronteggTenantsTools } from './tools/frontegg-tenants.js';
import { FronteggAuditTools } from './tools/frontegg-audit.js';
import { FronteggRolesTools } from './tools/frontegg-roles.js';
// Category B — branding + applications
import { FronteggBrandingTools } from './tools/frontegg-branding.js';
import { FronteggApplicationsTools } from './tools/frontegg-applications.js';
// Category E — user session management
import { FronteggUserSessionTools } from './tools/frontegg-user-sessions.js';
import { ToolRegistry } from './tools/registry.js';
import { bindRegistry } from './tools/bind-registry.js';
// Platform tools — 49 tools imported from frontegg/frontegg-mcp-server.
// Registered through a RegistryAdapter that maps the upstream
// McpServer.tool() surface to our ToolRegistry. See src/platform/README.
import { registerPlatformTools } from './platform/index.js';
import { RegistryAdapter } from './platform/registry-adapter.js';
import { ErrorHandler } from './utils/error-handler.js';
import { HealthCheck } from './utils/health-check.js';

const logger = Logger.getInstance();

/**
 * Initialize and start the MCP server
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Starting Frontegg Mobile MCP Server...');
    
    // Initialize configuration
    const config = ConfigManager.getInstance();
    await config.validate();
    logger.info('Configuration validated successfully');
    
    // Perform health checks
    const healthCheck = new HealthCheck();
    await healthCheck.performStartupChecks();
    
    // Create MCP server instance
    const server = new Server(
      {
        name: 'frontegg-mobile-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Build a single registry, register every tool into it, then bind the
    // registry to the MCP server with ONE pair of dispatchers (tools/list +
    // tools/call). This is the fix for the long-standing bug where each
    // tool class called server.setRequestHandler(CallToolRequestSchema)
    // and only the last registration won — making 5 of 6 tools dead surface.
    const registry = new ToolRegistry();
    new WorkspaceTools().register(registry);
    new FronteggAutoTool().register(registry);
    new FronteggApplyDiffTool().register(registry);
    new FeatureGuideTool().register(registry);
    new FronteggConfigureTools().register(registry);
    new FronteggAuthPoliciesTools().register(registry);
    new FronteggEmailTemplatesTools().register(registry);
    new FronteggWebhooksTools().register(registry);
    new FronteggUserMfaTools().register(registry);
    new FronteggEntitlementsTools().register(registry);
    new FronteggApiTokensTools().register(registry);
    new FronteggLoginTool().register(registry);
    // Category A — users / tenants / audit / roles
    new FronteggUsersTools().register(registry);
    new FronteggTenantsTools().register(registry);
    new FronteggAuditTools().register(registry);
    new FronteggRolesTools().register(registry);
    // Category B — branding + applications (5 tools)
    new FronteggBrandingTools().register(registry);
    new FronteggApplicationsTools().register(registry);
    // Category E — user session management (3 tools)
    new FronteggUserSessionTools().register(registry);
    // Platform tools (49) — upstream surface from frontegg/frontegg-mcp-server.
    // Registered via RegistryAdapter so upstream's McpServer.tool() calls land
    // in this same ToolRegistry as kebab-case tool names. No name collisions
    // with the snake_case mobile/audit tools above.
    registerPlatformTools(new RegistryAdapter(registry) as never);
    bindRegistry(server, registry);
    logger.info('Tool registry bound', { tools: registry.names() });
    
    // Set up error handlers
    const errorHandler = new ErrorHandler();
    errorHandler.setupProcessHandlers();
    
    server.onerror = (error: unknown) => {
      logger.error('Server error occurred', { error: errorHandler.formatError(error) });
    };
    
    // Create and connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('Frontegg Mobile MCP Server started successfully');
    logger.info(`Server ready to handle requests on stdio transport`);
    
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', { error });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  logger.error('Fatal error during server startup', { error });
  process.exit(1);
});