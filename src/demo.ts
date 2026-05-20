#!/usr/bin/env node
/**
 * Demo CLI — exercises the MCP dispatcher end-to-end against a scripted
 * scenario so VHS can record deterministic terminal GIFs for the README.
 *
 * Each scenario builds a tiny in-memory project in a tmp directory, runs
 * the dispatcher against it, and pretty-prints the result with ANSI colors.
 * Scenarios:
 *   - rn       : React Native deep-link + init fixes
 *   - flutter  : Flutter version drift against canonical pubspec
 *   - ionic    : Ionic Capacitor plugin block missing
 *   - security : .env + base URL + .gitignore security sweep
 *   - ios      : iOS Swift mid-integration — deep-link + entitlements gaps
 *   - android  : Android Kotlin mid-integration — manifest + init + SDK dep gaps
 *
 * Usage: node dist/demo.js <scenario>
 */

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { analyze, generateDiffs } from './tools/dispatcher.js';
import { Finding } from './tools/types.js';
import { groupByFlow } from './prompts/result-formatters.js';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  red: '\x1b[38;5;203m',
  yellow: '\x1b[38;5;221m',
  green: '\x1b[38;5;120m',
  blue: '\x1b[38;5;111m',
  purple: '\x1b[38;5;141m',
  grey: '\x1b[38;5;245m',
  slate: '\x1b[38;5;244m',
};

type Scenario = 'rn' | 'flutter' | 'ionic' | 'security' | 'ios' | 'android';

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

async function scaffoldRN(root: string): Promise<void> {
  await writeFile(root, 'package.json', JSON.stringify({
    name: 'mobile-app',
    dependencies: {
      'react-native': '0.73.0',
      '@frontegg/react-native': '^1.0.0',
    },
  }, null, 2));
  await writeFile(root, 'android/app/src/main/AndroidManifest.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n<manifest package="com.example.app">\n  <application android:label="App">\n    <activity android:name=".MainActivity" />\n  </application>\n</manifest>\n');
  await writeFile(root, 'ios/MobileApp/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>CFBundleName</key><string>MobileApp</string>\n</dict>\n</plist>\n');
  await writeFile(root, 'ios/Podfile', "target 'MobileApp' do\n  pod 'FronteggRN'\nend\n");
  await writeFile(root, 'App.tsx', "import React from 'react';\nexport default function App() { return null; }\n");
}

async function scaffoldFlutter(root: string): Promise<void> {
  await writeFile(root, 'pubspec.yaml',
    'name: my_flutter_app\nversion: 1.0.0\ndependencies:\n  flutter:\n    sdk: flutter\n  frontegg_flutter: ^2.0.1\n');
  await writeFile(root, 'lib/main.dart',
    "import 'package:flutter/material.dart';\nimport 'package:frontegg_flutter/frontegg_flutter.dart';\nvoid main() => runApp(MyApp());\nclass MyApp extends StatelessWidget { @override Widget build(BuildContext c) => MaterialApp(home: Scaffold()); }\n");
}

async function scaffoldIonic(root: string): Promise<void> {
  await writeFile(root, 'package.json', JSON.stringify({
    name: 'ionic-store',
    dependencies: {
      '@capacitor/core': '^5.0.0',
      '@frontegg/ionic-capacitor': '^1.1.0',
    },
  }, null, 2));
  await writeFile(root, 'capacitor.config.ts',
    "import { CapacitorConfig } from '@capacitor/cli';\nconst config: CapacitorConfig = { appId: 'com.example.store', appName: 'Store', webDir: 'www' };\nexport default config;\n");
  await writeFile(root, 'android/app/src/main/AndroidManifest.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n<manifest package="com.example.store">\n  <uses-permission android:name="android.permission.INTERNET" />\n  <application><activity android:name=".MainActivity" /></application>\n</manifest>\n');
  await writeFile(root, 'ios/App/App/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict></dict></plist>\n');
}

async function scaffoldSecurity(root: string): Promise<void> {
  // React Native project with a bunch of security landmines.
  await scaffoldRN(root);
  await writeFile(root, '.env',
    'FRONTEGG_APP_ID=abc-123\nFRONTEGG_BASE_URL=http://app-demo.frontegg.com\n');
  await writeFile(root, '.gitignore', 'node_modules\nbuild\n');
}

