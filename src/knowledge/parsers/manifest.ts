import { Sdk } from '../types.js';

export interface ManifestInfo {
  version?: string;
  dependencies: Record<string, string>;
}

/** Best-effort manifest parser — each SDK has a different primary manifest. */
export function parseManifest(sdk: Sdk, files: Record<string, string>): ManifestInfo {
  switch (sdk) {
    case 'flutter':
      return parsePubspec(files['pubspec.yaml']);
    case 'react-native':
    case 'ionic-capacitor':
      return parseNpmPackage(files['package.json']);
    case 'ios-swift':
      return parseSpmOrPodspec(files['Package.swift'], files['FronteggSwift.podspec']);
    case 'android-kotlin':
      return parseAndroidGradle(files['build.gradle'] || files['build.gradle.kts']);
  }
}

function parsePubspec(body: string | undefined): ManifestInfo {
  if (!body) return { dependencies: {} };
  const versionMatch = /^version:\s*([^\s#]+)/m.exec(body);
  const version = versionMatch?.[1];
  const deps: Record<string, string> = {};
  // Very loose YAML: capture "  name: ^1.2.3" under dependencies.
  const depSection = /\ndependencies:\s*\n([\s\S]*?)(?=\n\S|$)/.exec(body);
  if (depSection) {
    const depRx = /^\s{2,}([a-z0-9_]+):\s*([^\n]+)$/gm;
    let m: RegExpExecArray | null;
    const sectionBody = depSection[1] ?? '';
    while ((m = depRx.exec(sectionBody)) !== null) {
      const key = m[1];
      const val = m[2];
      if (key && val) deps[key] = val.trim();
    }
  }
  const out: ManifestInfo = { dependencies: deps };
  if (version) out.version = version;
  return out;
}

function parseNpmPackage(body: string | undefined): ManifestInfo {
  if (!body) return { dependencies: {} };
  try {
    const pkg = JSON.parse(body);
    const deps: Record<string, string> = {
      ...(pkg.dependencies || {}),
      ...(pkg.peerDependencies || {}),
    };
    const out: ManifestInfo = { dependencies: deps };
    if (pkg.version) out.version = pkg.version;
    return out;
  } catch {
    return { dependencies: {} };
  }
}

function parseSpmOrPodspec(spm: string | undefined, podspec: string | undefined): ManifestInfo {
  const deps: Record<string, string> = {};
  let version: string | undefined;
  if (podspec) {
    const vm = /\.version\s*=\s*['"]([^'"]+)['"]/.exec(podspec);
    if (vm) version = vm[1];
  }
  if (spm) {
    const pkgRx = /\.package\([^)]*name:\s*"([^"]+)"[^)]*from:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = pkgRx.exec(spm)) !== null) {
      const name = m[1];
      const from = m[2];
      if (name && from) deps[name] = from;
    }
  }
  const out: ManifestInfo = { dependencies: deps };
  if (version) out.version = version;
  return out;
}

function parseAndroidGradle(body: string | undefined): ManifestInfo {
  if (!body) return { dependencies: {} };
  const vm = /version\s*=?\s*['"]([^'"]+)['"]/.exec(body);
  const deps: Record<string, string> = {};
  const depRx = /(?:implementation|api)\s*\(?\s*['"]([^:'"]+):([^:'"]+):([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = depRx.exec(body)) !== null) {
    const g = m[1];
    const artifact = m[2];
    const ver = m[3];
    if (g && artifact && ver) deps[`${g}:${artifact}`] = ver;
  }
  const out: ManifestInfo = { dependencies: deps };
  if (vm?.[1]) out.version = vm[1];
  return out;
}
