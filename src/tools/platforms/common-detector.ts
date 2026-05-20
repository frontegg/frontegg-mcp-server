import path from 'path';
import { promises as fs } from 'fs';
import { Finding } from '../types.js';
import { PlatformDetector } from './types.js';
import { androidDetector } from './android-detector.js';
import { iosDetector } from './ios-detector.js';
import { flutterDetector } from './flutter-detector.js';
import { reactNativeDetector } from './react-native-detector.js';
import { ionicCapacitorDetector } from './ionic-capacitor-detector.js';
import { Sdk } from '../../knowledge/types.js';
import { findAll, readIfExists } from './fs-util.js';
import { hasFronteggPlistRequiredKeys } from './wiring-probe.js';

/** All SDK-specific detectors. Order matters for the "first match wins"
 *  path in the dispatcher. More specific (cross-platform SDKs) come first. */
export const ALL_DETECTORS: PlatformDetector[] = [
  reactNativeDetector,
  ionicCapacitorDetector,
  flutterDetector,
  androidDetector,
  iosDetector,
];

export function getDetector(sdk: Sdk): PlatformDetector | undefined {
  return ALL_DETECTORS.find((d) => d.sdk === sdk);
}

export async function detectCommonIssues(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  const envPath = path.join(root, '.env');
  let env: string | null = null;
  try {
    env = await fs.readFile(envPath, 'utf8');
  } catch {
    /* no .env */
  }

  // Frontegg sample apps (and many real projects) supply credentials through
  // native mechanisms instead of a dotenv file: frontegg.properties for
  // Android Kotlin, Frontegg.plist for iOS Swift, hardcoded gradle vars for
  // Flutter/RN native shells. If any of those exist the common.env.missing
  // rule is a false positive.
  const altCredentialSources = await hasAlternativeCredentialSource(root);

  if (env === null && !altCredentialSources) {
    findings.push({
      id: 'common.env.missing',
      rule_id: 'common.env.missing',
      title: 'No .env found for Frontegg configuration',
      severity: 'critical',
      file_path: '.env',
      why: 'Environment file is required to supply credentials and base URL. Suppressed when frontegg.properties (Android) or Frontegg.plist (iOS) is present.',
      suggested_fix:
        'Create .env and set FRONTEGG_APP_ID and FRONTEGG_BASE_URL, OR configure credentials via frontegg.properties / Frontegg.plist / gradle build vars.',
      platform: 'common',
      flow: 'env',
    });
  } else if (env !== null) {
    const hasAppId = /^\s*FRONTEGG_APP_ID\s*=\s*[^\s#]+/m.test(env);
    const hasBaseUrl = /^\s*FRONTEGG_BASE_URL\s*=\s*[^\s#]+/m.test(env);
    if (!hasAppId || !hasBaseUrl) {
      findings.push({
        id: 'common.env.missing',
        rule_id: 'common.env.missing',
        title: 'Missing Frontegg environment keys',
        severity: 'critical',
        file_path: path.relative(root, envPath),
        why: 'SDKs require FRONTEGG_APP_ID and FRONTEGG_BASE_URL for auth flow.',
        suggested_fix: 'Add FRONTEGG_APP_ID and FRONTEGG_BASE_URL to your .env file.',
        platform: 'common',
        flow: 'env',
      });
    }
    if (/FRONTEGG_BASE_URL\s*=\s*http:\/\//m.test(env)) {
      findings.push({
        id: 'common.baseUrl.insecure',
        rule_id: 'common.baseUrl.insecure',
        title: 'FRONTEGG_BASE_URL uses HTTP',
        severity: 'high',
        file_path: path.relative(root, envPath),
        why: 'Tokens and auth cookies MUST flow over HTTPS. HTTP base URLs leak credentials.',
        suggested_fix: 'Change FRONTEGG_BASE_URL to https://app-<subdomain>.frontegg.com.',
        platform: 'common',
        flow: 'security',
      });
    }
  }

  // .env committed — security issue.
  const gitignore = await readIfExists(path.join(root, '.gitignore'));
  if (env !== null && gitignore !== null && !/^\.env(\s|$)/m.test(gitignore)) {
    findings.push({
      id: 'common.env.gitignore.missing',
      rule_id: 'common.env.gitignore.missing',
      title: '.env is not listed in .gitignore',
      severity: 'high',
      file_path: '.gitignore',
      why: 'Committing .env exposes client ids and secrets in version control history.',
      suggested_fix: 'Add `.env` to .gitignore.',
      platform: 'common',
      flow: 'security',
    });
  }

  return findings;
}

/**
 * Detect non-.env credential stores that projects legitimately use instead
 * of a dotenv file:
 *   - `frontegg.properties` at the project root (canonical Android Kotlin pattern)
 *   - `Frontegg.plist` anywhere under ios/ (canonical iOS Swift pattern)
 *   - Hardcoded `frontegg_domain` / `frontegg_client_id` in any build.gradle
 *     (Flutter / RN / native Android build-var pattern)
 */
async function hasAlternativeCredentialSource(root: string): Promise<boolean> {
  try {
    await fs.access(path.join(root, 'frontegg.properties'));
    return true;
  } catch {
    /* not present */
  }

  // A Frontegg.plist counts only when it actually contains the required
  // baseUrl / clientId keys — an empty plist is a half-done integration,
  // not a credential source.
  const plists = await findAll(root, (n) => n === 'Frontegg.plist', 3);
  for (const p of plists) {
    const body = (await readIfExists(p)) || '';
    if (hasFronteggPlistRequiredKeys(body)) {
      return true;
    }
  }

  const gradleFiles = await findAll(
    root,
    (n) => n === 'build.gradle' || n === 'build.gradle.kts',
    20
  );
  for (const g of gradleFiles) {
    const body = (await readIfExists(g)) || '';
    if (/frontegg_domain\s*=\s*["']/i.test(body) || /frontegg_client_id\s*=\s*["']/i.test(body)) {
      return true;
    }
  }
  return false;
}
