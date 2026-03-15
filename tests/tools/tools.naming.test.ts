/**
 * Tool naming convention tests.
 *
 * All MCP tool names MUST use kebab-case (e.g. "get-roles", not "get_roles").
 * This test reads every *.tool.ts source file and extracts the first string
 * argument passed to server.tool(...), then asserts it matches /^[a-z0-9-]+$/.
 *
 * This acts as a regression guard — it would have caught the 11 snake_case
 * tool names that existed in the vendor-integrations, frontegg-integrations,
 * and applications directories before they were fixed.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const TOOLS_DIR = resolve(__dirname, "../../src/tools");

function findToolFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findToolFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".tool.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extract the tool name string from a call like:
 *   server.tool("tool-name", ...)
 *   server.tool('tool-name', ...)
 */
function extractToolName(source: string): string | null {
  const match = source.match(/server\.tool\(\s*["']([^"']+)["']/);
  return match ? match[1] : null;
}

describe("tool naming convention", () => {
  const toolFiles = findToolFiles(TOOLS_DIR).filter(
    // exclude test files and index files
    (f) => !f.includes(".test.") && !f.endsWith("index.ts")
  );

  it("finds at least 40 tool files", () => {
    // Sanity check: ensure glob is working and we're testing all tools
    expect(toolFiles.length).toBeGreaterThanOrEqual(40);
  });

  toolFiles.forEach((filePath) => {
    const relativePath = filePath.replace(TOOLS_DIR + "/", "");
    it(`${relativePath}: tool name uses kebab-case`, () => {
      const source = readFileSync(filePath, "utf-8");
      const toolName = extractToolName(source);

      expect(toolName, `Could not find tool name in ${relativePath}`).not.toBeNull();
      expect(
        toolName,
        `Tool name "${toolName}" in ${relativePath} must use kebab-case (no underscores)`
      ).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
  });
});
