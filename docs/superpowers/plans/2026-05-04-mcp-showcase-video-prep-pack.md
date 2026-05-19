# MCP Showcase Video — Prep Pack & Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce all assets (demo state, scripts, overlays, VHS tapes, Claude Desktop configs) AND record raw scene footage for the 4-minute Frontegg Mobile MCP showcase video described in `docs/superpowers/specs/2026-05-04-mcp-showcase-video-design.md`. Hand a finished prep pack + raw scene recordings to the user, who supplies VO and edits the final cut.

**Architecture:** Five logical phases, mostly serial. Phase 1 sets up workspace + extends existing `src/demo.ts` and VHS tape system to support iOS and Android. Phases 2–4 produce assets (configs, scripts, overlays, VHS-rendered CLI beat). Phase 5 runs the live recording session driven via the macOS computer-use sandbox + Bash `screencapture`. Each phase ends with a validated, reviewable artifact.

**Tech Stack:** Node 18+, TypeScript (existing MCP server), VHS (`charmbracelet/vhs`) for terminal recording, macOS `screencapture` for screen recording, `xcrun simctl io booted recordVideo` for clean simulator recording, HTML/CSS/SVG for overlays, Claude Desktop + Cursor (user-driven sidebar shots) as recording surfaces.

**Spec reference:** `docs/superpowers/specs/2026-05-04-mcp-showcase-video-design.md`. Read it before starting.

**Conventions used in this plan:**

- **`USER TASK:`** prefix on a step means a human must do it — I can't drive the action (browsers, IDE typing, physical recording approvals).
- **`COMMIT:`** prefix on a step means create a git commit. **Per the user's earlier instruction not to auto-commit the design doc, ALL commits in this plan are conditional — pause and confirm with the user before running them.**
- Asset folder root: `assets/showcase-video-2026-05-04/` (relative to the MCP repo root). Created in Task 1.1.
- Demo-state forks live OUTSIDE this repo at `~/Showcase/demo-state/` so they don't pollute the MCP repo's git history. The asset folder contains symlinks + scripts that point to them.

---

## Phase 1 — Workspace & demo runner extensions

### Task 1.1: Create the asset folder structure

**Files:**
- Create: `assets/showcase-video-2026-05-04/.gitkeep`
- Create: `assets/showcase-video-2026-05-04/demo-state/README.md`
- Create: `assets/showcase-video-2026-05-04/claude-desktop-configs/.gitkeep`
- Create: `assets/showcase-video-2026-05-04/script/.gitkeep`
- Create: `assets/showcase-video-2026-05-04/cli-beat/.gitkeep`
- Create: `assets/showcase-video-2026-05-04/overlays/.gitkeep`
- Create: `assets/showcase-video-2026-05-04/recordings/.gitkeep`

- [ ] **Step 1: Create the directory tree**

```bash
cd /Users/dianakhortiuk/frontegg-mcp-support
mkdir -p assets/showcase-video-2026-05-04/{demo-state,claude-desktop-configs,script,cli-beat,overlays,recordings}
mkdir -p ~/Showcase/demo-state
touch assets/showcase-video-2026-05-04/{demo-state,claude-desktop-configs,script,cli-beat,overlays,recordings}/.gitkeep
```

- [ ] **Step 2: Write the demo-state README**

```markdown
<!-- assets/showcase-video-2026-05-04/demo-state/README.md -->
# Demo state forks

The actual forks of `frontegg-ios-swift` and `frontegg-android-kotlin` live at
`~/Showcase/demo-state/` (outside this repo) so they don't pollute MCP server
git history.

Each fork has two branches:

- `demo-start` — config stripped to simulate a mid-integration customer
- `demo-end` — full canonical state (untouched main branch)

Reset between recording takes:

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift
git reset --hard demo-start
```

The exact strips applied on `demo-start` are documented in
`docs/superpowers/specs/2026-05-04-mcp-showcase-video-design.md` under
"Hero scene — exact 'broken state' for iOS / Kotlin".
```

- [ ] **Step 3: Verify directory tree**

Run: `tree assets/showcase-video-2026-05-04/ -L 2 || find assets/showcase-video-2026-05-04/ -maxdepth 2 -type d`
Expected: All 6 subdirs present, README in `demo-state/`.

- [ ] **Step 4: COMMIT** (confirm with user first)

```bash
git add assets/showcase-video-2026-05-04/
git commit -m "chore(showcase): scaffold prep-pack asset folder"
```

---

### Task 1.2: Add `ios` scenario to `src/demo.ts`

**Files:**
- Modify: `src/demo.ts:80-100` (add `scaffoldIOS` function and switch case)
- Modify: `src/demo.ts:155-160` (extend allowed scenarios array)
- Test: `tests/demo-ios.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/demo-ios.test.ts`:

```typescript
import { spawn } from 'child_process';
import { promisify } from 'util';

const exec = promisify(require('child_process').exec);

