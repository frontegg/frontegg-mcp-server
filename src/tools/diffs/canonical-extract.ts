/**
 * Extract specific code/config snippets from canonical example files that
 * the knowledge loader has already fetched from GitHub. This is what makes
 * the diffs "live" — they're templated from the actual Frontegg example
 * apps rather than from hand-coded strings the MCP author once wrote.
 *
 * Each extractor takes a string blob (the file content) and returns the
 * snippet to insert, or null when extraction fails. Callers fall back to
 * their hardcoded template in that case.
 */

import { Logger } from '../../utils/logger.js';
const logger = Logger.getInstance();

/**
 * Pull a deep-link `<intent-filter>` block — specifically one that contains
 * `android.intent.action.VIEW`. Canonical example manifests usually have a
 * LAUNCHER intent-filter first; returning that one would not satisfy the
 * detector (which checks for VIEW) and would not actually fix the user's
 * deep-link problem.
 */
export function extractIntentFilterBlock(manifest: string): string[] | null {
  const re = /(<intent-filter[\s\S]*?<\/intent-filter>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(manifest)) !== null) {
    if (m[1]!.includes('android.intent.action.VIEW')) {
      return dedent(m[1]!).split('\n');
    }
  }
  logger.debug('extractIntentFilterBlock: no VIEW intent-filter found in canonical manifest');
  return null;
}

/** Pull the `<key>CFBundleURLTypes</key>...<array>...</array>` block. */
export function extractCFBundleURLTypes(plist: string): string[] | null {
  const m =
    /(<key>CFBundleURLTypes<\/key>\s*<array>[\s\S]*?<\/array>)/.exec(plist);
  if (!m) {
    logger.debug('extractCFBundleURLTypes: no CFBundleURLTypes block found in canonical plist');
    return null;
  }
  return dedent(m[1]!).split('\n');
}

/**
 * Pull the baseUrl / clientId / applicationId key/value pairs out of a
 * canonical `Frontegg.plist`. Returns the lines ready to splice into a
 * placeholder plist, or null if the canonical doesn't have them. Sensitive
 * values (the canonical example uses real-looking ids) are replaced with
 * obvious placeholders so we never recommend a customer paste them.
 */
export function extractFronteggPlistKeys(plist: string): string[] | null {
  if (!plist) return null;
  const out: string[] = [];
  const grab = (key: string, placeholder: string): void => {
    const re = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`);
    if (re.test(plist)) {
      out.push(`  <key>${key}</key>`);
      out.push(`  <string>${placeholder}</string>`);
    }
  };
  // `<subdomain>` is a placeholder for the user's actual tenant subdomain;
  // it must be XML-escaped or plutil rejects the file as invalid markup.
  grab('baseUrl', 'https://app-&lt;subdomain&gt;.frontegg.com');
  grab('clientId', 'YOUR_CLIENT_ID');
  grab('applicationId', 'YOUR_APPLICATION_ID');
  if (out.length === 0) {
    logger.debug('extractFronteggPlistKeys: no recognized keys in canonical Frontegg.plist');
    return null;
  }
  return out;
}

/**
 * Pull the `frontegg_flutter:` line (or block, if it nests path/version)
 * from a canonical pubspec.yaml.
 */
export function extractFlutterDep(pubspec: string): string[] | null {
  const m = /^(\s*frontegg_flutter:[^\n]*(?:\n\s+\S[^\n]*)*)/m.exec(pubspec);
  if (!m) {
    logger.debug('extractFlutterDep: no frontegg_flutter dependency found in canonical pubspec');
    return null;
  }
  return m[1]!.replace(/^\s+/, '  ').split('\n');
}

/**
 * Pull the Frontegg init lines from a canonical main.dart — looks for the
 * surrounding `void main()` block and the FronteggApp.init call inside.
 */
export function extractFlutterInit(mainDart: string): string[] | null {
  // Find a line that imports frontegg_flutter and the main() function body.
  const importLine = /import\s+'package:frontegg_flutter\/[^']+';/.exec(mainDart);
  const mainBody = /void\s+main\s*\(\)[\s\S]*?{[\s\S]*?runApp\([\s\S]*?\);/.exec(mainDart);
  if (!importLine && !mainBody) {
    logger.debug('extractFlutterInit: no frontegg import or main() found in canonical main.dart');
    return null;
  }
  const out: string[] = [];
  if (importLine) out.push(importLine[0]);
  if (mainBody) {
    out.push('');
    out.push(...mainBody[0].split('\n').slice(0, 12));
    out.push('}');
  }
  return out;
}

/**
 * Pull the FronteggNative plugin block from a canonical capacitor.config.ts.
 */
export function extractCapacitorPluginBlock(config: string): string[] | null {
  const m = /(FronteggNative\s*:\s*{[\s\S]*?})\s*,?/.exec(config);
  if (!m) {
    logger.debug('extractCapacitorPluginBlock: no FronteggNative block found in canonical capacitor config');
    return null;
  }
  return ('  ' + m[1]! + ',').split('\n');
}

/**
 * Pull a Podfile pod 'FronteggRN' (or similar) line.
 */
export function extractPodfileFronteggLine(podfile: string): string[] | null {
  const m = /^(\s*pod\s+['"]Frontegg[^'"]*['"][^\n]*)/m.exec(podfile);
  if (!m) return null;
  return [m[1]!.trim()];
}

/** Strip common leading whitespace from a multi-line string. */
function dedent(s: string): string {
  const lines = s.split('\n');
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^\s*/)?.[0].length ?? 0);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}
