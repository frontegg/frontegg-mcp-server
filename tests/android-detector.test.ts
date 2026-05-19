import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import {
  detectAndroidIssues,
  hasFronteggGradleDependency,
} from '../src/tools/platforms/android-detector.js';
import { clearFileIndex } from '../src/tools/platforms/fs-util.js';

/** Per-test temp dir helper. Mirrors the demo.ts scaffolding pattern. */
async function makeRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `android-detector-${prefix}-`));
  return root;
}

async function write(root: string, rel: string, content: string): Promise<void> {
  const p = path.join(root, rel);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, 'utf8');
}

const MANIFEST_NO_INTENT_FILTER =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">\n' +
  '  <application android:label="App">\n' +
  '    <activity android:name=".MainActivity" android:exported="true">\n' +
  '      <intent-filter>\n        <action android:name="android.intent.action.MAIN" />\n' +
  '        <category android:name="android.intent.category.LAUNCHER" />\n      </intent-filter>\n' +
  '    </activity>\n  </application>\n</manifest>\n';

const MANIFEST_WITH_DEEPLINK =
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">\n' +
  '  <uses-permission android:name="android.permission.INTERNET" />\n' +
  '  <application android:label="App">\n' +
  '    <activity android:name=".MainActivity" android:exported="true">\n' +
  '      <intent-filter>\n        <action android:name="android.intent.action.VIEW" />\n' +
  '        <category android:name="android.intent.category.DEFAULT" />\n' +
  '        <category android:name="android.intent.category.BROWSABLE" />\n' +
  '        <data android:scheme="myapp" android:host="auth" />\n' +
  '      </intent-filter>\n' +
  '    </activity>\n  </application>\n</manifest>\n';

const GRADLE_NO_FRONTEGG_DEP =
  'plugins { id "com.android.application"; id "kotlin-android" }\n' +
  'android {\n  namespace "com.example.app"\n  compileSdk 34\n' +
  '  defaultConfig { applicationId "com.example.app"; minSdk 26; targetSdk 34 }\n}\n' +
  'dependencies {\n  // FRONTEGG SDK MISSING — should be: implementation "com.frontegg.android:android:..."\n}\n';

const GRADLE_WITH_FRONTEGG_DEP =
  'plugins { id "com.android.application"; id "kotlin-android" }\n' +
  'android {\n  namespace "com.example.app"\n  compileSdk 34\n' +
  '  defaultConfig { applicationId "com.example.app"; minSdk 26; targetSdk 34 }\n}\n' +
  'dependencies {\n  implementation "com.frontegg.android:android:1.2.6"\n}\n';

const GRADLE_WITH_PLACEHOLDERS =
  'plugins { id "com.android.application"; id "kotlin-android" }\n' +
  'android {\n  namespace "com.example.app"\n  compileSdk 34\n' +
  '  defaultConfig {\n    applicationId "com.example.app"\n    minSdk 26\n    targetSdk 34\n' +
  '    manifestPlaceholders = [\n' +
  '        "frontegg_domain"   : "app-demo.frontegg.com",\n' +
  '        "frontegg_client_id": "11111111-2222-3333-4444-555555555555",\n' +
  '    ]\n  }\n}\n' +
  'dependencies {\n  implementation "com.frontegg.android:android:1.2.6"\n}\n';

const APP_KT_NO_INIT =
  'package com.example.app\nimport android.app.Application\nclass App : Application() {\n' +
  '  override fun onCreate() { super.onCreate() }\n}\n';

const APP_KT_WITH_INIT =
  'package com.example.app\n' +
  'import android.app.Application\n' +
  'import com.frontegg.android.FronteggApp\n' +
  'class App : Application() {\n' +
  '  override fun onCreate() {\n' +
  '    super.onCreate()\n' +
  '    FronteggApp.init(\n' +
  '      fronteggDomain = "app-demo.frontegg.com",\n' +
  '      clientId = "abc",\n' +
  '      context = this,\n' +
  '    )\n' +
  '  }\n}\n';

afterEach(() => {
  clearFileIndex();
});

describe('hasFronteggGradleDependency', () => {
  test('matches a coordinate-style implementation line', () => {
    expect(
      hasFronteggGradleDependency(
        'dependencies {\n  implementation "com.frontegg.android:android:1.2.3"\n}\n'
      )
    ).toBe(true);
  });

  test('matches single-quoted api line', () => {
    expect(
      hasFronteggGradleDependency(
        "dependencies {\n  api 'com.frontegg.android:android:1.2.3'\n}\n"
      )
    ).toBe(true);
  });

  test('matches debugImplementation', () => {
    expect(
      hasFronteggGradleDependency(
        'dependencies {\n  debugImplementation "com.frontegg.android:android:1.2.3"\n}\n'
      )
    ).toBe(true);
  });

  test('matches the canonical SDK monorepo project(":android") form', () => {
    expect(
      hasFronteggGradleDependency(
        "dependencies {\n  implementation project(path: ':android')\n}\n"
      )
    ).toBe(true);
  });

  test('does NOT match a comment that mentions frontegg', () => {
    expect(
      hasFronteggGradleDependency(
        'dependencies {\n  // FRONTEGG SDK MISSING — should be: implementation "com.frontegg.android:..."\n}\n'
      )
    ).toBe(false);
  });

  test('does NOT match a `def fronteggDomain = ...` script variable', () => {
    expect(
      hasFronteggGradleDependency(
        'def fronteggDomain = "app.frontegg.com"\nandroid { namespace "com.x" }\n'
      )
    ).toBe(false);
  });

  test('does NOT match an empty dependencies block', () => {
    expect(hasFronteggGradleDependency('dependencies {\n}\n')).toBe(false);
  });
});

