# Frontegg Mobile MCP Server — End-to-End Test Plan

## Goal

Verify every README example actually works end-to-end by exercising the real
dispatcher against (a) in-memory fixture projects and (b) the canonical
Frontegg SDK sample apps cloned locally under `~/developer/frontegg-*`.

## What we're testing

| # | Layer | What passes means |
|---|---|---|
| 1 | **In-memory demos** — `npm run demo:rn|flutter|ionic|security` | Scaffolds a broken fixture, runs the dispatcher, prints a colored report with the expected findings + diffs. Exit code 0. |
| 2 | **Ground-truth canonical apps** — the dispatcher runs against each real sample app with **zero modifications** | Reports ≤ 1 critical/high finding per SDK (canonical examples are the reference — they should be nearly clean). Any finding surfaced is a real catalog-vs-canonical drift worth investigating. |
| 3 | **Breakage injection** — copy of each canonical app into a tmp dir with a known breakage applied | Dispatcher detects the injected issue, classifies it correctly, and `generateDiffs` produces a non-empty unified diff for at least the top-severity finding. |
| 4 | **MCP stdio smoke test** — spawn `node dist/index.js`, send a real JSON-RPC `tools/list` + `tools/call frontegg_auto`, parse the response | Server starts, registers tools, returns a well-formed response containing "Frontegg Auto Report". |

## Canonical sample app inventory

| SDK | Local path | Notes |
|---|---|---|
| android-kotlin | `~/developer/frontegg-android-kotlin` (repo root — `app/` module is the sample) | Standard Android Studio layout |
| ios-swift | `~/developer/frontegg-ios-swift/demo/demo` | SwiftUI `demoApp.swift` |
| flutter | `~/developer/frontegg-flutter/hosted` | `hosted` is the hosted-login Flutter sample |
| react-native | `~/developer/frontegg-react-native/example` | Full RN 0.72+ project |
| ionic-capacitor | `~/developer/frontegg-ionic-capacitor/example` | Angular + Capacitor sample |

## Breakages we inject (one per SDK)

| SDK | Breakage | Expected rule ID |
|---|---|---|
| android-kotlin | Strip `<intent-filter>` from `AndroidManifest.xml` | `android.intentFilter.missing` |
| ios-swift | Delete `CFBundleURLTypes` block from `Info.plist` | `ios.urlTypes.missing` |
| flutter | Remove `frontegg_flutter` line from `pubspec.yaml` | `flutter.dependency.missing` |
| react-native | Strip `<intent-filter>` from `android/app/src/main/AndroidManifest.xml` | `rn.android.intentFilter.missing` |
| ionic-capacitor | Remove `plugins.FronteggNative` block from `capacitor.config.ts` | `ionic.capacitorConfig.plugin.missing` |

## How to run

```bash
# Full suite
npm run test:e2e

# Individual layers
npm run test:e2e:demos      # layer 1 — in-memory demos
npm run test:e2e:ground     # layer 2 — ground-truth canonical apps
npm run test:e2e:break      # layer 3 — breakage injection
npm run test:e2e:stdio      # layer 4 — MCP stdio smoke test
```

## Pass/fail criteria

- **Layer 1** — All 4 scenarios exit 0 and print at least one critical/high finding plus at least one diff.
- **Layer 2** — Each sample app reports ≤ 1 critical/high finding. Any unexpected findings are listed as "potential drift" for manual review rather than hard failures.
- **Layer 3** — Every injected breakage is surfaced with the matching expected rule id, and `generateDiffs` returns a non-empty diff for it.
- **Layer 4** — Server starts, `tools/list` returns `frontegg_auto` in its tool list, `tools/call frontegg_auto` returns text containing the string "Frontegg Auto Report".

## Non-goals

- **We do not run the SDK apps themselves** (no `flutter run`, `pod install`, `./gradlew`, etc.). The test exercises only the MCP's static analysis of source files.
- **We do not mutate the canonical repos.** Breakage tests always operate on a tmp-dir copy.
- **We do not need network access to Frontegg vendor APIs.** The dispatcher reads GitHub raw files which are cached after the first call.
