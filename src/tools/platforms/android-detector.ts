import path from 'path';
import { Finding } from '../types.js';
import { SdkKnowledge } from '../../knowledge/types.js';
import { PlatformDetector } from './types.js';
import { findFirst, findAll, readIfExists, fileExists } from './fs-util.js';
import { isFronteggGradleConfigured } from './wiring-probe.js';

/**
 * True when build.gradle[.kts] contains an actual Gradle dependency
 * declaration that pulls in the Frontegg SDK. Tightened from a bare
 * `/frontegg/i` test so that comments mentioning "frontegg" don't
 * silently suppress the rule (and so that random `def fronteggDomain`
 * variables don't, either).
 *
 * Accepted shapes:
 *   - implementation "com.frontegg.android:android:1.2.3"
 *   - api 'com.frontegg.android:android:1.2.3'
 *   - implementation(project(":android"))   // the canonical SDK monorepo
 *   - debugImplementation / releaseImplementation / runtimeOnly / etc.
 */
export function hasFronteggGradleDependency(text: string): boolean {
  if (!text) return false;
  const depConfigs =
    'implementation|api|compileOnly|runtimeOnly|annotationProcessor|kapt|ksp|' +
    'debugImplementation|releaseImplementation|testImplementation|androidTestImplementation';
  // implementation "com.frontegg...:..." or single-quoted, optionally with parens
  const coordinatePattern = new RegExp(
    `(?:^|\\n)\\s*(?:${depConfigs})\\s*\\(?\\s*["']com\\.frontegg`,
    'i'
  );
  if (coordinatePattern.test(text)) return true;
  // implementation project(path: ':android')  (canonical SDK example only —
  // a customer wouldn't write this, but the canonical fixture does, so we
  // accept it for completeness)
  const projectPattern = new RegExp(
    `(?:^|\\n)\\s*(?:${depConfigs})\\s+project\\s*\\(\\s*(?:path:\\s*)?["']:android["']`
  );
  if (projectPattern.test(text)) return true;
  return false;
}

