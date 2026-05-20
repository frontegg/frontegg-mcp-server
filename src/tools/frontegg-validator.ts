import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { normalizeError } from '../utils/errors.js';
import { withPreamble } from '../prompts/tool-preambles.js';

/**
 * Schema for the validation tool arguments
 */
const ValidatorArgsSchema = z.object({
  project_path: z.string().describe('Path to the project to validate'),
  check_dependencies: z
    .boolean()
    .default(true)
    .describe('Check if required dependencies are installed'),
  check_environment: z.boolean().default(true).describe('Check environment variables'),
  check_configuration: z.boolean().default(true).describe('Check configuration files'),
  check_code_setup: z.boolean().default(true).describe('Check code setup and integration'),
  framework: z
    .enum(['react', 'vue', 'angular', 'nextjs', 'nodejs', 'express'])
    .optional()
    .describe('Framework being used'),
});

type ValidatorArgs = z.infer<typeof ValidatorArgsSchema>;

/**
 * Validation check result interface
 */
interface ValidationCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'skip';
  message: string;
  details?: string;
  fix_suggestion?: string;
  cursor_actions?: string[];
}

/**
 * Validation result interface
 */
interface ValidationResult {
  overall_status: 'healthy' | 'issues_found' | 'critical_issues';
  checks: ValidationCheck[];
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  recommendations: string[];
}

/**
 * MCP Tool for validating Frontegg integration setup
 */
export class FronteggValidator {
  private readonly logger = Logger.getInstance();
  private readonly toolName = 'frontegg_validate_setup';

