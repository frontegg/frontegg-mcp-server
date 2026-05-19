import path from 'path';
import { promises as fs } from 'fs';
import {
  appendDiff,
  insertBeforeMarkerDiff,
  newFileDiff,
  swiftuiWrapWindowGroupDiff,
} from './diff-util.js';

export interface IosDiffCanonicals {
  /** CFBundleURLTypes block extracted from the canonical Info.plist. */
  urlTypes?: string[] | null;
  /** Required key/value lines (baseUrl, clientId, applicationId) for Frontegg.plist. */
  fronteggPlistKeys?: string[] | null;
}

export async function iosDiffFor(
  root: string,
  id: string,
  canonicalUrlTypesOrCanonicals?: string[] | null | IosDiffCanonicals
): Promise<string | null> {
  // Back-compat: callers used to pass the URL types array directly. Accept
  // both shapes.
  const canonicals: IosDiffCanonicals = Array.isArray(canonicalUrlTypesOrCanonicals)
    ? { urlTypes: canonicalUrlTypesOrCanonicals }
    : canonicalUrlTypesOrCanonicals && typeof canonicalUrlTypesOrCanonicals === 'object'
      ? canonicalUrlTypesOrCanonicals
      : {};

  if (id.endsWith('ios.urlTypes.missing')) {
    const plist = await findFirst(root, 'Info.plist');
    if (!plist) return null;
    const block =
      canonicals.urlTypes && canonicals.urlTypes.length > 0
        ? canonicals.urlTypes
        : [
            '<key>CFBundleURLTypes</key>',
            '<array>',
            '    <dict>',
            '        <key>CFBundleURLSchemes</key>',
            '        <array>',
            '            <string>yourapp</string>',
            '        </array>',
            '    </dict>',
            '</array>',
          ];
    // Insert immediately before the closing </dict> of the root dict.
    return insertBeforeMarkerDiff(plist, '</dict>', block);
  }
  if (id.startsWith('ios.associatedDomains.missing')) {
    const entitlements =
      (await findFirst(root, '.entitlements')) || (await findFirstBySuffix(root, '.entitlements'));
    if (!entitlements) return null;
    const block = [
      '<key>com.apple.developer.associated-domains</key>',
      '<array>',
      '    <string>applinks:your.domain.example</string>',
      '</array>',
    ];
    return insertBeforeMarkerDiff(entitlements, '</dict>', block);
  }
  if (id.startsWith('ios.entitlements.file.missing')) {
    const newPath = 'Frontegg.entitlements';
    const content = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '    <key>com.apple.developer.associated-domains</key>',
      '    <array>',
      '        <string>applinks:your.domain.example</string>',
      '    </array>',
      '</dict>',
      '</plist>',
    ];
    return newFileDiff(newPath, content);
  }
  if (id.startsWith('ios.frontegg.plist.empty')) {
    const plist = await findFirst(root, 'Frontegg.plist');
    if (!plist) return null;
    // Use canonical keys when knowledge is available, otherwise insert a
    // sensible placeholder template that mirrors the canonical schema.
    // Note: emit with no leading indentation; the insert-before-marker op
    // re-indents lines to match the marker line's indent at apply time.
    const block =
      canonicals.fronteggPlistKeys && canonicals.fronteggPlistKeys.length > 0
        ? canonicals.fronteggPlistKeys.map((l) => l.replace(/^\s+/, ''))
        : [
            '<key>baseUrl</key>',
            '<string>https://app-&lt;subdomain&gt;.frontegg.com</string>',
            '<key>clientId</key>',
            '<string>YOUR_CLIENT_ID</string>',
            '<key>applicationId</key>',
            '<string>YOUR_APPLICATION_ID</string>',
          ];
    // Insert before the closing </dict> of the (typically empty) root dict
    // so we end up *inside* the dict instead of after </plist>.
    return insertBeforeMarkerDiff(plist, '</dict>', block);
  }
  if (id.startsWith('ios.ats.broad-allows')) {
    const plist = await findFirst(root, 'Info.plist');
    if (!plist) return null;
    // Show the deletion of the broad-allow lines as the recommended fix.
    // Using a unified-diff style with `-` lines so the apply-diff tool can
    // round-trip it; the apply tool takes context from these lines, so we
    // also include the surrounding NSAppTransportSecurity wrapper.
    const removed = [
      '  <key>NSAppTransportSecurity</key>',
      '  <dict>',
      '    <key>NSAllowsArbitraryLoads</key>',
      '    <true/>',
      '  </dict>',
    ];
    return [
      `--- ${plist}`,
      `+++ ${plist}`,
      `@@`,
      ...removed.map((l) => `-${l}`),
    ].join('\n');
  }
  if (id.startsWith('ios.init.missing')) {
    // Prefer the SwiftUI App entry when present — that's the canonical
    // pattern in modern frontegg-ios-swift demos. Fall back to AppDelegate
    // / SceneDelegate for older UIKit projects.
    const swiftuiEntry = await findSwiftUIAppEntry(root);
    if (swiftuiEntry) {
      // Wrap the WindowGroup body with FronteggWrapper { ... } and add
      // `import FronteggSwift`. The applier handles the structural transform.
      return swiftuiWrapWindowGroupDiff(swiftuiEntry);
    }

    const appDelegate =
      (await findFirst(root, 'AppDelegate.swift')) ||
      (await findFirst(root, 'SceneDelegate.swift'));
    if (appDelegate) {
      const insertion = [
        '    // Bootstrap the Frontegg SDK so login/logout/silent-refresh',
        '    // are wired before the first scene comes up.',
        '    FronteggApp.shared.didFinishLaunchingWithOptions()',
      ];
      return appendDiff(appDelegate, insertion);
    }
    return null;
  }
  return null;
}

