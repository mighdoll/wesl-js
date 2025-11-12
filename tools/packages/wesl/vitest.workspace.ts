/**
 * Vitest workspace configuration for running tests with both V1 and V2 parsers
 *
 * Usage:
 *   pnpm --filter wesl test --config=vitest.workspace.ts
 *
 * This will run all tests twice in parallel:
 * - Once with V1 parser (default)
 * - Once with V2 parser (experimental)
 *
 * Results will be tagged with [v1] and [v2] prefixes
 */

import { defineWorkspace } from "vitest/config";
import { baseViteConfig } from "./base.vite.config.ts";

export default defineWorkspace([
  // V1 Parser Tests (default)
  {
    extends: "./vite.config.ts",
    test: {
      name: "v1",
      setupFiles: ["./src/test/TestSetupV1.ts"],
      include: ["src/test/**/*.test.ts"],
    },
  },

  // V2 Parser Tests (experimental)
  {
    extends: "./vite.config.ts",
    test: {
      name: "v2",
      setupFiles: ["./src/test/TestSetupV2.ts"],
      include: ["src/test/**/*.test.ts"],
      // Exclude parity tests since they explicitly test both parsers
      exclude: ["**/ParserV2Parity.test.ts"],
    },
  },
]);
