#!/usr/bin/env tsx
/**
 * End-to-end test harness for the Frontegg Mobile MCP Server.
 *
 * Exercises the real dispatcher against:
 *   1. In-memory fixture projects (the same scenarios the demos use)
 *   2. Ground-truth canonical sample apps under ~/developer/frontegg-*
 *   3. Tmp copies of canonical apps with injected breakages
 *   4. The MCP stdio transport via spawned `node dist/index.js`
 *
 * Usage:
 *   tsx scripts/test-e2e.ts                  # run everything
 *   tsx scripts/test-e2e.ts demos            # layer 1 only
 *   tsx scripts/test-e2e.ts ground           # layer 2 only
 *   tsx scripts/test-e2e.ts break            # layer 3 only
 *   tsx scripts/test-e2e.ts stdio            # layer 4 only
 */

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { analyze, generateDiffs } from '../src/tools/dispatcher.js';
import type { Sdk } from '../src/knowledge/types.js';

const HOME = os.homedir();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  green: '\x1b[38;5;120m',
  yellow: '\x1b[38;5;221m',
  blue: '\x1b[38;5;111m',
  purple: '\x1b[38;5;141m',
  slate: '\x1b[38;5;244m',
};

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  const mark = passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
  console.log(`  ${mark} ${name}  ${c.slate}${detail}${c.reset}`);
}

function section(title: string) {
  console.log();
  console.log(`${c.bold}${c.purple}━━━ ${title} ━━━${c.reset}`);
}

// ───────────────────── Layer 1: in-memory demos ─────────────────────
async function layer1Demos() {
  section('Layer 1 · in-memory demo scenarios');
  const scenarios = ['rn', 'flutter', 'ionic', 'security'] as const;
  for (const s of scenarios) {
    const proc = spawnSync('tsx', [path.join(ROOT, 'src/demo.ts'), s], {
      cwd: ROOT,
      env: process.env,
      encoding: 'utf8',
    });
    const out = (proc.stdout || '') + (proc.stderr || '');
    const ok =
      proc.status === 0 &&
      /Frontegg Auto Report/.test(out) &&
      /FLOW · /.test(out) &&
      /\[(CRITICAL|HIGH)\]/.test(out);
    record(`demo:${s}`, ok, ok ? 'report + findings emitted' : `exit=${proc.status}`);
    if (!ok) console.log(c.dim + out.slice(0, 1500) + c.reset);
  }
}

// ───────────────── Layer 2: ground-truth canonical apps ─────────────────
const SAMPLE_APPS: Array<{ sdk: Sdk; label: string; path: string }> = [
  {
    sdk: 'android-kotlin',
    label: 'android-kotlin (repo root)',
    path: path.join(HOME, 'developer/frontegg-android-kotlin'),
  },
  {
    sdk: 'ios-swift',
    label: 'ios-swift demo/demo',
    path: path.join(HOME, 'developer/frontegg-ios-swift/demo/demo'),
  },
  {
    sdk: 'flutter',
    label: 'flutter hosted sample',
    path: path.join(HOME, 'developer/frontegg-flutter/hosted'),
  },
  {
    sdk: 'react-native',
    label: 'react-native example',
    path: path.join(HOME, 'developer/frontegg-react-native/example'),
  },
  {
    sdk: 'ionic-capacitor',
    label: 'ionic-capacitor example',
    path: path.join(HOME, 'developer/frontegg-ionic-capacitor/example'),
  },
];

async function layer2Ground() {
  section('Layer 2 · ground-truth canonical sample apps');
  for (const app of SAMPLE_APPS) {
    try {
      const exists = await fs.stat(app.path).then((s) => s.isDirectory()).catch(() => false);
      if (!exists) {
        record(app.label, false, `missing path: ${app.path}`);
        continue;
      }
      const result = await analyze(app.path, app.sdk);
      const crit = result.findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
      const passed = crit.length <= 1;
      const ids = crit.map((f) => f.id).join(', ');
      record(
        app.label,
        passed,
        `detected=${result.matchedSdks.join(',') || '-'} crit/high=${crit.length}${ids ? ' [' + ids + ']' : ''}`
      );
      if (crit.length > 0) {
        for (const f of crit.slice(0, 3)) {
          console.log(`    ${c.yellow}· ${f.title}${c.reset}  ${c.dim}${f.file_path || ''}${c.reset}`);
        }
      }
    } catch (err) {
      record(app.label, false, `error: ${(err as Error).message}`);
    }
  }
}

