/**
 * Cross-runtime resolver for this MCP server's installed root directory.
 *
 * The production runtime is ESM (`"type": "module"` in package.json), where
 * `import.meta.url` is the source of truth. Jest's default ts-jest transform
 * outputs CJS, where `import.meta` is a syntax error — the parser rejects
 * the source before any logic runs. We hide the `import.meta.url` access
 * behind `new Function()` so the TS compiler doesn't emit it as a literal
 * `import.meta.url` reference, and so the CJS parser doesn't choke.
 *
 * Both `logger.ts` and `config-manager.ts` previously used different
 * approaches for the same problem (one used `new Function`, the other used
 * `import.meta.url` directly). This module is the single source of truth
 * so they stay consistent.
 *
 * `new Function` is eval-equivalent and would be rejected under a strict
 * Content Security Policy. That's an acceptable trade-off here — this code
 * only runs under Node.js (no browser, no CSP). If you ever need to ship
 * this under CSP, swap this for a build-time path injection (e.g.
 * `tsc --moduleResolution NodeNext` + a transform plugin that rewrites
 * `import.meta.url` at compile time).
 *
 * Returns `process.cwd()` as a fallback when neither path resolution works,
 * which keeps tests runnable in unusual environments.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

let cachedPackageRoot: string | undefined;

/**
 * Returns the absolute path of this package's installed root directory
 * (the directory containing `package.json`), regardless of which file
 * within `src/` calls it.
 */
export function getPackageRoot(): string {
  if (cachedPackageRoot !== undefined) return cachedPackageRoot;

  let resolved: string | undefined;
  try {
    // The `new Function` indirection hides `import.meta.url` from both
    // the TS compiler's type-check (no `import.meta` type required) and
    // the CJS parser when ts-jest transpiles to CommonJS for tests.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const getMetaUrl = new Function(
      "try { return import.meta.url; } catch { return undefined; }",
    );
    const url = getMetaUrl() as string | undefined;
    if (url) {
      // import.meta.url here points at src/utils/module-paths.ts (or its
      // compiled equivalent at dist/utils/module-paths.js). Package root
      // is two levels up from either location.
      resolved = resolve(dirname(fileURLToPath(url)), "..", "..");
    }
  } catch {
    /* fall through to cwd */
  }

  const result = resolved ?? process.cwd();
  cachedPackageRoot = result;
  return result;
}

/**
 * Convenience: absolute path to the `.env` file colocated with the MCP
 * server's source. Distinct from any `.env` in the user's project cwd —
 * we deliberately don't load that one because it would override the IDE's
 * MCP-config-provided credentials.
 */
export function getMcpEnvPath(): string {
  return resolve(getPackageRoot(), ".env");
}

/**
 * Convenience: absolute path to the `logs/` directory under the MCP
 * install root. Created on demand by the logger if it doesn't exist.
 */
export function getLogsDir(): string {
  return resolve(getPackageRoot(), "logs");
}
