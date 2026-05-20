import { Sdk } from '../knowledge/types.js';

export interface EvidenceBlock {
  filesRead?: string[];
  rulesApplied?: string[];
  canonicalSources?: string[];
  sdksConsidered?: Sdk[];
  manualVerification?: string[];
}

/**
 * Append the godmode completion-gate footer to a tool response. Anything
 * this MCP emits that claims to analyze or fix something must go through
 * this wrapper so the calling model sees the evidence shape.
 */
export function withCompletionGate(body: string, evidence: EvidenceBlock): string {
  const lines: string[] = [body.trimEnd(), '', '---', '## Evidence (completion-gate)'];

  if (evidence.sdksConsidered?.length) {
    lines.push(`- **SDK(s) considered**: ${evidence.sdksConsidered.join(', ')}`);
  }
  if (evidence.canonicalSources?.length) {
    lines.push('- **Canonical sources consulted**:');
    for (const s of evidence.canonicalSources) lines.push(`  - ${s}`);
  }
  if (evidence.filesRead?.length) {
    lines.push('- **Files read**:');
    for (const f of evidence.filesRead) lines.push(`  - ${f}`);
  }
  if (evidence.rulesApplied?.length) {
    lines.push('- **Rules applied**:');
    for (const r of evidence.rulesApplied) lines.push(`  - ${r}`);
  }
  lines.push('', '## Manual verification (required before claiming done)');
  if (evidence.manualVerification?.length) {
    for (const v of evidence.manualVerification) lines.push(`- [ ] ${v}`);
  } else {
    lines.push('- [ ] Build the project on a clean checkout.');
    lines.push('- [ ] Exercise the login flow end-to-end.');
    lines.push('- [ ] Verify deep-link callback opens the app and lands on the auth handler.');
  }
  lines.push(
    '',
    '> Per godmode completion-gate: do not mark this task "fixed" until every checkbox above is verified by observation (logs, device, simulator), not inference.'
  );
  return lines.join('\n');
}

/** Group findings by the Frontegg integration flow they belong to. */
export function groupByFlow<T extends { rule_id: string }>(findings: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {
    'deep-link': [],
    'init': [],
    'auth': [],
    'security': [],
    'build': [],
    'env': [],
    'other': [],
  };
  for (const f of findings) {
    const bucket = flowForRule(f.rule_id);
    (groups[bucket] ||= []).push(f);
  }
  // Drop empty buckets for cleaner output.
  for (const k of Object.keys(groups)) {
    if ((groups[k] ?? []).length === 0) delete groups[k];
  }
  return groups;
}

function flowForRule(ruleId: string): string {
  if (/intentFilter|urlTypes|associatedDomains|appLinks|deepLink|linking/i.test(ruleId))
    return 'deep-link';
  if (/init|provider|bootstrap|app\.init|frontegg\.plist/i.test(ruleId)) return 'init';
  if (/auth|token|login|logout|mfa|refresh|callback|social/i.test(ruleId)) return 'auth';
  if (/secret|https|hardcoded|pinning|keychain|keystore|gitignore|ats|arbitrary|transport/i.test(ruleId))
    return 'security';
  if (/gradle|pod|metro|proguard|capacitor\.sync|pubspec|lockfile/i.test(ruleId)) return 'build';
  if (/env|baseUrl|appId|clientId|region/i.test(ruleId)) return 'env';
  return 'other';
}
