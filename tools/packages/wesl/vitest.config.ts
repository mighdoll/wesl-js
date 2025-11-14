/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { resolve } from "node:path";

// Check parser mode from environment variable
// - V1_ONLY=true: Run only V1 tests
// - V2_ONLY=true: Run only V2 tests
// - Default: Run both V1 and V2 tests
const useV1Only = process.env.V1_ONLY === "true";
const useV2Only = process.env.V2_ONLY === "true";

// V2-specific tests that should only run in V2 mode
const v2OnlyTests = [
  "**/ParserV2Parity.test.ts",
  "**/ImportCasesV2.test.ts",
  "**/ScopeWESLV2.test.ts",
  "**/CompareV1V2.test.ts",
  "**/DebugImportBinding.test.ts",
  "**/ParseContext.test.ts",
];

const baseExcludes = ["**/node_modules/**", "**/dist/**"];

const resolveConfig = {
  resolve: {
    alias: {
      "mini-parse": resolve(__dirname, "../mini-parse/src/index.ts"),
      "mini-parse/test-util": resolve(__dirname, "../mini-parse/src/test-util/index.ts"),
      "mini-parse/vitest-util": resolve(__dirname, "../mini-parse/src/vitest-util/index.ts"),
      "berry-pretty": resolve(__dirname, "src/test/berry-pretty-stub.ts"),
      "wesl-testsuite": resolve(__dirname, "../wesl-test/src/index.ts"),
      "wesl-tooling": resolve(__dirname, "../wesl-tooling/src/index.ts"),
    },
  },
};

let config;
if (useV1Only) {
  // V1 only mode - exclude V2-specific tests
  config = {
    ...resolveConfig,
    test: {
      setupFiles: "./src/test/TestSetupV1.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: [...baseExcludes, ...v2OnlyTests],
    },
  };
} else if (useV2Only) {
  // V2 only mode
  config = {
    ...resolveConfig,
    test: {
      setupFiles: "./src/test/TestSetupV2.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: baseExcludes,
    },
  };
} else {
  // Default: dual parser mode - run tests with both V1 and V2 sequentially
  // (sequential to avoid race conditions with shared weslParserConfig)
  config = {
    ...resolveConfig,
    test: {
      sequence: {
        concurrent: false, // Run projects sequentially to avoid config race
      },
      projects: [
        {
          ...resolveConfig,
          test: {
            name: "v1",
            setupFiles: ["./src/test/TestSetupV1.ts"],
            include: ["src/test/**/*.test.ts"],
            exclude: [...baseExcludes, ...v2OnlyTests],
          },
        },
        {
          ...resolveConfig,
          test: {
            name: "v2",
            setupFiles: ["./src/test/TestSetupV2.ts"],
            include: ["src/test/**/*.test.ts"],
            exclude: baseExcludes,
          },
        },
      ],
    },
  };
}

export default defineConfig(config);
