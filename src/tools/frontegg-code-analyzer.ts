import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { normalizeError } from '../utils/errors.js';
import { withPreamble } from '../prompts/tool-preambles.js';

/**
 * Schema for the code analyzer tool arguments
 */
const CodeAnalyzerArgsSchema = z.object({
  project_path: z.string().describe('Path to the project to analyze'),
  integration_type: z
    .enum(['react', 'vue', 'angular', 'nodejs', 'nextjs', 'express'])
    .optional()
    .describe('Type of application being analyzed'),
  check_configuration: z.boolean().default(true).describe('Check configuration files'),
  check_dependencies: z.boolean().default(true).describe('Check package.json dependencies'),
  check_environment: z.boolean().default(true).describe('Check environment variables'),
  check_structure: z.boolean().default(true).describe('Check project structure'),
});

type CodeAnalyzerArgs = z.infer<typeof CodeAnalyzerArgsSchema>;

/**
 * Analysis issue interface
 */
interface AnalysisIssue {
  type: 'error' | 'warning' | 'info';
  category: 'configuration' | 'dependencies' | 'structure' | 'environment' | 'security';
  title: string;
  description: string;
  file_path?: string;
  line_number?: number;
  fix_suggestion: string;
  code_example?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  cursor_actions: string[];
}

/**
 * Analysis result interface
 */
interface AnalysisResult {
  project_type: string;
  issues: AnalysisIssue[];
  recommendations: string[];
  summary: {
    total_issues: number;
    critical_count: number;
    files_analyzed: number;
    integration_status: 'not_started' | 'partial' | 'complete' | 'needs_fixes';
  };
}

/**
 * MCP Tool for analyzing Frontegg integration in projects
 */
export class FronteggCodeAnalyzer {
  private readonly logger = Logger.getInstance();
  private readonly toolName = 'frontegg_analyze_project';