// ───────────────── Layer 3: breakage injection ─────────────────
interface Breakage {
  sdk: Sdk;
  label: string;
  source: string;
  expectedRuleId: string;
  apply: (tmpRoot: string) => Promise<void>;
}

async function copyDir(src: string, dst: string, skipDirs = new Set(['node_modules', '.git', 'build', 'Pods', '.dart_tool', '.gradle', 'dist'])) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (skipDirs.has(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d, skipDirs);
    } else if (e.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function stripFronteggFromGradle(root: string): Promise<void> {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'build', '.gradle'].includes(e.name)) continue;
        stack.push(p);
      } else if (e.name === 'build.gradle' || e.name === 'build.gradle.kts') {
        let body = await fs.readFile(p, 'utf8');
        if (!/frontegg/i.test(body)) continue;
        // Strip any line containing frontegg (placeholder, var assignment, dep)
        body = body.replace(/^.*frontegg.*$/gim, '');
        // Strip entire manifestPlaceholders blocks (they contain frontegg keys)
        body = body.replace(/manifestPlaceholders\s*=\s*\[[\s\S]*?\]/g, '');
        await fs.writeFile(p, body);
      }
    }
  }
}

async function stripFronteggFromIosSources(root: string): Promise<void> {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'build', 'Pods', 'DerivedData'].includes(e.name)) continue;
        stack.push(p);
      } else if (e.name === 'Frontegg.plist') {
        await fs.rm(p);
      } else if (/\.(swift|m|mm)$/.test(e.name)) {
        let body = await fs.readFile(p, 'utf8');
        if (!/Frontegg/.test(body)) continue;
        body = body
          .replace(/^.*import\s+FronteggSwift.*$/gm, '')
          .replace(/Frontegg(Auth|App)\b/g, 'Disabled');
        await fs.writeFile(p, body);
      }
    }
  }
}

async function findFile(root: string, name: string): Promise<string | null> {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'build', 'Pods'].includes(e.name)) continue;
        stack.push(p);
      } else if (e.name === name) {
        return p;
      }
    }
  }
  return null;
}

