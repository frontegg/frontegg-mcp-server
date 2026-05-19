import { DiffGenerator } from '../platforms/types.js';
import { appendDiff } from './diff-util.js';
import { findFirst } from '../platforms/fs-util.js';
import path from 'path';
import {
  extractFlutterDep,
  extractFlutterInit,
  extractIntentFilterBlock,
} from './canonical-extract.js';

export const flutterDiffGenerator: DiffGenerator = {
  sdk: 'flutter',
  async generate(root, id, knowledge) {
    if (id === 'flutter.dependency.missing' || id === 'flutter.dependency.versionDrift') {
      const pubspec = await findFirst(root, 'pubspec.yaml');
      if (!pubspec) return null;
      // Prefer the canonical pubspec line so the version + path/git ref
      // matches what frontegg-flutter ships today.
      const canonicalPubspec = knowledge?.snippets?.['flutter.pubspec']?.content;
      const canonicalLines = canonicalPubspec ? extractFlutterDep(canonicalPubspec) : null;
      if (canonicalLines && canonicalLines.length > 0) {
        return appendDiff(path.relative(root, pubspec), ['dependencies:', ...canonicalLines]);
      }
      const version = knowledge?.version ? `^${knowledge.version}` : '^1.0.0';
      return appendDiff(path.relative(root, pubspec), [
        'dependencies:',
        `  frontegg_flutter: ${version}`,
      ]);
    }
    if (id === 'flutter.init.missing') {
      const mainDart = await findFirst(root, 'main.dart');
      if (!mainDart) return null;
      // Prefer canonical main.dart init lines harvested from the live example.
      const canonicalMain = knowledge?.snippets?.['flutter.main']?.content;
      const canonicalInit = canonicalMain ? extractFlutterInit(canonicalMain) : null;
      if (canonicalInit && canonicalInit.length > 0) {
        return appendDiff(path.relative(root, mainDart), canonicalInit);
      }
      return appendDiff(path.relative(root, mainDart), [
        "import 'package:frontegg_flutter/frontegg_flutter.dart';",
        '',
        'void main() async {',
        '  WidgetsFlutterBinding.ensureInitialized();',
        '  await FronteggApp.init(',
        "    baseUrl: 'https://app-your-subdomain.frontegg.com',",
        "    clientId: 'YOUR_CLIENT_ID',",
        "    applicationId: 'YOUR_APPLICATION_ID',",
        '  );',
        '  runApp(const MyApp());',
        '}',
      ]);
    }
    // Cross-platform: Flutter detector re-namespaces android findings under
    // `flutter.android.*`. Handle the intent-filter case here so the diff
    // for a Flutter project is templated from the canonical example app.
    if (id === 'flutter.android.intentFilter.missing') {
      const manifest = await findFirst(path.join(root, 'android'), 'AndroidManifest.xml');
      if (!manifest) return null;
      const canonicalManifest = knowledge?.snippets?.['android.manifest']?.content;
      const canonicalBlock = canonicalManifest
        ? extractIntentFilterBlock(canonicalManifest)
        : null;
      const block =
        canonicalBlock && canonicalBlock.length > 0
          ? canonicalBlock
          : [
              '    <intent-filter>',
              '        <action android:name="android.intent.action.VIEW" />',
              '        <category android:name="android.intent.category.DEFAULT" />',
              '        <category android:name="android.intent.category.BROWSABLE" />',
              '        <data android:scheme="yourapp" android:host="auth" />',
              '    </intent-filter>',
            ];
      return appendDiff(path.relative(root, manifest), block);
    }
    return null;
  },
};