test('npm run demo:ios produces an iOS report with deep-link findings', async () => {
  const { stdout } = await exec('npm run demo:ios', {
    cwd: process.cwd(),
    timeout: 60_000,
  });
  expect(stdout).toContain('detected SDK(s):');
  expect(stdout.toLowerCase()).toMatch(/ios|swift/);
  expect(stdout).toMatch(/\[CRITICAL\]|\[HIGH\]/);
  // The hero scene needs at least 4 visible findings
  const findingCount = (stdout.match(/\[(CRITICAL|HIGH|MEDIUM)\]/g) || []).length;
  expect(findingCount).toBeGreaterThanOrEqual(4);
}, 70_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/demo-ios.test.ts`
Expected: FAIL with "Unknown scenario: ios" or similar.

- [ ] **Step 3: Add `scaffoldIOS` to `src/demo.ts`**

Insert after `scaffoldSecurity` (around line 91):

```typescript
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
```

- [ ] **Step 4: Wire `ios` into the switch + scenario list**

Modify `src/demo.ts`:

In the `scaffold` function's switch (around line 95), add:
```typescript
    case 'ios': await scaffoldIOS(root); break;
```

In `main()` (around line 157), update the validation:
```typescript
  if (!['rn', 'flutter', 'ionic', 'security', 'ios', 'android'].includes(scenario)) {
    console.error(`Unknown scenario: ${scenario}. Use: rn | flutter | ionic | security | ios | android`);
    process.exit(1);
  }
```

(The `android` entry is added in Task 1.3 — list both now to avoid two edits.)

- [ ] **Step 5: Add the script entry to `package.json`**

Modify `package.json` `scripts` block. Insert after `demo:security`:

```json
    "demo:ios": "tsx src/demo.ts ios",
    "demo:android": "tsx src/demo.ts android",
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run build && npx jest tests/demo-ios.test.ts`
Expected: PASS. The report should show iOS SDK detected and ≥4 findings.

- [ ] **Step 7: COMMIT** (confirm with user)

```bash
git add src/demo.ts package.json tests/demo-ios.test.ts
git commit -m "feat(demo): add iOS scenario for showcase video CLI beat"
```

---

### Task 1.3: Add `android` scenario to `src/demo.ts`

**Files:**
- Modify: `src/demo.ts:80-100` (add `scaffoldAndroid` function)
- Modify: `src/demo.ts:95` (add `case 'android'`)
- Test: `tests/demo-android.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/demo-android.test.ts`:

```typescript
import { promisify } from 'util';
const exec = promisify(require('child_process').exec);

test('npm run demo:android produces an Android report with auth findings', async () => {
  const { stdout } = await exec('npm run demo:android', {
    cwd: process.cwd(),
    timeout: 60_000,
  });
  expect(stdout).toContain('detected SDK(s):');
  expect(stdout.toLowerCase()).toMatch(/android|kotlin/);
  expect(stdout).toMatch(/\[CRITICAL\]|\[HIGH\]/);
  const findingCount = (stdout.match(/\[(CRITICAL|HIGH|MEDIUM)\]/g) || []).length;
  expect(findingCount).toBeGreaterThanOrEqual(3);
}, 70_000);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/demo-android.test.ts`
Expected: FAIL with "Unknown scenario: android".

- [ ] **Step 3: Add `scaffoldAndroid` to `src/demo.ts`**

Insert after `scaffoldIOS`:

```typescript
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
```

- [ ] **Step 4: Wire `android` into the switch**

Modify `src/demo.ts` `scaffold()` switch:

```typescript
    case 'android': await scaffoldAndroid(root); break;
```

(The validation array was already updated in Task 1.2 Step 4.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && npx jest tests/demo-android.test.ts`
Expected: PASS. Report shows Android SDK detected and ≥3 findings.

- [ ] **Step 6: COMMIT** (confirm with user)

```bash
git add src/demo.ts tests/demo-android.test.ts
git commit -m "feat(demo): add Android scenario for showcase video CLI beat"
```

---

## Phase 2 — Demo state forks (live customer-style projects)

These tasks set up the *real* iOS Swift and Android Kotlin example apps in
`demo-start` (broken) state for use during the live recording. The tmp-fixture
demo from Phase 1 is for the CLI beat; this phase produces what the simulator
and emulator actually run during scenes 2 and 4.

### Task 2.1: Fork & strip iOS example

**Files:**
- Create (outside repo): `~/Showcase/demo-state/frontegg-ios-swift/`
- Modify: `~/Showcase/demo-state/frontegg-ios-swift/example/...` (5 strips)

- [ ] **Step 1: Clone the iOS example repo**

```bash
mkdir -p ~/Showcase/demo-state
cd ~/Showcase/demo-state
git clone https://github.com/frontegg/frontegg-ios-swift.git
cd frontegg-ios-swift
git checkout -b demo-end          # full canonical state
git checkout -b demo-start        # branch where we'll strip config
```

- [ ] **Step 2: Locate the example app's config files**

Run:
```bash
find example -name "*.entitlements" -o -name "Info.plist" -o -name "Frontegg.plist" -o -name "AppDelegate.swift" 2>/dev/null
```
Expected: Paths to the 4 config files. Capture them. Substitute into Steps 3–7 below.

- [ ] **Step 3: Strip Associated Domains entitlement**

In `<example>/<App>/<App>.entitlements`, remove the `<key>com.apple.developer.associated-domains</key>` and its following `<array>...</array>` block. Leave the rest of the entitlements file intact.

After edit, verify:
```bash
grep -c "associated-domains" example/**/*.entitlements
```
Expected: `0`.

- [ ] **Step 4: Strip CFBundleURLTypes**

In `<example>/<App>/Info.plist`, remove the `<key>CFBundleURLTypes</key>` block (key + the following `<array>...</array>`).

Verify: `grep -c "CFBundleURLTypes" example/**/Info.plist` → `0`.

- [ ] **Step 5: Strip `FronteggAuth.shared.start()` init wiring**

In `<example>/<App>/AppDelegate.swift`, remove or comment out the line containing `FronteggAuth.shared.start()` (or `FronteggAuth.shared.initialize` — whatever the canonical example uses). Leave the rest of the AppDelegate intact.

Verify: `grep -c "FronteggAuth.shared.start\|FronteggAuth.shared.initialize" example/**/*.swift` → `0`.

- [ ] **Step 6: Strip `baseUrl` / `clientId` from Frontegg.plist**

Replace the contents of `<example>/<App>/Frontegg.plist` with an empty plist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
```

Verify: `grep -c "baseUrl\|clientId" example/**/Frontegg.plist` → `0`.

- [ ] **Step 7: Inject ATS exception**

In the example's `Info.plist`, add (or leave, if already present):

```xml
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
```

Verify: `grep -c "NSAllowsArbitraryLoads" example/**/Info.plist` → `1` (or more).

- [ ] **Step 8: Commit demo-start changes (in the fork repo, not the MCP repo)**

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift
git add example/
git -c commit.gpgsign=false commit -m "demo-start: strip 5 config items for showcase video"
```

- [ ] **Step 9: Verify the project still opens in Xcode**

```bash
open example/<the-xcodeproj-or-workspace>  # path discovered in step 2
```
Expected: Xcode opens, project loads (build will fail at runtime — that's the point — but the project must structurally open).

USER TASK: glance at Xcode, confirm it opened. Close Xcode.

---

### Task 2.2: Fork & strip Android example

**Files:**
- Create (outside repo): `~/Showcase/demo-state/frontegg-android-kotlin/`
- Modify: `~/Showcase/demo-state/frontegg-android-kotlin/example/...` (4 strips)

- [ ] **Step 1: Clone the Android example repo**

```bash
cd ~/Showcase/demo-state
git clone https://github.com/frontegg/frontegg-android-kotlin.git
cd frontegg-android-kotlin
git checkout -b demo-end
git checkout -b demo-start
```

- [ ] **Step 2: Locate the config files**

```bash
find example -name "AndroidManifest.xml" -o -name "build.gradle*" -o -name "*Application*.kt" 2>/dev/null
```
Capture paths. Substitute below.

- [ ] **Step 3: Strip the auth-callback `<intent-filter>` from AndroidManifest.xml**

In `<example>/app/src/main/AndroidManifest.xml`, find the `<intent-filter>` block whose data scheme matches `frontegg://` (or whatever the canonical scheme is). Remove that entire `<intent-filter>...</intent-filter>` block.

Verify the LAUNCHER intent-filter (the one with `MAIN`/`LAUNCHER` categories) is **still present** — that's not the one to remove.

- [ ] **Step 4: Strip the INTERNET permission**

In the same AndroidManifest.xml, remove:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Verify: `grep -c "android.permission.INTERNET" example/app/src/main/AndroidManifest.xml` → `0`.

- [ ] **Step 5: Strip the `FronteggApp.init(...)` call**

In `<example>/app/src/main/kotlin/.../App.kt` (or `MainApplication.kt`), comment out or delete the line:
```kotlin
FronteggApp.init(...)
```

Verify: `grep -rc "FronteggApp.init" example/app/src/main/` → `0`.

- [ ] **Step 6: Strip the SDK dependency**

In `<example>/app/build.gradle` (or `build.gradle.kts`), find and delete the line(s) like:
```gradle
implementation("com.frontegg.android:android:...")
```

Verify: `grep -c "com.frontegg.android" example/app/build.gradle*` → `0`.

- [ ] **Step 7: Commit demo-start in the fork repo**

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin
git add example/
git -c commit.gpgsign=false commit -m "demo-start: strip 4 config items for showcase video"
```

- [ ] **Step 8: Verify the project syncs in Android Studio**

USER TASK: open the example folder in Android Studio. Confirm Gradle sync runs (will not necessarily succeed — the missing SDK dep is intentional — but the IDE must structurally load the project). Close Android Studio when done.

---

### Task 2.3: Validate iOS demo-start triggers expected findings

**Files:**
- Test: by hand via `frontegg_auto` invocation (no test file — this is a manual gate)

- [ ] **Step 1: Build the MCP server**

```bash
cd /Users/dianakhortiuk/frontegg-mcp-support
npm run build
```
Expected: clean build, no TS errors.

- [ ] **Step 2: Run the MCP detector against the iOS demo-start fork via the analyze-repo tool**

The MCP isn't directly invokable from CLI, but the `analyze` function it wraps is. Write a one-off validation script:

Create `scripts/validate-demo-state.ts`:

```typescript
import { analyze } from '../src/tools/analyze-repo.js';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: tsx scripts/validate-demo-state.ts <project-path>');
    process.exit(1);
  }
  const result = await analyze(target);
  console.log(`detected SDK(s): ${result.matchedSdks.join(', ') || 'none'}`);
  console.log(`findings: ${result.findings.length}`);
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.id} — ${f.title} (${f.file_path || '-'})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run:
```bash
npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-ios-swift/example
```

Expected output: detected SDK shows `ios-swift`. **At least 4** findings, including IDs related to: associated-domains, url-types/CFBundleURLTypes, init wiring (FronteggAuth start), and either the empty Frontegg.plist or the ATS exception.

If fewer findings, the strips were incomplete — go back and re-check Task 2.1.

- [ ] **Step 3: COMMIT validation script** (confirm with user)

```bash
git add scripts/validate-demo-state.ts
git commit -m "chore: add demo-state validation script for showcase prep"
```

---

### Task 2.4: Validate Android demo-start triggers expected findings

- [ ] **Step 1: Run the validator on the Android fork**

```bash
npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-android-kotlin/example
```

Expected: SDK detected as `android-kotlin`. **At least 3** findings: missing intent-filter, missing INTERNET permission, missing init call. (The missing SDK dep may surface as a different kind of finding or not at all — verify which.)

If fewer findings, revisit Task 2.2.

---

### Task 2.5: Validate apply_diff round-trip on iOS

- [ ] **Step 1: Run apply_diff via a one-off script**

Create `scripts/validate-apply-diff.ts`:

```typescript
import { analyze } from '../src/tools/analyze-repo.js';
import { generateDiffs } from '../src/tools/diffs/generate-diffs.js';
import { applyDiffs } from '../src/tools/diffs/diff-applier.js';

async function main() {
  const target = process.argv[2];
  if (!target) { console.error('Usage: tsx scripts/validate-apply-diff.ts <project>'); process.exit(1); }
  const result = await analyze(target);
  const ids = result.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => f.id);
  const diffs = await generateDiffs(target, ids, result.knowledge);
  console.log(`generated ${diffs.length} diffs`);
  const applied = await applyDiffs(target, diffs.map(d => d.diff), { backup: true, dryRun: false });
  console.log('apply result:', JSON.stringify(applied, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
```

(Adjust import paths to match the actual MCP source — verify against `src/tools/`.)

Run:
```bash
cd ~/Showcase/demo-state/frontegg-ios-swift && git reset --hard demo-start
cd /Users/dianakhortiuk/frontegg-mcp-support
npx tsx scripts/validate-apply-diff.ts ~/Showcase/demo-state/frontegg-ios-swift/example
```

Expected: `generated N diffs` (N ≥ 4). `apply result` shows clean application + `.bak` files created.

- [ ] **Step 2: Verify the project builds after applying diffs**

USER TASK: open `~/Showcase/demo-state/frontegg-ios-swift/example/` in Xcode. Build for any iPhone simulator. Build must succeed.