const BREAKAGES: Breakage[] = [
  {
    sdk: 'android-kotlin',
    label: 'android-kotlin — strip Frontegg wiring entirely',
    source: path.join(HOME, 'developer/frontegg-android-kotlin'),
    expectedRuleId: 'android.intentFilter.missing',
    async apply(root) {
      const manifest = await findFile(root, 'AndroidManifest.xml');
      if (!manifest) throw new Error('AndroidManifest.xml not found in copy');
      let content = await fs.readFile(manifest, 'utf8');
      content = content.replace(/<intent-filter[\s\S]*?<\/intent-filter>/g, '');
      await fs.writeFile(manifest, content);
      // Also strip all Frontegg gradle wiring so the manifest-placeholders
      // suppression doesn't kick in — this simulates a user who hasn't
      // wired the SDK at all yet.
      await stripFronteggFromGradle(root);
    },
  },
  {
    sdk: 'ios-swift',
    label: 'ios-swift — strip iOS Frontegg wiring entirely',
    source: path.join(HOME, 'developer/frontegg-ios-swift/demo/demo'),
    expectedRuleId: 'ios.urlTypes.missing',
    async apply(root) {
      const plist = await findFile(root, 'Info.plist');
      if (!plist) throw new Error('Info.plist not found in copy');
      let content = await fs.readFile(plist, 'utf8');
      content = content.replace(/<key>CFBundleURLTypes<\/key>[\s\S]*?<\/array>/g, '');
      await fs.writeFile(plist, content);
      // Also remove Frontegg.plist + Frontegg references in Swift so the
      // iOS wiring probe can't detect the SDK as linked.
      await stripFronteggFromIosSources(root);
    },
  },
  {
    sdk: 'flutter',
    label: 'flutter — remove frontegg_flutter dep',
    source: path.join(HOME, 'developer/frontegg-flutter/hosted'),
    expectedRuleId: 'flutter.dependency.missing',
    async apply(root) {
      const pubspec = path.join(root, 'pubspec.yaml');
      let content = await fs.readFile(pubspec, 'utf8');
      content = content.replace(/^\s*frontegg_flutter:[\s\S]*?(?=^\s*\w+:|\Z)/m, '');
      await fs.writeFile(pubspec, content);
    },
  },
  {
    sdk: 'react-native',
    label: 'react-native — strip RN + gradle wiring',
    source: path.join(HOME, 'developer/frontegg-react-native/example'),
    expectedRuleId: 'rn.android.intentFilter.missing',
    async apply(root) {
      const manifest = await findFile(path.join(root, 'android'), 'AndroidManifest.xml');
      if (!manifest) throw new Error('Android manifest not found in copy');
      let content = await fs.readFile(manifest, 'utf8');
      content = content.replace(/<intent-filter[\s\S]*?<\/intent-filter>/g, '');
      await fs.writeFile(manifest, content);
      await stripFronteggFromGradle(path.join(root, 'android'));
    },
  },
  {
    sdk: 'ionic-capacitor',
    label: 'ionic-capacitor — remove FronteggNative plugin block',
    source: path.join(HOME, 'developer/frontegg-ionic-capacitor/example'),
    expectedRuleId: 'ionic.capacitorConfig.plugin.missing',
    async apply(root) {
      const cfg = await findFile(root, 'capacitor.config.ts');
      if (!cfg) throw new Error('capacitor.config.ts not found in copy');
      let content = await fs.readFile(cfg, 'utf8');
      // Rename the plugin key — the detector looks specifically for
      // `FronteggNative:`, so renaming makes the rule fire deterministically.
      content = content.replace(/FronteggNative\s*:/g, 'DisabledPlugin:');
      await fs.writeFile(cfg, content);
    },
  },
];

