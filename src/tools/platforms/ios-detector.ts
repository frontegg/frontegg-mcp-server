import path from 'path';
import { Finding } from '../types.js';
import { SdkKnowledge } from '../../knowledge/types.js';
import { PlatformDetector } from './types.js';
import { findFirst, findAll, readIfExists } from './fs-util.js';
import { isFronteggIosConfigured, hasFronteggPlistRequiredKeys } from './wiring-probe.js';

export async function detectIosIssues(
  root: string,
  knowledge?: SdkKnowledge | null
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // Proof that the iOS SDK is linked and will register URL handling at
  // runtime — suppresses CFBundleURLTypes false positives for samples
  // that rely on Frontegg.plist + SDK runtime registration instead.
  const iosConfigured = await isFronteggIosConfigured(root);

  const infoPlist = await findFirst(root, 'Info.plist');
  if (infoPlist) {
    const content = (await readIfExists(infoPlist)) || '';
    const hasURLTypes = content.includes('CFBundleURLTypes');
    if (!hasURLTypes && !iosConfigured) {
      findings.push({
        id: 'ios.urlTypes.missing',
        rule_id: 'ios.urlTypes.missing',
        title: 'Missing URL Types / universal links',
        severity: 'high',
        file_path: path.relative(root, infoPlist),
        why: 'iOS needs URL schemes (or Associated Domains) for login redirect handling.',
        suggested_fix:
          'Add CFBundleURLTypes with your scheme, or Associated Domains for universal links.',
        platform: 'ios',
        flow: 'deep-link',
      });
    }

    // Detect a broad ATS allow regardless of whether http:// is present
    // elsewhere — this disables transport security globally and is
    // independently risky (Apple may also reject the app review for it).
    const hasArbitraryLoads =
      /<key>\s*NSAllowsArbitraryLoads\s*<\/key>\s*<true\s*\/?>/i.test(content);
    if (hasArbitraryLoads) {
      findings.push({
        id: 'ios.ats.broad-allows',
        rule_id: 'ios.ats.broad-allows',
        title: 'ATS NSAllowsArbitraryLoads is enabled',
        severity: 'medium',
        file_path: path.relative(root, infoPlist),
        why: 'Your Info.plist has NSAllowsArbitraryLoads = true, which globally disables App Transport Security. Even if your Frontegg base URL is HTTPS today, this exposes your app to plaintext exfiltration if any other library or future code uses http://. Apple may also reject the app review with this set.',
        suggested_fix:
          'Remove NSAllowsArbitraryLoads (or set it to false) and add per-domain NSExceptionDomains entries only for hosts that genuinely require HTTP.',
        platform: 'ios',
        flow: 'security',
      });
    }

    // The original "http URL + no ATS exception" rule still fires when both
    // conditions are present; it is now strictly stricter than the broad
    // allows rule (the broad allow is the looser, more common landmine).
    if (!/NSAppTransportSecurity/.test(content) && /http:\/\//.test(content)) {
      findings.push({
        id: 'ios.ats.httpUrl',
        rule_id: 'ios.ats.httpUrl',
        title: 'HTTP URL found without ATS exception',
        severity: 'medium',
        file_path: path.relative(root, infoPlist),
        why: 'iOS blocks non-HTTPS traffic unless explicitly allowed. Frontegg should only be called over HTTPS.',
        suggested_fix:
          'Remove the http:// reference or use https://app-*.frontegg.com for the base URL.',
        platform: 'ios',
        flow: 'security',
      });
    }
  }

  const entitlementsFiles = await findAll(root, (n) => n.endsWith('.entitlements'), 5);
  const entitlements = entitlementsFiles[0];
  if (entitlements) {
    const e = (await readIfExists(entitlements)) || '';
    const hasDomains = e.includes('com.apple.developer.associated-domains');
    if (!hasDomains) {
      findings.push({
        id: 'ios.associatedDomains.missing',
        rule_id: 'ios.associatedDomains.missing',
        title: 'Associated Domains not configured',
        severity: 'medium',
        file_path: path.relative(root, entitlements),
        why: 'For universal links, iOS needs Associated Domains (applinks:).',
        suggested_fix:
          'Add com.apple.developer.associated-domains with applinks:your.domain to entitlements.',
        platform: 'ios',
        flow: 'deep-link',
      });
    }
    // Passkeys need webcredentials: in Associated Domains
    if (hasDomains && !e.includes('webcredentials:')) {
      findings.push({
        id: 'ios.associatedDomains.webcredentials.missing',
        rule_id: 'ios.associatedDomains.webcredentials.missing',
        title: 'Missing webcredentials for passkeys',
        severity: 'medium',
        file_path: path.relative(root, entitlements),
        why: 'Passkeys (WebAuthn) require webcredentials:{domain} in Associated Domains. Without it, passkey registration fails with error 1004.',
        suggested_fix:
          'Add webcredentials:{YOUR_FRONTEGG_DOMAIN} to the associated-domains array in your .entitlements file.',
        platform: 'ios',
        flow: 'auth',
      });
    }
  } else {
    findings.push({
      id: 'ios.entitlements.file.missing',
      rule_id: 'ios.entitlements.file.missing',
      title: 'No entitlements file found',
      severity: 'medium',
      file_path: '',
      why: 'Entitlements are required to enable Associated Domains for universal links.',
      suggested_fix:
        'Create an .entitlements file and add com.apple.developer.associated-domains.',
      platform: 'ios',
      flow: 'deep-link',
    });
  }

  // Frontegg.plist present but empty / missing required keys.
  const fronteggPlist = await findFirst(root, 'Frontegg.plist');
  if (fronteggPlist) {
    const body = (await readIfExists(fronteggPlist)) || '';
    if (!hasFronteggPlistRequiredKeys(body)) {
      findings.push({
        id: 'ios.frontegg.plist.empty',
        rule_id: 'ios.frontegg.plist.empty',
        title: 'Frontegg config plist is empty / incomplete',
        severity: 'high',
        file_path: path.relative(root, fronteggPlist),
        why:
          'Your Frontegg.plist is present but missing the required baseUrl / clientId keys. The SDK cannot reach your environment without them. Canonical schema: frontegg-ios-swift/example/.../Frontegg.plist.',
        suggested_fix:
          'Add <key>baseUrl</key><string>https://app-<subdomain>.frontegg.com</string>, <key>clientId</key><string>YOUR_CLIENT_ID</string> (and optionally <key>applicationId</key><string>YOUR_APP_ID</string>) to Frontegg.plist.',
        platform: 'ios',
        flow: 'init',
      });
    }
  }

  // FronteggAuth init call missing — scan all .swift sources for any
  // recognized Frontegg init marker. Canonical patterns (from
  // frontegg-ios-swift): `FronteggApp.shared.didFinishLaunchingWithOptions()`
  // for UIKit, `FronteggWrapper { ... }` for SwiftUI, plus the documented
  // `FronteggAuth.shared.start(...)` / `FronteggAuth.shared.initialize(...)`
  // entry points. We treat any of these as proof the SDK is bootstrapped.
  const swiftSources = await findAll(root, (n) => n.endsWith('.swift'), 200);
  if (swiftSources.length > 0) {
    let hasInitCall = false;
    for (const s of swiftSources) {
      const body = (await readIfExists(s)) || '';
      if (
        /FronteggAuth\.shared\.start\s*\(/.test(body) ||
        /FronteggAuth\.shared\.initialize\s*\(/.test(body) ||
        /FronteggApp\.shared\.didFinishLaunchingWithOptions\s*\(/.test(body) ||
        /FronteggWrapper\s*[({]/.test(body)
      ) {
        hasInitCall = true;
        break;
      }
    }
    if (!hasInitCall) {
      // Anchor the finding at the AppDelegate (or app entry point) so the
      // diff template knows where to insert the call.
      const appDelegate = await findFirst(root, 'AppDelegate.swift');
      const sceneDelegate = await findFirst(root, 'SceneDelegate.swift');
      const anchor = appDelegate || sceneDelegate || swiftSources[0]!;
      // Prefer the canonical example path when knowledge is available.
      const canonicalRef =
        knowledge?.snippets?.['ios.appDelegate.swift']?.path ||
        'demo-uikit/demo-uikit/AppDelegate.swift';
      findings.push({
        id: 'ios.init.missing',
        rule_id: 'ios.init.missing',
        title: 'FronteggAuth init call missing',
        severity: 'critical',
        file_path: path.relative(root, anchor),
        why:
          'Without FronteggAuth.shared.start(...) (or FronteggAuth.shared.initialize(...), or FronteggApp.shared.didFinishLaunchingWithOptions(), or a FronteggWrapper SwiftUI scene) called from your AppDelegate or app entry point, the SDK never bootstraps and authentication flows can\'t begin. Canonical example: frontegg-ios-swift/' +
          canonicalRef +
          '.',
        suggested_fix:
          'In AppDelegate application(_:didFinishLaunchingWithOptions:), call FronteggApp.shared.didFinishLaunchingWithOptions() (UIKit) — or wrap your SwiftUI scene with FronteggWrapper { ... } in your @main App.',
        platform: 'ios',
        flow: 'init',
      });
    }
  }

  const spm = await findFirst(root, 'Package.swift');
  const podfile = await findFirst(root, 'Podfile');
  let hasSdk = false;
  if (spm) {
    const c = (await readIfExists(spm)) || '';
    if (/frontegg/i.test(c)) hasSdk = true;
  }
  if (!hasSdk && podfile) {
    const c = (await readIfExists(podfile)) || '';
    if (/frontegg/i.test(c)) hasSdk = true;
  }
  if (!hasSdk && !iosConfigured) {
    findings.push({
      id: 'ios.sdk.dependency.missing',
      rule_id: 'ios.sdk.dependency.missing',
      title: 'Frontegg iOS SDK dependency not detected',
      severity: 'medium',
      file_path: spm ? 'Package.swift' : podfile ? 'Podfile' : undefined,
      why: 'The SDK dependency is required to use Frontegg features.',
      suggested_fix:
        'Add Frontegg SDK via Swift Package Manager or CocoaPods and link it to your target.',
      platform: 'ios',
      flow: 'build',
    });
  }

  return findings;
}

export const iosDetector: PlatformDetector = {
  sdk: 'ios-swift',
  async matches(root: string) {
    return (
      (await findFirst(root, 'Info.plist')) !== null ||
      (await findFirst(root, 'Podfile')) !== null ||
      (await findFirst(root, 'Package.swift')) !== null
    );
  },
  async detect(root, knowledge) {
    return detectIosIssues(root, knowledge);
  },
};
