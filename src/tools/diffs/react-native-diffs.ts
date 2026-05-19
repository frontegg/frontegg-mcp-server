import path from 'path';
import { DiffGenerator } from '../platforms/types.js';
import { appendDiff } from './diff-util.js';
import { findFirst, findAll } from '../platforms/fs-util.js';

export const reactNativeDiffGenerator: DiffGenerator = {
  sdk: 'react-native',
  async generate(root, id, knowledge) {
    if (id === 'rn.dependency.missing' || id === 'rn.dependency.versionDrift') {
      const version = knowledge?.version ? `^${knowledge.version}` : '^1.0.0';
      return appendDiff('package.json', [
        '"dependencies": {',
        `  "@frontegg/react-native": "${version}"`,
        '}',
      ]);
    }
    if (id === 'rn.android.intentFilter.missing') {
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
    if (id === 'rn.android.internetPermission.missing') {
      const manifest = await findFirst(path.join(root, 'android'), 'AndroidManifest.xml');
      if (!manifest) return null;
      return appendDiff(path.relative(root, manifest), [
        '<uses-permission android:name="android.permission.INTERNET" />',
      ]);
    }
    if (id === 'rn.ios.urlTypes.missing') {
      const plist = (await findAll(path.join(root, 'ios'), (n) => n === 'Info.plist', 1))[0];
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
    if (id === 'rn.ios.podfile.useFrameworks.missing') {
      const podfile = await findFirst(path.join(root, 'ios'), 'Podfile');
      if (!podfile) return null;
      return appendDiff(path.relative(root, podfile), ['  use_frameworks!']);
    }
    if (id === 'rn.init.missing') {
      const appFile =
        (await findFirst(root, 'App.tsx')) || (await findFirst(root, 'App.js'));
      if (!appFile) return null;
      return appendDiff(path.relative(root, appFile), [
        "import { FronteggWrapper } from '@frontegg/react-native';",
        '',
        'const fronteggOptions = {',
        "  baseUrl: 'https://app-your-subdomain.frontegg.com',",
        "  clientId: 'YOUR_CLIENT_ID',",
        "  applicationId: 'YOUR_APPLICATION_ID',",
        '};',
        '',
        '// Wrap your app root:',
        '// <FronteggWrapper {...fronteggOptions}>',
        '//   <App />',
        '// </FronteggWrapper>',
      ]);
    }
    return null;
  },
};
