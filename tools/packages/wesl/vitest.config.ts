/// <reference types="vitest/config" />
import { defineConfig } from "vite";

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
  "**/LinkerV2.test.ts",
  "**/ScopeWESLV2.test.ts",
  "**/BindWESLV2.test.ts",
  "**/CompareV1V2.test.ts",
  "**/DebugImportBinding.test.ts",
  "**/ParseContext.test.ts",
];

// V1-specific tests that validate V1 AST structure (should not run in V2 mode)
const v1OnlyTests = [
  "**/ScopeWESL.test.ts",
  "**/BindWESL.test.ts",
  "**/ParseWESL.test.ts", // TODO: Update snapshots when V2 is feature-complete
];

const baseExcludes = ["**/node_modules/**", "**/dist/**"];

type VitestConfig = ReturnType<typeof defineConfig> extends infer R ? R : never;
let config: VitestConfig;
if (useV1Only) {
  // V1 only mode - exclude V2-specific tests
  config = {
    test: {
      setupFiles: "./src/test/TestSetupV1.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: [...baseExcludes, ...v2OnlyTests],
    },
  };
} else if (useV2Only) {
  // V2 only mode - exclude V1-specific tests
  config = {
    test: {
      setupFiles: "./src/test/TestSetupV2.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: [...baseExcludes, ...v1OnlyTests],
    },
  };
} else {
  // Default: dual parser mode - run tests with both V1 and V2 sequentially
  // (sequential to avoid race conditions with shared weslParserConfig)
  config = {
    test: {
      sequence: {
        concurrent: false, // Run projects sequentially to avoid config race
      },
      projects: [
        {
          test: {
            name: "v1",
            setupFiles: ["./src/test/TestSetupV1.ts"],
            include: ["src/test/**/*.test.ts"],
            exclude: [...baseExcludes, ...v2OnlyTests],
          },
        },
        {
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
