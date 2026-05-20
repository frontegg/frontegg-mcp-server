import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { detectIosIssues } from '../src/tools/platforms/ios-detector.js';
import { isFronteggIosConfigured } from '../src/tools/platforms/wiring-probe.js';
import { clearFileIndex } from '../src/tools/platforms/fs-util.js';

/** Per-test temp dir helper. Mirrors the demo.ts scaffolding pattern. */
async function makeRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `ios-detector-${prefix}-`));
  return root;
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

const PLIST_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
  '<plist version="1.0">\n<dict>\n';
const PLIST_TAIL = '</dict>\n</plist>\n';

const EMPTY_PLIST = PLIST_HEAD + PLIST_TAIL;

const POPULATED_FRONTEGG_PLIST =
  PLIST_HEAD +
  '  <key>baseUrl</key>\n' +
  '  <string>https://app-demo.frontegg.com</string>\n' +
  '  <key>clientId</key>\n' +
  '  <string>11111111-2222-3333-4444-555555555555</string>\n' +
  '  <key>applicationId</key>\n' +
  '  <string>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</string>\n' +
  PLIST_TAIL;

const ATS_BROAD_INFO_PLIST =
  PLIST_HEAD +
  '  <key>NSAppTransportSecurity</key>\n' +
  '  <dict>\n' +
  '    <key>NSAllowsArbitraryLoads</key>\n' +
  '    <true/>\n' +
  '  </dict>\n' +
  PLIST_TAIL;

const APP_DELEGATE_NO_INIT =
  'import UIKit\n' +
  '@main\n' +
  'class AppDelegate: UIResponder, UIApplicationDelegate {\n' +
  '  func application(_ app: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {\n' +
  '    return true\n  }\n}\n';

const APP_DELEGATE_WITH_INIT =
  'import UIKit\n' +
  'import FronteggSwift\n' +
  '@main\n' +
  'class AppDelegate: UIResponder, UIApplicationDelegate {\n' +
  '  func application(_ app: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {\n' +
  '    FronteggApp.shared.didFinishLaunchingWithOptions()\n' +
  '    return true\n  }\n}\n';

afterEach(() => {
  clearFileIndex();
});

