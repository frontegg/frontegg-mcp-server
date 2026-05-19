import path from 'path';
import { DiffGenerator } from '../platforms/types.js';
import { appendDiff, newFileDiff } from './diff-util.js';
import { findFirst } from '../platforms/fs-util.js';
import { extractCapacitorPluginBlock } from './canonical-extract.js';

export const ionicCapacitorDiffGenerator: DiffGenerator = {
  sdk: 'ionic-capacitor',
  async generate(root, id, knowledge) {
    if (id === 'ionic.dependency.missing' || id === 'ionic.dependency.versionDrift') {
      const version = knowledge?.version ? `^${knowledge.version}` : '^1.0.0';
      return appendDiff('package.json', [
        '"dependencies": {',
        `  "@frontegg/ionic-capacitor": "${version}"`,
        '}',
      ]);
    }
    if (id === 'ionic.capacitorConfig.missing') {
      return newFileDiff('capacitor.config.ts', [
        "import { CapacitorConfig } from '@capacitor/cli';",
        '',
        'const config: CapacitorConfig = {',
        "  appId: 'com.example.app',",
        "  appName: 'YourApp',",
        "  webDir: 'www',",
        '  plugins: {',
        '    FronteggNative: {',
        "      baseUrl: 'https://app-your-subdomain.frontegg.com',",
        "      clientId: 'YOUR_CLIENT_ID',",
        "      applicationId: 'YOUR_APPLICATION_ID',",
        '    },',
        '  },',
        '};',
        '',
        'export default config;',
      ]);
    }
    if (id === 'ionic.capacitorConfig.plugin.missing') {
      const config =
        (await findFirst(root, 'capacitor.config.ts')) ||
        (await findFirst(root, 'capacitor.config.json'));
      if (!config) return null;
      // Prefer the canonical FronteggNative block from the live example.
      const canonicalConfig = knowledge?.snippets?.['ionic.capacitorConfigTs']?.content;
      const canonicalBlock = canonicalConfig
        ? extractCapacitorPluginBlock(canonicalConfig)
        : null;
      if (canonicalBlock && canonicalBlock.length > 0) {
        return appendDiff(path.relative(root, config), [
          '  plugins: {',
          ...canonicalBlock,
          '  },',
        ]);
      }
      return appendDiff(path.relative(root, config), [
        '  plugins: {',
        '    FronteggNative: {',
        "      baseUrl: 'https://app-your-subdomain.frontegg.com',",
        "      clientId: 'YOUR_CLIENT_ID',",
        "      applicationId: 'YOUR_APPLICATION_ID',",
        '    },',
        '  },',
      ]);
    }
    if (id === 'ionic.android.intentFilter.missing') {
      const manifest = await findFirst(path.join(root, 'android'), 'AndroidManifest.xml');
      if (!manifest) return null;
      return appendDiff(path.relative(root, manifest), [
        '    <intent-filter>',
        '        <action android:name="android.intent.action.VIEW" />',
        '        <category android:name="android.intent.category.DEFAULT" />',
        '        <category android:name="android.intent.category.BROWSABLE" />',
        '        <data android:scheme="yourapp" android:host="auth" />',
        '    </intent-filter>',
      ]);
    }
    if (id === 'ionic.ios.urlTypes.missing') {
      const plist = await findFirst(path.join(root, 'ios'), 'Info.plist');
      if (!plist) return null;
      return appendDiff(path.relative(root, plist), [
        '  <key>CFBundleURLTypes</key>',
        '  <array>',
        '    <dict>',
        '      <key>CFBundleURLSchemes</key>',
        '      <array>',
        '        <string>yourapp</string>',
        '      </array>',
        '    </dict>',
        '  </array>',
      ]);
    }
    return null;
  },
};
