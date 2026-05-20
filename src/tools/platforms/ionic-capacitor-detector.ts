import path from 'path';
import { Finding } from '../types.js';
import { SdkKnowledge } from '../../knowledge/types.js';
import { PlatformDetector } from './types.js';
import { findFirst, readIfExists } from './fs-util.js';
import { isFronteggGradleConfigured, isFronteggIosConfigured } from './wiring-probe.js';

const IONIC_PKG = '@frontegg/ionic-capacitor';

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

export async function detectIonicIssues(
  root: string,
  knowledge: SdkKnowledge | null
): Promise<Finding[]> {
  const findings: Finding[] = [];

  const pkgBody = await readIfExists(path.join(root, 'package.json'));
  if (!pkgBody) return findings;
  let pkg: any = {};
  try {
    pkg = JSON.parse(pkgBody);
  } catch {
    return findings;
  }
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  if (!allDeps['@capacitor/core']) return findings;

  if (!allDeps[IONIC_PKG]) {
    findings.push({
      id: 'ionic.dependency.missing',
      rule_id: 'ionic.dependency.missing',
      title: `${IONIC_PKG} dependency not declared`,
      severity: 'critical',
      file_path: 'package.json',
      why: 'package.json does not declare @frontegg/ionic-capacitor — plugin is required before init.',
      suggested_fix: `Run: npm install ${IONIC_PKG} && npx cap sync.`,
      platform: 'ionic-capacitor',
      sdk: 'ionic-capacitor',
      flow: 'build',
    });
  } else if (knowledge?.version && !isLocalDep(allDeps[IONIC_PKG])) {
    const declared = String(allDeps[IONIC_PKG]).replace(/^[\^~]/, '');
    if (declared !== knowledge.version) {
      findings.push({
        id: 'ionic.dependency.versionDrift',
        rule_id: 'ionic.dependency.versionDrift',
        title: `${IONIC_PKG} version drift (${declared} vs canonical ${knowledge.version})`,
        severity: 'low',
        file_path: 'package.json',
        why: 'User project pins a version different from the canonical SDK repo.',
        suggested_fix: `Bump ${IONIC_PKG} to ^${knowledge.version}.`,
        platform: 'ionic-capacitor',
        sdk: 'ionic-capacitor',
        flow: 'build',
      });
    }
  }

  // capacitor.config.(ts|json) presence
  const capConfigTs =
    (await findFirst(root, 'capacitor.config.ts')) ||
    (await findFirst(root, 'capacitor.config.json'));
  if (!capConfigTs) {
    findings.push({
      id: 'ionic.capacitorConfig.missing',
      rule_id: 'ionic.capacitorConfig.missing',
      title: 'capacitor.config.{ts,json} not found',
      severity: 'high',
      file_path: '.',
      why: 'Capacitor requires a config file at the project root; Frontegg plugin settings live here.',
      suggested_fix:
        'Create capacitor.config.ts with appId, appName, and a FronteggPlugin block.',
      platform: 'ionic-capacitor',
      sdk: 'ionic-capacitor',
      flow: 'build',
    });
  } else {
    const content = (await readIfExists(capConfigTs)) || '';
    // Match the specific plugin key, not any mention of "frontegg" — the
    // config often references frontegg.com URLs in comments/elsewhere.
    if (!/FronteggNative\s*:/.test(content)) {
      findings.push({
        id: 'ionic.capacitorConfig.plugin.missing',
        rule_id: 'ionic.capacitorConfig.plugin.missing',
        title: 'Frontegg plugin block missing from capacitor config',
        severity: 'high',
        file_path: path.relative(root, capConfigTs),
        why: 'No Frontegg plugin configuration present — baseUrl / clientId cannot be injected at runtime.',
        suggested_fix:
          'Add a plugins.FronteggNative block with baseUrl, clientId, and applicationId to capacitor.config.',
        platform: 'ionic-capacitor',
        sdk: 'ionic-capacitor',
        flow: 'init',
      });
    }
  }

  // Android shell — suppressed when gradle manifestPlaceholders wire Frontegg.
  const gradleConfigured = await isFronteggGradleConfigured(path.join(root, 'android'));
  const androidManifest = await findFirst(path.join(root, 'android'), 'AndroidManifest.xml');
  if (androidManifest) {
    const content = (await readIfExists(androidManifest)) || '';
    if (!content.includes('android.intent.action.VIEW') && !gradleConfigured) {
      findings.push({
        id: 'ionic.android.intentFilter.missing',
        rule_id: 'ionic.android.intentFilter.missing',
        title: 'Ionic Android: missing intent-filter for deep links',
        severity: 'high',
        file_path: path.relative(root, androidManifest),
        why: 'Capacitor Android shell needs a VIEW intent-filter to receive the OAuth redirect. Suppressed when gradle manifestPlaceholders wire Frontegg.',
        suggested_fix:
          'Add an intent-filter with your scheme/host under MainActivity in android/app/src/main/AndroidManifest.xml, OR configure manifestPlaceholders with frontegg_domain + frontegg_client_id.',
        platform: 'ionic-capacitor',
        sdk: 'ionic-capacitor',
        flow: 'deep-link',
      });
    }
  }

  // iOS shell — suppressed when FronteggNative Capacitor plugin registers runtime URL handling.
  const iosConfigured = await isFronteggIosConfigured(path.join(root, 'ios'));
  const infoPlist = await findFirst(path.join(root, 'ios'), 'Info.plist');
  if (infoPlist) {
    const content = (await readIfExists(infoPlist)) || '';
    if (!content.includes('CFBundleURLTypes') && !iosConfigured) {
      findings.push({
        id: 'ionic.ios.urlTypes.missing',
        rule_id: 'ionic.ios.urlTypes.missing',
        title: 'Ionic iOS: CFBundleURLTypes missing',
        severity: 'high',
        file_path: path.relative(root, infoPlist),
        why: 'Capacitor iOS shell requires a URL scheme to receive OAuth redirects.',
        suggested_fix: 'Add CFBundleURLTypes with your scheme to ios/App/App/Info.plist.',
        platform: 'ionic-capacitor',
        sdk: 'ionic-capacitor',
        flow: 'deep-link',
      });
    }
  }

  return findings;
}

export const ionicCapacitorDetector: PlatformDetector = {
  sdk: 'ionic-capacitor',
  async matches(root: string) {
    const pkg = await readIfExists(path.join(root, 'package.json'));
    if (!pkg) return false;
    try {
      const parsed = JSON.parse(pkg);
      const deps = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
      return Boolean(deps['@capacitor/core']);
    } catch {
      return false;
    }
  },
  async detect(root, knowledge) {
    return detectIonicIssues(root, knowledge);
  },
};