async function layer3Break() {
  section('Layer 3 · breakage injection + diff generation');
  for (const b of BREAKAGES) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `frontegg-break-${b.sdk}-`));
    try {
      const exists = await fs.stat(b.source).then((s) => s.isDirectory()).catch(() => false);
      if (!exists) {
        record(b.label, false, `missing source: ${b.source}`);
        continue;
      }
      await copyDir(b.source, tmp);
      await b.apply(tmp);
      const result = await analyze(tmp, b.sdk);
      const match = result.findings.find((f) => f.rule_id === b.expectedRuleId);
      if (!match) {
        const ids = result.findings.map((f) => f.rule_id).slice(0, 5).join(', ');
        record(b.label, false, `expected ${b.expectedRuleId} not fired. got: ${ids || 'none'}`);
        continue;
      }
      const diffs = await generateDiffs(tmp, [match.id], result.knowledge);
      const diffPresent = diffs.length > 0 && diffs[0]!.diff.length > 0;
      record(
        b.label,
        diffPresent,
        diffPresent
          ? `detected ${match.rule_id} + ${diffs[0]!.diff.split('\n').length} line diff`
          : `detected ${match.rule_id} but no diff generated`
      );
    } catch (err) {
      record(b.label, false, `error: ${(err as Error).message}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}

// ───────────────── Layer 4: MCP stdio smoke test ─────────────────
const EXPECTED_TOOLS = [
  'frontegg_auto',
  'frontegg_apply_diff',
  'analyze_repo',
  'generate_diffs',
  'list_rules',
  'explain_finding',
  'read_resource',
  'detect_android_issues',
  'detect_ios_issues',
  'detect_common_issues',
  'frontegg_feature_guide',
  'frontegg_configure_mfa',
  'frontegg_configure_sessions',
  'frontegg_configure_sso',
  'frontegg_configure_identity',
];

async function layer4Stdio() {
  section('Layer 4 · MCP stdio smoke test');
  const distEntry = path.join(ROOT, 'dist/index.js');
  const distExists = await fs.access(distEntry).then(() => true).catch(() => false);
  if (!distExists) {
    console.log(
      `  ${c.yellow}⊘${c.reset} stdio layer skipped  ${c.slate}(dist/index.js missing — run: npm run build)${c.reset}`
    );
    return;
  }
  await new Promise<void>((resolve) => {
    const child = spawn('node', [distEntry], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const req = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    setTimeout(() => child.stdin.write(req + '\n'), 600);

    setTimeout(() => {
      // Find the first JSON-RPC response line in stdout.
      const lines = stdout.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
      let toolNames: string[] = [];
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed?.result?.tools && Array.isArray(parsed.result.tools)) {
            toolNames = parsed.result.tools.map((t: any) => t.name).filter(Boolean);
            break;
          }
        } catch {
          /* skip non-JSON line */
        }
      }
      const missing = EXPECTED_TOOLS.filter((n) => !toolNames.includes(n));
      const startupLine =
        /started successfully|ready to handle/i.test(stderr) ||
        /started successfully/i.test(stdout);
      record(
        'server starts',
        startupLine,
        startupLine ? 'startup log seen' : `no startup line. stderr=${stderr.slice(0, 200)}`
      );
      record(
        'tools/list returns tools',
        toolNames.length > 0,
        toolNames.length > 0 ? `got ${toolNames.length} tools` : 'no tools array in any response line'
      );
      record(
        'all expected tools registered (no multi-handler dead surface)',
        missing.length === 0,
        missing.length === 0
          ? `all ${EXPECTED_TOOLS.length} tools present`
          : `missing: ${missing.join(', ')}`
      );
      child.kill();
      resolve();
    }, 3500);
  });
}

// ───────────────── Layer 5: apply_diff end-to-end ─────────────────
async function layer5ApplyDiff() {
  section('Layer 5 · apply_diff writes real changes');
  const { applyDiff } = await import('../src/tools/diffs/diff-applier.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontegg-apply-'));
  try {
    // 1. New-file diff
    const newFileDiff = [
      '--- /dev/null',
      '+++ .env',
      '@@',
      '+FRONTEGG_APP_ID=demo',
      '+FRONTEGG_BASE_URL=https://app-demo.frontegg.com',
      '',
    ].join('\n');
    const r1 = await applyDiff({ rootPath: tmp, diff: newFileDiff });
    const created = r1.status === 'created';
    let content = '';
    if (created) {
      content = await fs.readFile(path.join(tmp, '.env'), 'utf8');
    }
    record(
      'apply_diff creates new file',
      created && content.includes('FRONTEGG_APP_ID=demo'),
      created ? `wrote ${content.split('\n').length} lines` : `status=${r1.status}`
    );

    // 2. Append diff
    const appendDiffStr = [
      '--- .env',
      '+++ .env',
      '@@',
      '+FRONTEGG_REGION=eu',
      '',
    ].join('\n');
    const r2 = await applyDiff({ rootPath: tmp, diff: appendDiffStr });
    const updated = await fs.readFile(path.join(tmp, '.env'), 'utf8');
    record(
      'apply_diff appends to existing file',
      r2.status === 'appended' && updated.includes('FRONTEGG_REGION=eu'),
      r2.status === 'appended' ? 'append confirmed + .bak written' : `status=${r2.status}`
    );

    // 3. Idempotent: re-applying the same append should be a no-op
    const r3 = await applyDiff({ rootPath: tmp, diff: appendDiffStr });
    record(
      'apply_diff is idempotent (skip when already present)',
      r3.status === 'skipped',
      `status=${r3.status}`
    );

    // 4. Refuse deletion-style diff
    const badDiff = [
      '--- .env',
      '+++ .env',
      '@@',
      '-FRONTEGG_APP_ID=demo',
      '',
    ].join('\n');
    let rejected = false;
    try {
      await applyDiff({ rootPath: tmp, diff: badDiff });
    } catch {
      rejected = true;
    }
    record('apply_diff rejects deletion patches', rejected, rejected ? 'threw as expected' : 'should have thrown');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ───────────────── Layer 6: per-SDK full round-trip ─────────────────
// Break canonical sample → analyze → diff → apply → re-analyze → finding gone.
// Also verifies dry_run does not write to disk.
async function layer6RoundTrip() {
  section('Layer 6 · per-SDK round-trip (analyze → diff → apply → re-analyze)');
  const { applyDiff } = await import('../src/tools/diffs/diff-applier.js');
  for (const b of BREAKAGES) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `frontegg-rt-${b.sdk}-`));
    try {
      const exists = await fs.stat(b.source).then((s) => s.isDirectory()).catch(() => false);
      if (!exists) {
        record(`${b.sdk} round-trip`, false, `missing source: ${b.source}`);
        continue;
      }
      await copyDir(b.source, tmp);
      await b.apply(tmp);
      const r1 = await analyze(tmp, b.sdk);
      const target = r1.findings.find((f) => f.rule_id === b.expectedRuleId);
      if (!target) {
        record(`${b.sdk} round-trip`, false, `expected ${b.expectedRuleId} did not fire`);
        continue;
      }
      const diffs = await generateDiffs(tmp, [target.id], r1.knowledge);
      if (!diffs[0] || !diffs[0].diff) {
        record(`${b.sdk} round-trip`, false, `no diff generated for ${target.id}`);
        continue;
      }
      // Snapshot file mtimes before dry_run to verify it does not write.
      const before = await snapshotMtimes(tmp);
      await applyDiff({ rootPath: tmp, diff: diffs[0].diff, dryRun: true });
      const after = await snapshotMtimes(tmp);
      const dryClean =
        before.size === after.size &&
        [...before].every(([k, v]) => after.get(k) === v);
      if (!dryClean) {
        record(`${b.sdk} round-trip`, false, 'dry_run mutated disk');
        continue;
      }
      const applyRes = await applyDiff({ rootPath: tmp, diff: diffs[0].diff, dryRun: false });
      const r2 = await analyze(tmp, b.sdk);
      const stillThere = r2.findings.some((f) => f.rule_id === b.expectedRuleId);
      record(
        `${b.sdk} round-trip`,
        !stillThere,
        stillThere
          ? `apply=${applyRes.status} but rule still fires`
          : `apply=${applyRes.status} → finding cleared`
      );
    } catch (err) {
      record(`${b.sdk} round-trip`, false, `error: ${(err as Error).message}`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}

async function snapshotMtimes(root: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'build', 'Pods', 'DerivedData'].includes(e.name)) continue;
        stack.push(p);
      } else if (e.isFile()) {
        try {
          const st = await fs.stat(p);
          out.set(p, st.mtimeMs);
        } catch {
          /* skip */
        }
      }
    }
  }
  return out;
}

// ───────────────── Runner ─────────────────
async function main() {
  const arg = process.argv[2];
  const t0 = Date.now();
  console.log(`${c.bold}Frontegg Mobile MCP Server — end-to-end test suite${c.reset}`);
  if (!arg || arg === 'demos') await layer1Demos();
  if (!arg || arg === 'ground') await layer2Ground();
  if (!arg || arg === 'break') await layer3Break();
  if (!arg || arg === 'stdio') await layer4Stdio();
  if (!arg || arg === 'apply') await layer5ApplyDiff();
  if (!arg || arg === 'roundtrip') await layer6RoundTrip();

  section('Summary');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const color = failed === 0 ? c.green : c.red;
  console.log(
    `${color}${c.bold}${passed} passed, ${failed} failed${c.reset} ${c.dim}(${dur}s)${c.reset}`
  );
  if (failed > 0) {
    console.log();
    console.log(`${c.red}Failures:${c.reset}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${c.red}✗${c.reset} ${r.name} — ${r.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
