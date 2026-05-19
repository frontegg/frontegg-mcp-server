/**
 * "Is Frontegg actually wired into this project's native shell?" probes.
 *
 * The Frontegg SDKs contribute a big chunk of configuration through native
 * library manifest merging (Android) and runtime registration (iOS). That
 * means the user's *own* files may legitimately omit things like the
 * `<intent-filter>` for the OAuth redirect or the `CFBundleURLTypes` block
 * — because the SDK provides them at merge/runtime.
 *
 * If we detect positive proof that the SDK is linked and configured the
 * canonical Frontegg way, we suppress the deep-link / permission rules
 * that would otherwise false-positive on canonical sample apps.
 */

import path from 'path';
import { findAll, readIfExists } from './fs-util.js';

/**
 * True when any build.gradle[.kts] in the tree configures the Frontegg
 * manifestPlaceholders — the SDK's contract for wiring up the OAuth
 * redirect intent-filter + INTERNET permission via manifest merging.
 */
export async function isFronteggGradleConfigured(root: string): Promise<boolean> {
  const gradleFiles = await findAll(
    root,
    (n) => n === 'build.gradle' || n === 'build.gradle.kts',
    20
  );
  for (const g of gradleFiles) {
    const body = (await readIfExists(g)) || '';
    if (!/frontegg/i.test(body)) continue;
    // Any of the canonical Frontegg gradle markers — placeholders, domain
    // assignment, or an auth_activity override.
    if (
      /manifestPlaceholders\s*=[\s\S]{0,400}frontegg_(domain|client_id|application_id|scheme|host|auth)/i.test(
        body
      ) ||
      /frontegg_domain\s*=\s*["']/i.test(body) ||
      /frontegg_client_id\s*=\s*["']/i.test(body) ||
      /auth_activity\s*:\s*["']com\.frontegg/i.test(body)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when the iOS shell shows proof that the Frontegg iOS SDK is linked
 * and initialized. The SDK handles URL routing at runtime, so the strict
 * CFBundleURLTypes check is a false positive when this proof exists.
 *
 * Semantic note: a Frontegg.plist that exists but is empty (no `baseUrl` /
 * `clientId`) is NOT proof of configuration — the SDK can't bootstrap from
 * an empty plist. We require either a populated plist OR Swift/Obj-C source
 * that imports the SDK and references its init API.
 */
export async function isFronteggIosConfigured(root: string): Promise<boolean> {
  // Frontegg.plist is the canonical place to put baseUrl/clientId/appId —
  // but only when it ACTUALLY contains those keys. An empty plist is a
  // half-finished integration, not "configured".
  const plists = await findAll(root, (n) => n === 'Frontegg.plist', 5);
  for (const p of plists) {
    const body = (await readIfExists(p)) || '';
    if (hasFronteggPlistRequiredKeys(body)) {
      return true;
    }
  }

  // Any Swift / Obj-C file that imports or references the SDK class.
  const sources = await findAll(
    root,
    (n) => n.endsWith('.swift') || n.endsWith('.m') || n.endsWith('.mm'),
    200
  );
  for (const s of sources) {
    const body = (await readIfExists(s)) || '';
    if (/import\s+FronteggSwift|FronteggAuth\.|FronteggApp\.|Frontegg\(/.test(body)) {
      return true;
    }
  }
  return false;
}

/**
 * True when a Frontegg.plist body contains both `baseUrl` and `clientId` keys
 * with non-empty string values. These are the minimum the SDK needs to make
 * a request — `applicationId` and the rest are optional.
 *
 * Exported so the iOS detector can reuse the exact same notion of "populated".
 */
export function hasFronteggPlistRequiredKeys(plistBody: string): boolean {
  if (!plistBody) return false;
  const hasKey = (key: string): boolean => {
    // Match <key>baseUrl</key>\s*<string>NON-EMPTY</string> — tolerant of whitespace
    // and case for the key name (plist keys are case-sensitive in practice but we
    // allow flex here since the canonical SDK always uses camelCase).
    const re = new RegExp(
      `<key>\\s*${key}\\s*</key>\\s*<string>\\s*\\S[^<]*</string>`,
      'i'
    );
    return re.test(plistBody);
  };
  return hasKey('baseUrl') && hasKey('clientId');
}

/**
 * True when a React Native project uses `react-native.config.js` to link
 * the Frontegg SDK from a local path (the canonical SDK example pattern
 * and many monorepo setups).
 */
export async function isFronteggRnConfigViaLocalConfig(root: string): Promise<boolean> {
  const cfg = await readIfExists(path.join(root, 'react-native.config.js'));
  if (!cfg) return false;
  return /frontegg/i.test(cfg) || /dependencies\s*:[\s\S]*root\s*:/.test(cfg);
}