/**
 * Find the Swift file that declares the `@main` SwiftUI App entry point.
 *
 *   @main
 *   struct demoApp: App {
 *       var body: some Scene { WindowGroup { ... } }
 *   }
 *
 * Multiple Swift files commonly end with `App.swift` (e.g. `MyApp.swift`),
 * so we MUST scan content rather than trust the filename. Returns null if
 * no SwiftUI App entry is found in the project.
 */
async function findSwiftUIAppEntry(root: string): Promise<string | null> {
  const swiftFiles = await findAllSwiftFiles(root);
  // Match `@main` followed (possibly across whitespace / attributes) by a
  // `struct <Name>: App` declaration. Two-stage check makes the regex
  // robust to comments / attribute lists between the two.
  for (const p of swiftFiles) {
    const body = await fs.readFile(p, 'utf8').catch(() => '');
    if (!/@main/.test(body)) continue;
    if (!/struct\s+\w+\s*:\s*App\b/.test(body)) continue;
    // Confirm `WindowGroup` is in the file too — that's where the wrap
    // patch lands.
    if (!/WindowGroup\b/.test(body)) continue;
    return p;
  }
  return null;
}

async function findAllSwiftFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (
          e.name === 'node_modules' ||
          e.name === '.git' ||
          e.name === 'Pods' ||
          e.name === 'build' ||
          e.name === 'DerivedData'
        ) {
          continue;
        }
        stack.push(p);
      } else if (e.name.endsWith('.swift')) {
        out.push(p);
      }
    }
  }
  return out;
}

/** @deprecated retained for back-compat with callers outside this module. */
export async function appendBeforeClosingDict(
  plistPath: string,
  lines: string[]
): Promise<string> {
  return insertBeforeMarkerDiff(plistPath, '</dict>', lines);
}

async function findFirst(root: string, fileName: string): Promise<string | null> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        stack.push(p);
      } else if (e.name === fileName) {
        return p;
      }
    }
  }
  return null;
}

async function findFirstBySuffix(root: string, suffix: string): Promise<string | null> {
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        stack.push(p);
      } else if (e.name.endsWith(suffix)) {
        return p;
      }
    }
  }
  return null;
}
