/**
 * Lightweight logger shim for upstream platform tools.
 *
 * Imported from frontegg/frontegg-mcp-server, where the original used `pino`.
 * We drop the pino dependency here in favor of plain stderr writes so the
 * upstream tools share the rest of the MCP server's runtime model (ESM,
 * no extra deps, stderr-only logging to keep stdout reserved for the JSON-RPC
 * MCP transport).
 *
 * The exported `logger` object preserves the upstream surface (log/debug/
 * error/info/warn) so no upstream tool file needs to change.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configured = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
const minRank = LEVEL_RANK[configured] ?? LEVEL_RANK.info;

function emit(level: LogLevel, message: string, details: unknown[]): void {
  if (LEVEL_RANK[level] < minRank) return;
  const payload =
    details.length > 0
      ? `${message} ${JSON.stringify(details)}`
      : message;
  // stderr only — stdout is the MCP JSON-RPC transport
  process.stderr.write(`[${level}] ${payload}\n`);
}

export const logger = {
  log: (message: string, ...details: unknown[]) => emit("info", message, details),
  debug: (message: string, ...details: unknown[]) => emit("debug", message, details),
  info: (message: string, ...details: unknown[]) => emit("info", message, details),
  warn: (message: string, ...details: unknown[]) => emit("warn", message, details),
  error: (error: string | Error, ...details: unknown[]) => {
    const message = error instanceof Error ? error.message : String(error);
    emit("error", message, details);
  },
};