async function scaffoldIOS(root: string): Promise<void> {
  // iOS Swift project mid-integration — Frontegg SDK installed via SwiftPM
  // but with the 5 things real customer projects miss. Mirrors the spec.
  await writeFile(root, 'Podfile',
    "platform :ios, '15.0'\ntarget 'App' do\n  use_frameworks!\n  pod 'FronteggSwift'\nend\n");
  // Info.plist WITHOUT CFBundleURLTypes (deep-link callback)
  await writeFile(root, 'App/App/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n<dict>\n' +
    '  <key>NSAppTransportSecurity</key>\n  <dict>\n    <key>NSAllowsArbitraryLoads</key>\n    <true/>\n  </dict>\n' +
    '</dict>\n</plist>\n');
  // Frontegg.plist WITHOUT baseUrl / clientId
  await writeFile(root, 'App/App/Frontegg.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict></dict></plist>\n');
  // AppDelegate.swift WITHOUT FronteggAuth.shared.start()
  await writeFile(root, 'App/App/AppDelegate.swift',
    'import UIKit\n@main\nclass AppDelegate: UIResponder, UIApplicationDelegate {\n' +
    '  func application(_ app: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {\n' +
    '    return true\n  }\n}\n');
  // .entitlements WITHOUT Associated Domains
  await writeFile(root, 'App/App/App.entitlements',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict></dict></plist>\n');
}

async function scaffoldAndroid(root: string): Promise<void> {
  // Android Kotlin project mid-integration. Strips: intent-filter, INTERNET
  // permission, FronteggApp.init() call, and SDK gradle dependency.
  // build.gradle WITHOUT the SDK dep
  await writeFile(root, 'app/build.gradle',
    'plugins { id "com.android.application"; id "kotlin-android" }\n' +
    'android {\n  namespace "com.example.app"\n  compileSdk 34\n' +
    '  defaultConfig { applicationId "com.example.app"; minSdk 26; targetSdk 34 }\n}\n' +
    'dependencies {\n  // FRONTEGG SDK MISSING — should be: implementation "com.frontegg.android:android:..."\n}\n');
  // AndroidManifest WITHOUT intent-filter and WITHOUT INTERNET permission
  await writeFile(root, 'app/src/main/AndroidManifest.xml',
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">\n' +
    '  <application android:label="App">\n' +
    '    <activity android:name=".MainActivity" android:exported="true">\n' +
    '      <intent-filter>\n        <action android:name="android.intent.action.MAIN" />\n' +
    '        <category android:name="android.intent.category.LAUNCHER" />\n      </intent-filter>\n' +
    '    </activity>\n  </application>\n</manifest>\n');
  // App class WITHOUT FronteggApp.init()
  await writeFile(root, 'app/src/main/kotlin/com/example/app/App.kt',
    'package com.example.app\nimport android.app.Application\nclass App : Application() {\n' +
    '  override fun onCreate() { super.onCreate() }\n}\n');
}

async function scaffold(scenario: Scenario): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `frontegg-demo-${scenario}-`));
  switch (scenario) {
    case 'rn': await scaffoldRN(root); break;
    case 'flutter': await scaffoldFlutter(root); break;
    case 'ionic': await scaffoldIonic(root); break;
    case 'security': await scaffoldSecurity(root); break;
    case 'ios': await scaffoldIOS(root); break;
    case 'android': await scaffoldAndroid(root); break;
  }
  return root;
}

function severityColor(sev: string): string {
  if (sev === 'critical' || sev === 'high') return c.red;
  if (sev === 'medium') return c.yellow;
  return c.slate;
}

function printReport(root: string, findings: Finding[], matched: string[], diffs: Array<{ id: string; diff: string }>): void {
  const out = (s: string = '') => process.stdout.write(s + '\n');
  out();
  out(`${c.purple}${c.bold}╭─── Frontegg Auto Report ─────────────────────────────╮${c.reset}`);
  out(`${c.purple}${c.bold}│${c.reset}  project: ${c.slate}${path.basename(root)}${c.reset}`);
  out(`${c.purple}${c.bold}│${c.reset}  detected SDK(s): ${c.blue}${matched.join(', ') || 'none'}${c.reset}`);
  out(`${c.purple}${c.bold}│${c.reset}  canonical source: ${c.dim}github.com/frontegg/*  (cached 6h)${c.reset}`);
  out(`${c.purple}${c.bold}╰──────────────────────────────────────────────────────╯${c.reset}`);
  out();

  if (findings.length === 0) {
    out(`  ${c.green}✓ No issues detected.${c.reset}`);
    return;
  }

  const grouped = groupByFlow(findings);
  for (const [flow, items] of Object.entries(grouped)) {
    out(`  ${c.bold}${c.slate}FLOW · ${flow.toUpperCase()}${c.reset}  ${c.dim}(${(items as Finding[]).length})${c.reset}`);
    for (const f of items as Finding[]) {
      const sevCol = severityColor(f.severity);
      out(`    ${sevCol}[${f.severity.toUpperCase()}]${c.reset} ${c.bold}${f.title}${c.reset}`);
      if (f.file_path) out(`        ${c.dim}${f.file_path}${c.reset}`);
      out(`        ${c.slate}${f.why.split('\n')[0]}${c.reset}`);
    }
    out();
  }

  if (diffs.length) {
    out(`  ${c.bold}${c.slate}READY-TO-APPLY DIFFS${c.reset}  ${c.dim}(${diffs.length})${c.reset}`);
    for (const d of diffs.slice(0, 2)) {
      out(`    ${c.blue}▸ ${d.id}${c.reset}`);
      const lines = d.diff.split('\n').slice(0, 6);
      for (const ln of lines) {
        if (ln.startsWith('+')) out(`      ${c.green}${ln}${c.reset}`);
        else if (ln.startsWith('-')) out(`      ${c.red}${ln}${c.reset}`);
        else out(`      ${c.dim}${ln}${c.reset}`);
      }
      if (d.diff.split('\n').length > 6) out(`      ${c.dim}…${c.reset}`);
    }
    out();
  }

  out(`  ${c.dim}${c.italic}Evidence: ${findings.length} rules applied · BMAD+godmode completion-gate${c.reset}`);
}

async function main(): Promise<void> {
  const scenario = (process.argv[2] || 'rn') as Scenario;
  if (!['rn', 'flutter', 'ionic', 'security', 'ios', 'android'].includes(scenario)) {
    console.error(`Unknown scenario: ${scenario}. Use: rn | flutter | ionic | security | ios | android`);
    process.exit(1);
  }

  process.stdout.write(`${c.dim}▸ scaffolding ${scenario} fixture…${c.reset}\n`);
  const root = await scaffold(scenario);
  process.stdout.write(`${c.dim}▸ running frontegg_auto on ${root}…${c.reset}\n`);

  const result = await analyze(root);
  const critIds = result.findings
    .filter((f) => f.severity === 'critical' || f.severity === 'high')
    .map((f) => f.id);
  const diffs = critIds.length ? await generateDiffs(root, critIds, result.knowledge) : [];

  printReport(root, result.findings, result.matchedSdks, diffs);

  // cleanup tmp
  await fs.rm(root, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
