import { Sdk } from './types.js';

/** GitHub repo coordinates for each canonical SDK. */
export interface GithubCoords {
  owner: string;
  repo: string;
  branch: string;
}

export const SDK_GITHUB: Record<Sdk, GithubCoords> = {
  'android-kotlin': { owner: 'frontegg', repo: 'frontegg-android-kotlin', branch: 'master' },
  'ios-swift': { owner: 'frontegg', repo: 'frontegg-ios-swift', branch: 'master' },
  'flutter': { owner: 'frontegg', repo: 'frontegg-flutter', branch: 'master' },
  'react-native': { owner: 'frontegg', repo: 'frontegg-react-native', branch: 'master' },
  'ionic-capacitor': { owner: 'frontegg', repo: 'frontegg-ionic-capacitor', branch: 'master' },
};

/** Primary manifest files tried per SDK, in order. */
export const MANIFEST_FILES: Record<Sdk, string[]> = {
  'flutter': ['pubspec.yaml'],
  'react-native': ['package.json'],
  'ionic-capacitor': ['package.json'],
  'ios-swift': ['Package.swift', 'FronteggSwift.podspec'],
  'android-kotlin': ['build.gradle', 'build.gradle.kts'],
};

/**
 * Curated canonical example paths per SDK — the files the diagnose/diff
 * layers cite when pointing the developer at a known-good configuration.
 * We hardcode these rather than walking the repo tree to avoid GitHub API
 * rate limits.
 */
export const EXAMPLE_PATHS: Record<Sdk, Record<string, string[]>> = {
  'android-kotlin': {
    'android.manifest': ['app/src/main/AndroidManifest.xml'],
    'android.gradle': ['app/build.gradle', 'app/build.gradle.kts'],
  },
  'ios-swift': {
    'ios.infoPlist': ['demo/demo/Info.plist', 'Example/Example/Info.plist'],
    'ios.appDelegate.swift': [
      'demo-uikit/demo-uikit/AppDelegate.swift',
      'demo/demo/AppDelegate.swift',
      'Example/Example/AppDelegate.swift',
    ],
    // Canonical SwiftUI app entry that wraps with FronteggWrapper { ... } —
    // used as the init template alongside the UIKit AppDelegate.
    'ios.appEntry.swift': [
      'demo/demo/demoApp.swift',
      'demo-application-id/demo-application-id/demo_application_idApp.swift',
    ],
    // Canonical Frontegg.plist with baseUrl / clientId / applicationId.
    'ios.fronteggPlist': [
      'demo/demo/Frontegg.plist',
      'Example/Example/Frontegg.plist',
    ],
  },
  'flutter': {
    'flutter.pubspec': ['example/pubspec.yaml'],
    'flutter.main': ['example/lib/main.dart'],
    'android.manifest': ['example/android/app/src/main/AndroidManifest.xml'],
    'ios.infoPlist': ['example/ios/Runner/Info.plist'],
  },
  'react-native': {
    'rn.package': ['example/package.json'],
    'rn.app': ['example/App.tsx', 'example/src/App.tsx'],
    'android.manifest': ['example/android/app/src/main/AndroidManifest.xml'],
    'ios.infoPlist': ['example/ios/FronteggRNExample/Info.plist'],
    'ios.podfile': ['example/ios/Podfile'],
  },
  'ionic-capacitor': {
    'ionic.capacitorConfigTs': ['example/capacitor.config.ts'],
    'ionic.capacitorConfigJson': ['example/capacitor.config.json'],
    'ionic.package': ['example/package.json'],
    'android.manifest': ['example/android/app/src/main/AndroidManifest.xml'],
    'ios.infoPlist': ['example/ios/App/App/Info.plist'],
  },
};

export function rawUrl(sdk: Sdk, path: string): string {
  const { owner, repo, branch } = SDK_GITHUB[sdk];
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

export function repoUrl(sdk: Sdk): string {
  const { owner, repo } = SDK_GITHUB[sdk];
  return `https://github.com/${owner}/${repo}`;
}

export const ALL_SDKS: Sdk[] = [
  'android-kotlin',
  'ios-swift',
  'flutter',
  'react-native',
  'ionic-capacitor',
];