If build fails, the canonical-source diffs aren't covering all stripped pieces — this is a blocker; do not proceed to recording until fixed.

- [ ] **Step 3: Reset to demo-start (the recording starts from broken state)**

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift
git reset --hard demo-start
git clean -fd  # remove .bak files left by applier
```

- [ ] **Step 4: COMMIT validation script** (confirm with user)

```bash
cd /Users/dianakhortiuk/frontegg-mcp-support
git add scripts/validate-apply-diff.ts
git commit -m "chore: add apply-diff validation script for showcase prep"
```

---

### Task 2.6: Validate apply_diff round-trip on Android

- [ ] **Step 1: Run validator on Android fork**

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin && git reset --hard demo-start
cd /Users/dianakhortiuk/frontegg-mcp-support
npx tsx scripts/validate-apply-diff.ts ~/Showcase/demo-state/frontegg-android-kotlin/example
```

Expected: ≥3 diffs generated, applied cleanly.

- [ ] **Step 2: Verify Gradle sync + build succeeds in Android Studio**

USER TASK: open `~/Showcase/demo-state/frontegg-android-kotlin/example/` in Android Studio. Wait for Gradle sync. Build > Make Project. Must succeed. Close Android Studio.

If build fails, see Task 2.5 Step 2 — same blocker rule.

- [ ] **Step 3: Reset to demo-start**

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin
git reset --hard demo-start
git clean -fd
```

---

## Phase 3 — Configs, scripts, prompts

### Task 3.1: Write Claude Desktop MCP-off config

**Files:**
- Create: `assets/showcase-video-2026-05-04/claude-desktop-configs/mcp-off.json`

- [ ] **Step 1: Write the config**

```json
{
  "mcpServers": {}
}
```

(Empty — no MCP servers connected. Used for the LEFT side of the A/B opener.)

- [ ] **Step 2: Verify it parses**

```bash
jq . assets/showcase-video-2026-05-04/claude-desktop-configs/mcp-off.json
```
Expected: clean JSON output.

---

### Task 3.2: Write Claude Desktop MCP-on config

**Files:**
- Create: `assets/showcase-video-2026-05-04/claude-desktop-configs/mcp-on.json`

- [ ] **Step 1: Determine the absolute path to `dist/index.js`**

```bash
realpath /Users/dianakhortiuk/frontegg-mcp-support/dist/index.js
```
Capture output. Substitute `<DIST_PATH>` below.

- [ ] **Step 2: Write the config**

```json
{
  "mcpServers": {
    "frontegg-mobile": {
      "command": "node",
      "args": ["<DIST_PATH>"],
      "env": {
        "FRONTEGG_CLIENT_ID": "${FRONTEGG_CLIENT_ID}",
        "FRONTEGG_SECRET": "${FRONTEGG_SECRET}"
      }
    }
  }
}
```

(Env vars are read from the user's shell at Claude Desktop launch time. The user must `export` them before launching the app for the day-2 MFA scene to work.)

- [ ] **Step 3: Verify it parses**

```bash
jq . assets/showcase-video-2026-05-04/claude-desktop-configs/mcp-on.json
```

- [ ] **Step 4: Validate the path resolves**

```bash
test -f "$(jq -r '.mcpServers["frontegg-mobile"].args[0]' assets/showcase-video-2026-05-04/claude-desktop-configs/mcp-on.json)" && echo "OK" || echo "DIST MISSING"
```
Expected: `OK`. If `DIST MISSING`, run `npm run build` first.

---

### Task 3.3: Write the prompts file

**Files:**
- Create: `assets/showcase-video-2026-05-04/script/prompts.md`

- [ ] **Step 1: Write the file**

```markdown
# Exact prompts to type during recording

Copy-paste-ready. Do **not** improvise.

## Scene 2 — A/B + Hero (typed into BOTH Claude Desktop windows)

```
This is the Frontegg iOS example. Login redirects to Safari and never comes
back to the app. What's wrong with the project — be specific about file names
and exact config lines.
```

> The same prompt is typed verbatim into both windows — left (MCP off) and
> right (MCP on). Comparison only works if the prompt is identical.

## Scene 4 — Kotlin breadth (typed into MCP-on Claude Desktop only)

```
Same prompt, but for the Frontegg Android example app this time. Login fails
silently. What's missing — be specific about file names.
```

## Scene 5 — Day-2 MFA (typed into MCP-on Claude Desktop)

Two consecutive prompts:

**5a:**
```
Show me the current MFA policy for my Frontegg environment.
```

**5b (after the response renders):**
```
Now force MFA for everyone except SSO users.
```

## Hardening note

If during pre-shoot validation the MCP-OFF window in Scene 2 returns an
answer that's too good (model has memorized the right config), replace the
Scene 2 prompt with the harder variant:

```
What's missing from my Frontegg iOS Info.plist for deep-link return on
iOS 17 with Associated Domains v2, given that the Xcode project has a custom
URL scheme but the redirect still opens Safari?
```

Document the exact prompt you used in the recording-checklist.md run-day notes.
```

- [ ] **Step 2: Sanity-read the file**

Run: `wc -w assets/showcase-video-2026-05-04/script/prompts.md`
Expected: ~120-180 words. The file is concise on purpose — every prompt must be exact.

---

### Task 3.4: Write the timed voiceover script

**Files:**
- Create: `assets/showcase-video-2026-05-04/script/voiceover.md`

- [ ] **Step 1: Copy the VO from the spec verbatim**

The voiceover script in the spec (under "Voiceover script (timed, MCP-credited)") is the source of truth. Copy it into this file with the same timestamps and phrasing. Paste it into:

`assets/showcase-video-2026-05-04/script/voiceover.md`

(The spec's VO covers 0:00 → 3:56. Total runtime including the silent close = 4:00.)

- [ ] **Step 2: Add a header**

Prepend to the file:

```markdown
# Voiceover script — Frontegg Mobile MCP showcase (2026-05-04)

**Runtime target:** 4:00 (3:56 spoken + 4s silent logo close)
**Words per minute target:** ~145 (conversational, slightly under-paced)
**Brand-attribution rule:** every line credits "the MCP", never "the AI" or "Claude". The only place "Claude" appears is in Scene 6's multi-client closer.

---

```

- [ ] **Step 3: Verify total word count**

Run: `wc -w assets/showcase-video-2026-05-04/script/voiceover.md`
Expected: ~580 words (4 minutes × 145 wpm). If significantly over, trim. If significantly under, the VO has gaps — add to the longer scenes.

---

### Task 3.5: Write the teleprompter file

**Files:**
- Create: `assets/showcase-video-2026-05-04/script/teleprompter.txt`

- [ ] **Step 1: Strip the VO file to plain narration text**

Take `voiceover.md`, remove all timestamps, all stage directions in `[brackets]`, all section headers, and all formatting. Result: plain text, one sentence per line, no Markdown.

Example:

```
Every new mobile customer hits the same wall.
Deep links. Plist entries. Init order.
It's the longest, most CSM-expensive moment of their relationship with us.

Same model. Same prompt. Two windows.
The one on the left has nothing extra.
The one on the right has the Frontegg Mobile MCP connected.

[... continue for the full script ...]
```

- [ ] **Step 2: Verify line lengths fit teleprompter standard**

```bash
awk '{ print length, $0 }' assets/showcase-video-2026-05-04/script/teleprompter.txt | sort -rn | head -5
```
Expected: longest lines ≤ 80 chars. Any longer = break into two lines.

---

### Task 3.6: Write the shot list

**Files:**
- Create: `assets/showcase-video-2026-05-04/script/shot-list.md`

- [ ] **Step 1: Write the file**

```markdown
# Shot list — Frontegg Mobile MCP showcase

Six scenes. For each: what's on screen, the action sequence, and the
recording mechanism.

## Scene 1 — Pain hook (0:00–0:15)

- **On screen:** TextEdit narrator card with three lines fading in:
  "Mobile integration today." → "Tickets escalate. Engineers loop in.
  Customers stall." → "Today, week one. The longest part of the
  relationship." Held for 2s each.
- **Recording:** `screencapture -V 18 recordings/scene-1-hook.mov`
  starts. I drive TextEdit (full tier) to type and reveal each line.
- **Cuts to be added in editing:** Quick stock cuts of an Xcode build
  error, blurred Slack thread, and a CSM calendar — sourced separately by
  the editor (Frontegg brand library or Unsplash).

## Scene 2 — A/B + Hero (0:15–1:45)

- **On screen:** Two Claude Desktop windows side-by-side.
  - Left: `mcp-off.json` config, fresh chat.
  - Right: `mcp-on.json` config, fresh chat with `frontegg-mobile`
    visible in the tools sidebar.
- **Action:**
  1. I type the Scene 2 prompt (from `prompts.md`) into the LEFT window.
     Wait ~12s for response to render fully.
  2. I type the same prompt verbatim into the RIGHT window.
  3. Wait ~15s for MCP tool calls + findings to render.
  4. On the right, click "Apply diffs" (or type "apply all").
  5. Cut to iOS Simulator (already booted). Tap login button. Show
     hosted-login flow → return → authenticated state.