export async function detectAndroidIssues(
  root: string,
  _knowledge?: SdkKnowledge | null
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // When the project wires Frontegg via Gradle manifestPlaceholders the
  // SDK library manifest contributes the intent-filter + INTERNET permission
  // at merge time, so the user's AndroidManifest.xml legitimately omits them.
  const gradleConfigured = await isFronteggGradleConfigured(root);

  const manifest = await findFirst(root, 'AndroidManifest.xml');
  if (manifest) {
    const content = (await readIfExists(manifest)) || '';
    const hasIntentFilter =
      content.includes('<intent-filter') && content.includes('android.intent.action.VIEW');
    if (!hasIntentFilter && !gradleConfigured) {
      findings.push({
        id: 'android.intentFilter.missing',
        rule_id: 'android.intentFilter.missing',
        title: 'Missing intent-filter for deep links',
        severity: 'high',
        file_path: path.relative(root, manifest),
        why: 'Without an intent-filter, OAuth redirect cannot open your app. If you use Frontegg gradle manifestPlaceholders the SDK will contribute this automatically — this finding is suppressed in that case.',
        suggested_fix: 'Add an intent-filter with your scheme/host under the login activity, OR configure manifestPlaceholders with frontegg_domain + frontegg_client_id in app/build.gradle.',
        platform: 'android',
        flow: 'deep-link',
      });
    }
    if (!/android\.permission\.INTERNET/.test(content) && !gradleConfigured) {
      findings.push({
        id: 'android.internetPermission.missing',
        rule_id: 'android.internetPermission.missing',
        title: 'INTERNET permission not declared',
        severity: 'high',
        file_path: path.relative(root, manifest),
        why: 'Frontegg SDK makes HTTPS calls; without INTERNET permission auth will fail at runtime. Contributed automatically when Frontegg gradle manifestPlaceholders are configured.',
        suggested_fix: 'Add <uses-permission android:name="android.permission.INTERNET" />.',
        platform: 'android',
        flow: 'build',
      });
    }
  }

  const gradle =
    (await findFirst(root, 'build.gradle')) || (await findFirst(root, 'build.gradle.kts'));
  if (gradle) {
    const text = (await readIfExists(gradle)) || '';
    const hasAppId =
      /applicationId\s+"[A-Za-z0-9_.]+"/.test(text) || /namespace\s+"[A-Za-z0-9_.]+"/.test(text);
    if (!hasAppId) {
      findings.push({
        id: 'android.gradle.appId.missing',
        rule_id: 'android.gradle.appId.missing',
        title: 'applicationId not declared',
        severity: 'low',
        file_path: path.relative(root, gradle),
        why: 'applicationId/namespace clarifies package identity; some deep link setups rely on it.',
        suggested_fix: 'Add applicationId "com.example.app" to defaultConfig (or namespace).',
        platform: 'android',
        flow: 'build',
      });
    }
    const hasFronteggDep = hasFronteggGradleDependency(text) || gradleConfigured;
    if (!hasFronteggDep) {
      findings.push({
        id: 'android.sdk.dependency.missing',
        rule_id: 'android.sdk.dependency.missing',
        title: 'Frontegg Android SDK dependency not detected',
        severity: 'high',
        file_path: path.relative(root, gradle),
        why: 'No Frontegg dependency found in app/build.gradle — the SDK must be linked for the app to compile against it. (A comment that mentions "frontegg" does not count.)',
        suggested_fix:
          'The Frontegg Android SDK is NOT published to Maven Central. Either (a) inside the canonical frontegg-android-kotlin monorepo, add `implementation project(path: \':android\')` to your app/build.gradle dependencies, or (b) for standalone projects, add `maven { url "https://jitpack.io" }` to settings.gradle and `implementation \'com.github.frontegg:frontegg-android-kotlin:<tag>\'` to dependencies.',
        platform: 'android',
        flow: 'build',
      });
    }
  }

  // Init bootstrap probe — the Frontegg Android SDK can be initialized in
  // two ways:
  //   1. Implicit: the Gradle plugin is configured with `manifestPlaceholders`
  //      (frontegg_domain + frontegg_client_id) AND/OR a `frontegg.properties`
  //      file at the project root drives BuildConfig values that the SDK reads
  //      reflectively at first `Context.fronteggApp` access.
  //   2. Explicit: the user calls `FronteggApp.init(...)` from their custom
  //      Application subclass `onCreate()`.
  //
  // If neither path is present the SDK never bootstraps and every auth call
  // crashes with `frontegg.error.app_must_be_initialized`. Mirrors the iOS
  // `ios.init.missing` rule.
  const ktSources = await findAll(
    root,
    (n) => n.endsWith('.kt') || n.endsWith('.java'),
    400
  );
  if (ktSources.length > 0) {
    let hasInitCall = false;
    for (const s of ktSources) {
      const body = (await readIfExists(s)) || '';
      if (/FronteggApp\s*\.\s*init\s*\(/.test(body) || /FronteggApp\s*\.\s*initWithRegions\s*\(/.test(body)) {
        hasInitCall = true;
        break;
      }
    }
    const hasFronteggProperties = await fileExists(path.join(root, 'frontegg.properties'));
    if (!hasInitCall && !gradleConfigured && !hasFronteggProperties) {
      // Anchor the finding at the Application class when present, otherwise
      // the first Kotlin/Java source — that's where the diff would land.
      const appClass = ktSources.find((p) => /\/App(lication)?\.kt$/.test(p)) || ktSources[0]!;
      findings.push({
        id: 'android.init.missing',
        rule_id: 'android.init.missing',
        title: 'FronteggApp init not bootstrapped',
        severity: 'critical',
        file_path: path.relative(root, appClass),
        why:
          'The Frontegg Android SDK never bootstraps in this project — there is no `FronteggApp.init(...)` call in any Kotlin/Java source, no `manifestPlaceholders` for `frontegg_domain` / `frontegg_client_id` in `build.gradle`, and no `frontegg.properties` at the project root. Without one of these the SDK has no client id / domain to talk to and every auth call fails with `frontegg.error.app_must_be_initialized`.',
        suggested_fix:
          'Either (a) call `FronteggApp.init(fronteggDomain = "...", clientId = "...", context = this)` from your Application subclass `onCreate()`, OR (b) add `manifestPlaceholders = ["frontegg_domain": ..., "frontegg_client_id": ...]` to your app/build.gradle defaultConfig (canonical), OR (c) create a `frontegg.properties` at the project root with `FRONTEGG_DOMAIN=...` and `FRONTEGG_CLIENT_ID=...`.',
        platform: 'android',
        flow: 'init',
      });
    }
  }

  return findings;
}

export const androidDetector: PlatformDetector = {
  sdk: 'android-kotlin',
  async matches(root: string) {
    return (
      (await findFirst(root, 'AndroidManifest.xml')) !== null ||
      (await findFirst(root, 'build.gradle')) !== null ||
      (await findFirst(root, 'build.gradle.kts')) !== null
    );
  },
  async detect(root, knowledge) {
    return detectAndroidIssues(root, knowledge);
  },
};
