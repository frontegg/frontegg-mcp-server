import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { androidDiffFor } from '../src/tools/diffs/android-diffs.js';
import { applyDiff } from '../src/tools/diffs/diff-applier.js';
import { clearFileIndex } from '../src/tools/platforms/fs-util.js';

async function makeRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `android-diffs-${prefix}-`));
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

const APP_KT_NO_INIT =
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

const SETTINGS_GRADLE_CANONICAL_REPO =
  "rootProject.name = \"Frontegg Android Kotlin\"\ninclude ':android'\ninclude ':app'\n";

const SETTINGS_GRADLE_STANDALONE = "rootProject.name = \"My App\"\ninclude ':app'\n";

describe('androidDiffFor — android.init.missing', () => {
  test('end-to-end: applies init INSIDE onCreate body, not after the class brace', async () => {
    const root = await makeRoot('init-e2e');
    const target = await write(root, 'app/src/main/kotlin/com/frontegg/demo/App.kt', APP_KT_NO_INIT);

    const diff = await androidDiffFor(root, 'android.init.missing', null);
    expect(diff).toBeTruthy();
    expect(diff!).toContain('FRONTEGG-OP: kotlin-insert-in-method method=onCreate');

    const r = await applyDiff({ rootPath: root, diff: diff! });
    expect(r.status).toBe('appended');
    const after = await fs.readFile(target, 'utf8');

    // Import was added.
    expect(after).toMatch(/import\s+com\.frontegg\.android\.FronteggApp/);
    // FronteggApp.init lands INSIDE onCreate, AFTER super.onCreate().
    const onCreateOpenIdx = after.indexOf('fun onCreate');
    expect(onCreateOpenIdx).toBeGreaterThan(0);
    const onCreateBodyEnd = after.indexOf('}', onCreateOpenIdx);
    const onCreateBody = after.slice(onCreateOpenIdx, onCreateBodyEnd);
    expect(onCreateBody).toContain('FronteggApp.init(');
    expect(onCreateBody.indexOf('super.onCreate()')).toBeLessThan(
      onCreateBody.indexOf('FronteggApp.init(')
    );
    // The class-level closing brace must come AFTER FronteggApp.init.
    const classClose = after.lastIndexOf('}');
    expect(after.indexOf('FronteggApp.init(')).toBeLessThan(classClose);
    await fs.rm(root, { recursive: true, force: true });
  });
});

describe('androidDiffFor — android.sdk.dependency.missing', () => {
  test('suggests the local :android Gradle module inside the canonical SDK monorepo', async () => {
    const root = await makeRoot('dep-canonical');
    await write(root, 'settings.gradle', SETTINGS_GRADLE_CANONICAL_REPO);
    await write(
      root,
      'app/build.gradle',
      'plugins { id "com.android.application" }\nandroid { namespace "com.example.app" }\ndependencies {\n}\n'
    );

    const diff = await androidDiffFor(root, 'android.sdk.dependency.missing', null);
    expect(diff).toBeTruthy();
    expect(diff!).toContain("implementation project(path: ':android')");
    expect(diff!).not.toContain('com.frontegg.android:android');
    await fs.rm(root, { recursive: true, force: true });
  });

  test('suggests the JitPack coordinate for standalone projects', async () => {
    const root = await makeRoot('dep-standalone');
    await write(root, 'settings.gradle', SETTINGS_GRADLE_STANDALONE);
    await write(
      root,
      'app/build.gradle',
      'plugins { id "com.android.application" }\nandroid { namespace "com.example.app" }\ndependencies {\n}\n'
    );

    const diff = await androidDiffFor(root, 'android.sdk.dependency.missing', null);
    expect(diff).toBeTruthy();
    expect(diff!).toContain('com.github.frontegg:frontegg-android-kotlin');
    // Must NOT suggest the non-existent Maven Central coord.
    expect(diff!).not.toContain('com.frontegg.android:android');
    await fs.rm(root, { recursive: true, force: true });
  });
});
