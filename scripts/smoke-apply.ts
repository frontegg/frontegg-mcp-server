// Smoke test for frontegg_apply_diff: apply all critical/high findings to
// the given project root and report what landed where.
//
//   npx tsx scripts/smoke-apply.ts <project-path>

import { analyze, generateDiffs } from '../src/tools/dispatcher.js';
import { applyDiff } from '../src/tools/diffs/diff-applier.js';

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx scripts/smoke-apply.ts <project-path>');
    process.exit(1);
  }

  const result = await analyze(target);
  const requested = result.findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'high'
  );
  console.log(`detected SDK(s): ${result.matchedSdks.join(', ') || 'none'}`);
  console.log(`findings: ${result.findings.length}; will apply ${requested.length}`);
  for (const f of requested) {
    console.log(`  [${f.severity}] ${f.id} -> ${f.file_path || '-'}`);
  }

  const diffs = await generateDiffs(
    target,
    requested.map((f) => f.id),
    result.knowledge
  );
  console.log(`\ngenerated ${diffs.length} diff(s):`);
  for (const d of diffs) {
    console.log(`--- ${d.id} ---`);
    console.log(d.diff);
    console.log('');
  }

  console.log(`\napplying...`);
  for (const d of diffs) {
    try {
      const r = await applyDiff({ rootPath: target, diff: d.diff });
      console.log(
        `[${d.id}] ${r.status}${r.filePath ? `  ${r.filePath}` : ''}${r.reason ? `  (${r.reason})` : ''}`
      );
    } catch (err) {
      console.log(`[${d.id}] ERROR  ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