  public readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_analyze_project',
      'Analyze a project for Frontegg integration issues and provide specific file-based fixes that Cursor can execute. Scans project structure, dependencies, and configuration.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the project to analyze (absolute or relative)',
        },
        integration_type: {
          type: 'string',
          description: 'Type of application being analyzed',
          enum: ['react', 'vue', 'angular', 'nodejs', 'nextjs', 'express'],
        },
        check_configuration: {
          type: 'boolean',
          description: 'Check configuration files',
          default: true,
        },
        check_dependencies: {
          type: 'boolean',
          description: 'Check package.json dependencies',
          default: true,
        },
        check_environment: {
          type: 'boolean',
          description: 'Check environment variables',
          default: true,
        },
        check_structure: {
          type: 'boolean',
          description: 'Check project structure',
          default: true,
        },
      },
      required: ['project_path'],
    },
  };

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg code analyzer tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    try {
      const args = await this.validateArguments(rawArgs);
      const result = await this.analyzeProject(args);
      return { content: [result] };
    } catch (error) {
      this.logger.error('Code analyzer execution failed', { error });
      const normalizedError = normalizeError(error);
      throw new Error(`Project analyzer failed: ${normalizedError.message}`);
    }
  }

  private async validateArguments(args: unknown): Promise<CodeAnalyzerArgs> {
    return CodeAnalyzerArgsSchema.parse(args);
  }

  private async analyzeProject(args: CodeAnalyzerArgs): Promise<McpTextContent> {
    this.logger.info('Analyzing project for Frontegg integration', {
      path: args.project_path,
      type: args.integration_type,
    });

    try {
      const analysis = await this.performAnalysis(args);
      const formatted = this.formatAnalysisForCursor(analysis);

      return {
        type: 'text',
        text: formatted,
      };
    } catch (error) {
      this.logger.error('Analysis failed', { error });
      throw error;
    }
  }

  private async performAnalysis(args: CodeAnalyzerArgs): Promise<AnalysisResult> {
    const issues: AnalysisIssue[] = [];
    const recommendations: string[] = [];
    let filesAnalyzed = 0;

    // Resolve project path
    const projectPath = path.resolve(args.project_path);

    try {
      await fs.access(projectPath);
    } catch {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    // Detect project type if not provided
    const detectedType = args.integration_type || (await this.detectProjectType(projectPath));

    // Check package.json and dependencies
    if (args.check_dependencies) {
      const depIssues = await this.checkDependencies(projectPath, detectedType);
      issues.push(...depIssues);
      filesAnalyzed++;
    }

    // Check environment configuration
    if (args.check_environment) {
      const envIssues = await this.checkEnvironmentConfig(projectPath);
      issues.push(...envIssues);
      filesAnalyzed++;
    }

    // Check project structure
    if (args.check_structure) {
      const structureIssues = await this.checkProjectStructure(projectPath, detectedType);
      issues.push(...structureIssues);
      filesAnalyzed += 3; // Typically check multiple structure files
    }

    // Check configuration files
    if (args.check_configuration) {
      const configIssues = await this.checkConfigurationFiles(projectPath, detectedType);
      issues.push(...configIssues);
      filesAnalyzed += 2;
    }

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(issues, detectedType));

    // Determine integration status
    const criticalIssues = issues.filter((i) => i.priority === 'critical').length;
    const totalIssues = issues.length;

    let integrationStatus: AnalysisResult['summary']['integration_status'] = 'complete';
    if (criticalIssues > 0) {
      integrationStatus = 'needs_fixes';
    } else if (totalIssues > 0) {
      integrationStatus = 'partial';
    } else if (totalIssues === 0 && !(await this.hasFronteggDependency(projectPath))) {
      integrationStatus = 'not_started';
    }

    return {
      project_type: detectedType,
      issues,
      recommendations,
      summary: {
        total_issues: totalIssues,
        critical_count: criticalIssues,
        files_analyzed: filesAnalyzed,
        integration_status: integrationStatus,
      },
    };
  }

  private async detectProjectType(projectPath: string): Promise<string> {
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

  private async checkDependencies(
    projectPath: string,
    projectType: string
  ): Promise<AnalysisIssue[]> {
    const issues: AnalysisIssue[] = [];

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check for Frontegg dependencies
      const requiredDeps = this.getRequiredDependencies(projectType);
      const missingDeps = requiredDeps.filter((dep) => !dependencies[dep]);

      if (missingDeps.length > 0) {
        issues.push({
          type: 'error',
          category: 'dependencies',
          title: 'Missing Frontegg Dependencies',
          description: `Required Frontegg packages are not installed: ${missingDeps.join(', ')}`,
          file_path: 'package.json',
          fix_suggestion: `Install the required Frontegg packages for ${projectType}`,
          code_example: `npm install ${missingDeps.join(' ')}`,
          priority: 'critical',
          cursor_actions: [
            '📦 **Open terminal** in your project root',
            `⚡ **Run command**: \`npm install ${missingDeps.join(' ')}\``,
            '✅ **Verify** installation completed successfully',
            '🔄 **Restart** your development server if running',
          ],
        });
      }

      // Check for outdated versions
      const fronteggDeps = Object.keys(dependencies).filter((dep) => dep.includes('frontegg'));
      if (fronteggDeps.length > 0) {
        issues.push({
          type: 'info',
          category: 'dependencies',
          title: 'Check Frontegg Package Versions',
          description:
            'Verify you are using the latest Frontegg packages for security and features',
          file_path: 'package.json',
          fix_suggestion: 'Update Frontegg packages to latest versions',
          code_example: `npm update ${fronteggDeps.join(' ')}`,
          priority: 'low',
          cursor_actions: [
            '🔍 **Check** current versions in package.json',
            '📦 **Run**: `npm outdated` to see available updates',
            '⬆️ **Update** if newer versions are available',
          ],
        });
      }
    } catch (error) {
      issues.push({
        type: 'error',
        category: 'dependencies',
        title: 'Cannot Read package.json',
        description: 'Unable to analyze dependencies - package.json file is missing or invalid',
        file_path: 'package.json',
        fix_suggestion: 'Ensure package.json exists and is valid JSON',
        priority: 'critical',
        cursor_actions: [
          '📁 **Check** if package.json exists in project root',
          '🔧 **Create** package.json if missing: `npm init -y`',
          '✅ **Validate** JSON syntax if file exists',
        ],
      });
    }

    return issues;
  }

  private async checkEnvironmentConfig(projectPath: string): Promise<AnalysisIssue[]> {
    const issues: AnalysisIssue[] = [];

    const envFiles = ['.env', '.env.local', '.env.development'];
    let hasEnvFile = false;

    for (const envFile of envFiles) {
      try {
        const envPath = path.join(projectPath, envFile);
        await fs.access(envPath);
        hasEnvFile = true;

        const content = await fs.readFile(envPath, 'utf8');
        const requiredVars = ['FRONTEGG_APP_ID', 'FRONTEGG_BASE_URL'];
        const missingVars = requiredVars.filter((varName) => !content.includes(varName));

        if (missingVars.length > 0) {
          issues.push({
            type: 'error',
            category: 'environment',
            title: 'Missing Environment Variables',
            description: `Required Frontegg environment variables are not set: ${missingVars.join(', ')}`,
            file_path: envFile,
            fix_suggestion: 'Add the missing environment variables to your .env file',
            code_example: `# Add to ${envFile}
${missingVars.map((v) => `${v}=your-${v.toLowerCase().replace('_', '-')}-here`).join('\n')}`,
            priority: 'critical',
            cursor_actions: [
              `📁 **Open** ${envFile} file`,
              '✏️ **Add** the missing environment variables',
              '🔑 **Replace** placeholder values with your actual Frontegg credentials',
              '💾 **Save** the file',
            ],
          });
        }

        break; // Found an env file, no need to check others
      } catch {
        // File doesn't exist, continue checking
      }
    }

    if (!hasEnvFile) {
      issues.push({
        type: 'error',
        category: 'environment',
        title: 'No Environment File Found',
        description: 'No .env file found for storing Frontegg configuration',
        file_path: '.env',
        fix_suggestion: 'Create a .env file with your Frontegg configuration',
        code_example: `# Create .env file with:
FRONTEGG_APP_ID=your-app-id-here
FRONTEGG_BASE_URL=https://app-your-subdomain.frontegg.com
FRONTEGG_CLIENT_ID=your-client-id-here`,
        priority: 'critical',
        cursor_actions: [
          '📄 **Create** new file named `.env` in project root',
          '✏️ **Add** the environment variables shown above',
          '🔑 **Replace** placeholder values with your Frontegg credentials',
          '💾 **Save** the file',
        ],
      });
    }

    return issues;
  }

  private async checkProjectStructure(
    projectPath: string,
    projectType: string
  ): Promise<AnalysisIssue[]> {
    const issues: AnalysisIssue[] = [];

    // Check for common structure based on project type
    const expectedPaths = this.getExpectedStructure(projectType);

    for (const expectedPath of expectedPaths) {
      try {
        await fs.access(path.join(projectPath, expectedPath.path));
      } catch {
        if (expectedPath.required) {
          issues.push({
            type: 'warning',
            category: 'structure',
            title: `Missing ${expectedPath.description}`,
            description: `Expected ${expectedPath.path} for ${projectType} Frontegg integration`,
            file_path: expectedPath.path,
            fix_suggestion: expectedPath.fix_suggestion,
            code_example: expectedPath.code_example,
            priority: 'medium',
            cursor_actions: expectedPath.cursor_actions,
          });
        }
      }
    }

    return issues;
  }

  private async checkConfigurationFiles(
    projectPath: string,
    _projectType: string
  ): Promise<AnalysisIssue[]> {
    const issues: AnalysisIssue[] = [];

    // Check TypeScript configuration if it's a TS project
    try {
      const tsconfigPath = path.join(projectPath, 'tsconfig.json');
      await fs.access(tsconfigPath);

      const tsconfig = JSON.parse(await fs.readFile(tsconfigPath, 'utf8'));

      // Check if types are properly configured for Frontegg
      if (!tsconfig.compilerOptions?.types?.includes('@frontegg/types')) {
        issues.push({
          type: 'info',
          category: 'configuration',
          title: 'TypeScript Types Configuration',
          description: 'Consider adding Frontegg types to TypeScript configuration',
          file_path: 'tsconfig.json',
          fix_suggestion: 'Add Frontegg types to tsconfig.json for better type safety',
          code_example: `{
  "compilerOptions": {
    "types": ["@frontegg/types"]
  }
}`,
          priority: 'low',
          cursor_actions: [
            '📁 **Open** tsconfig.json',
            '🔧 **Add** "@frontegg/types" to the types array',
            '💾 **Save** the file',
          ],
        });
      }
    } catch {
      // No TypeScript config found, which is fine
    }

    return issues;
  }

  private getRequiredDependencies(projectType: string): string[] {
    switch (projectType) {
      case 'react':
      case 'nextjs':
        return ['@frontegg/react'];
      case 'vue':
        return ['@frontegg/vue'];
      case 'angular':
        return ['@frontegg/angular'];
      case 'nodejs':
      case 'express':
        return ['@frontegg/client'];
      default:
        return ['@frontegg/client'];
    }
  }

  private getExpectedStructure(projectType: string): Array<{
    path: string;
    required: boolean;
    description: string;
    fix_suggestion: string;
    code_example?: string;
    cursor_actions: string[];
  }> {
    const common = [];

    switch (projectType) {
      case 'react':
        common.push({
          path: 'src/components/Auth',
          required: false,
          description: 'Auth components directory',
          fix_suggestion: 'Create an Auth components directory for Frontegg components',
          cursor_actions: [
            '📁 **Create** directory: `src/components/Auth`',
            '📄 **Add** authentication-related components here',
          ],
        });
        break;
      case 'nextjs':
        common.push({
          path: 'pages/_app.tsx',
          required: true,
          description: 'Next.js App component',
          fix_suggestion: 'Ensure _app.tsx exists for Frontegg provider setup',
          code_example: `import { FronteggProvider } from '@frontegg/nextjs';

function MyApp({ Component, pageProps }) {
  return (
    <FronteggProvider>
      <Component {...pageProps} />
    </FronteggProvider>
  );
}

export default MyApp;`,
          cursor_actions: [
            '📁 **Check** if pages/_app.tsx exists',
            '🔧 **Wrap** your app with FronteggProvider',
            '💾 **Save** the file',
          ],
        });
        break;
    }

    return common;
  }

  private async hasFronteggDependency(projectPath: string): Promise<boolean> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      return Object.keys(allDeps).some((dep) => dep.includes('frontegg'));
    } catch {
      return false;
    }
  }

  private generateRecommendations(issues: AnalysisIssue[], projectType: string): string[] {
    const recommendations: string[] = [];

    const criticalIssues = issues.filter((i) => i.priority === 'critical').length;
    const highIssues = issues.filter((i) => i.priority === 'high').length;

    if (criticalIssues > 0) {
      recommendations.push(
        '🚨 **Address critical issues first** - These will prevent Frontegg from working'
      );
    }

    if (highIssues > 0) {
      recommendations.push(
        '⚠️ **Fix high priority issues** - These may cause security or functionality problems'
      );
    }

    recommendations.push(
      `📚 **Review ${projectType} integration guide** - Follow Frontegg's official documentation`
    );
    recommendations.push('🧪 **Test thoroughly** - Verify each fix before moving to the next');
    recommendations.push('🔒 **Security review** - Ensure sensitive data is properly protected');

    return recommendations;
  }

  private formatAnalysisForCursor(analysis: AnalysisResult): string {
    const lines: string[] = [];

    lines.push(`# 🔍 Frontegg Project Analysis Report`);
    lines.push(`**Project Type**: ${analysis.project_type}`);
    lines.push(`**Integration Status**: ${analysis.summary.integration_status.toUpperCase()}`);
    lines.push(
      `**Issues Found**: ${analysis.summary.total_issues} (${analysis.summary.critical_count} critical)`
    );
    lines.push(`**Files Analyzed**: ${analysis.summary.files_analyzed}`);
    lines.push('');

    if (analysis.issues.length === 0) {
      lines.push('## ✅ No Issues Found');
      lines.push('Your Frontegg integration appears to be properly configured!');
      lines.push('');
    } else {
      lines.push('## 🎯 Issues to Fix');
      lines.push('');

      // Group by priority
      const issuesByPriority = analysis.issues.reduce(
        (acc, issue) => {
          (acc[issue.priority] ||= []).push(issue);
          return acc;
        },
        {} as Record<string, AnalysisIssue[]>
      );

      ['critical', 'high', 'medium', 'low'].forEach((priority) => {
        const issues = issuesByPriority[priority];
        if (!issues?.length) return;

        const emoji =
          priority === 'critical'
            ? '🚨'
            : priority === 'high'
              ? '⚠️'
              : priority === 'medium'
                ? '📋'
                : '💡';
        lines.push(`### ${emoji} ${priority.toUpperCase()} Priority`);
        lines.push('');

        issues.forEach((issue, index) => {
          lines.push(`#### ${index + 1}. ${issue.title} [${issue.category}]`);
          lines.push(`**Description**: ${issue.description}`);
          lines.push('');

          if (issue.file_path) {
            lines.push(
              `**📁 File**: \`${issue.file_path}\`${issue.line_number ? ` (line ${issue.line_number})` : ''}`
            );
            lines.push('');
          }

          lines.push(`**🔧 Fix**: ${issue.fix_suggestion}`);
          lines.push('');

          if (issue.code_example) {
            lines.push('**💻 Code Example**:');
            lines.push('```typescript');
            lines.push(issue.code_example);
            lines.push('```');
            lines.push('');
          }

          lines.push('**🎯 Cursor Action Steps**:');
          issue.cursor_actions.forEach((action, idx) => {
            lines.push(`${idx + 1}. ${action}`);
          });
          lines.push('');
          lines.push('---');
          lines.push('');
        });
      });
    }

    if (analysis.recommendations.length > 0) {
      lines.push('## 💡 Recommendations');
      lines.push('');
      analysis.recommendations.forEach((rec, index) => {
        lines.push(`${index + 1}. ${rec}`);
      });
      lines.push('');
    }

    lines.push('## 🚀 Next Steps');
    lines.push('1. **Fix issues in priority order** - Start with critical, then high, medium, low');
    lines.push('2. **Test after each fix** - Verify functionality before proceeding');
    lines.push('3. **Run analysis again** - Use this tool to verify fixes');
    lines.push(
      '4. **Consult Frontegg docs** - Reference official documentation for complex issues'
    );
    lines.push('');
    lines.push("> 💡 **Tip**: Use Cursor's AI chat to get help implementing these specific fixes!");

    return lines.join('\n');
  }
}
