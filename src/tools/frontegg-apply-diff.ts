/**
 * frontegg_apply_diff — closes the loop from "MCP told me what's wrong" to
 * "MCP fixed it". Re-runs the dispatcher against the project, generates the
 * diff for the requested finding(s), then applies them to disk (with .bak
 * backups) using the minimal append/new-file applier.
 */

import path from 'path';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';
import type { McpTool, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { analyze, generateDiffs } from './dispatcher.js';
import { applyDiff, ApplyResult } from './diffs/diff-applier.js';
import { withCompletionGate } from '../prompts/result-formatters.js';
import { withPreamble } from '../prompts/tool-preambles.js';

const SDK_ENUM = z.enum([
  'android-kotlin',
  'ios-swift',
  'flutter',
  'react-native',
  'ionic-capacitor',
]);

const ApplyDiffArgs = z.object({
  root_path: z.string().describe('Project root to operate on'),
  finding_ids: z
    .array(z.string())
    .optional()
    .describe('Specific finding IDs to apply. If omitted, applies all critical/high findings.'),
  sdk: SDK_ENUM.optional(),
  dry_run: z.boolean().default(false).describe('Compute the apply plan without writing files'),
});

export class FronteggApplyDiffTool {
  private readonly logger = Logger.getInstance();
  private readonly toolName = 'frontegg_apply_diff';

  public readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_apply_diff',
      'Apply Frontegg auto-fix diffs to a project. Re-runs detection, generates the diff for each requested finding, and writes the changes to disk with .bak backups. Set dry_run=true to preview the apply plan without touching files.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        root_path: { type: 'string' },
        finding_ids: { type: 'array', items: { type: 'string' } } as any,
        sdk: {
          type: 'string',
          enum: ['android-kotlin', 'ios-swift', 'flutter', 'react-native', 'ionic-capacitor'],
        },
        dry_run: { type: 'boolean' } as any,
      },
      required: ['root_path'],
    },
  };

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg apply_diff tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = ApplyDiffArgs.parse(rawArgs);
    const root = path.resolve(args.root_path);
    const dry = args.dry_run;

    const result = await analyze(root, args.sdk);
    const requested = args.finding_ids
      ? result.findings.filter((f) => args.finding_ids!.includes(f.id))
      : result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');

    if (requested.length === 0) {
      return textResult(
        '# No findings to apply\n\nNothing to do — either the project is already clean or the requested finding IDs did not match.'
      );
    }

    const diffs = await generateDiffs(
      root,
      requested.map((f) => f.id),
      result.knowledge
    );

    const applyResults: Array<{ id: string; result: ApplyResult | { error: string } }> = [];
    for (const d of diffs) {
      try {
        const r = await applyDiff({ rootPath: root, diff: d.diff, dryRun: dry });
        applyResults.push({ id: d.id, result: r });
      } catch (err) {
        applyResults.push({
          id: d.id,
          result: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    const body = this.format(applyResults, requested.length, diffs.length, dry);
    const wrapped = withCompletionGate(body, {
      sdksConsidered: result.matchedSdks,
      canonicalSources: Object.values(result.knowledge)
        .filter(Boolean)
        .map((k) => `${k!.sdk}${k!.version ? ` v${k!.version}` : ''} @ ${k!.repoRoot}`),
      rulesApplied: requested.map((f) => f.rule_id),
      manualVerification: [
        dry
          ? 'Dry run only — re-run with dry_run=false to actually write files.'
          : 'Re-run frontegg_auto and verify zero critical/high findings remain.',
        'Diff backups have been written to <file>.bak — delete them after you confirm the change works.',
        'Build + smoke-test the project before committing.',
      ],
    });
    return textResult(wrapped);
  }

  private format(
    results: Array<{ id: string; result: ApplyResult | { error: string } }>,
    requestedCount: number,
    diffCount: number,
    dry: boolean
  ): string {
    const lines: string[] = [];
    lines.push(`# Frontegg apply_diff ${dry ? '(dry run)' : ''}`);
    lines.push('');
    lines.push(
      `Findings requested: **${requestedCount}** · diffs generated: **${diffCount}** · results: **${results.length}**`
    );
    lines.push('');
    if (results.length === 0) {
      lines.push('_(No diffs were generated for the requested findings.)_');
      return lines.join('\n');
    }

    let created = 0;
    let appended = 0;
    let skipped = 0;
    let errored = 0;
    for (const r of results) {
      if ('error' in r.result) {
        errored++;
        lines.push(`- ❌ \`${r.id}\` — error: ${r.result.error}`);
        continue;
      }
      const ar = r.result;
      if (ar.status === 'created') {
        created++;
        lines.push(`- ✨ \`${r.id}\` — created \`${path.basename(ar.filePath)}\``);
      } else if (ar.status === 'appended') {
        appended++;
        lines.push(
          `- ✏️  \`${r.id}\` — appended to \`${path.basename(ar.filePath)}\`${ar.backupPath ? ` (backup: \`${path.basename(ar.backupPath)}\`)` : ''}`
        );
      } else {
        skipped++;
        lines.push(`- ⊘ \`${r.id}\` — skipped (${ar.reason || 'no-op'})`);
      }
    }
    lines.push('');
    lines.push(
      `**Summary**: ${created} created · ${appended} appended · ${skipped} skipped · ${errored} errored`
    );
    return lines.join('\n');
  }
}
