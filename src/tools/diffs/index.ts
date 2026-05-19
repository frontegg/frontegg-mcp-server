import { DiffGenerator } from '../platforms/types.js';
import { androidDiffFor } from './android-diffs.js';
import { iosDiffFor } from './ios-diffs.js';
import { commonDiffFor } from './common-diffs.js';
import { flutterDiffGenerator } from './flutter-diffs.js';
import { reactNativeDiffGenerator } from './react-native-diffs.js';
import { ionicCapacitorDiffGenerator } from './ionic-capacitor-diffs.js';
import {
  extractCFBundleURLTypes,
  extractFronteggPlistKeys,
  extractIntentFilterBlock,
} from './canonical-extract.js';

export const androidDiffGenerator: DiffGenerator = {
  sdk: 'android-kotlin',
  async generate(root, id, knowledge) {
    const snippet = knowledge?.snippets?.['android.manifest']?.content;
    const canonical = snippet ? extractIntentFilterBlock(snippet) : null;
    return androidDiffFor(root, id, canonical);
  },
};

export const iosDiffGenerator: DiffGenerator = {
  sdk: 'ios-swift',
  async generate(root, id, knowledge) {
    const infoSnippet = knowledge?.snippets?.['ios.infoPlist']?.content;
    const fronteggPlistSnippet = knowledge?.snippets?.['ios.fronteggPlist']?.content;
    return iosDiffFor(root, id, {
      urlTypes: infoSnippet ? extractCFBundleURLTypes(infoSnippet) : null,
      fronteggPlistKeys: fronteggPlistSnippet
        ? extractFronteggPlistKeys(fronteggPlistSnippet)
        : null,
    });
  },
};

/** Common diffs apply to any SDK; modeled as a pseudo generator not tied to one sdk. */
export async function commonDiff(root: string, id: string): Promise<string | null> {
  return commonDiffFor(root, id);
}

export const ALL_DIFF_GENERATORS: DiffGenerator[] = [
  androidDiffGenerator,
  iosDiffGenerator,
  flutterDiffGenerator,
  reactNativeDiffGenerator,
  ionicCapacitorDiffGenerator,
];

export {
  androidDiffFor,
  iosDiffFor,
  commonDiffFor,
  flutterDiffGenerator,
  reactNativeDiffGenerator,
  ionicCapacitorDiffGenerator,
};
