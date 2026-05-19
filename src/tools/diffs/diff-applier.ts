import path from 'path';
import { promises as fs } from 'fs';

/**
 * Minimal unified-diff applier scoped to the diff shapes our generators
 * actually emit. We support a handful of patch *modes*; the mode is encoded
 * as a directive on the `@@` hunk-header line so the diff still round-trips
 * through standard diff viewers.
 *
 *   1. **New file** — `--- /dev/null` / `+++ <path>` headers. Default mode.
 *
 *   2. **EOF append** — same path on both headers, no directive on `@@`.
 *      Falls back to a structurally-aware insert for known XML files
 *      (AndroidManifest.xml, Info.plist, *.entitlements) so we don't land
 *      content outside the root element.
 *
 *   3. **Insert at anchor** — `@@ FRONTEGG-OP: insert-before-marker
 *      marker=<literal text>`. Splices the addition block immediately
 *      before the FIRST occurrence of `<literal text>` in the file. Used
 *      to drop keys inside a nearly-empty `<dict></dict>`, etc.
 *
 *   4. **SwiftUI wrap** — `@@ FRONTEGG-OP: swiftui-wrap-windowgroup`.
 *      Looks for the `WindowGroup { ... }` body inside an `@main struct ...
 *      : App` declaration and wraps it with `FronteggWrapper { ... }`.
 *      Also adds `import FronteggSwift` if missing.
 *
 *   5. **Kotlin onCreate insert** — `@@ FRONTEGG-OP: kotlin-insert-in-method
 *      method=onCreate`. Inserts the addition block at the end of the
 *      target method body (just before the closing `}`). Adds the import
 *      lines from the `+import ...` lines at the top of the addition list
 *      to the import region of the file if missing.
 *
 * Anything more elaborate (true context patches, hunks with deletions,
 * multi-file diffs) is rejected with a clear error so the caller can fall
 * back to manual review.
 */

export interface ApplyResult {
  status: 'created' | 'appended' | 'skipped';
  filePath: string;
  /** Path to the .bak we wrote before mutating an existing file. */
  backupPath?: string;
  reason?: string;
}

export interface ApplyDiffOptions {
  rootPath: string;
  diff: string;
  dryRun?: boolean;
  /**
   * If true, append even when the target file already contains an
   * identical line. Default false (skip-if-present).
   */
  allowDuplicate?: boolean;
}

/** Recognized FRONTEGG-OP patch modes. */
type PatchOp =
  | { kind: 'eof-append' }
  | { kind: 'insert-before-marker'; marker: string }
  | { kind: 'swiftui-wrap-windowgroup' }
  | { kind: 'kotlin-insert-in-method'; method: string };

/**
 * Parse the `@@ ...` hunk-header directive into a patch op. Unknown ops
 * fall back to eof-append so older diffs keep working.
 */
function parseOp(hunkHeader: string): PatchOp {
  // Strip leading `@@` and any trailing whitespace.
  const tail = hunkHeader.replace(/^@@\s*/, '').trim();
  if (!tail) return { kind: 'eof-append' };
  const m = tail.match(/^FRONTEGG-OP:\s*([\w-]+)(.*)$/);
  if (!m) return { kind: 'eof-append' };
  const op = m[1]!;
  const argsRaw = (m[2] || '').trim();
  // Split on the first `=`; everything after the `<key>=` is the value.
  // Marker text can contain spaces and `<>` so we don't tokenize further.
  const argMatch = argsRaw.match(/^(\w[\w-]*)=(.*)$/);
  const argKey = argMatch?.[1];
  const argVal = argMatch?.[2];
  switch (op) {
    case 'insert-before-marker':
      if (argKey === 'marker' && argVal) {
        return { kind: 'insert-before-marker', marker: argVal };
      }
      break;
    case 'swiftui-wrap-windowgroup':
      return { kind: 'swiftui-wrap-windowgroup' };
    case 'kotlin-insert-in-method':
      if (argKey === 'method' && argVal) {
        return { kind: 'kotlin-insert-in-method', method: argVal };
      }
      break;
  }
  return { kind: 'eof-append' };
}