  public readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_validate_setup',
      'Validate Frontegg integration setup by checking dependencies, configuration, environment variables, and code setup. Provides specific fixes for any issues found.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the project to validate (absolute or relative)',
        },
        check_dependencies: {
          type: 'boolean',
          description: 'Check if required dependencies are installed',
          default: true,
        },
        check_environment: {
          type: 'boolean',
          description: 'Check environment variables',
          default: true,
        },
        check_configuration: {
          type: 'boolean',
          description: 'Check configuration files',
          default: true,
        },
        check_code_setup: {
          type: 'boolean',
          description: 'Check code setup and integration',
          default: true,
        },
        framework: {
          type: 'string',
          description: 'Framework being used',
          enum: ['react', 'vue', 'angular', 'nextjs', 'nodejs', 'express'],
        },
      },
      required: ['project_path'],
    },
  };

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg validator tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    try {
      const args = await this.validateArguments(rawArgs);
      const result = await this.validateSetup(args);
      return { content: [result] };
    } catch (error) {
      this.logger.error('Validator execution failed', { error });
      const normalizedError = normalizeError(error);
      throw new Error(`Setup validator failed: ${normalizedError.message}`);
    }
  }

  private async validateArguments(args: unknown): Promise<ValidatorArgs> {
    return ValidatorArgsSchema.parse(args);
  }

  private async validateSetup(args: ValidatorArgs): Promise<McpTextContent> {
    this.logger.info('Validating Frontegg setup', {
      path: args.project_path,
      framework: args.framework,
    });

    try {
      const validation = await this.performValidation(args);
      const formatted = this.formatValidationForCursor(validation);

      return {
        type: 'text',
        text: formatted,
      };
    } catch (error) {
      this.logger.error('Validation failed', { error });
      throw error;
    }
  }

  private async performValidation(args: ValidatorArgs): Promise<ValidationResult> {
    const checks: ValidationCheck[] = [];

    // Resolve project path
    const projectPath = path.resolve(args.project_path);

    try {
      await fs.access(projectPath);
    } catch {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Detect framework if not provided
    const framework = args.framework || (await this.detectFramework(projectPath));

    // Validate dependencies
    if (args.check_dependencies) {
      const depChecks = await this.validateDependencies(projectPath, framework);
      checks.push(...depChecks);
    }

    // Validate environment variables
    if (args.check_environment) {
      const envChecks = await this.validateEnvironment(projectPath);
      checks.push(...envChecks);
    }

    // Validate configuration
    if (args.check_configuration) {
      const configChecks = await this.validateConfiguration(projectPath, framework);
      checks.push(...configChecks);
    }

    // Validate code setup
    if (args.check_code_setup) {
      const codeChecks = await this.validateCodeSetup(projectPath, framework);
      checks.push(...codeChecks);
    }

    // Calculate summary
    const summary = {
      total_checks: checks.length,
      passed: checks.filter((c) => c.status === 'pass').length,
      failed: checks.filter((c) => c.status === 'fail').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      skipped: checks.filter((c) => c.status === 'skip').length,
    };

    // Determine overall status
    let overall_status: ValidationResult['overall_status'] = 'healthy';
    if (summary.failed > 0) {
      overall_status = summary.failed >= 3 ? 'critical_issues' : 'issues_found';
    } else if (summary.warnings > 0) {
      overall_status = 'issues_found';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(checks, framework);

    return {
      overall_status,
      checks,
      summary,
      recommendations,
    };
  }

  private async detectFramework(projectPath: string): Promise<string> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      if (dependencies['next']) return 'nextjs';
      if (dependencies['react']) return 'react';
      if (dependencies['vue']) return 'vue';
      if (dependencies['@angular/core']) return 'angular';
      if (dependencies['express']) return 'express';

      return 'nodejs';
    } catch {
      return 'unknown';
    }
  }

  private async validateDependencies(
    projectPath: string,
    framework: string
  ): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check for main Frontegg dependency
      const requiredDep = this.getMainDependency(framework);
      if (dependencies[requiredDep]) {
        checks.push({
          name: `${requiredDep} dependency`,
          status: 'pass',
          message: `✅ ${requiredDep} is installed (${dependencies[requiredDep]})`,
        });
      } else {
        checks.push({
          name: `${requiredDep} dependency`,
          status: 'fail',
          message: `❌ ${requiredDep} is not installed`,
          details: `This is the main Frontegg package required for ${framework} integration`,
          fix_suggestion: `Install the required Frontegg package`,
          cursor_actions: [
            '📦 **Open terminal** in project root',
            `⚡ **Run**: \`npm install ${requiredDep}\``,
            '✅ **Verify** installation completed',
          ],
        });
      }

      // Check for additional dependencies
      const additionalDeps = this.getAdditionalDependencies(framework);
      additionalDeps.forEach((dep) => {
        if (dependencies[dep]) {
          checks.push({
            name: `${dep} dependency`,
            status: 'pass',
            message: `✅ ${dep} is installed (${dependencies[dep]})`,
          });
        } else {
          checks.push({
            name: `${dep} dependency`,
            status: 'warning',
            message: `⚠️ ${dep} is not installed (optional but recommended)`,
            fix_suggestion: `Consider installing ${dep} for enhanced functionality`,
            cursor_actions: [`📦 **Install** if needed: \`npm install ${dep}\``],
          });
        }
      });

      // Check package-lock.json exists
      try {
        await fs.access(path.join(projectPath, 'package-lock.json'));
        checks.push({
          name: 'Package lock file',
          status: 'pass',
          message: '✅ package-lock.json exists (dependencies are locked)',
        });
      } catch {
        checks.push({
          name: 'Package lock file',
          status: 'warning',
          message: '⚠️ package-lock.json not found',
          details: 'Having a lock file ensures consistent dependency versions',
          fix_suggestion: 'Run npm install to generate package-lock.json',
          cursor_actions: ['📦 **Run**: `npm install` to generate lock file'],
        });
      }
    } catch (error) {
      checks.push({
        name: 'Package.json validation',
        status: 'fail',
        message: '❌ Cannot read package.json',
        details: 'package.json file is missing or invalid',
        fix_suggestion: 'Ensure package.json exists and is valid JSON',
        cursor_actions: [
          '📁 **Check** if package.json exists',
          '🔧 **Create** with `npm init -y` if missing',
          '✅ **Validate** JSON syntax',
        ],
      });
    }

    return checks;
  }

  private async validateEnvironment(projectPath: string): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];
    const requiredVars = ['FRONTEGG_APP_ID', 'FRONTEGG_BASE_URL'];
    const optionalVars = ['FRONTEGG_CLIENT_ID', 'FRONTEGG_API_KEY'];

    const envFiles = ['.env', '.env.local', '.env.development'];
    let envFileFound = false;
    let envContent = '';
    let envFilePath = '';

    // Find and read env file
    for (const envFile of envFiles) {
      try {
        const filePath = path.join(projectPath, envFile);
        await fs.access(filePath);
        envContent = await fs.readFile(filePath, 'utf8');
        envFileFound = true;
        envFilePath = envFile;
        break;
      } catch {
        // Continue searching
      }
    }

    if (envFileFound) {
      checks.push({
        name: 'Environment file',
        status: 'pass',
        message: `✅ Environment file found (${envFilePath})`,
      });

      // Check required variables
      requiredVars.forEach((varName) => {
        const hasVar =
          envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your-`);
        if (hasVar) {
          checks.push({
            name: `${varName} variable`,
            status: 'pass',
            message: `✅ ${varName} is set`,
          });
        } else {
          checks.push({
            name: `${varName} variable`,
            status: 'fail',
            message: `❌ ${varName} is missing or using placeholder value`,
            details: `This variable is required for Frontegg authentication`,
            fix_suggestion: `Add ${varName} to your environment file with your actual value`,
            cursor_actions: [
              `📁 **Open** ${envFilePath}`,
              `✏️ **Add/Update**: \`${varName}=your-actual-value\``,
              '🔑 **Get value** from your Frontegg dashboard',
              '💾 **Save** the file',
            ],
          });
        }
      });

      // Check optional variables
      optionalVars.forEach((varName) => {
        const hasVar =
          envContent.includes(`${varName}=`) && !envContent.includes(`${varName}=your-`);
        if (hasVar) {
          checks.push({
            name: `${varName} variable`,
            status: 'pass',
            message: `✅ ${varName} is set`,
          });
        } else {
          checks.push({
            name: `${varName} variable`,
            status: 'warning',
            message: `⚠️ ${varName} is not set (optional)`,
            details: `This variable may be needed for certain Frontegg features`,
            fix_suggestion: `Add ${varName} if you need related functionality`,
          });
        }
      });
    } else {
      checks.push({
        name: 'Environment file',
        status: 'fail',
        message: '❌ No environment file found',
        details: 'Environment variables are required for Frontegg configuration',
        fix_suggestion: 'Create a .env file with your Frontegg configuration',
        cursor_actions: [
          '📄 **Create** .env file in project root',
          '✏️ **Add** required environment variables',
          '🔑 **Get values** from Frontegg dashboard',
          '💾 **Save** the file',
        ],
      });
    }

    // Check .gitignore includes .env
    try {
      const gitignorePath = path.join(projectPath, '.gitignore');
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      if (gitignoreContent.includes('.env')) {
        checks.push({
          name: 'Environment security',
          status: 'pass',
          message: '✅ .env is in .gitignore (secure)',
        });
      } else {
        checks.push({
          name: 'Environment security',
          status: 'warning',
          message: '⚠️ .env not found in .gitignore',
          details: 'Environment files should not be committed to version control',
          fix_suggestion: 'Add .env to .gitignore to protect sensitive data',
          cursor_actions: [
            '📁 **Open** .gitignore file',
            '✏️ **Add** line: `.env`',
            '💾 **Save** the file',
          ],
        });
      }
    } catch {
      checks.push({
        name: 'Environment security',
        status: 'warning',
        message: '⚠️ .gitignore not found',
        fix_suggestion: 'Create .gitignore and add .env to it',
        cursor_actions: [
          '📄 **Create** .gitignore file',
          '✏️ **Add** line: `.env`',
          '💾 **Save** the file',
        ],
      });
    }

    return checks;
  }

  private async validateConfiguration(
    projectPath: string,
    framework: string
  ): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    // Check TypeScript configuration if applicable
    try {
      const tsconfigPath = path.join(projectPath, 'tsconfig.json');
      await fs.access(tsconfigPath);

      const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));

      checks.push({
        name: 'TypeScript configuration',
        status: 'pass',
        message: '✅ TypeScript is configured',
      });

      // Check if strict mode is enabled (recommended for better type safety)
      if (tsconfig.compilerOptions?.strict) {
        checks.push({
          name: 'TypeScript strict mode',
          status: 'pass',
          message: '✅ TypeScript strict mode is enabled',
        });
      } else {
        checks.push({
          name: 'TypeScript strict mode',
          status: 'warning',
          message: '⚠️ TypeScript strict mode is disabled',
          details: 'Strict mode provides better type safety with Frontegg',
          fix_suggestion: 'Enable strict mode in tsconfig.json',
          cursor_actions: [
            '📁 **Open** tsconfig.json',
            '✏️ **Set** `"strict": true` in compilerOptions',
            '💾 **Save** and fix any type errors',
          ],
        });
      }
    } catch {
      if (framework === 'nodejs') {
        checks.push({
          name: 'TypeScript configuration',
          status: 'skip',
          message: '⏭️ TypeScript not detected (using JavaScript)',
        });
      } else {
        checks.push({
          name: 'TypeScript configuration',
          status: 'warning',
          message: '⚠️ TypeScript configuration not found',
          details: 'TypeScript is recommended for better development experience',
          fix_suggestion: 'Consider adding TypeScript to your project',
        });
      }
    }

    // Framework-specific configuration checks
    await this.validateFrameworkConfig(projectPath, framework, checks);

    return checks;
  }

  private async validateFrameworkConfig(
    projectPath: string,
    framework: string,
    checks: ValidationCheck[]
  ): Promise<void> {
    switch (framework) {
      case 'nextjs':
        // Check for Next.js config
        try {
          await fs.access(path.join(projectPath, 'next.config.js'));
          checks.push({
            name: 'Next.js configuration',
            status: 'pass',
            message: '✅ next.config.js found',
          });
        } catch {
          checks.push({
            name: 'Next.js configuration',
            status: 'warning',
            message: '⚠️ next.config.js not found',
            details: 'You may need Next.js configuration for Frontegg',
            fix_suggestion: 'Create next.config.js if needed for custom configuration',
          });
        }
        break;

      case 'react':
        // Check for React-specific files
        try {
          await fs.access(path.join(projectPath, 'public', 'index.html'));
          checks.push({
            name: 'React public files',
            status: 'pass',
            message: '✅ React public directory structure found',
          });
        } catch {
          checks.push({
            name: 'React public files',
            status: 'warning',
            message: '⚠️ Standard React structure not detected',
          });
        }
        break;
    }
  }

  private async validateCodeSetup(
    projectPath: string,
    framework: string
  ): Promise<ValidationCheck[]> {
    const checks: ValidationCheck[] = [];

    // Check for main app file
    const appFiles = this.getExpectedAppFiles(framework);
    let appFileFound = false;

    for (const appFile of appFiles) {
      try {
        const filePath = path.join(projectPath, appFile);
        const content = await fs.readFile(filePath, 'utf8');

        // Check if Frontegg is imported
        if (content.includes('@frontegg') || content.includes('frontegg')) {
          checks.push({
            name: 'Frontegg integration',
            status: 'pass',
            message: `✅ Frontegg integration found in ${appFile}`,
          });
          appFileFound = true;

          // Check for provider setup
          if (content.includes('FronteggProvider') || content.includes('frontegg')) {
            checks.push({
              name: 'Frontegg provider setup',
              status: 'pass',
              message: '✅ Frontegg provider is configured',
            });
          } else {
            checks.push({
              name: 'Frontegg provider setup',
              status: 'warning',
              message: '⚠️ Frontegg provider setup not detected',
              fix_suggestion: 'Ensure FronteggProvider wraps your app',
            });
          }
          break;
        }
      } catch {
        // File doesn't exist or can't be read
      }
    }

    if (!appFileFound) {
      checks.push({
        name: 'Frontegg integration',
        status: 'fail',
        message: '❌ Frontegg integration not found in main app files',
        details: `Checked: ${appFiles.join(', ')}`,
        fix_suggestion: 'Add Frontegg integration to your main app component',
        cursor_actions: [
          '📁 **Open** your main app file',
          '📦 **Import** Frontegg components',
          '🔧 **Wrap** your app with FronteggProvider',
          '💾 **Save** the changes',
        ],
      });
    }

    // Check for authentication usage
    const srcPath = path.join(projectPath, 'src');
    try {
      const hasAuthUsage = await this.searchForAuthUsage(srcPath);
      if (hasAuthUsage) {
        checks.push({
          name: 'Authentication usage',
          status: 'pass',
          message: '✅ Frontegg authentication hooks/composables are being used',
        });
      } else {
        checks.push({
          name: 'Authentication usage',
          status: 'warning',
          message: '⚠️ No Frontegg authentication usage detected',
          details: 'You may not be using Frontegg authentication features yet',
          fix_suggestion: 'Implement authentication using Frontegg hooks/composables',
        });
      }
    } catch {
      checks.push({
        name: 'Authentication usage',
        status: 'skip',
        message: '⏭️ Cannot analyze authentication usage (src directory not found)',
      });
    }

    return checks;
  }

  private async searchForAuthUsage(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const found = await this.searchForAuthUsage(fullPath);
          if (found) return true;
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.js') ||
            entry.name.endsWith('.ts') ||
            entry.name.endsWith('.jsx') ||
            entry.name.endsWith('.tsx') ||
            entry.name.endsWith('.vue'))
        ) {
          const content = await fs.readFile(fullPath, 'utf8');
          if (
            content.includes('useAuth') ||
            content.includes('useFrontegg') ||
            content.includes('loginWithRedirect')
          ) {
            return true;
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return false;
  }

  private getMainDependency(framework: string): string {
    switch (framework) {
      case 'react':
        return '@frontegg/react';
      case 'nextjs':
        return '@frontegg/nextjs';
      case 'vue':
        return '@frontegg/vue';
      case 'angular':
        return '@frontegg/angular';
      case 'nodejs':
      case 'express':
        return '@frontegg/client';
      default:
        return '@frontegg/client';
    }
  }

  private getAdditionalDependencies(framework: string): string[] {
    const common = ['@frontegg/types'];

    switch (framework) {
      case 'react':
      case 'nextjs':
        return [...common, 'react', 'react-dom'];
      case 'vue':
        return [...common, 'vue'];
      case 'angular':
        return [...common, '@angular/core'];
      default:
        return common;
    }
  }

  private getExpectedAppFiles(framework: string): string[] {
    switch (framework) {
      case 'react':
        return ['src/App.tsx', 'src/App.jsx', 'src/index.tsx', 'src/index.jsx'];
      case 'nextjs':
        return ['pages/_app.tsx', 'pages/_app.jsx', 'app/layout.tsx', 'app/layout.jsx'];
      case 'vue':
        return ['src/App.vue', 'src/main.ts', 'src/main.js'];
      case 'angular':
        return ['src/app/app.component.ts', 'src/app/app.module.ts'];
      case 'nodejs':
      case 'express':
        return ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'src/app.ts', 'src/app.js'];
      default:
        return ['src/index.ts', 'src/index.js'];
    }
  }

  private generateRecommendations(checks: ValidationCheck[], framework: string): string[] {
    const recommendations: string[] = [];
    const failedChecks = checks.filter((c) => c.status === 'fail');
    const warningChecks = checks.filter((c) => c.status === 'warning');

    if (failedChecks.length > 0) {
      recommendations.push(
        '🚨 **Fix critical issues first** - Address all failed checks before proceeding'
      );
    }

    if (warningChecks.length > 0) {
      recommendations.push(
        '⚠️ **Review warnings** - Consider addressing warnings for better setup'
      );
    }

    recommendations.push(
      `📚 **Follow ${framework} guide** - Refer to Frontegg's official ${framework} documentation`
    );
    recommendations.push(
      '🧪 **Test integration** - Verify authentication works after fixing issues'
    );
    recommendations.push(
      '🔒 **Security review** - Ensure environment variables are properly protected'
    );

    if (framework === 'nextjs') {
      recommendations.push(
        '🚀 **Deploy considerations** - Ensure environment variables are set in production'
      );
    }

    return recommendations;
  }

  private formatValidationForCursor(validation: ValidationResult): string {
    const lines: string[] = [];

    const statusEmoji =
      validation.overall_status === 'healthy'
        ? '✅'
        : validation.overall_status === 'issues_found'
          ? '⚠️'
          : '🚨';

    lines.push(`# ${statusEmoji} Frontegg Setup Validation Report`);
    lines.push(`**Overall Status**: ${validation.overall_status.toUpperCase().replace('_', ' ')}`);
    lines.push('');

    // Summary
    lines.push(`## 📊 Summary`);
    lines.push(`- **Total Checks**: ${validation.summary.total_checks}`);
    lines.push(`- **✅ Passed**: ${validation.summary.passed}`);
    lines.push(`- **❌ Failed**: ${validation.summary.failed}`);
    lines.push(`- **⚠️ Warnings**: ${validation.summary.warnings}`);
    lines.push(`- **⏭️ Skipped**: ${validation.summary.skipped}`);
    lines.push('');

    // Group checks by status
    const checksByStatus = validation.checks.reduce(
      (acc, check) => {
        (acc[check.status] ||= []).push(check);
        return acc;
      },
      {} as Record<string, ValidationCheck[]>
    );
    const failChecks = checksByStatus.fail ?? [];
    const warningChecks = checksByStatus.warning ?? [];
    const passChecks = checksByStatus.pass ?? [];

    // Show failed checks first
    if (failChecks.length > 0) {
      lines.push(`## 🚨 Critical Issues (${failChecks.length})`);
      lines.push('*These must be fixed for Frontegg to work properly*');
      lines.push('');

      failChecks.forEach((check, index) => {
        lines.push(`### ${index + 1}. ${check.name}`);
        lines.push(check.message);
        if (check.details) {
          lines.push(`**Details**: ${check.details}`);
        }
        if (check.fix_suggestion) {
          lines.push(`**Fix**: ${check.fix_suggestion}`);
        }
        if (check.cursor_actions) {
          lines.push(`**Cursor Actions**:`);
          check.cursor_actions.forEach((action, idx) => {
            lines.push(`${idx + 1}. ${action}`);
          });
        }
        lines.push('');
        lines.push('---');
        lines.push('');
      });
    }

    // Show warnings
    if (warningChecks.length > 0) {
      lines.push(`## ⚠️ Warnings (${warningChecks.length})`);
      lines.push('*These should be addressed for optimal setup*');
      lines.push('');

      warningChecks.forEach((check, index) => {
        lines.push(`### ${index + 1}. ${check.name}`);
        lines.push(check.message);
        if (check.details) {
          lines.push(`**Details**: ${check.details}`);
        }
        if (check.fix_suggestion) {
          lines.push(`**Suggestion**: ${check.fix_suggestion}`);
        }
        if (check.cursor_actions) {
          lines.push(`**Cursor Actions**:`);
          check.cursor_actions.forEach((action, idx) => {
            lines.push(`${idx + 1}. ${action}`);
          });
        }
        lines.push('');
      });
      lines.push('---');
      lines.push('');
    }

    // Show passed checks summary
    if (passChecks.length > 0) {
      lines.push(`## ✅ Passed Checks (${passChecks.length})`);
      passChecks.forEach((check) => {
        lines.push(`- ${check.message}`);
      });
      lines.push('');
    }

    // Show recommendations
    if (validation.recommendations.length > 0) {
      lines.push(`## 💡 Recommendations`);
      validation.recommendations.forEach((rec, index) => {
        lines.push(`${index + 1}. ${rec}`);
      });
      lines.push('');
    }

    // Next steps
    lines.push(`## 🚀 Next Steps`);
    if (validation.overall_status === 'healthy') {
      lines.push('1. ✅ **Your setup looks good!** - Test your authentication flow');
      lines.push('2. 🧪 **Run integration tests** - Verify all features work as expected');
      lines.push(
        '3. 📚 **Explore advanced features** - Check Frontegg documentation for more capabilities'
      );
    } else {
      lines.push('1. 🔧 **Fix critical issues** - Address all failed checks first');
      lines.push('2. ⚠️ **Review warnings** - Consider addressing warnings for better setup');
      lines.push('3. 🔄 **Re-run validation** - Use this tool again after making changes');
      lines.push('4. 🧪 **Test integration** - Verify everything works after fixes');
    }
    lines.push('');

    lines.push(`---`);
    lines.push(`🤖 **Validation completed** - Ready to implement fixes in Cursor`);

    return lines.join('\n');
  }
}
