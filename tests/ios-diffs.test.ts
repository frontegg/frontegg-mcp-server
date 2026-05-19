import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { iosDiffFor } from '../src/tools/diffs/ios-diffs.js';
import { applyDiff } from '../src/tools/diffs/diff-applier.js';
import { clearFileIndex } from '../src/tools/platforms/fs-util.js';

async function makeRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `ios-diffs-${prefix}-`));
}

async function write(root: string, rel: string, content: string): Promise<string> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
  return p;
}

afterEach(() => {
  clearFileIndex();
});

const SWIFTUI_APP_ENTRY =
  'import SwiftUI\n' +
  '\n' +
  '@main\n' +
  'struct demoApp: App {\n' +
  '    var body: some Scene {\n' +
  '        WindowGroup {\n' +
  '            MyApp()\n' +
  '        }\n' +
  '    }\n' +
  '}\n';

const NON_APP_SWIFT_ENDING_IN_APP =
  'import SwiftUI\nstruct MyApp: View { var body: some View { Text("x") } }\n';

const APPLE_TEST_HARNESS_FILE =
  '// Mocker.swift — XCUITest harness, not the app entry point.\n' +
  'import XCTest\nclass Mocker {}\n';

describe('iosDiffFor — ios.init.missing target file detection', () => {
  test('finds the SwiftUI @main App file even when other files end in App.swift', async () => {
    const root = await makeRoot('init-detect');
    // Decoy: a Swift file whose name ends in App.swift but is NOT the @main entry.
    await write(root, 'demo/MyApp.swift', NON_APP_SWIFT_ENDING_IN_APP);
    // Decoy: a test bundle file.
    await write(root, 'demo-test/Mocker.swift', APPLE_TEST_HARNESS_FILE);
    // The real entry.
    const realEntry = await write(root, 'demo/demoApp.swift', SWIFTUI_APP_ENTRY);

    const diff = await iosDiffFor(root, 'ios.init.missing', null);
    expect(diff).toBeTruthy();
    // Diff header should reference ONLY the real @main App file.
    expect(diff!).toContain(`--- ${realEntry}`);
    expect(diff!).toContain('FRONTEGG-OP: swiftui-wrap-windowgroup');
    expect(diff!).not.toContain('Mocker.swift');
    expect(diff!).not.toContain('MyApp.swift');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('end-to-end: applying the diff produces compilable Swift (FronteggWrapper inside, import added)', async () => {
    const root = await makeRoot('init-e2e');
    const target = await write(root, 'demo/demoApp.swift', SWIFTUI_APP_ENTRY);
    const diff = await iosDiffFor(root, 'ios.init.missing', null);
    expect(diff).toBeTruthy();
    const r = await applyDiff({ rootPath: root, diff: diff! });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    expect(after).toMatch(/import\s+FronteggSwift/);
    expect(after).toMatch(/WindowGroup\s*\{[\s\S]*FronteggWrapper\s*\{[\s\S]*MyApp\(\)/);
    // Critically: no content trails the closing brace of the struct.
    const lastBraceIdx = after.lastIndexOf('}');
    expect(after.slice(lastBraceIdx + 1).trim()).toBe('');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('falls back to AppDelegate (UIKit) when no SwiftUI App entry exists', async () => {
    const root = await makeRoot('init-uikit-fallback');
    const target = await write(
      root,
      'demo/AppDelegate.swift',
      'import UIKit\n@main\nclass AppDelegate: UIResponder, UIApplicationDelegate {\n  func application(_ a: UIApplication, didFinishLaunchingWithOptions o: [UIApplication.LaunchOptionsKey: Any]?) -> Bool { return true }\n}\n'
    );
    const diff = await iosDiffFor(root, 'ios.init.missing', null);
    expect(diff).toBeTruthy();
    expect(diff!).toContain(`--- ${target}`);
    expect(diff!).toContain('FronteggApp.shared.didFinishLaunchingWithOptions()');
    expect(diff!).not.toContain('FRONTEGG-OP: swiftui-wrap-windowgroup');
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('iosDiffFor — ios.frontegg.plist.empty', () => {
  test('produces an insert-before-marker diff that lands keys inside <dict>', async () => {
    const root = await makeRoot('plist-diff');
    const target = await write(
      root,
      'demo/Frontegg.plist',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n'
    );
    const diff = await iosDiffFor(root, 'ios.frontegg.plist.empty', null);
    expect(diff).toBeTruthy();
    expect(diff!).toContain('FRONTEGG-OP: insert-before-marker marker=</dict>');
    const r = await applyDiff({ rootPath: root, diff: diff! });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    const dictIdx = after.indexOf('</dict>');
    const plistIdx = after.indexOf('</plist>');
    expect(after.indexOf('<key>baseUrl</key>')).toBeLessThan(dictIdx);
    expect(plistIdx).toBeGreaterThan(dictIdx);
    await fs.rm(root, { recursive: true, force: true });
  });
});
