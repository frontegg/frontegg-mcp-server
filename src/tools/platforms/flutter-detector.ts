import path from 'path';
import { Finding } from '../types.js';
import { SdkKnowledge } from '../../knowledge/types.js';
import { PlatformDetector } from './types.js';
import { findFirst, readIfExists } from './fs-util.js';
import { detectAndroidIssues } from './android-detector.js';
import { detectIosIssues } from './ios-detector.js';

export async function detectFlutterIssues(
  root: string,
  knowledge: SdkKnowledge | null
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const pubspecPath = await findFirst(root, 'pubspec.yaml');
  if (!pubspecPath) return findings;
  const pubspec = (await readIfExists(pubspecPath)) || '';
  const relPubspec = path.relative(root, pubspecPath);

  const hasDep = /^\s*frontegg_flutter\s*:/m.test(pubspec);
  if (!hasDep) {
    findings.push({
      id: 'flutter.dependency.missing',
      rule_id: 'flutter.dependency.missing',
      title: 'frontegg_flutter dependency not declared',
      severity: 'critical',
      file_path: relPubspec,
      why: 'pubspec.yaml does not declare frontegg_flutter — SDK must be added before init can work.',
      suggested_fix: "Add 'frontegg_flutter: ^<latest>' under dependencies in pubspec.yaml.",
      platform: 'flutter',
      sdk: 'flutter',
      flow: 'build',
    });
  } else if (knowledge?.version) {
    const m = /frontegg_flutter\s*:\s*[\^~]?([0-9]+\.[0-9]+\.[0-9]+)/m.exec(pubspec);
    if (m && m[1] !== knowledge.version) {
      findings.push({
        id: 'flutter.dependency.versionDrift',
        rule_id: 'flutter.dependency.versionDrift',
        title: `frontegg_flutter version drift (${m[1]} vs canonical ${knowledge.version})`,
        severity: 'low',
        file_path: relPubspec,
        why: 'User project pins a version older/newer than the canonical SDK repo.',
        suggested_fix: `Bump to ^${knowledge.version} if compatible with your Flutter SDK channel.`,
        platform: 'flutter',
        sdk: 'flutter',
        flow: 'build',
      });
    }
  }

  // Init call in main.dart
  const mainDart = await findFirst(root, 'main.dart');
  if (mainDart) {
    const content = (await readIfExists(mainDart)) || '';
    if (!/FronteggApp|FronteggProvider|frontegg_flutter/.test(content)) {
      findings.push({
        id: 'flutter.init.missing',
        rule_id: 'flutter.init.missing',
        title: 'Frontegg init not found in main.dart',
        severity: 'high',
        file_path: path.relative(root, mainDart),
        why: 'No reference to Frontegg found in the entry point — auth flows will not start.',
        suggested_fix:
          'Wrap MaterialApp with FronteggProvider and call FronteggApp.init(baseUrl, clientId, applicationId) in main().',
        platform: 'flutter',
        sdk: 'flutter',
        flow: 'init',
      });
    }
  }

  // Delegate to native detectors for the android/ios shells of a Flutter project.
  // Rules that only make sense for pure-native projects (e.g. checking for a
  // Frontegg dependency in Gradle / Podfile / SPM — these live in pubspec for
  // Flutter) must be filtered out before re-namespacing under `flutter.`.
  const NATIVE_ONLY_RULES_SKIP_IN_CROSS_PLATFORM = new Set([
    'android.sdk.dependency.missing',
    'android.gradle.appId.missing',
    'ios.sdk.dependency.missing',
  ]);

  const androidFindings = (await detectAndroidIssues(root))
    .filter((f) => !NATIVE_ONLY_RULES_SKIP_IN_CROSS_PLATFORM.has(f.rule_id))
    .map((f) => ({
      ...f,
      id: 'flutter.' + f.id,
      rule_id: 'flutter.' + f.rule_id,
      sdk: 'flutter' as const,
    }));
  const iosFindings = (await detectIosIssues(root))
    .filter((f) => !NATIVE_ONLY_RULES_SKIP_IN_CROSS_PLATFORM.has(f.rule_id))
    .map((f) => ({
      ...f,
      id: 'flutter.' + f.id,
      rule_id: 'flutter.' + f.rule_id,
      sdk: 'flutter' as const,
    }));

  return [...findings, ...androidFindings, ...iosFindings];
}

export const flutterDetector: PlatformDetector = {
  sdk: 'flutter',
  async matches(root: string) {
    const pubspec = await findFirst(root, 'pubspec.yaml');
    if (!pubspec) return false;
    const body = (await readIfExists(pubspec)) || '';
    // Match any Flutter project — a Flutter project without frontegg_flutter
    // will still fire the dependency.missing finding.
    return /flutter\s*:\s*\n\s+sdk:\s*flutter/.test(body) || /frontegg_flutter/.test(body);
  },
  async detect(root, knowledge) {
    return detectFlutterIssues(root, knowledge);
  },
};