- **Recording:** `screencapture -V 100 recordings/scene-2-ab-hero.mov`
  for the chat portion. Then `xcrun simctl io booted recordVideo
  recordings/scene-2-sim.mp4` for the clean simulator login. Editor
  composites these.

## Scene 3 — CLI beat (1:45–2:00)

- **On screen:** Pre-rendered VHS GIF/MP4 of `npm run demo:ios` running
  in a styled terminal. No live recording.
- **Source:** `cli-beat/demo-ios.mp4` (rendered in Phase 4).
- **Editor instruction:** crossfade from end of Scene 2 sim shot into
  this clip. Hold for 15s.

## Scene 4 — Kotlin breadth (2:00–2:25)

- **On screen:** MCP-on Claude Desktop window (full screen, simulator
  hidden), then split with Android Emulator.
- **Action:**
  1. Reset Android demo-start. Switch focus to Claude Desktop.
  2. I type the Scene 4 prompt.
  3. Wait for findings + apply.
  4. Switch to emulator. Launch app. Show login.
- **Recording:** `screencapture -V 28
  recordings/scene-4-kotlin.mov` + emulator video via Android Studio's
  built-in screen recorder (USER TASK in case computer-use can't drive it
  cleanly — see Phase 5 Task 5.4).

## Scene 5 — Day-2 MFA (2:25–3:10)

- **On screen:** MCP-on Claude Desktop full-screen, then split with
  Frontegg portal.
- **Action:**
  1. I type Prompt 5a. Wait for `frontegg_configure_mfa get` tool-call
     line + policy render (~10s).
  2. I type Prompt 5b. Wait for `frontegg_configure_mfa update`
     confirmation (~8s).
- **Recording:** `screencapture -V 50 recordings/scene-5-mfa.mov`.
- **Portal cut:** USER TASK — record a 10-second clip in Chrome of the
  MFA setting in the Frontegg portal showing it now reads
  "ForceExceptSAML." Save as `recordings/scene-5-portal-USER.mp4`.

## Scene 6 — Multi-client closer + impact numbers (3:10–4:00)

- **On screen:** Three sidebar cuts (Cursor → Claude Code → Claude
  Desktop), then `impact-numbers.html` rendered as a sequence.
- **Action:**
  - Sidebar cuts (5s each): USER TASK — three 5-second screen recordings
    of the user's actual editor showing `frontegg-mobile` connected in
    each client's MCP sidebar. Save as `recordings/scene-6-sidebar-cursor-USER.mp4`,
    `scene-6-sidebar-claude-code-USER.mp4`,
    `scene-6-sidebar-claude-desktop-USER.mp4`.
  - Impact numbers: I render `overlays/impact-numbers.html` to a 35s
    PNG sequence using headless Chrome + ffmpeg, output as
    `recordings/scene-6-numbers.mp4`.

## Mouse-cursor convention

- Cursor visible during typing scenes (signals human-like interaction).
- Cursor hidden during pre-rendered cuts (CLI beat, impact numbers).
- Hide via macOS keyboard shortcut or `defaults write` — verify in
  `recording-checklist.md` setup.
```

---

### Task 3.7: Write recording-checklist.md

**Files:**
- Create: `assets/showcase-video-2026-05-04/recording-checklist.md`

- [ ] **Step 1: Write the file**

```markdown
# Recording-day checklist

Run this top-to-bottom before "Action" on the day of recording. Skip nothing.

## Environment

- [ ] Close all unrelated apps (Slack, Mail, Messages, browser tabs).
- [ ] Enable Do Not Disturb for the next 90 minutes.
- [ ] Close all browser windows except the Frontegg portal tab.
- [ ] Quit and relaunch Finder to clear stale notifications.
- [ ] Set desktop wallpaper to a clean solid color (avoid identifying
      info in the corner).
- [ ] Hide dock auto-show: `defaults write com.apple.dock autohide -bool
      true && killall Dock`.

## Display

- [ ] Plug in any external monitor. Set primary display to the laptop
      screen at 1920×1200 (Retina default).
- [ ] If using two displays, position Claude Desktop on primary, Xcode +
      Simulator on secondary, recording captures primary only.

## App pre-launch

- [ ] iOS Simulator: boot any iPhone 15+ device. Wait until home screen
      idle. Don't show the spinner.
- [ ] Android Emulator: boot a Pixel-class AVD. Wait for home idle.
- [ ] Xcode: open `~/Showcase/demo-state/frontegg-ios-swift/example/`.
      Build target → iPhone simulator. Don't run yet.