export async function applyDiff(opts: ApplyDiffOptions): Promise<ApplyResult> {
  const { rootPath, diff, dryRun = false, allowDuplicate = false } = opts;
  const lines = diff.split(/\r?\n/);

  // Locate the --- and +++ headers.
  const oldHeaderIdx = lines.findIndex((l) => l.startsWith('--- '));
  const newHeaderIdx = lines.findIndex((l) => l.startsWith('+++ '));
  if (oldHeaderIdx < 0 || newHeaderIdx < 0) {
    throw new Error('apply_diff: missing --- / +++ headers in diff');
  }
  const oldPath = lines[oldHeaderIdx]!.slice(4).trim();
  const newPath = lines[newHeaderIdx]!.slice(4).trim();

  // Locate the @@ hunk header so we can read the FRONTEGG-OP directive.
  const hunkHeaderIdx = lines.findIndex((l, i) => i > newHeaderIdx && l.startsWith('@@'));
  const op: PatchOp =
    hunkHeaderIdx >= 0 ? parseOp(lines[hunkHeaderIdx]!) : { kind: 'eof-append' };

  // Collect addition lines, reject deletions.
  const hunkBody = lines.slice(newHeaderIdx + 1);
  const additions: string[] = [];
  let inHunk = false;
  for (const line of hunkBody) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('---') || line.startsWith('+++')) break;
    if (line.startsWith('-')) {
      throw new Error(
        'apply_diff: diff contains deletions; only append/new-file patches are supported here'
      );
    }
    if (line.startsWith('+')) {
      // strip the leading +; the diff util sometimes emits a bare '+' for empty lines
      additions.push(line.length === 1 ? '' : line.slice(1));
    }
    // Ignore context lines (we don't emit them, but be lenient)
  }

  if (additions.length === 0 && op.kind !== 'swiftui-wrap-windowgroup') {
    return { status: 'skipped', filePath: newPath, reason: 'no addition lines in diff' };
  }

  if (oldPath === '/dev/null') {
    // New file path
    const target = path.resolve(rootPath, newPath);
    if (dryRun) {
      return { status: 'created', filePath: target };
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    // If file exists already, refuse rather than clobber.
    const exists = await fs.access(target).then(() => true).catch(() => false);
    if (exists) {
      return {
        status: 'skipped',
        filePath: target,
        reason: 'target file already exists; refusing to overwrite',
      };
    }
    await fs.writeFile(target, additions.join('\n') + '\n', 'utf8');
    return { status: 'created', filePath: target };
  }

  // Modify path
  const target = path.resolve(rootPath, oldPath);
  const exists = await fs.access(target).then(() => true).catch(() => false);
  if (!exists) {
    return {
      status: 'skipped',
      filePath: target,
      reason: 'target file does not exist; cannot modify',
    };
  }
  const original = await fs.readFile(target, 'utf8');

  // Idempotency: if every meaningful addition line is already present in
  // the file (Frontegg-specific anchor — the relevant SDK call/import is
  // already wired), treat as a no-op. Falls back to a block-level signature
  // check for the pure eof-append case.
  if (!allowDuplicate) {
    const idempotentReason = detectAlreadyApplied(op, original, additions);
    if (idempotentReason) {
      return {
        status: 'skipped',
        filePath: target,
        reason: idempotentReason,
      };
    }
  }

  if (dryRun) {
    return { status: 'appended', filePath: target };
  }

  let updated: string;
  switch (op.kind) {
    case 'insert-before-marker':
      updated = applyInsertBeforeMarker(target, original, additions, op.marker);
      break;
    case 'swiftui-wrap-windowgroup':
      updated = applySwiftUIWrap(target, original);
      break;
    case 'kotlin-insert-in-method':
      updated = applyKotlinInsertInMethod(target, original, additions, op.method);
      break;
    case 'eof-append':
    default:
      updated = applyEofAppend(target, original, additions);
      break;
  }

  if (updated === original) {
    return {
      status: 'skipped',
      filePath: target,
      reason: 'no-op: file already contains the target content',
    };
  }

  // Write a .bak before mutating
  const backupPath = target + '.bak';
  await fs.writeFile(backupPath, original, 'utf8');
  await fs.writeFile(target, updated, 'utf8');
  return { status: 'appended', filePath: target, backupPath };
}

/**
 * Returns a human-readable reason if the patch is already applied, else null.
 * Different ops have different "already done" signatures:
 *   - swiftui-wrap-windowgroup: the file already contains `FronteggWrapper`.
 *   - kotlin-insert-in-method: the file already contains `FronteggApp.init`.
 *   - insert-before-marker / eof-append: the entire addition block is
 *     already present verbatim.
 */
