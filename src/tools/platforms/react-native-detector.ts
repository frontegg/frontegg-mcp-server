import path from 'path';
import { Finding } from '../types.js';
import { SdkKnowledge } from '../../knowledge/types.js';
import { PlatformDetector } from './types.js';
import { findFirst, readIfExists } from './fs-util.js';
import {
  isFronteggGradleConfigured,
  isFronteggIosConfigured,
  isFronteggRnConfigViaLocalConfig,
} from './wiring-probe.js';

const RN_PKG = '@frontegg/react-native';

/**
 * Is the package.json dependency value a path / local / workspace reference?
 * Monorepo + SDK example apps use these instead of a published version,
 * so we should treat them as "present" and skip the version-drift check.
 */
function isLocalDep(value: unknown): boolean {
  const s = String(value || '');
  return (
    s.startsWith('file:') ||
    s.startsWith('link:') ||
    s.startsWith('workspace:') ||
    s.startsWith('portal:') ||
    s.startsWith('./') ||
    s.startsWith('../') ||
    s.startsWith('/')
  );
}

export async function detectReactNativeIssues(
  root: string,
  knowledge: SdkKnowledge | null
): Promise<Finding[]> {
  const findings: Finding[] = [];
  const pkgPath = path.join(root, 'package.json');
  const pkgBody = await readIfExists(pkgPath);
  if (!pkgBody) return findings;
  let pkg: any = {};
  try {
    pkg = JSON.parse(pkgBody);
  } catch {
    return findings;
  }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const rnInstalled = Boolean(allDeps['react-native']);
  if (!rnInstalled) return findings;

  const rawDep = allDeps[RN_PKG];
  const linkedViaRnConfig = await isFronteggRnConfigViaLocalConfig(root);
  if (!rawDep && !linkedViaRnConfig) {
    findings.push({
      id: 'rn.dependency.missing',
      rule_id: 'rn.dependency.missing',
      title: `${RN_PKG} dependency not declared`,
      severity: 'critical',
      file_path: 'package.json',
      why: 'package.json does not declare @frontegg/react-native — SDK is required before init.',
      suggested_fix: `Run: yarn add ${RN_PKG}  (then cd ios && pod install).`,
      platform: 'react-native',
      sdk: 'react-native',
      flow: 'build',
    });
  } else if (rawDep && knowledge?.version && !isLocalDep(rawDep)) {
    const declared = String(rawDep).replace(/^[\^~]/, '');
    if (declared !== knowledge.version) {
      findings.push({
        id: 'rn.dependency.versionDrift',
        rule_id: 'rn.dependency.versionDrift',
        title: `${RN_PKG} version drift (${declared} vs canonical ${knowledge.version})`,
        severity: 'low',
        file_path: 'package.json',
        why: 'User project pins a version different from the canonical SDK repo.',
        suggested_fix: `Bump ${RN_PKG} to ^${knowledge.version}.`,
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'build',
      });
    }
  }

  // Android deep-link check against android/app/src/main/AndroidManifest.xml.
  // Suppressed when Gradle manifestPlaceholders wire Frontegg — the SDK's
  // library manifest will contribute the VIEW intent-filter and INTERNET
  // permission at manifest merge time.
  const gradleConfigured = await isFronteggGradleConfigured(path.join(root, 'android'));
  const androidManifest = await findFirst(path.join(root, 'android'), 'AndroidManifest.xml');
  if (androidManifest) {
    const content = (await readIfExists(androidManifest)) || '';
    if (!content.includes('android.intent.action.VIEW') && !gradleConfigured) {
      findings.push({
        id: 'rn.android.intentFilter.missing',
        rule_id: 'rn.android.intentFilter.missing',
        title: 'RN Android: missing intent-filter for deep links',
        severity: 'high',
        file_path: path.relative(root, androidManifest),
        why: 'OAuth redirect cannot reach the RN bridge without a VIEW intent-filter. Suppressed when gradle manifestPlaceholders wire Frontegg.',
        suggested_fix:
          'Add <intent-filter> with your scheme/host under MainActivity in AndroidManifest.xml, OR add manifestPlaceholders with frontegg_domain + frontegg_client_id in android/app/build.gradle.',
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'deep-link',
      });
    }
    if (!/android\.permission\.INTERNET/.test(content) && !gradleConfigured) {
      findings.push({
        id: 'rn.android.internetPermission.missing',
        rule_id: 'rn.android.internetPermission.missing',
        title: 'RN Android: INTERNET permission not declared',
        severity: 'high',
        file_path: path.relative(root, androidManifest),
        why: 'SDK needs network access; Android will deny HTTPS without this permission. Contributed automatically by the SDK when Frontegg manifestPlaceholders are configured.',
        suggested_fix: 'Add <uses-permission android:name="android.permission.INTERNET" />.',
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'build',
      });
    }
  }

  // iOS deep-link check against ios/*/Info.plist. findFirst picks the
  // main app Info.plist over test-bundle / UITests ones via path scoring.
  const plist = await findFirst(path.join(root, 'ios'), 'Info.plist');
  const iosConfigured = await isFronteggIosConfigured(path.join(root, 'ios'));
  if (plist) {
    const content = (await readIfExists(plist)) || '';
    if (!content.includes('CFBundleURLTypes') && !iosConfigured) {
      findings.push({
        id: 'rn.ios.urlTypes.missing',
        rule_id: 'rn.ios.urlTypes.missing',
        title: 'RN iOS: CFBundleURLTypes missing',
        severity: 'high',
        file_path: path.relative(root, plist),
        why: 'iOS cannot route the OAuth redirect to the RN app without a registered URL scheme.',
        suggested_fix: 'Add CFBundleURLTypes with your scheme to Info.plist.',
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'deep-link',
      });
    }
  }

  // Podfile check
  const podfile = await findFirst(path.join(root, 'ios'), 'Podfile');
  if (podfile) {
    const content = (await readIfExists(podfile)) || '';
    if (!/use_frameworks!/.test(content)) {
      findings.push({
        id: 'rn.ios.podfile.useFrameworks.missing',
        rule_id: 'rn.ios.podfile.useFrameworks.missing',
        title: 'RN iOS Podfile missing use_frameworks!',
        severity: 'medium',
        file_path: path.relative(root, podfile),
        why: 'Frontegg RN iOS pod requires Swift frameworks — use_frameworks! must be set.',
        suggested_fix: "Add 'use_frameworks!' in the target block of Podfile, then pod install.",
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'build',
      });
    }
  }

  // Init call check — look for FronteggWrapper / FronteggProvider in App.tsx / App.js
  const appFile =
    (await findFirst(root, 'App.tsx')) || (await findFirst(root, 'App.js'));
  if (appFile) {
    const content = (await readIfExists(appFile)) || '';
    if (!/FronteggWrapper|FronteggProvider|@frontegg\/react-native/.test(content)) {
      findings.push({
        id: 'rn.init.missing',
        rule_id: 'rn.init.missing',
        title: 'Frontegg init not found in App entry',
        severity: 'high',
        file_path: path.relative(root, appFile),
        why: 'App entry file does not wrap the tree with Frontegg provider — auth flows will not start.',
        suggested_fix:
          'Wrap your app root with <FronteggWrapper /> and pass baseUrl + clientId + applicationId.',
        platform: 'react-native',
        sdk: 'react-native',
        flow: 'init',
      });
    }
  }

  return findings;
}

export const reactNativeDetector: PlatformDetector = {
  sdk: 'react-native',
  async matches(root: string) {
    const pkg = await readIfExists(path.join(root, 'package.json'));
    if (!pkg) return false;
    try {
      const parsed = JSON.parse(pkg);
      const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
      return Boolean(deps['react-native']);
    } catch {
      return false;
    }
  },
  async detect(root, knowledge) {
    return detectReactNativeIssues(root, knowledge);
  },
};