- [ ] Android Studio: open
      `~/Showcase/demo-state/frontegg-android-kotlin/example/`. Wait
      for sync (will fail — that's OK on demo-start).
- [ ] Frontegg portal: log in. Navigate to MFA settings page. Leave the
      tab focused.

## Claude Desktop dual-window setup

- [ ] Quit Claude Desktop fully (`pkill -f Claude` if needed).
- [ ] Copy `assets/.../claude-desktop-configs/mcp-off.json` to
      `~/Library/Application Support/Claude/claude_desktop_config.json`.
- [ ] Launch Claude Desktop. Confirm sidebar shows NO MCP tools.
- [ ] Cmd+N for a new chat. Position window: left half of screen.
- [ ] Quit Claude Desktop again.
- [ ] Copy `assets/.../claude-desktop-configs/mcp-on.json` over the
      same path. Restart Claude Desktop.
- [ ] Confirm sidebar shows `frontegg-mobile` server connected with all
      15 tools listed.
- [ ] Cmd+N for new chat. Position window: right half of screen.
- [ ] Visual check: both windows visible side-by-side, both at the new
      chat composer.

## Demo state pre-flight

- [ ] `cd ~/Showcase/demo-state/frontegg-ios-swift && git reset --hard
      demo-start && git clean -fd`.
- [ ] `cd ~/Showcase/demo-state/frontegg-android-kotlin && git reset
      --hard demo-start && git clean -fd`.

## MCP-off side prompt-hardening pre-flight

- [ ] Type the Scene 2 prompt into LEFT (MCP-off) window. Wait for
      response.
- [ ] Read the response. **Does it identify the right files and lines?**
  - If YES → swap to the harder prompt variant from `prompts.md`.
      Re-test. Loop until LEFT side is plausibly weaker.
  - If NO → record the prompt actually used in the run-day notes
      below. Proceed.
- [ ] Take a screenshot of the LEFT response for editor reference.
- [ ] Cmd+K (clear chat) in LEFT window. Recording starts from a fresh
      composer.

## Right-side warmup (cache the canonical fetch)

- [ ] Type the Scene 2 prompt into RIGHT window once. Wait for findings.
- [ ] This warms the GitHub fetch cache (6h TTL) so the recorded take
      doesn't show network spinners.
- [ ] Cmd+K to clear. Right window now has fresh composer + warm cache.

## Run-day notes

| Field | Value |
|---|---|
| Recording date | _____ |
| Operator | _____ |
| Final Scene 2 prompt used | _____ |
| MCP commit pinned | _____ |
| Notes / deviations | _____ |
```

---

### Task 3.8: Write editing-notes.md

**Files:**
- Create: `assets/showcase-video-2026-05-04/editing-notes.md`

- [ ] **Step 1: Write the file**

```markdown
# Editing notes — Frontegg Mobile MCP showcase

For the human editing this video. Read before opening Premiere/Final Cut.

## Sequence assembly

| Scene | Source clip(s) | Duration | Overlay |
|---|---|---:|---|
| 1 Hook | `recordings/scene-1-hook.mov` + your stock cuts | 0:15 | `overlays/title-card.html` (rendered to PNG) for first 3s |
| 2 A/B + Hero | `recordings/scene-2-ab-hero.mov` (chat) + `recordings/scene-2-sim.mp4` (sim) | 1:30 | `overlays/lower-third-2.html` + `overlays/ab-divider.html` for the split-screen labels |
| 3 CLI beat | `cli-beat/demo-ios.mp4` (pre-rendered VHS) | 0:15 | `overlays/lower-third-3.html` |
| 4 Kotlin | `recordings/scene-4-kotlin.mov` + emulator clip | 0:25 | `overlays/lower-third-4.html` |
| 5 Day-2 | `recordings/scene-5-mfa.mov` + `scene-5-portal-USER.mp4` | 0:45 | `overlays/lower-third-5.html` |
| 6 Closer | 3 × sidebar cuts + `recordings/scene-6-numbers.mp4` | 0:50 | `overlays/multi-client-strip.html` for the sidebar montage; `overlays/lower-third-6.html` |

## Audio mix

- VO bus: -16 LUFS integrated (broadcast-loud, async-distribution-friendly).
- Music bed: optional. If used, duck to -28 dB under VO.
- No SFX on tool-call render — let the visible UI speak.

## Color & branding

- All overlays use Frontegg's brand palette. Reuse the colors from
  `overlays/*.html` directly — they import the same CSS variable set.
- Cursor visible during live action; hide during pre-rendered numbers
  scene if your editor supports cursor-mask.

## Pre-export checklist

- [ ] Three "your data here" placeholders populated in
      `overlays/impact-numbers.html` BEFORE rendering Scene 6.
- [ ] No `frontegg_configure_mfa` API key visible in any frame (zoom + check).
- [ ] No `clientId` or `clientSecret` text visible in any frame.
- [ ] No personal Slack notifications, Mail badges, or unrelated tabs.
- [ ] Total runtime within 3:45–4:30 window.
- [ ] Closing logo card visible for full 4 seconds before fade.

## Export settings

- 1920×1080, 30 fps, H.264, ~10 Mbps for Loom-grade async share.
- Embed captions if `script/teleprompter.txt` was post-edited.
- Filename: `frontegg-mobile-mcp-showcase-v1.mp4`.
```

---

## Phase 4 — Overlays + CLI beat

### Task 4.1: Title card

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/title-card.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Title Card — Frontegg Mobile MCP</title>
<style>
  :root {
    --frontegg-purple: #5C3DE6;
    --frontegg-bg: #0B0B16;
    --frontegg-fg: #F5F5FA;
    --frontegg-dim: #8B8B9E;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: var(--frontegg-bg); color: var(--frontegg-fg); font-family: -apple-system, "Inter", sans-serif; display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; }
  .pill { display: inline-block; padding: 8px 20px; border: 1px solid var(--frontegg-purple); border-radius: 999px; color: var(--frontegg-purple); font-size: 18px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 32px; }
  h1 { font-size: 96px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 24px; }
  h1 span { color: var(--frontegg-purple); }
  p { font-size: 28px; color: var(--frontegg-dim); max-width: 1100px; margin: 0 auto; line-height: 1.4; }
</style>
</head>
<body>
<div class="card">
  <div class="pill">Frontegg Mobile MCP</div>
  <h1>The longest part of the relationship<br/>just got <span>shorter</span>.</h1>
  <p>How a single MCP server collapses mobile integration time and deflects the support load CS owns today.</p>
</div>
</body>
</html>
```

- [ ] **Step 2: Render to PNG via headless Chrome**

```bash
brew install --cask chromium 2>/dev/null || true  # if not present
/Applications/Chromium.app/Contents/MacOS/Chromium --headless --disable-gpu \
  --window-size=1920,1080 \
  --screenshot=assets/showcase-video-2026-05-04/overlays/title-card.png \
  "file://$(pwd)/assets/showcase-video-2026-05-04/overlays/title-card.html"
```

(If Chromium not preferred: substitute `chrome --headless` or `playwright` if installed.)

- [ ] **Step 3: Visual sanity check**

```bash
open assets/showcase-video-2026-05-04/overlays/title-card.png
```
Expected: Frontegg-branded card, readable at 100%, no clipping.

---

### Task 4.2: Lower-thirds (1–6)

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/lower-third-{1..6}.html`

- [ ] **Step 1: Write the shared template**

Create `assets/showcase-video-2026-05-04/overlays/_lower-third-template.html` (template — not used directly):

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root { --frontegg-purple: #5C3DE6; --frontegg-fg: #F5F5FA; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; font-family: -apple-system, "Inter", sans-serif; }
  .lower-third { position: absolute; left: 80px; bottom: 80px; padding: 16px 28px; background: rgba(11, 11, 22, 0.85); border-left: 4px solid var(--frontegg-purple); color: var(--frontegg-fg); }
  .scene { font-size: 14px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--frontegg-purple); margin-bottom: 4px; }
  .label { font-size: 22px; font-weight: 500; }
</style>
</head>
<body>
<div class="lower-third">
  <div class="scene">SCENE_NUMBER</div>
  <div class="label">SCENE_LABEL</div>
</div>
</body>
</html>
```

- [ ] **Step 2: Generate the 6 lower-thirds**

For each scene, copy the template and replace `SCENE_NUMBER` and `SCENE_LABEL`:

| File | SCENE_NUMBER | SCENE_LABEL |
|---|---|---|
| `lower-third-1.html` | `Scene 01` | `The cost of mobile integration today` |
| `lower-third-2.html` | `Scene 02` | `Same model. Same prompt. One has the MCP.` |
| `lower-third-3.html` | `Scene 03` | `The MCP itself — no AI involved.` |
| `lower-third-4.html` | `Scene 04` | `Same MCP. Different SDK.` |
| `lower-third-5.html` | `Scene 05` | `Day two. Configuration without the portal.` |
| `lower-third-6.html` | `Scene 06` | `Works in any MCP-compatible client.` |

- [ ] **Step 3: Render each to PNG (transparent background)**

For each `lower-third-N.html`:

```bash
for i in 1 2 3 4 5 6; do
  /Applications/Chromium.app/Contents/MacOS/Chromium --headless --disable-gpu \
    --window-size=1920,1080 \
    --default-background-color=00000000 \
    --screenshot="assets/showcase-video-2026-05-04/overlays/lower-third-$i.png" \
    "file://$(pwd)/assets/showcase-video-2026-05-04/overlays/lower-third-$i.html"
done
```

- [ ] **Step 4: Visual sanity check on one of them**

```bash
open assets/showcase-video-2026-05-04/overlays/lower-third-2.png
```
Expected: transparent PNG with the lower-third bar in the bottom-left.

---

### Task 4.3: A/B divider overlay

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/ab-divider.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root { --frontegg-purple: #5C3DE6; --bg-dim: rgba(11, 11, 22, 0.85); --fg: #F5F5FA; --warn: #FFB347; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: transparent; font-family: -apple-system, "Inter", sans-serif; }
  .badge { position: absolute; top: 40px; padding: 12px 28px; background: var(--bg-dim); color: var(--fg); font-size: 24px; font-weight: 600; letter-spacing: 0.05em; border-radius: 999px; }
  .left { left: 80px; border: 2px solid var(--warn); color: var(--warn); }
  .right { right: 80px; border: 2px solid var(--frontegg-purple); color: var(--frontegg-purple); }
  .vline { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: linear-gradient(to bottom, transparent, var(--frontegg-purple), transparent); transform: translateX(-50%); }
</style>
</head>
<body>
<div class="badge left">MCP off — AI alone</div>
<div class="badge right">MCP on — grounded in your repo</div>
<div class="vline"></div>
</body>
</html>
```

- [ ] **Step 2: Render to PNG**

```bash
/Applications/Chromium.app/Contents/MacOS/Chromium --headless --disable-gpu \
  --window-size=1920,1080 --default-background-color=00000000 \
  --screenshot=assets/showcase-video-2026-05-04/overlays/ab-divider.png \
  "file://$(pwd)/assets/showcase-video-2026-05-04/overlays/ab-divider.html"
```

- [ ] **Step 3: Visual sanity check**

```bash
open assets/showcase-video-2026-05-04/overlays/ab-divider.png
```
Expected: two top-banner badges (left orange, right purple) and a vertical center line — all with transparent background.

---

### Task 4.4: Multi-client strip

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/multi-client-strip.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root { --frontegg-purple: #5C3DE6; --frontegg-bg: #0B0B16; --frontegg-fg: #F5F5FA; --dim: #5C5C70; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: var(--frontegg-bg); color: var(--frontegg-fg); font-family: -apple-system, "Inter", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  h2 { font-size: 56px; font-weight: 700; margin-bottom: 60px; text-align: center; line-height: 1.15; }
  h2 span { color: var(--frontegg-purple); }
  .strip { display: flex; gap: 48px; }
  .client { width: 380px; height: 200px; background: #15151F; border: 1px solid #2A2A3A; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 24px; }
  .name { font-size: 32px; font-weight: 600; margin-bottom: 8px; }
  .conn { font-size: 16px; color: var(--frontegg-purple); letter-spacing: 0.05em; text-transform: uppercase; }
  .dot { display: inline-block; width: 8px; height: 8px; background: var(--frontegg-purple); border-radius: 50%; margin-right: 8px; box-shadow: 0 0 12px var(--frontegg-purple); }
  footer { font-size: 24px; color: var(--dim); margin-top: 80px; max-width: 1300px; text-align: center; line-height: 1.4; }
</style>
</head>
<body>
<h2>Works in <span>any MCP-compatible client</span>.</h2>
<div class="strip">
  <div class="client"><div class="name">Cursor</div><div class="conn"><span class="dot"></span>frontegg-mobile</div></div>
  <div class="client"><div class="name">Claude Code</div><div class="conn"><span class="dot"></span>frontegg-mobile</div></div>
  <div class="client"><div class="name">Claude Desktop</div><div class="conn"><span class="dot"></span>frontegg-mobile</div></div>
</div>
<footer>The intelligence is the MCP. The chat is just the surface.</footer>
</body>
</html>
```

- [ ] **Step 2: Render to PNG**

```bash
/Applications/Chromium.app/Contents/MacOS/Chromium --headless --disable-gpu \
  --window-size=1920,1080 \
  --screenshot=assets/showcase-video-2026-05-04/overlays/multi-client-strip.png \
  "file://$(pwd)/assets/showcase-video-2026-05-04/overlays/multi-client-strip.html"
```

- [ ] **Step 3: Visual sanity check**

```bash
open assets/showcase-video-2026-05-04/overlays/multi-client-strip.png
```
Expected: dark background, headline + 3 client cards + footer line.

---

### Task 4.5: Impact-numbers slide (the close)

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/impact-numbers.html`

- [ ] **Step 1: Write the file**

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  :root { --frontegg-purple: #5C3DE6; --frontegg-bg: #0B0B16; --frontegg-fg: #F5F5FA; --dim: #5C5C70; --warn: #FFB347; --good: #4ADE80; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1920px; height: 1080px; background: var(--frontegg-bg); color: var(--frontegg-fg); font-family: -apple-system, "Inter", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  h2 { font-size: 48px; font-weight: 600; margin-bottom: 80px; color: var(--dim); letter-spacing: -0.01em; }
  .row { display: flex; gap: 80px; }
  .metric { width: 460px; text-align: center; }
  .label { font-size: 22px; color: var(--dim); margin-bottom: 24px; line-height: 1.3; min-height: 60px; }
  .pair { display: flex; align-items: center; justify-content: center; gap: 24px; }
  .before { font-size: 64px; font-weight: 700; color: var(--warn); }
  .arrow { font-size: 40px; color: var(--dim); }
  .after { font-size: 64px; font-weight: 700; color: var(--good); }
  .placeholder { display: inline-block; padding: 8px 16px; background: rgba(255, 179, 71, 0.15); border: 1px dashed var(--warn); border-radius: 8px; font-size: 22px; color: var(--warn); margin-top: 16px; }
</style>
</head>
<body>
<h2>What this changes — in your numbers.</h2>
<div class="row">
  <div class="metric">
    <div class="label">Time to first successful mobile login</div>
    <div class="pair">
      <span class="before" data-slot="before-1">[ N days ]</span>
      <span class="arrow">→</span>
      <span class="after" data-slot="after-1">[ minutes ]</span>
    </div>
    <div class="placeholder">your data here</div>
  </div>
  <div class="metric">
    <div class="label">CSM hours per new mobile customer onboarding</div>
    <div class="pair">
      <span class="before" data-slot="before-2">[ N hrs ]</span>
      <span class="arrow">→</span>
      <span class="after" data-slot="after-2">[ ~0 ]</span>
    </div>
    <div class="placeholder">your data here</div>
  </div>
  <div class="metric">
    <div class="label">Mobile-auth tickets / quarter — projected deflection</div>
    <div class="pair">
      <span class="before" data-slot="before-3">[ N ]</span>
      <span class="arrow">→</span>
      <span class="after" data-slot="after-3">[ N × deflect% ]</span>
    </div>
    <div class="placeholder">your data here</div>
  </div>
</div>
</body>
</html>
```

- [ ] **Step 2: Render to PNG (placeholder version)**

```bash
/Applications/Chromium.app/Contents/MacOS/Chromium --headless --disable-gpu \
  --window-size=1920,1080 \
  --screenshot=assets/showcase-video-2026-05-04/overlays/impact-numbers.png \
  "file://$(pwd)/assets/showcase-video-2026-05-04/overlays/impact-numbers.html"
```

- [ ] **Step 3: Visual sanity check**

```bash
open assets/showcase-video-2026-05-04/overlays/impact-numbers.png
```
Expected: 3-metric layout, all "your data here" placeholders visible. (Editor will populate before final export.)

---

### Task 4.6: Architecture B-roll SVG

**Files:**
- Create: `assets/showcase-video-2026-05-04/overlays/architecture-broll.svg`

- [ ] **Step 1: Write the file**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" style="background: #0B0B16">
  <defs>
    <style>
      .node { fill: #15151F; stroke: #5C3DE6; stroke-width: 2; }
      .label { fill: #F5F5FA; font: 600 26px -apple-system, "Inter", sans-serif; }
      .sub { fill: #8B8B9E; font: 400 18px -apple-system, "Inter", sans-serif; }
      .flow { stroke: #5C3DE6; stroke-width: 3; fill: none; stroke-dasharray: 8 4; }
      .flow-anim { animation: dash 2s linear infinite; }
      @keyframes dash { to { stroke-dashoffset: -24; } }
    </style>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#5C3DE6"/>
    </marker>
  </defs>

  <!-- Canonical repo (left) -->
  <rect class="node" x="120" y="440" width="320" height="200" rx="16"/>
  <text class="label" x="280" y="525" text-anchor="middle">Canonical Frontegg repo</text>
  <text class="sub" x="280" y="558" text-anchor="middle">github.com/frontegg/...</text>
  <text class="sub" x="280" y="585" text-anchor="middle">README · examples · manifests</text>

  <!-- MCP (center) -->
  <rect class="node" x="800" y="440" width="320" height="200" rx="16"/>
  <text class="label" x="960" y="525" text-anchor="middle">Frontegg Mobile MCP</text>
  <text class="sub" x="960" y="558" text-anchor="middle">15 tools · 135+ rules</text>
  <text class="sub" x="960" y="585" text-anchor="middle">canonical fetch · 6h cache</text>

  <!-- Customer project (right) -->
  <rect class="node" x="1480" y="440" width="320" height="200" rx="16"/>
  <text class="label" x="1640" y="525" text-anchor="middle">Your customer's project</text>
  <text class="sub" x="1640" y="558" text-anchor="middle">iOS · Android · cross-platform</text>
  <text class="sub" x="1640" y="585" text-anchor="middle">findings + diffs applied</text>

  <!-- Flows -->
  <path class="flow flow-anim" d="M440 540 L800 540" marker-end="url(#arrow)"/>
  <path class="flow flow-anim" d="M1120 540 L1480 540" marker-end="url(#arrow)"/>

  <!-- Title -->
  <text class="label" x="960" y="220" text-anchor="middle" style="font-size: 40px;">Where the value comes from</text>
  <text class="sub" x="960" y="270" text-anchor="middle" style="font-size: 22px;">The MCP grounds the AI in your canonical SDK repo. Every diff is sourced. Every claim is evidence-backed.</text>
</svg>
```

- [ ] **Step 2: Visual sanity check in browser**

```bash
open -a Safari assets/showcase-video-2026-05-04/overlays/architecture-broll.svg
```
Expected: 3-box flow diagram, animated dashed lines flowing left-to-right.

---

### Task 4.7: Add and render the iOS VHS tape

**Files:**
- Create: `docs/demos/tapes/ios.tape`
- Output: `assets/showcase-video-2026-05-04/cli-beat/demo-ios.mp4` (and a GIF as a side artifact)

- [ ] **Step 1: Confirm VHS is installed**

```bash
which vhs || brew install vhs
```

- [ ] **Step 2: Write the tape**

`docs/demos/tapes/ios.tape`:

```
# VHS tape — iOS Frontegg integration demo (showcase video CLI beat)
# Regenerate with: vhs docs/demos/tapes/ios.tape
Output assets/showcase-video-2026-05-04/cli-beat/demo-ios.mp4
Output assets/showcase-video-2026-05-04/cli-beat/demo-ios.gif

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 640
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 35ms

Type "npm run demo:ios"
Sleep 400ms
Enter
Sleep 12s
```

- [ ] **Step 3: Render the tape**

```bash
cd /Users/dianakhortiuk/frontegg-mcp-support
vhs docs/demos/tapes/ios.tape
```

Expected: `demo-ios.mp4` and `demo-ios.gif` appear in `cli-beat/`. Open the MP4 to verify it shows the actual `frontegg_auto` report rendering with iOS findings.

- [ ] **Step 4: Quality gate — duration check**

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  assets/showcase-video-2026-05-04/cli-beat/demo-ios.mp4
```
Expected: 13–17 seconds. If shorter, the demo is failing fast (re-check Phase 1 Task 1.2). If longer, the report is verbose — trim by reducing the final `Sleep` line.

- [ ] **Step 5: COMMIT** (confirm with user)

```bash
git add docs/demos/tapes/ios.tape assets/showcase-video-2026-05-04/cli-beat/
git commit -m "feat(showcase): add iOS VHS demo tape and rendered MP4"
```

---

### Task 4.8: Add and render the Android VHS tape (optional safety net)

The Kotlin scene is recorded live. This tape is a backup if the live recording
fails — same script, different scenario.

**Files:**
- Create: `docs/demos/tapes/android.tape`
- Output: `assets/showcase-video-2026-05-04/cli-beat/demo-android.mp4`

- [ ] **Step 1: Write the tape**

```
# VHS tape — Android Frontegg integration demo (CLI fallback for Scene 4)
Output assets/showcase-video-2026-05-04/cli-beat/demo-android.mp4

Set Shell "bash"
Set FontSize 14
Set Width 1100
Set Height 640
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 35ms

Type "npm run demo:android"
Sleep 400ms
Enter
Sleep 10s
```

- [ ] **Step 2: Render**

```bash
vhs docs/demos/tapes/android.tape
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  assets/showcase-video-2026-05-04/cli-beat/demo-android.mp4
```
Expected: 11–14s.

---

## Phase 5 — Live recording session

This phase runs end-to-end on a single recording day. Phases 1–4 must be
complete and the recording-checklist (Task 3.7) must be ticked top-to-bottom
before starting.

### Task 5.1: Pre-shoot validation gate

- [ ] **Step 1: Re-validate iOS demo state**

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift && git reset --hard demo-start && git clean -fd
cd /Users/dianakhortiuk/frontegg-mcp-support
npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-ios-swift/example
```
Expected: same finding set as Phase 2 Task 2.3 baseline. If different, MCP rules drifted — STOP and reconcile before recording.

- [ ] **Step 2: Re-validate Android demo state**

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin && git reset --hard demo-start && git clean -fd
cd /Users/dianakhortiuk/frontegg-mcp-support
npx tsx scripts/validate-demo-state.ts ~/Showcase/demo-state/frontegg-android-kotlin/example
```
Expected: same finding set as Phase 2 Task 2.4 baseline.

- [ ] **Step 3: USER TASK — work through `recording-checklist.md`**

Open `assets/showcase-video-2026-05-04/recording-checklist.md`. Tick every item top-to-bottom. **Do not start recording until every checkbox is ticked.**

This includes the MCP-off prompt-hardening loop — if the MCP-off side answers too well, swap to the harder prompt before recording.

- [ ] **Step 4: Pin the MCP commit for the day**

```bash
cd /Users/dianakhortiuk/frontegg-mcp-support
git rev-parse HEAD
```
Record the commit SHA in the run-day notes table at the bottom of `recording-checklist.md`. If anything goes wrong post-recording, this lets you reproduce the exact MCP behavior.

---

### Task 5.2: Record Scene 1 — Pain hook

- [ ] **Step 1: Request computer-use access for the apps needed in Scene 1**

```typescript
// (executed by the agent)
mcp__computer-use__request_access({
  apps: ["TextEdit", "Claude"],  // TextEdit for narrator card; Claude reserved for later scenes
  reason: "Recording showcase video Scene 1 (narrator card)."
})
```

- [ ] **Step 2: Open TextEdit, set up the narrator card**

Open TextEdit. New document. Set font to a large sans-serif (Helvetica 96pt). Window resized to 1920×1080.

- [ ] **Step 3: Start the recording**

```bash
screencapture -V 18 assets/showcase-video-2026-05-04/recordings/scene-1-hook.mov &
SCAP_PID=$!
echo "screencapture PID: $SCAP_PID"
```

- [ ] **Step 4: Drive the narrator card via computer-use**

Type each line, pause 2 seconds between, total ~15s before screencapture's 18s window expires:

```
Mobile integration today.

Tickets escalate.
Engineers loop in.
Customers stall.

Today: week one.
The longest part of the relationship.
```

- [ ] **Step 5: Confirm recording landed**

```bash
ls -la assets/showcase-video-2026-05-04/recordings/scene-1-hook.mov
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  assets/showcase-video-2026-05-04/recordings/scene-1-hook.mov
```
Expected: ~18s, file size > 5MB.

- [ ] **Step 6: Review the take**

```bash
open assets/showcase-video-2026-05-04/recordings/scene-1-hook.mov
```

If pacing is off or text wrapping looks bad, re-record (delete and repeat from Step 3). Multiple takes are normal; keep the best one as the canonical filename.

---

### Task 5.3: Record Scene 2 — A/B + Hero (the big one)

This is the scene that defines the whole video. Plan for 3–5 takes.

- [ ] **Step 1: Position both Claude Desktop windows**

USER TASK: confirm two Claude Desktop windows are visible side-by-side (left = MCP-off, right = MCP-on per recording-checklist Step "Claude Desktop dual-window setup"). Both should be at fresh new-chat composers.

- [ ] **Step 2: Boot iOS simulator**

USER TASK: confirm iOS Simulator is running, idle on home screen, the demo-start build of the example app is installed. Bring Simulator to background — it'll come forward later in the take.

- [ ] **Step 3: Request computer-use access**

```typescript
mcp__computer-use__request_access({
  apps: ["Claude", "Simulator"],
  reason: "Recording showcase video Scene 2 (A/B chat + simulator login flow)."
})
```

- [ ] **Step 4: Start the chat-portion recording**

```bash
screencapture -V 90 assets/showcase-video-2026-05-04/recordings/scene-2-ab-hero.mov &
echo "screencapture PID: $!"
```

- [ ] **Step 5: Click into LEFT (MCP-off) window's composer**

Take a screenshot. Identify the LEFT window's composer x,y. Click it. (Coordinates depend on the user's screen; capture with `mcp__computer-use__screenshot` first.)

- [ ] **Step 6: Type the Scene 2 prompt into LEFT window**

Use the prompt from `assets/showcase-video-2026-05-04/script/prompts.md` Scene 2 verbatim (the original or hardened variant — whichever was chosen during pre-shoot).

After typing, press Enter. Wait ~12 seconds for the response to render fully.

- [ ] **Step 7: Click into RIGHT (MCP-on) window's composer**

Screenshot, identify, click.

- [ ] **Step 8: Type the same Scene 2 prompt into RIGHT window**

Verbatim. Press Enter. Wait ~15 seconds for the MCP tool calls and findings to render.

- [ ] **Step 9: Apply diffs on the RIGHT side**

In the same RIGHT chat composer, type:

```
Apply all the diffs.
```

Press Enter. Wait ~10 seconds.

- [ ] **Step 10: Switch focus to iOS Simulator**

```typescript
mcp__computer-use__open_application({ app: "Simulator" })
```

Wait for Simulator to come to front. Click the example app's login button. The hosted login flow should now succeed (because diffs applied). Wait for the authenticated home screen to appear.

- [ ] **Step 11: Stop screencapture**

The 90-second window may have already expired. If still running:

```bash
pkill -f "screencapture -V" || true
```

- [ ] **Step 12: Capture clean simulator video as a separate clip**

After login completes, run a clean simulator-only recording for the editor:

```bash
xcrun simctl io booted recordVideo \
  --type=mp4 \
  assets/showcase-video-2026-05-04/recordings/scene-2-sim.mp4 &
SIMRECORD_PID=$!
```

USER TASK: in the simulator, log out of the example app (back to login button), then tap login again to redo the flow cleanly. ~10 seconds. Then:

```bash
kill -INT $SIMRECORD_PID  # graceful stop produces a valid MP4
```

- [ ] **Step 13: Review both takes**

```bash
open assets/showcase-video-2026-05-04/recordings/scene-2-ab-hero.mov
open assets/showcase-video-2026-05-04/recordings/scene-2-sim.mp4
```

USER TASK: judge both. Acceptable if:
- LEFT response is plausibly weaker / wrong
- RIGHT shows specific findings with file paths
- Tool-call lines visible in the RIGHT response
- Simulator login flow visible end-to-end

If any condition fails, re-take from Step 4.

- [ ] **Step 14: Reset demo-start for any future takes**

```bash
cd ~/Showcase/demo-state/frontegg-ios-swift && git reset --hard demo-start && git clean -fd
```

---

### Task 5.4: Record Scene 4 — Kotlin breadth

- [ ] **Step 1: Reset Android demo-start**

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin && git reset --hard demo-start && git clean -fd
```

- [ ] **Step 2: Boot Android emulator**

USER TASK: launch a Pixel-class AVD via Android Studio's AVD Manager. Wait for home idle. Install the demo-start build of the example app via:

```bash
cd ~/Showcase/demo-state/frontegg-android-kotlin/example
./gradlew installDebug || true   # may fail at the actual install since SDK dep is stripped — that's fine, app is broken-state
```

If the broken state can't even install, skip this step and rely on the VHS fallback (Task 4.8) — note in run-day notes.

- [ ] **Step 3: Request access**

```typescript
mcp__computer-use__request_access({
  apps: ["Claude", "qemu-system-x86_64"],   // emulator process; verify name with list_granted_applications after grant
  reason: "Recording showcase video Scene 4 (Kotlin chat + emulator)."
})
```

- [ ] **Step 4: Start recording**

```bash
screencapture -V 28 assets/showcase-video-2026-05-04/recordings/scene-4-kotlin.mov &
```

- [ ] **Step 5: Drive the chat**

Click into RIGHT (MCP-on) Claude Desktop window. Type the Scene 4 prompt verbatim from `prompts.md`. Press Enter. Wait ~12 seconds for findings.

Type "apply all". Press Enter. Wait ~6 seconds.

- [ ] **Step 6: Switch focus to emulator, show login**

`open_application` the emulator. Click the example app's login button. Wait for hosted login flow → return → authenticated state. ~8 seconds.

- [ ] **Step 7: Stop screencapture (auto-stops at 28s)**

- [ ] **Step 8: Review**

```bash
open assets/showcase-video-2026-05-04/recordings/scene-4-kotlin.mov
```
Same acceptance criteria as Scene 2. If unacceptable, re-take. If emulator misbehaves entirely, fall back to the rendered `cli-beat/demo-android.mp4` — document the substitution in run-day notes.

---

### Task 5.5: Record Scene 5 — Day-2 MFA

- [ ] **Step 1: Confirm Frontegg API credentials are exported**

USER TASK: in the same shell that launched Claude Desktop:

```bash
echo "${FRONTEGG_CLIENT_ID:?MISSING}"
echo "${FRONTEGG_SECRET:?MISSING}"
```

If either is missing, set them and relaunch Claude Desktop. The day-2 scene only works if the MCP can call the Frontegg Management API.

- [ ] **Step 2: Start recording**

```bash
screencapture -V 50 assets/showcase-video-2026-05-04/recordings/scene-5-mfa.mov &
```

- [ ] **Step 3: Drive the chat — Prompt 5a**

Click RIGHT (MCP-on) Claude Desktop composer. Type the Scene 5a prompt verbatim from `prompts.md`. Press Enter. Wait ~10 seconds for `frontegg_configure_mfa get` tool-call line + policy render.

- [ ] **Step 4: Drive the chat — Prompt 5b**

Type Scene 5b prompt verbatim. Press Enter. Wait ~8 seconds for `frontegg_configure_mfa update` confirmation.

- [ ] **Step 5: Stop screencapture (auto-stops at 50s)**

- [ ] **Step 6: USER TASK — record portal cut**

USER TASK: in Chrome (or your browser), navigate to the Frontegg portal MFA settings page. The setting should now read "Force except SAML." Use macOS Cmd+Shift+5 (or Loom) to record a 10-second clip of this. Save as:

`assets/showcase-video-2026-05-04/recordings/scene-5-portal-USER.mp4`

- [ ] **Step 7: Review**

```bash
open assets/showcase-video-2026-05-04/recordings/scene-5-mfa.mov
open assets/showcase-video-2026-05-04/recordings/scene-5-portal-USER.mp4
```

Both must be clean. If the chat shot's tool-call line is collapsed (not visible), the editor will need to add an explicit caption — note in editing-notes.md.

- [ ] **Step 8: Restore the original MFA setting**

USER TASK: in the same chat or via the portal, set MFA back to whatever it was before. The recorded change is real — don't leave it active accidentally.

---

### Task 5.6: Render Scene 6 — Closer (numbers + multi-client)

The closer is mostly pre-rendered. The user provides 3 sidebar cuts; the
agent renders the impact-numbers slide as a video.

- [ ] **Step 1: Render impact-numbers as a still PNG sequence**

Already done in Task 4.5 — verify the file exists:

```bash
test -f assets/showcase-video-2026-05-04/overlays/impact-numbers.png && echo OK || echo MISSING
```

- [ ] **Step 2: Render impact-numbers as a 35-second hold video**

```bash
ffmpeg -loop 1 -i assets/showcase-video-2026-05-04/overlays/impact-numbers.png \
  -c:v libx264 -t 35 -pix_fmt yuv420p -vf "scale=1920:1080" \
  -y assets/showcase-video-2026-05-04/recordings/scene-6-numbers.mp4
```

Expected: a 35-second MP4 of the impact-numbers slide held still. Editor will animate the counters or overlay live numbers in post.

- [ ] **Step 3: USER TASK — record three 5-second sidebar cuts**

USER TASK: separately, in your normal IDE/chat setup:

1. Open Cursor. Show the MCP sidebar with `frontegg-mobile` connected. Record 5s with Cmd+Shift+5. Save as `recordings/scene-6-sidebar-cursor-USER.mp4`.
2. Open Claude Code (the CLI). Run `claude mcp list`. Show the connected `frontegg-mobile`. Record 5s. Save as `recordings/scene-6-sidebar-claude-code-USER.mp4`.
3. Already-running Claude Desktop with MCP-on config: show the right pane's tools sidebar. Record 5s. Save as `recordings/scene-6-sidebar-claude-desktop-USER.mp4`.

- [ ] **Step 4: Verify all three USER files exist**

```bash
ls -la assets/showcase-video-2026-05-04/recordings/scene-6-sidebar-*-USER.mp4
```
Expected: 3 files, each ~5 seconds.

---

### Task 5.7: Final asset manifest + handoff

- [ ] **Step 1: Generate the manifest**

Create `assets/showcase-video-2026-05-04/MANIFEST.md`:

```bash
cat > assets/showcase-video-2026-05-04/MANIFEST.md <<'EOF'
# Asset manifest — handoff to editor

## Scene clips

| Scene | File | Duration | Notes |
|---|---|---|---|
| 1 | recordings/scene-1-hook.mov | ~18s | Add stock cuts in editor |
| 2 chat | recordings/scene-2-ab-hero.mov | ~90s | Composite with Scene 2 sim |
| 2 sim | recordings/scene-2-sim.mp4 | ~10s | Cut into Scene 2 at the post-apply moment |
| 3 | cli-beat/demo-ios.mp4 | ~15s | Pre-rendered VHS |
| 4 | recordings/scene-4-kotlin.mov | ~28s | Or fallback: cli-beat/demo-android.mp4 |
| 5 chat | recordings/scene-5-mfa.mov | ~50s | |
| 5 portal | recordings/scene-5-portal-USER.mp4 | ~10s | USER-recorded |
| 6 sidebars | recordings/scene-6-sidebar-{cursor,claude-code,claude-desktop}-USER.mp4 | 3 × 5s | USER-recorded |
| 6 numbers | recordings/scene-6-numbers.mp4 | 35s | Held still — animate counters in post |

## Overlays

| File | Use |
|---|---|
| overlays/title-card.png | Scene 1 first 3s |
| overlays/lower-third-1..6.png | Per-scene caption bar |
| overlays/ab-divider.png | Scene 2 split-screen labels |
| overlays/multi-client-strip.png | Scene 6 client-strip card |
| overlays/impact-numbers.png | Scene 6 numbers slide |
| overlays/architecture-broll.svg | Optional B-roll for Scene 1 or 3 |

## Scripts

- script/voiceover.md — full timed VO
- script/teleprompter.txt — flat narration, 80-char lines
- script/shot-list.md — per-scene action breakdown
- script/prompts.md — exact prompts that were typed (record final used variants)

## Editing reference

- editing-notes.md — sequence assembly, audio mix, color, pre-export checklist
- recording-checklist.md — for repeat takes / future re-records

## Run-day notes

See run-day notes table at bottom of recording-checklist.md.
EOF
```

- [ ] **Step 2: Verify manifest is complete**

```bash
cat assets/showcase-video-2026-05-04/MANIFEST.md
ls -la assets/showcase-video-2026-05-04/recordings/
```

- [ ] **Step 3: Asset count sanity check**

```bash
ls assets/showcase-video-2026-05-04/recordings/*.mov assets/showcase-video-2026-05-04/recordings/*.mp4 2>/dev/null | wc -l
```
Expected: at least 9 files (1 hook + 1 chat + 1 sim + 1 kotlin + 1 mfa + 1 portal + 3 sidebars + 1 numbers = 10).

- [ ] **Step 4: COMMIT** (confirm with user — final commit of the prep pack)

```bash
git add assets/showcase-video-2026-05-04/
git commit -m "feat(showcase): complete prep pack and raw scene recordings (v1)"
```

- [ ] **Step 5: Hand off**

Tell the user: prep pack complete at `assets/showcase-video-2026-05-04/`. Open
`MANIFEST.md` and `editing-notes.md` to start the edit.

---

## Self-review checklist (run after writing this plan)

- [x] **Spec coverage:** Every section in the spec maps to at least one task.
  - Brand-attribution rule → enforced via VO (Task 3.4), tool-call visibility check in recording-checklist (Task 3.7), success-criteria final review.
  - A/B opener → Task 5.3 with hardening loop in Task 3.7.
  - 5 iOS strips → Task 2.1 steps 3–7. 4 Kotlin strips → Task 2.2 steps 3–6.
  - CLI beat → Tasks 4.7 + 4.8.
  - Multi-client closer → Task 5.6.
  - Three numbers → Task 4.5 + 5.6.
  - All overlays + scripts → Phase 3 + 4.
  - Pre-shoot validation → Task 5.1 + recording-checklist.
- [x] **Placeholder scan:** No `TBD`/`TODO`/"add appropriate". Every command and code block is concrete. The `your data here` placeholders in `impact-numbers.html` are intentional and called out for the editor.
- [x] **Type consistency:** `frontegg_auto`, `frontegg_apply_diff`, `frontegg_configure_mfa` used consistently across plan and spec. Demo state paths (`~/Showcase/demo-state/...`) consistent across all tasks. Asset folder path (`assets/showcase-video-2026-05-04/`) consistent.

## Risks documented in the spec — mitigations live in this plan

| Spec risk | Plan task that mitigates |
|---|---|
| MCP-off side too good | Task 3.7 hardening loop, Task 5.1 Step 3 |
| GitHub fetch flake | Task 3.7 right-side warmup |
| Rule drift between writing and recording | Task 5.1 Steps 1–2 + 4 (commit pin) |
| Tool-call lines hidden by UI | Task 3.7 visual check + editing-notes Scene 5 caption fallback |
| `your data here` ships in final cut | Task 3.8 editing-notes pre-export checklist |
| Simulator cold-start spinner | Recording-checklist environment section |
| Viewer credits Claude not MCP | VO discipline (Task 3.4 line-by-line review), multi-client closer (Task 5.6) |
