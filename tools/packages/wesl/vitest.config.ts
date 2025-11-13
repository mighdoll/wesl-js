/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Check parser mode from environment variable
// - V1_ONLY=true: Run only V1 tests
// - V2_ONLY=true: Run only V2 tests
// - Default: Run both V1 and V2 tests
const useV1Only = process.env.V1_ONLY === "true";
const useV2Only = process.env.V2_ONLY === "true";

let config;
if (useV1Only) {
  // V1 only mode - exclude V2-specific tests
  config = {
    test: {
      setupFiles: "./src/test/TestSetupV1.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/ParserV2Parity.test.ts",
        "**/ImportCasesV2.test.ts",
        "**/LinkerV2.test.ts",
        "**/ScopeWESLV2.test.ts",
        "**/CompareV1V2.test.ts",
        "**/DebugImportBinding.test.ts",
        "**/ParseContext.test.ts",
      ],
    },
  };
} else if (useV2Only) {
  // V2 only mode
  config = {
    test: {
      setupFiles: "./src/test/TestSetupV2.ts",
      include: ["src/test/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
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
            exclude: [
              "**/node_modules/**",
              "**/dist/**",
              "**/ParserV2Parity.test.ts",
              "**/ImportCasesV2.test.ts",
              "**/LinkerV2.test.ts",
              "**/ScopeWESLV2.test.ts",
              "**/CompareV1V2.test.ts",
              "**/DebugImportBinding.test.ts",
              "**/ParseContext.test.ts",
            ],
          },
        },
        {
          test: {
            name: "v2",
            setupFiles: ["./src/test/TestSetupV2.ts"],
            include: ["src/test/**/*.test.ts"],
            // Exclude parity tests since they explicitly test both parsers
            exclude: [
              "**/node_modules/**",
              "**/dist/**",
              "**/ParserV2Parity.test.ts",
            ],
          },
        },
      ],
    },
  };
}

export default defineConfig(config);
