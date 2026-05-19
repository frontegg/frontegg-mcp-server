import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { z } from 'zod';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { analyze, generateDiffs } from './dispatcher.js';
import { Finding } from './types.js';
import { withPreamble, toolDescriptionPreamble } from '../prompts/tool-preambles.js';
import { withCompletionGate, groupByFlow } from '../prompts/result-formatters.js';

const SDK_ENUM = z.enum([
  'android-kotlin',
  'ios-swift',
  'flutter',
  'react-native',
  'ionic-capacitor',
]);

const AutoArgs = z.object({
  prompt: z.string().optional().describe('What you want to do (free-form)'),
  root_path: z.string().optional().default('.').describe('Project root to analyze'),
  max_files: z.number().int().positive().default(1500),
  sdk: SDK_ENUM.optional().describe('Restrict to a specific SDK; otherwise auto-detect.'),
});

export class FronteggAutoTool {
  private readonly logger = Logger.getInstance();
  private readonly toolName = 'frontegg_auto';

  public readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_auto',
      'Natural-language entry point. Auto-detects the Frontegg SDK (Android/iOS/Flutter/React Native/Ionic Capacitor) in the target repo, runs all applicable detectors against the live canonical SDK repos at ~/developer/frontegg-*, groups findings by integration flow (deep-link / init / auth / security / build / env), and returns ready-to-apply unified diffs.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        root_path: { type: 'string' },
        max_files: { type: 'number' },
        sdk: {
          type: 'string',
          enum: ['android-kotlin', 'ios-swift', 'flutter', 'react-native', 'ionic-capacitor'],
        },
      },
    },
  };

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg auto tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = AutoArgs.parse(rawArgs);
    const root = path.resolve(args.root_path || '.');

    try {
      const result = await analyze(root, args.sdk);
      const ids = result.findings
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .map((f) => f.id);
      const diffs = ids.length ? await generateDiffs(root, ids, result.knowledge) : [];

      const body = this.format(result.findings, diffs, result.matchedSdks);
      const wrapped = withCompletionGate(body, {
        sdksConsidered: result.matchedSdks,
        canonicalSources: Object.values(result.knowledge)
          .filter(Boolean)
          .map(
            (k) => `${k!.sdk}${k!.version ? ` v${k!.version}` : ''} @ ${k!.repoRoot}`
          ),
        rulesApplied: Array.from(new Set(result.findings.map((f) => f.rule_id))),
        manualVerification: [
          'Re-run `frontegg_auto` — it should report zero critical/high findings.',
          'Exercise the login flow on a physical device (deep-link callback must open the app).',
          'Confirm no secrets are logged during auth — check debug console.',
        ],
      });
      return { content: [this.text(wrapped)] };
    } catch (error) {
      this.logger.error('frontegg_auto failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private text(text: string): McpTextContent {
    return { type: 'text', text };
  }

  private format(
    findings: Finding[],
    diffs: Array<{ id: string; diff: string }>,
    matchedSdks: string[]
  ): string {
    const lines: string[] = [];
    lines.push('# Frontegg Auto Report');
    lines.push('');
    lines.push(`_${toolDescriptionPreamble('frontegg_auto')}_`);
    lines.push('');
    lines.push(
      `**Detected SDK(s):** ${matchedSdks.length ? matchedSdks.join(', ') : '_none — no mobile SDK marker files found_'}`
    );
    lines.push('');

    lines.push('## Findings (grouped by flow)');
    if (findings.length === 0) {
      lines.push('No issues detected.');
    } else {
      const grouped = groupByFlow(findings);
      for (const [flow, items] of Object.entries(grouped)) {
        lines.push(`### ${flow} (${items.length})`);
        (items as Finding[]).forEach((f, i) => {
          lines.push(
            `${i + 1}. [${f.severity}] ${f.title}${f.file_path ? ` — \`${f.file_path}\`` : ''}`
          );
          lines.push(`   - **Why:** ${f.why}`);
          lines.push(`   - **Fix:** ${f.suggested_fix}`);
        });
        lines.push('');
      }
    }

    lines.push('## Diffs (dry-run — review before applying)');
    if (diffs.length === 0) {
      lines.push('No diffs generated.');
    } else {
      diffs.forEach((d) => {
        lines.push(`### Finding ${d.id}`);
        lines.push('```diff');
        lines.push(d.diff);
        lines.push('```');
      });
    }
    return lines.join('\n');
  }
}
