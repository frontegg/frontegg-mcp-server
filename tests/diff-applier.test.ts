import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { applyDiff } from '../src/tools/diffs/diff-applier.js';
import {
  insertBeforeMarkerDiff,
  swiftuiWrapWindowGroupDiff,
  kotlinInsertInMethodDiff,
  appendDiff,
  newFileDiff,
} from '../src/tools/diffs/diff-util.js';

async function makeRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `diff-applier-${prefix}-`));
}

async function write(root: string, rel: string, content: string): Promise<string> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
  return p;
}

describe('diff-applier — insert-before-marker', () => {
  test('inserts addition lines INSIDE empty <dict> of Frontegg.plist (Bug 1)', async () => {
    const root = await makeRoot('plist-empty');
    const target = await write(
      root,
      'demo/Frontegg.plist',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
        '<plist version="1.0">\n' +
        '<dict>\n' +
        '</dict>\n' +
        '</plist>\n'
    );
    const diff = insertBeforeMarkerDiff(target, '</dict>', [
      '<key>baseUrl</key>',
      '<string>https://app-foo.frontegg.com</string>',
      '<key>clientId</key>',
      '<string>YOUR_CLIENT_ID</string>',
    ]);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('appended');
    expect(r.backupPath).toBeDefined();
    const after = await fs.readFile(target, 'utf8');
    // The keys must appear BEFORE </dict>, BEFORE </plist> (i.e. inside the
    // root dict).
    const dictIdx = after.indexOf('</dict>');
    const plistIdx = after.indexOf('</plist>');
    expect(dictIdx).toBeGreaterThan(0);
    expect(plistIdx).toBeGreaterThan(dictIdx);
    expect(after.indexOf('<key>baseUrl</key>')).toBeGreaterThan(0);
    expect(after.indexOf('<key>baseUrl</key>')).toBeLessThan(dictIdx);
    // Backup must hold the pre-mutation content.
    const bak = await fs.readFile(r.backupPath!, 'utf8');
    expect(bak).not.toContain('baseUrl');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('idempotent: re-applying does not double-insert', async () => {
    const root = await makeRoot('plist-idempotent');
    const target = await write(
      root,
      'demo/Frontegg.plist',
      '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n'
    );
    const diff = insertBeforeMarkerDiff(target, '</dict>', [
      '<key>baseUrl</key>',
      '<string>https://x.frontegg.com</string>',
    ]);
    const r1 = await applyDiff({ rootPath: root, diff });
    expect(r1.status).toBe('appended');
    const r2 = await applyDiff({ rootPath: root, diff });
    expect(r2.status).toBe('skipped');
    const after = await fs.readFile(target, 'utf8');
    const occurrences = after.match(/<key>baseUrl<\/key>/g) ?? [];
    expect(occurrences.length).toBe(1);
    await fs.rm(root, { recursive: true, force: true });
  });

  test('falls back to EOF append (XML-aware) when marker is absent', async () => {
    // No </dict> so the marker doesn't match. The applier should still produce
    // a structurally-valid file rather than crashing.
    const root = await makeRoot('marker-missing');
    const target = await write(root, 'app/build.gradle', 'dependencies {\n}\n');
    const diff = insertBeforeMarkerDiff(target, '</dict>', ['// trailing comment']);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    expect(after).toContain('// trailing comment');
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('diff-applier — swiftui-wrap-windowgroup', () => {
  const SWIFTUI_APP =
    '//\n' +
    '//  demoApp.swift\n' +
    '//\n' +
    '\n' +
    'import SwiftUI\n' +
    '\n' +
    '/// The main entry point for the demo application.\n' +
    '@main\n' +
    'struct demoApp: App {\n' +
    '    var body: some Scene {\n' +
    '        WindowGroup {\n' +
    '            MyApp()\n' +
    '        }\n' +
    '    }\n' +
    '}\n';

  test('wraps WindowGroup body with FronteggWrapper and adds import (Bug 2)', async () => {
    const root = await makeRoot('swiftui-wrap');
    const target = await write(root, 'demo/demoApp.swift', SWIFTUI_APP);
    const diff = swiftuiWrapWindowGroupDiff(target);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    // import was added
    expect(after).toMatch(/import\s+FronteggSwift/);
    // FronteggWrapper wraps the WindowGroup body
    expect(after).toMatch(/WindowGroup\s*\{[\s\S]*FronteggWrapper\s*\{[\s\S]*MyApp\(\)[\s\S]*\}[\s\S]*\}/);
    // No content appears AFTER the closing struct brace (would be invalid Swift).
    const lastBrace = after.lastIndexOf('}');
    const tail = after.slice(lastBrace + 1).trim();
    expect(tail).toBe('');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('idempotent: re-applying detects FronteggWrapper already present', async () => {
    const root = await makeRoot('swiftui-idempotent');
    const target = await write(root, 'demo/demoApp.swift', SWIFTUI_APP);
    const diff = swiftuiWrapWindowGroupDiff(target);
    const r1 = await applyDiff({ rootPath: root, diff });
    expect(r1.status).toBe('appended');
    const r2 = await applyDiff({ rootPath: root, diff });
    expect(r2.status).toBe('skipped');
    const after = await fs.readFile(target, 'utf8');
    const wrappers = after.match(/FronteggWrapper/g) ?? [];
    expect(wrappers.length).toBe(1);
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('diff-applier — kotlin-insert-in-method', () => {
  const APP_KT =
    'package com.frontegg.demo\n' +
    '\n' +
    'import android.app.Application\n' +
    '\n' +
    'class App : Application() {\n' +
    '    companion object {\n' +
    '        lateinit var instance: App\n' +
    '    }\n' +
    '\n' +
    '    override fun onCreate() {\n' +
    '        super.onCreate()\n' +
    '        instance = this\n' +
    '    }\n' +
    '}\n';

  test('inserts inside onCreate body and adds import (Bug 3)', async () => {
    const root = await makeRoot('kotlin-insert');
    const target = await write(root, 'app/src/main/kotlin/com/frontegg/demo/App.kt', APP_KT);
    const diff = kotlinInsertInMethodDiff(target, 'onCreate', [
      'import com.frontegg.android.FronteggApp',
      'FronteggApp.init(',
      '    fronteggDomain = "app-x.frontegg.com",',
      '    clientId = "Y",',
      '    context = this,',
      ')',
    ]);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    // Import landed in the import region.
    expect(after).toMatch(/import com\.frontegg\.android\.FronteggApp/);
    // FronteggApp.init lands INSIDE onCreate (after super.onCreate()).
    const onCreateOpen = after.indexOf('fun onCreate');
    const onCreateClose = after.indexOf('}', onCreateOpen);
    const onCreateBody = after.slice(onCreateOpen, onCreateClose);
    expect(onCreateBody).toContain('FronteggApp.init(');
    expect(onCreateBody.indexOf('super.onCreate()')).toBeLessThan(
      onCreateBody.indexOf('FronteggApp.init(')
    );
    // Class brace closes AFTER FronteggApp.init (so init isn't outside class).
    const classClose = after.lastIndexOf('}');
    expect(after.indexOf('FronteggApp.init(')).toBeLessThan(classClose);
    await fs.rm(root, { recursive: true, force: true });
  });

  test('idempotent: detects FronteggApp.init already present', async () => {
    const root = await makeRoot('kotlin-idempotent');
    const target = await write(root, 'app/App.kt', APP_KT);
    const diff = kotlinInsertInMethodDiff(target, 'onCreate', [
      'import com.frontegg.android.FronteggApp',
      'FronteggApp.init(fronteggDomain = "x", clientId = "y", context = this)',
    ]);
    const r1 = await applyDiff({ rootPath: root, diff });
    expect(r1.status).toBe('appended');
    const r2 = await applyDiff({ rootPath: root, diff });
    expect(r2.status).toBe('skipped');
    const after = await fs.readFile(target, 'utf8');
    const inits = after.match(/FronteggApp\.init/g) ?? [];
    expect(inits.length).toBe(1);
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('diff-applier — backwards compat', () => {
  test('eof-append still works for plain text files', async () => {
    const root = await makeRoot('eof-append');
    const target = await write(root, 'app/build.gradle', 'dependencies {\n}\n');
    const diff = appendDiff(target, ['// added comment']);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');
    expect(after).toContain('// added comment');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('new file creation still works (--- /dev/null)', async () => {
    const root = await makeRoot('new-file');
    const diff = newFileDiff(path.join(root, '.env'), [
      'FRONTEGG_APP_ID=x',
      'FRONTEGG_BASE_URL=https://y',
    ]);
    const r = await applyDiff({ rootPath: root, diff });
    expect(r.status).toBe('created');
    const after = await fs.readFile(path.join(root, '.env'), 'utf8');
    expect(after).toContain('FRONTEGG_APP_ID=x');
    await fs.rm(root, { recursive: true, force: true });
  });
});
