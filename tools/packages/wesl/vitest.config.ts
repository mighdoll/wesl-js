/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Check if running with dual parser mode via environment variable
const useDualParser = process.env.DUAL_PARSER === "true";

let config;
if (useDualParser) {
  // Dual parser mode: run tests with both V1 and V2 sequentially
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
          },
        },
        {
          test: {
            name: "v2",
            setupFiles: ["./src/test/TestSetupV2.ts"],
            include: ["src/test/**/*.test.ts"],
            // Exclude parity tests since they explicitly test both parsers
            exclude: ["**/ParserV2Parity.test.ts"],
          },
        },
      ],
    },
  };
} else {
  // Default: single project with V1 parser
  config = {
    test: {
      setupFiles: "./src/test/TestSetup.ts",
    },
  };
}

export default defineConfig(config);
