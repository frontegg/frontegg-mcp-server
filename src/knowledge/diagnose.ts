import { Finding } from '../tools/types.js';
import { SdkKnowledge } from './types.js';

/**
 * Enrich detector findings with canonical references pulled from the live
 * SDK repo: current version, doc anchors, and links to the example app file
 * that demonstrates the correct configuration.
 */
export function diagnose(findings: Finding[], knowledge: SdkKnowledge | null): Finding[] {
  if (!knowledge) return findings;
  return findings.map((f) => {
    const ref = canonicalRefFor(f, knowledge);
    if (!ref) return f;
    return {
      ...f,
      why: f.why + '\n' + ref,
    };
  });
}

function canonicalRefFor(f: Finding, k: SdkKnowledge): string | null {
  const parts: string[] = [];
  const versionSuffix = k.version ? ` v${k.version}` : '';
  parts.push(`Canonical: ${k.sdk}${versionSuffix} — ${k.repoRoot}`);

  // Map rule id -> relevant canonical snippet key.
  const snippetKey = snippetKeyForRule(f.rule_id);
  if (snippetKey && k.snippets[snippetKey]) {
    const snip = k.snippets[snippetKey]!;
    parts.push(`See example: ${k.repoRoot}/blob/master/${snip.path}`);
  }

  // Link known issue if the rule id mentions it.
  const issue = k.knownIssues.find((ki) => f.rule_id.includes(ki.id) || ki.id.includes(f.rule_id));
  if (issue) {
    parts.push(`Known issue: ${issue.title}`);
  }

  return parts.length ? parts.join(' ') : null;
}

function snippetKeyForRule(ruleId: string): string | null {
  if (ruleId.startsWith('android.')) {
    if (ruleId.includes('gradle')) return 'android.gradle';
    return 'android.manifest';
  }
  if (ruleId.startsWith('ios.')) {
    if (ruleId.includes('podfile')) return 'ios.podfile';
    if (ruleId.includes('init')) return 'ios.appDelegate.swift';
    if (ruleId.includes('appDelegate')) return 'ios.appDelegate.swift';
    if (ruleId.includes('frontegg.plist')) return 'ios.fronteggPlist';
    return 'ios.infoPlist';
  }
  if (ruleId.startsWith('flutter.')) {
    if (ruleId.includes('main')) return 'flutter.main';
    if (ruleId.includes('pubspec')) return 'flutter.pubspec';
  }
  if (ruleId.startsWith('rn.')) {
    if (ruleId.includes('android')) return 'android.manifest';
    if (ruleId.includes('ios')) return 'ios.infoPlist';
    return 'rn.app';
  }
  if (ruleId.startsWith('ionic.')) {
    return 'ionic.capacitorConfigTs';
  }
  return null;
}
