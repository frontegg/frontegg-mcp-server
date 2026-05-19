import path from 'path';
import { findFirst, findAll, readIfExists } from '../platforms/fs-util.js';
import { appendDiff, kotlinInsertInMethodDiff } from './diff-util.js';

/**
 * Optional canonical block — when provided we template the diff from a real
 * Frontegg example file instead of from the hardcoded fallback below.
 *
 * Uses the shared scored `findFirst` so the diff targets the same manifest
 * the detector flagged (e.g. `app/src/main/AndroidManifest.xml`), not whichever
 * one a naive DFS happens to hit first in a multi-module project.
 */
export async function androidDiffFor(
  root: string,
  id: string,
  canonicalIntentFilter?: string[] | null
): Promise<string | null> {
  if (id.endsWith('android.intentFilter.missing')) {
    const manifest = await findFirst(root, 'AndroidManifest.xml');
    if (!manifest) return null;
    // The block is inserted inside <application> (see diff-applier's
    // applyEofAppend). A fully structural insert would place it inside the
    // main launcher <activity>, but that requires XML parsing. The emitted
    // comment tells users they need to move it under their launcher activity.
    const block =
      canonicalIntentFilter && canonicalIntentFilter.length > 0
        ? canonicalIntentFilter
        : [
            '    <!-- Frontegg MCP: move this <intent-filter> under your main launcher <activity>. -->',
            '    <intent-filter>',
            '        <action android:name="android.intent.action.VIEW" />',
            '        <category android:name="android.intent.category.DEFAULT" />',
            '        <category android:name="android.intent.category.BROWSABLE" />',
            '        <data android:scheme="yourapp" android:host="auth" />',
            '    </intent-filter>',
          ];
    return appendDiff(path.relative(root, manifest), block);
  }
  if (id.endsWith('android.sdk.dependency.missing')) {
    const gradle =
      (await findFirst(root, 'build.gradle')) ||
      (await findFirst(root, 'build.gradle.kts'));
    if (!gradle) return null;
    const dep = await pickAndroidSdkDependency(root);
    return appendDiff(path.relative(root, gradle), [
      '// Frontegg Android SDK — see https://github.com/frontegg/frontegg-android-kotlin',
      `// ${dep.note}`,
      'dependencies {',
      `    ${dep.line}`,
      '}',
    ]);
  }
  if (id.endsWith('android.init.missing')) {
    // Anchor the diff at an Application subclass when present, otherwise
    // the first Kotlin source. Customer projects vary widely so we emit a
    // template patch with the canonical FronteggApp.init() call inside
    // onCreate(); the user wires up the actual domain / clientId values.
    const ktSources = await findAll(
      root,
      (n) => n.endsWith('.kt') || n.endsWith('.java'),
      400
    );
    const appClass = ktSources.find((p) => /\/App(lication)?\.kt$/.test(p)) || ktSources[0];
    if (!appClass) return null;
    // Lines beginning with `import ` get routed to the file's import region;
    // all other lines land at the END of the onCreate() body, after
    // `super.onCreate()` and any existing setup like `instance = this`.
    const insertion = [
      'import com.frontegg.android.FronteggApp',
      '// Bootstrap the Frontegg SDK so login / refresh / logout work',
      '// before the first Activity comes up. Replace the placeholder',
      '// domain & clientId with your tenant values.',
      'FronteggApp.init(',
      '    fronteggDomain = "app-<subdomain>.frontegg.com",',
      '    clientId = "YOUR_CLIENT_ID",',
      '    context = this,',
      ')',
    ];
    return kotlinInsertInMethodDiff(path.relative(root, appClass), 'onCreate', insertion);
  }
  return null;
}

/**
 * Choose the Maven coordinate / Gradle line to suggest for the Frontegg
 * Android SDK. The artifact `com.frontegg.android:android` is **not**
 * published to Maven Central as of this writing — repo1.maven.org returns
 * 404 for it. The two real-world install paths are:
 *
 *   1. The canonical SDK monorepo
 *      (https://github.com/frontegg/frontegg-android-kotlin) wires the SDK
 *      as a sibling Gradle module via `include ':android'` in
 *      `settings.gradle`. Demos in that repo use
 *      `implementation project(path: ':android')`.
 *
 *   2. Customer projects pull the SDK via JitPack with
 *      `com.github.frontegg:frontegg-android-kotlin:<tag>`.
 *
 * We detect (1) by reading `settings.gradle` (or `.kts`) and looking for an
 * `:android` include. Otherwise fall back to the JitPack coordinate.
 */
async function pickAndroidSdkDependency(
  root: string
): Promise<{ line: string; note: string }> {
  // Walk up from `root` looking for a settings.gradle / settings.gradle.kts
  // that includes a sibling `:android` Gradle module. This handles the case
  // where the user analyses `frontegg-android-kotlin/app/` rather than the
  // monorepo root — `:android` is a sibling at the parent level.
  let dir = root;
  for (let i = 0; i < 5; i++) {
    const settings =
      (await readIfExists(path.join(dir, 'settings.gradle'))) ||
      (await readIfExists(path.join(dir, 'settings.gradle.kts'))) ||
      '';
    if (settings && /include\s*[:(]?\s*['"]:android['"]/.test(settings)) {
      return {
        line: "implementation project(path: ':android')",
        note: 'Local Gradle module — this project includes the SDK as a sibling :android module.',
      };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {
    line: "implementation 'com.github.frontegg:frontegg-android-kotlin:1.2.43'",
    note:
      'JitPack coordinate. The canonical SDK is distributed via JitPack — add ' +
      'maven { url "https://jitpack.io" } to settings.gradle dependencyResolutionManagement.repositories. ' +
      'It is NOT published to Maven Central.',
  };
}
