/// <reference types="vitest/config" />
import { mergeConfig } from "vite";
import { baseViteConfig } from "./base.vite.config.ts";

// Default config: single project with V1 parser
// To enable dual parser testing, use: pnpm test --workspace=./vitest.workspace.ts
const merged = mergeConfig(baseViteConfig(), {
  test: {
    setupFiles: "./src/test/TestSetup.ts",
  },
});

export default merged;
