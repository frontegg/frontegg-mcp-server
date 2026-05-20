import { defineConfig } from "vitest/config";

// Vitest runs the upstream platform-surface tests (subtree-merged from the
// pre-merge frontegg-mcp-server). These live at tests/platform/ to keep them
// physically separate from the jest-driven mobile/audit suite at tests/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/platform/**/*.test.ts"],
    coverage: {
      include: ["src/platform/**/*.ts"],
      exclude: ["src/platform/**/*.test.ts"],
    },
  },
});
