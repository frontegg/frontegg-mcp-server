import path from 'path';
import { promises as fs } from 'fs';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'build',
  'Pods',
  '.dart_tool',
  '.gradle',
  'DerivedData',
  'ios/Pods',
  'dist',
  '.next',
  '.expo',
  // build-variant manifests Flutter auto-generates — they intentionally
  // only carry the minimum, so checking them for intent-filters yields
  // noisy false positives.
  'debug',
  'profile',
  // Capacitor's cordova-plugin shell — not the user's app manifest.
  'capacitor-cordova-android-plugins',
]);

/**
 * Per-root file index. Caches discovered files on first walk so multiple
 * detectors calling findFirst() for different filenames don't re-traverse
 * the entire tree (~6 walks per analysis → 1).
 */
const fileIndex = new Map<string, Map<string, string[]>>();

/** Clear the file index (call between analysis runs or in tests). */
export function clearFileIndex(): void {
  fileIndex.clear();
}

async function getFileIndex(root: string): Promise<Map<string, string[]>> {
  const cached = fileIndex.get(root);
  if (cached) return cached;

  const index = new Map<string, string[]>();
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop()!;
    if (depth > MAX_DEPTH) continue;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push({ dir: p, depth: depth + 1 });
      } else {
        const existing = index.get(e.name);
        if (existing) existing.push(p);
        else index.set(e.name, [p]);
      }
    }
  }
  fileIndex.set(root, index);
  return index;
}

export async function findFirst(root: string, fileName: string): Promise<string | null> {
  const index = await getFileIndex(root);
  const matches = index.get(fileName) ?? [];
  return pickBestMatch(matches, fileName);
}

const MAX_DEPTH = 25;


/**
 * Prefer the "main" / app-level version of a file when multiple candidates
 * exist. Android projects often contain profile/debug variant manifests,
 * and Capacitor wraps plugin shells that carry stub manifests — neither is
 * what detectors want to lint.
 */
function pickBestMatch(matches: string[], fileName: string): string | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const score = (p: string): number => {
    let s = 0;
    const norm = p.replace(/\\/g, '/');
    // Heavy preference for the canonical main source set.
    if (norm.includes('/src/main/')) s += 100;
    // Prefer app / Runner module over generated / plugin shells.
    if (/\/(app|Runner)\//.test(norm)) s += 20;
    // Penalize plugin, generated, variant, and test-bundle directories.
    if (/\/capacitor-cordova/.test(norm)) s -= 80;
    if (/\/src\/(debug|profile|test|androidTest)\//.test(norm)) s -= 60;
    if (/\/generated\//.test(norm)) s -= 40;
    // iOS test bundles commonly live in <AppName>Tests/ or <AppName>UITests/
    if (/(Tests|UITests)\//.test(norm) && fileName === 'Info.plist') s -= 70;
    // Shorter paths are usually the root / main one.
    s -= norm.split('/').length;
    return s;
  };

  return matches
    .map((p) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s)[0]!.p;
}

export async function findAll(
  root: string,
  predicate: (name: string) => boolean,
  maxResults: number = 50
): Promise<string[]> {
  const index = await getFileIndex(root);
  const out: string[] = [];
  for (const [name, paths] of index) {
    if (!predicate(name)) continue;
    for (const p of paths) {
      out.push(p);
      if (out.length >= maxResults) return out;
    }
  }
  return out;
}

export async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
