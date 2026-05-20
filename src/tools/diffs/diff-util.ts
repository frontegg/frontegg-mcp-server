/** Shared helpers for producing minimal unified-diff blocks. */

export function appendDiff(filePath: string, lines: string[]): string {
  const added = '\n' + lines.join('\n') + '\n';
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@`,
    added
      .split('\n')
      .map((l) => (l ? `+${l}` : '+'))
      .join('\n'),
  ].join('\n');
}

export function newFileDiff(filePath: string, lines: string[]): string {
  const content = lines.join('\n') + '\n';
  return [
    `--- /dev/null`,
    `+++ ${filePath}`,
    `@@`,
    content
      .split('\n')
      .map((l) => (l ? `+${l}` : '+'))
      .join('\n'),
  ].join('\n');
}

/**
 * Insert-before-marker diff. The applier finds the first occurrence of
 * `marker` in the target file and splices the addition block immediately
 * before that line (preserving the marker line's indentation).
 */
export function insertBeforeMarkerDiff(
  filePath: string,
  marker: string,
  lines: string[]
): string {
  const added = lines.join('\n') + '\n';
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ FRONTEGG-OP: insert-before-marker marker=${marker}`,
    added
      .split('\n')
      .map((l) => (l ? `+${l}` : '+'))
      .join('\n'),
  ].join('\n');
}

/**
 * SwiftUI-aware patch: wraps the body of `WindowGroup { ... }` inside an
 * `@main App` with `FronteggWrapper { ... }`, and adds `import FronteggSwift`
 * to the imports if missing. The applier handles the structural transform;
 * no addition lines are required from the caller.
 */
export function swiftuiWrapWindowGroupDiff(filePath: string): string {
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ FRONTEGG-OP: swiftui-wrap-windowgroup`,
    // Sentinel addition line so legacy "no additions" guards don't drop
    // the diff. The applier ignores body for this op.
    `+// (managed by frontegg-mcp: SwiftUI wrap)`,
  ].join('\n');
}

/**
 * Insert a block at the end of a Kotlin method body (just before the
 * method's closing `}`). Lines starting with `import ` are routed to the
 * file's import region instead of the method body.
 */
export function kotlinInsertInMethodDiff(
  filePath: string,
  method: string,
  lines: string[]
): string {
  const added = lines.join('\n') + '\n';
  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ FRONTEGG-OP: kotlin-insert-in-method method=${method}`,
    added
      .split('\n')
      .map((l) => (l ? `+${l}` : '+'))
      .join('\n'),
  ].join('\n');
}