describe('Android detector — new and tightened rules', () => {
  describe('android.sdk.dependency.missing', () => {
    test('fires when build.gradle only contains a frontegg COMMENT (regression test for /frontegg/i suppression)', async () => {
      const root = await makeRoot('dep-comment-only');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_WITH_DEEPLINK);
      await write(root, 'app/build.gradle', GRADLE_NO_FRONTEGG_DEP);
      const findings = await detectAndroidIssues(root, null);
      const hit = findings.find((f) => f.id === 'android.sdk.dependency.missing');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('high');
      expect(hit!.flow).toBe('build');
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when build.gradle has a real implementation dep', async () => {
      const root = await makeRoot('dep-present');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_WITH_DEEPLINK);
      await write(root, 'app/build.gradle', GRADLE_WITH_FRONTEGG_DEP);
      const findings = await detectAndroidIssues(root, null);
      expect(findings.find((f) => f.id === 'android.sdk.dependency.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when gradle is configured via manifestPlaceholders (gradleConfigured suppression)', async () => {
      const root = await makeRoot('dep-via-placeholders');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_NO_INTENT_FILTER);
      // strip the implementation line so only placeholders remain — checks the
      // gradleConfigured fallback path, not just the dep regex.
      await write(
        root,
        'app/build.gradle',
        GRADLE_WITH_PLACEHOLDERS.replace(
          'dependencies {\n  implementation "com.frontegg.android:android:1.2.6"\n}\n',
          'dependencies {\n}\n'
        )
      );
      const findings = await detectAndroidIssues(root, null);
      expect(findings.find((f) => f.id === 'android.sdk.dependency.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('android.init.missing', () => {
    test('fires when no source has FronteggApp.init AND no gradle config / properties', async () => {
      const root = await makeRoot('init-missing');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_WITH_DEEPLINK);
      await write(root, 'app/build.gradle', GRADLE_WITH_FRONTEGG_DEP);
      await write(root, 'app/src/main/kotlin/com/example/app/App.kt', APP_KT_NO_INIT);
      const findings = await detectAndroidIssues(root, null);
      const hit = findings.find((f) => f.id === 'android.init.missing');
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe('critical');
      expect(hit!.flow).toBe('init');
      expect(hit!.file_path).toContain('App.kt');
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when a Kotlin source calls FronteggApp.init(...)', async () => {
      const root = await makeRoot('init-via-kotlin');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_WITH_DEEPLINK);
      await write(root, 'app/build.gradle', GRADLE_WITH_FRONTEGG_DEP);
      await write(root, 'app/src/main/kotlin/com/example/app/App.kt', APP_KT_WITH_INIT);
      const findings = await detectAndroidIssues(root, null);
      expect(findings.find((f) => f.id === 'android.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when gradle manifestPlaceholders configure the SDK (gradle-driven init)', async () => {
      const root = await makeRoot('init-via-gradle');
      // Manifest can omit intent-filter / INTERNET because gradleConfigured
      // suppresses those rules for the canonical setup.
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_NO_INTENT_FILTER);
      await write(root, 'app/build.gradle', GRADLE_WITH_PLACEHOLDERS);
      await write(root, 'app/src/main/kotlin/com/example/app/App.kt', APP_KT_NO_INIT);
      const findings = await detectAndroidIssues(root, null);
      expect(findings.find((f) => f.id === 'android.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });

    test('does NOT fire when frontegg.properties at the project root drives BuildConfig init', async () => {
      const root = await makeRoot('init-via-properties');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_WITH_DEEPLINK);
      await write(root, 'app/build.gradle', GRADLE_WITH_FRONTEGG_DEP);
      await write(root, 'app/src/main/kotlin/com/example/app/App.kt', APP_KT_NO_INIT);
      await write(
        root,
        'frontegg.properties',
        'FRONTEGG_DOMAIN=app-demo.frontegg.com\nFRONTEGG_CLIENT_ID=abc\n'
      );
      const findings = await detectAndroidIssues(root, null);
      expect(findings.find((f) => f.id === 'android.init.missing')).toBeUndefined();
      await fs.rm(root, { recursive: true, force: true });
    });
  });

  describe('canonical-quality scaffold (positive case)', () => {
    test('a fully-wired Android project produces no critical/high findings from the new rules', async () => {
      const root = await makeRoot('canonical-good');
      await write(root, 'app/src/main/AndroidManifest.xml', MANIFEST_NO_INTENT_FILTER);
      await write(root, 'app/build.gradle', GRADLE_WITH_PLACEHOLDERS);
      await write(root, 'app/src/main/kotlin/com/example/app/App.kt', APP_KT_WITH_INIT);
      const findings = await detectAndroidIssues(root, null);
      const newRuleHits = findings.filter((f) =>
        ['android.init.missing', 'android.sdk.dependency.missing'].includes(f.id)
      );
      expect(newRuleHits).toHaveLength(0);
      await fs.rm(root, { recursive: true, force: true });
    });
  });
});
