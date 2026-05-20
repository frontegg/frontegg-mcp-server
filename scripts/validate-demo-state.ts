// Validate that a "demo-start" project triggers the expected Frontegg findings.
// Used as a pre-shoot gate for the showcase video — fail fast if the detector
// drift removes findings the recorded scenes depend on.
//
//   npx tsx scripts/validate-demo-state.ts <project-path>

import { analyze } from '../src/tools/dispatcher.js';

async function main(): Promise<void> {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx scripts/validate-demo-state.ts <project-path>');
    process.exit(1);
  }

  const result = await analyze(target);
  console.log(`detected SDK(s): ${result.matchedSdks.join(', ') || 'none'}`);
  console.log(`findings: ${result.findings.length}`);
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.id} — ${f.title} (${f.file_path || '-'})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