function detectAlreadyApplied(
  op: PatchOp,
  original: string,
  additions: string[]
): string | null {
  if (op.kind === 'swiftui-wrap-windowgroup') {
    if (/FronteggWrapper\s*[({]/.test(original)) {
      return 'FronteggWrapper already present in file';
    }
    return null;
  }
  if (op.kind === 'kotlin-insert-in-method') {
    if (/FronteggApp\s*\.\s*init\s*\(/.test(original)) {
      return 'FronteggApp.init already present in file';
    }
    return null;
  }
  // Block-level signature for the append-style ops. Same logic as the
  // pre-existing applier: normalize whitespace, check the full non-blank
  // block exists verbatim.
  const normalize = (s: string) => s.replace(/[^\S\n]+/g, ' ').replace(/\r\n/g, '\n').trim();
  const blockSignature = normalize(
    additions.filter((a) => a.trim().length > 0).join('\n')
  );
  if (blockSignature.length > 0 && normalize(original).includes(blockSignature)) {
    return 'addition block already present in target';
  }
  return null;
}

/**
 * Insert addition lines at the structurally-correct location for the file
 * type. For XML-like files (AndroidManifest.xml, Info.plist) a naive append
 * after EOF lands *outside* the root element, producing invalid markup. For
 * those we insert before the closing root tag instead. For everything else
 * (gradle, Podfile, pubspec, package.json fragments, .env, etc.) we fall back
 * to a simple EOF append.
 */
function applyEofAppend(target: string, original: string, additions: string[]): string {
  const block = additions.join('\n') + '\n';
  const lower = target.toLowerCase();

  // Android manifest: insert before </application> when present, otherwise
  // before </manifest>. Preserves XML validity and lands intent-filters
  // inside <application> where the manifest merger expects them.
  if (lower.endsWith('androidmanifest.xml')) {
    for (const closing of ['</application>', '</manifest>']) {
      const idx = original.lastIndexOf(closing);
      if (idx !== -1) {
        return original.slice(0, idx) + block + original.slice(idx);
      }
    }
  }

  // iOS Info.plist / *.entitlements / Frontegg.plist: insert before the last
  // </dict> which closes the top-level dict. Keeps keys inside the plist's
  // root dictionary instead of after </plist>.
  if (
    lower.endsWith('info.plist') ||
    lower.endsWith('.entitlements') ||
    lower.endsWith('frontegg.plist')
  ) {
    const idx = original.lastIndexOf('</dict>');
    if (idx !== -1) {
      return original.slice(0, idx) + block + original.slice(idx);
    }
  }

  // Default: EOF append with a leading newline if the file didn't end in one.
  const newline = original.endsWith('\n') ? '' : '\n';
  return original + newline + block;
}

/**
 * Insert the addition block immediately before the first occurrence of
 * `marker` in `original`. If `marker` is not present, fall back to the
 * structurally-aware EOF append so the patch still produces a valid file.
 */
function applyInsertBeforeMarker(
  target: string,
  original: string,
  additions: string[],
  marker: string
): string {
  const idx = original.indexOf(marker);
  if (idx < 0) {
    return applyEofAppend(target, original, additions);
  }
  // Preserve the indentation of the marker line so inserted lines align.
  const lineStart = original.lastIndexOf('\n', idx - 1) + 1;
  const indent = original.slice(lineStart, idx).match(/^[ \t]*/)?.[0] ?? '';
  const block = additions.map((l) => (l.length > 0 ? indent + l : '')).join('\n');
  return original.slice(0, lineStart) + block + '\n' + original.slice(lineStart);
}

/**
 * Wrap the body of the SwiftUI `@main App`'s `WindowGroup { ... }` with a
 * `FronteggWrapper { ... }`, and add `import FronteggSwift` to the import
 * region if missing. Returns the original text unchanged if the file does
 * not match the SwiftUI App pattern.
 *
 * Canonical reference:
 *   https://github.com/frontegg/frontegg-ios-swift/blob/master/
 *     demo-application-id/demo-application-id/demo_application_idApp.swift
 */
function applySwiftUIWrap(_target: string, original: string): string {
  let updated = original;

  // 1. Add `import FronteggSwift` immediately after the last `import` line
  //    in the import block (typically right after `import SwiftUI`).
  if (!/\bimport\s+FronteggSwift\b/.test(updated)) {
    const importRegex = /^import\s+\S+.*$/gm;
    let lastImportEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(updated)) !== null) {
      lastImportEnd = m.index + m[0].length;
    }
    if (lastImportEnd >= 0) {
      updated =
        updated.slice(0, lastImportEnd) +
        '\nimport FronteggSwift' +
        updated.slice(lastImportEnd);
    } else {
      updated = 'import FronteggSwift\n' + updated;
    }
  }

  // 2. Find the `WindowGroup { ... }` body inside the App and wrap with
  //    `FronteggWrapper { ... }`.
  //    We expect a literal `WindowGroup {` followed by the inner expression
  //    and a matching closing brace. Scan brace depth manually because the
  //    body can contain nested closures.
  const wgIdx = updated.indexOf('WindowGroup');
  if (wgIdx < 0) return updated; // not SwiftUI shape — leave imports change in place
  const openIdx = updated.indexOf('{', wgIdx);
  if (openIdx < 0) return updated;
  // Find matching close brace.
  let depth = 1;
  let i = openIdx + 1;
  let closeIdx = -1;
  while (i < updated.length) {
    const ch = updated[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
    i++;
  }
  if (closeIdx < 0) return updated;

  // Inner content (between { and }).
  const inner = updated.slice(openIdx + 1, closeIdx);
  // Compute indentation: use the WindowGroup line's leading whitespace as
  // the parent indent, then add 4 spaces for the FronteggWrapper-and-body.
  const wgLineStart = updated.lastIndexOf('\n', wgIdx - 1) + 1;
  const wgIndent = updated.slice(wgLineStart, wgIdx).match(/^[ \t]*/)?.[0] ?? '';
  const childIndent = wgIndent + '    ';
  // Trim leading/trailing whitespace-newlines so we control the spacing.
  const innerTrimmed = inner.replace(/^\s*\n/, '').replace(/\s*$/, '');
  // Re-indent every non-empty inner line by an additional 4 spaces.
  const reindented = innerTrimmed
    .split('\n')
    .map((l) => (l.trim().length === 0 ? '' : '    ' + l))
    .join('\n');
  // Use the closing-brace's existing indentation so the rebuilt block aligns.
  const closeLineStart = updated.lastIndexOf('\n', closeIdx - 1) + 1;
  const closeIndent = updated.slice(closeLineStart, closeIdx).match(/^[ \t]*/)?.[0] ?? '';
  const finalWrapped =
    '\n' +
    childIndent +
    'FronteggWrapper {\n' +
    reindented +
    '\n' +
    childIndent +
    '}\n' +
    closeIndent;
  updated = updated.slice(0, openIdx + 1) + finalWrapped + updated.slice(closeIdx);
  return updated;
}

/**
 * Insert the addition block at the end of the named method's body (just
 * before its closing `}`). Lines starting with `import ` in the addition
 * list are routed to the file's import region instead.
 */
function applyKotlinInsertInMethod(
  _target: string,
  original: string,
  additions: string[],
  method: string
): string {
  let updated = original;

  // Split additions into imports and body insertions.
  const imports: string[] = [];
  const body: string[] = [];
  for (const a of additions) {
    if (/^\s*import\s+\S+/.test(a)) {
      imports.push(a.trim());
    } else {
      body.push(a);
    }
  }

  // Add imports below the last existing `import ...` line.
  for (const imp of imports) {
    if (updated.includes(imp)) continue;
    const importRegex = /^import\s+\S+.*$/gm;
    let lastImportEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(updated)) !== null) {
      lastImportEnd = m.index + m[0].length;
    }
    if (lastImportEnd >= 0) {
      updated = updated.slice(0, lastImportEnd) + '\n' + imp + updated.slice(lastImportEnd);
    } else {
      updated = imp + '\n' + updated;
    }
  }

  // Find the method body. We accept multi-line declarations and an opening
  // `{` that may be on the same line or the next.
  const declRegex = new RegExp(`\\bfun\\s+${method}\\s*\\([^)]*\\)\\s*[^\\n{]*\\{`);
  const declMatch = declRegex.exec(updated);
  if (!declMatch) return updated;
  const openIdx = declMatch.index + declMatch[0].length - 1; // position of `{`
  let depth = 1;
  let i = openIdx + 1;
  let closeIdx = -1;
  while (i < updated.length) {
    const ch = updated[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
    i++;
  }
  if (closeIdx < 0) return updated;

  // Determine indentation from the line containing `}`.
  const closeLineStart = updated.lastIndexOf('\n', closeIdx - 1) + 1;
  const closeIndent = updated.slice(closeLineStart, closeIdx).match(/^[ \t]*/)?.[0] ?? '';
  const childIndent = closeIndent + '    ';
  // Preserve relative indentation between body lines: find the smallest
  // existing leading-whitespace among non-empty body lines and treat that
  // as the new column 0, then prepend `childIndent` to every line.
  const nonEmpty = body.filter((l) => l.trim().length > 0);
  const minLeading =
    nonEmpty.length > 0
      ? Math.min(
          ...nonEmpty.map((l) => l.match(/^[ \t]*/)?.[0].length ?? 0)
        )
      : 0;
  const indented = body
    .map((l) =>
      l.trim().length === 0 ? '' : childIndent + l.slice(minLeading)
    )
    .join('\n');

  // Insert just before the line that holds the closing brace, preserving
  // the trailing newline before `}`.
  // Strategy: place the block on its own line(s) right before `closeLineStart`.
  const before = updated.slice(0, closeLineStart);
  const after = updated.slice(closeLineStart);
  // Ensure exactly one blank line of separation after existing body content.
  const sep = before.endsWith('\n\n') || before.endsWith('\n') ? '' : '\n';
  return before + sep + indented + '\n' + after;
}
