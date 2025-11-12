/// <reference types="vitest/config" />
import { defineConfig, mergeConfig } from "vite";
import { baseViteConfig } from "./base.vite.config.ts";

// Check if running with dual parser mode via environment variable
const useDualParser = process.env.DUAL_PARSER === "true";

const config = useDualParser
  ? // Dual parser mode: run tests with both V1 and V2 in parallel
    mergeConfig(baseViteConfig(), {
      test: {
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
    })
  : // Default: single project with V1 parser
    mergeConfig(baseViteConfig(), {
      test: {
        setupFiles: "./src/test/TestSetup.ts",
      },
    });

export default defineConfig(config);