describe('iOS detector — new rules', () => {
  describe('ios.init.missing', () => {
    test('fires when no Swift source contains a recognized init marker', async () => {
      const root = await makeRoot('init-missing');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(root, 'App/App/AppDelegate.swift', APP_DELEGATE_NO_INIT);
      const findings = await detectIosIssues(root, null);
      const hit = findings.find((f) => f.id === 'ios.init.missing');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('critical');
      expect(hit!.flow).toBe('init');
      expect(hit!.file_path).toBe('App/App/AppDelegate.swift');
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when AppDelegate calls FronteggApp.shared.didFinishLaunchingWithOptions', async () => {
      const root = await makeRoot('init-uikit');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(root, 'App/App/AppDelegate.swift', APP_DELEGATE_WITH_INIT);
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when SwiftUI app entry uses FronteggWrapper', async () => {
      const root = await makeRoot('init-swiftui');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(
        root,
        'App/App/MyApp.swift',
        'import SwiftUI\nimport FronteggSwift\n@main\nstruct MyApp: App {\n  var body: some Scene {\n    WindowGroup { FronteggWrapper { ContentView() } }\n  }\n}\n'
      );
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when a Swift source calls FronteggAuth.shared.start(...)', async () => {
      const root = await makeRoot('init-start');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(
        root,
        'App/App/AppDelegate.swift',
        APP_DELEGATE_NO_INIT.replace('return true', 'FronteggAuth.shared.start(); return true')
      );
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('ios.frontegg.plist.empty', () => {
    test('fires when Frontegg.plist exists but is empty', async () => {
      const root = await makeRoot('plist-empty');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(root, 'App/App/Frontegg.plist', EMPTY_PLIST);
      const findings = await detectIosIssues(root, null);
      const hit = findings.find((f) => f.id === 'ios.frontegg.plist.empty');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
      expect(hit!.flow).toBe('init');
      expect(hit!.file_path).toContain('Frontegg.plist');
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when Frontegg.plist contains baseUrl and clientId', async () => {
      const root = await makeRoot('plist-populated');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      await write(root, 'App/App/Frontegg.plist', POPULATED_FRONTEGG_PLIST);
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.frontegg.plist.empty')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when Frontegg.plist is absent', async () => {
      const root = await makeRoot('plist-absent');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.frontegg.plist.empty')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('ios.ats.broad-allows', () => {
    test('fires when Info.plist has NSAllowsArbitraryLoads = true', async () => {
      const root = await makeRoot('ats-broad');
      await write(root, 'App/App/Info.plist', ATS_BROAD_INFO_PLIST);
      const findings = await detectIosIssues(root, null);
      const hit = findings.find((f) => f.id === 'ios.ats.broad-allows');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('medium');
      expect(hit!.flow).toBe('security');
      expect(hit!.file_path).toContain('Info.plist');
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when Info.plist has no NSAllowsArbitraryLoads', async () => {
      const root = await makeRoot('ats-clean');
      await write(root, 'App/App/Info.plist', EMPTY_PLIST);
      const findings = await detectIosIssues(root, null);
      expect(findings.find((f) => f.id === 'ios.ats.broad-allows')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('isFronteggIosConfigured() — semantic plist check', () => {
    test('returns false when Frontegg.plist exists but is empty', async () => {
      const root = await makeRoot('configured-empty');
      await write(root, 'App/App/Frontegg.plist', EMPTY_PLIST);
      expect(await isFronteggIosConfigured(root)).toBe(false);
      await fs.rm(root, { recursive: true, force: true });
    });

    test('returns true when Frontegg.plist has baseUrl and clientId', async () => {
      const root = await makeRoot('configured-populated');
      await write(root, 'App/App/Frontegg.plist', POPULATED_FRONTEGG_PLIST);
      expect(await isFronteggIosConfigured(root)).toBe(true);
      await fs.rm(root, { recursive: true, force: true });
    });

    test('returns true when a Swift source imports FronteggSwift even with empty plist', async () => {
      const root = await makeRoot('configured-swift');
      await write(root, 'App/App/Frontegg.plist', EMPTY_PLIST);
      await write(
        root,
        'App/App/AppDelegate.swift',
        'import UIKit\nimport FronteggSwift\nclass AppDelegate {}\n'
      );
      expect(await isFronteggIosConfigured(root)).toBe(true);
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('canonical-quality scaffold (positive case)', () => {
    test('a fully-wired iOS project produces no critical/high findings from the new rules', async () => {
      const root = await makeRoot('canonical-good');
      // Info.plist with CFBundleURLTypes and no broad ATS allow
      await write(
        root,
        'App/App/Info.plist',
        PLIST_HEAD +
          '  <key>CFBundleURLTypes</key>\n' +
          '  <array>\n    <dict>\n      <key>CFBundleURLSchemes</key>\n' +
          '      <array><string>com.example.app</string></array>\n    </dict>\n  </array>\n' +
          PLIST_TAIL
      );
      // Populated Frontegg.plist
      await write(root, 'App/App/Frontegg.plist', POPULATED_FRONTEGG_PLIST);
      // AppDelegate that bootstraps the SDK
      await write(root, 'App/App/AppDelegate.swift', APP_DELEGATE_WITH_INIT);
      // Entitlements with associated-domains + webcredentials
      await write(
        root,
        'App/App/App.entitlements',
        PLIST_HEAD +
          '  <key>com.apple.developer.associated-domains</key>\n' +
          '  <array>\n    <string>applinks:app-demo.frontegg.com</string>\n' +
          '    <string>webcredentials:app-demo.frontegg.com</string>\n  </array>\n' +
          PLIST_TAIL
      );
      // SDK dep visible to the detector
      await write(root, 'Podfile', "platform :ios, '15.0'\ntarget 'App' do\n  pod 'FronteggSwift'\nend\n");

      const findings = await detectIosIssues(root, null);
      const newRuleHits = findings.filter((f) =>
        ['ios.init.missing', 'ios.frontegg.plist.empty', 'ios.ats.broad-allows'].includes(f.id)
      );
      expect(newRuleHits).toHaveLength(0);
      await fs.rm(root, { recursive: true, force: true });
    });
  });
});
