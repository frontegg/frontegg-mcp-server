import { z } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';
import { Finding, RuleMeta } from './types.js';
import { getRules, STATIC_RULES } from './rules.js';
import { analyze, generateDiffs as dispatchGenerateDiffs } from './dispatcher.js';
import { detectAndroidIssues } from './platforms/android-detector.js';
import { detectIosIssues } from './platforms/ios-detector.js';
import { detectCommonIssues } from './platforms/common-detector.js';
import { Sdk, loadKnowledge } from '../knowledge/index.js';
import { withCompletionGate } from '../prompts/result-formatters.js';
import type { McpTool, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';

const SDK_ENUM = z.enum([
  'android-kotlin',
  'ios-swift',
  'flutter',
  'react-native',
  'ionic-capacitor',
]);

const AnalyzeRepoArgs = z.object({
  root_path: z.string().describe('Absolute or relative path to the project root'),
  max_files: z.number().int().positive().default(1500),
  sdk: SDK_ENUM.optional().describe('Restrict analysis to this SDK; otherwise auto-detect'),
});

const GenerateDiffsArgs = z.object({
  root_path: z.string(),
  finding_ids: z.array(z.string()).min(1),
  sdk: SDK_ENUM.optional(),
});

const ExplainFindingArgs = z.object({ finding_id: z.string() });

const ReadResourceArgs = z.object({
  root_path: z.string(),
  path: z.string(),
  max_bytes: z.number().int().positive().default(64 * 1024),
});

export class WorkspaceTools {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg workspace tools');

    const root_path = { type: 'string' as const };
    const sdk = {
      type: 'string' as const,
      enum: ['android-kotlin', 'ios-swift', 'flutter', 'react-native', 'ionic-capacitor'],
    };

    const tools: Array<{
      definition: McpTool;
      handler: (args: unknown) => Promise<McpToolCallResult>;
    }> = [
      {
        definition: {
          name: 'analyze_repo',
          description:
            'Detect Frontegg integration issues in a project. Auto-detects the SDK if not specified and returns grouped findings.',
          inputSchema: {
            type: 'object',
            properties: { root_path, sdk, max_files: { type: 'number' } as any },
            required: ['root_path'],
          },
        },
        handler: (raw) => this.handleAnalyzeRepo(raw),
      },
      {
        definition: {
          name: 'generate_diffs',
          description:
            'Generate ready-to-apply unified diffs for a list of finding IDs returned by analyze_repo.',
          inputSchema: {
            type: 'object',
            properties: {
              root_path,
              sdk,
              finding_ids: { type: 'array', items: { type: 'string' } } as any,
            },
            required: ['root_path', 'finding_ids'],
          },
        },
        handler: (raw) => this.handleGenerateDiffs(raw),
      },
      {
        definition: {
          name: 'explain_finding',
          description: 'Return a human-readable explanation + troubleshooting hint for a finding ID.',
          inputSchema: {
            type: 'object',
            properties: { finding_id: { type: 'string' } },
            required: ['finding_id'],
          },
        },
        handler: (raw) => this.handleExplainFinding(raw),
      },
      {
        definition: {
          name: 'list_rules',
          description:
            'List the Frontegg rule catalog. By default auto-detects the SDK in `root_path` (or cwd) and shows only the rules relevant to that SDK plus common rules. Pass `sdk` to force a specific SDK, or `all: true` to list every rule.',
          inputSchema: {
            type: 'object',
            properties: {
              root_path: { type: 'string' },
              sdk: {
                type: 'string',
                enum: [
                  'android-kotlin',
                  'ios-swift',
                  'flutter',
                  'react-native',
                  'ionic-capacitor',
                ],
              },
              all: { type: 'boolean' },
            },
          },
        },
        handler: (raw) => this.handleListRules(raw),
      },
      {
        definition: {
          name: 'read_resource',
          description: 'Read a project file (or directory listing) bounded by max_bytes.',
          inputSchema: {
            type: 'object',
            properties: {
              root_path,
              path: { type: 'string' },
              max_bytes: { type: 'number' } as any,
            },
            required: ['root_path', 'path'],
          },
        },
        handler: (raw) => this.handleReadResource(raw),
      },
      {
        definition: {
          name: 'detect_android_issues',
          description: 'Run only the Android detector against a project root.',
          inputSchema: {
            type: 'object',
            properties: { root_path },
            required: ['root_path'],
          },
        },
        handler: (raw) => this.handleNativeDetect(raw, detectAndroidIssues),
      },
      {
        definition: {
          name: 'detect_ios_issues',
          description: 'Run only the iOS detector against a project root.',
          inputSchema: {
            type: 'object',
            properties: { root_path },
            required: ['root_path'],
          },
        },
        handler: (raw) => this.handleNativeDetect(raw, detectIosIssues),
      },
      {
        definition: {
          name: 'detect_common_issues',
          description: 'Run only the common (env / security) detector against a project root.',
          inputSchema: {
            type: 'object',
            properties: { root_path },
            required: ['root_path'],
          },
        },
        handler: (raw) => this.handleNativeDetect(raw, detectCommonIssues),
      },
    ];

    for (const t of tools) registry.add(t.definition, t.handler);
  }

  private async handleAnalyzeRepo(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = AnalyzeRepoArgs.parse(rawArgs);
    const result = await analyze(args.root_path, args.sdk);
    const body = JSON.stringify(
      { findings: result.findings, matchedSdks: result.matchedSdks },
      null,
      2
    );
    const wrapped = withCompletionGate(body, {
      sdksConsidered: result.matchedSdks,
      canonicalSources: Object.values(result.knowledge)
        .filter(Boolean)
        .map((k) => `${k!.sdk}${k!.version ? ` v${k!.version}` : ''} @ ${k!.repoRoot}`),
      rulesApplied: Array.from(new Set(result.findings.map((f) => f.rule_id))),
    });
    return textResult(wrapped);
  }

  private async handleGenerateDiffs(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = GenerateDiffsArgs.parse(rawArgs);
    const diffs = await dispatchGenerateDiffs(args.root_path, args.finding_ids);
    return textResult(this.formatDiffs(diffs));
  }

  private async handleExplainFinding(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = ExplainFindingArgs.parse(rawArgs);
    return textResult(await this.explainFinding(args.finding_id));
  }

  private async handleListRules(rawArgs?: unknown): Promise<McpToolCallResult> {
    const args = (rawArgs || {}) as { root_path?: string; sdk?: Sdk; all?: boolean };
    let allRules = await this.rulesMerged();

    // SDK → which rule platform/sdk values count as "relevant"
    const sdkPlatformMap: Record<Sdk, string[]> = {
      'android-kotlin': ['android'],
      'ios-swift': ['ios'],
      flutter: ['flutter', 'android', 'ios'],
      'react-native': ['react-native', 'android', 'ios'],
      'ionic-capacitor': ['ionic-capacitor', 'android', 'ios'],
    };

    let activeSdk: Sdk | undefined = args.sdk;
    let detectionNote = '';
    if (!args.all && !activeSdk) {
      const root = args.root_path || process.cwd();
      try {
        const result = await analyze(root);
        if (result.matchedSdks.length > 0) {
          // Prefer the cross-platform parent SDK when multiple match — a
          // Flutter/RN/Ionic project always also matches its underlying
          // android-kotlin/ios-swift shells, and the parent is what the
          // user is actually working in. Falls back to first match if no
          // cross-platform SDK is present (pure native project).
          const crossPlatform: Sdk[] = ['flutter', 'react-native', 'ionic-capacitor'];
          activeSdk =
            result.matchedSdks.find((s) => crossPlatform.includes(s)) ||
            result.matchedSdks[0];
          detectionNote = `_Auto-detected SDK: **${activeSdk}** at \`${root}\`. Pass \`all: true\` to see every rule._`;
        } else {
          detectionNote = `_No Frontegg SDK auto-detected at \`${root}\`. Showing all rules. Pass \`sdk\` or \`all: true\` to filter._`;
        }
      } catch {
        detectionNote = `_Auto-detection failed; showing all rules._`;
      }
    } else if (activeSdk) {
      detectionNote = `_Filtered to SDK: **${activeSdk}**. Pass \`all: true\` to see every rule._`;
    } else {
      detectionNote = `_Showing all rules._`;
    }

    if (activeSdk && !args.all) {
      const allowedPlatforms = new Set(['common', ...sdkPlatformMap[activeSdk]]);
      // allowedSdks includes the active SDK PLUS any native shells implied by
      // it (flutter/rn/ionic projects always carry android + ios shells). This
      // future-proofs against rules that tag their SDK via `sdk:` instead of
      // `platforms:` — e.g. a rule with sdk: ['android-kotlin'] should surface
      // in a Flutter project because that project does have a native Android
      // shell underneath. Keep `platforms:` as the preferred tagging style.
      const allowedSdks = new Set<string>([activeSdk, ...sdkPlatformMap[activeSdk].map(
        (p) => (p === 'android' ? 'android-kotlin' : p === 'ios' ? 'ios-swift' : p)
      )]);
      allRules = allRules.filter((r: any) => {
        const sdks: string[] = r.sdk || [];
        const platforms: string[] = r.platforms || [];
        if (sdks.length > 0) return sdks.some((s) => allowedSdks.has(s));
        return platforms.some((p) => allowedPlatforms.has(p));
      });
    }

    const rules = allRules;
    const sevRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sevIcon: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      info: '⚪',
    };
    const groups = new Map<string, typeof rules>();
    for (const r of rules) {
      const k = (r as any).sdk?.[0] || (r as any).platforms?.[0] || 'common';
      if (!groups.has(k)) groups.set(k, [] as any);
      (groups.get(k) as any).push(r);
    }
    const groupOrder = [
      'common',
      'android',
      'ios',
      'flutter',
      'react-native',
      'ionic-capacitor',
    ];
    const titles: Record<string, string> = {
      common: 'Common (env / security)',
      android: 'Android (native Kotlin)',
      ios: 'iOS (native Swift)',
      flutter: 'Flutter',
      'react-native': 'React Native',
      'ionic-capacitor': 'Ionic Capacitor',
    };
    const lines: string[] = [];
    lines.push(`# Frontegg Mobile MCP — Rule Catalog`);
    lines.push('');
    lines.push(
      `**${rules.length} rules** · Severity legend: 🔴 critical · 🟠 high · 🟡 medium · 🔵 low`
    );
    if (detectionNote) {
      lines.push('');
      lines.push(detectionNote);
    }
    lines.push('');
    const seen = new Set<string>();
    const renderGroup = (key: string) => {
      const list = groups.get(key);
      if (!list || list.length === 0) return;
      seen.add(key);
      list.sort(
        (a: any, b: any) =>
          (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9) || a.id.localeCompare(b.id)
      );
      lines.push(`## ${titles[key] || key}  _(${list.length})_`);
      lines.push('');
      lines.push('| Sev | ID | Title |');
      lines.push('|---|---|---|');
      for (const r of list as any[]) {
        const icon = sevIcon[r.severity] || '·';
        lines.push(`| ${icon} ${r.severity} | \`${r.id}\` | ${r.title} |`);
      }
      lines.push('');
    };
    for (const k of groupOrder) renderGroup(k);
    for (const k of groups.keys()) if (!seen.has(k)) renderGroup(k);
    lines.push('---');
    lines.push(
      `_Static rules merged with dynamic Known-Issues rules pulled live from each SDK README._`
    );
    return textResult(lines.join('\n'));
  }

  private async handleReadResource(rawArgs: unknown): Promise<McpToolCallResult> {
    const args = ReadResourceArgs.parse(rawArgs);
    const out = await this.readResource(args.root_path, args.path, args.max_bytes);
    return textResult(out);
  }

  private async handleNativeDetect(
    rawArgs: unknown,
    detector: (root: string) => Promise<Finding[]>
  ): Promise<McpToolCallResult> {
    const root = String((rawArgs as any)?.root_path || process.cwd());
    const issues = await detector(root);
    return textResult(JSON.stringify({ findings: issues }, null, 2));
  }

  /** Back-compat shim used by frontegg-auto; delegates to the dispatcher. */
  public async analyzeRepo(
    rootPath: string,
    _maxFiles: number,
    sdk?: Sdk
  ): Promise<Finding[]> {
    const result = await analyze(rootPath, sdk);
    return result.findings;
  }

  /** Back-compat shim. */
  public async generateDiffs(
    rootPath: string,
    findingIds: string[],
    _sdk?: Sdk
  ): Promise<Array<{ id: string; diff: string }>> {
    return dispatchGenerateDiffs(rootPath, findingIds);
  }

  private formatDiffs(diffs: Array<{ id: string; diff: string }>): string {
    if (diffs.length === 0) return 'No diffs generated for the selected findings.';
    return diffs.map((d) => `# Finding ${d.id}\n\n${d.diff}`).join('\n\n');
  }

  public async explainFinding(findingId: string): Promise<string> {
    const rule = STATIC_RULES.find((r) => r.id === findingId || findingId.startsWith(r.id));
    if (rule) {
      return [
        `# ${rule.title}`,
        '',
        rule.description,
        rule.troubleshooting ? `\n**Troubleshooting:** ${rule.troubleshooting}` : '',
        rule.docAnchor ? `\n**Doc anchor:** ${rule.docAnchor}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    return 'No additional details available for this finding id.';
  }

  public async validateSetup(): Promise<Record<string, unknown>> {
    return { healthy: true, checks: ['env', 'platform_files', 'config'] };
  }

  public rules(): RuleMeta[] {
    return STATIC_RULES;
  }

  private async rulesMerged(): Promise<RuleMeta[]> {
    const merged: RuleMeta[] = [...STATIC_RULES];
    for (const sdk of ['android-kotlin', 'ios-swift', 'flutter', 'react-native', 'ionic-capacitor'] as Sdk[]) {
      try {
        const k = await loadKnowledge(sdk);
        if (k) merged.push(...getRules(k).filter((r) => !STATIC_RULES.find((s) => s.id === r.id)));
      } catch {
        /* skip */
      }
    }
    return merged;
  }

  public async readResource(rootPath: string, relPath: string, maxBytes: number): Promise<string> {
    const p = path.resolve(rootPath, relPath);
    const stat = await fs.stat(p);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(p);
      return entries.join('\n');
    }
    const file = await fs.readFile(p);
    const slice = file.slice(0, Math.min(maxBytes, file.length));
    return slice.toString('utf8');
  }
}
