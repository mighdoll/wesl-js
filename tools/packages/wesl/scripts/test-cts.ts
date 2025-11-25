#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const weslDir = path.dirname(import.meta.dirname);
const ctsDir = path.resolve(weslDir, "../../../cts");

if (!existsSync(ctsDir)) {
  console.error(`CTS directory not found: ${ctsDir}`);
  process.exit(1);
}

function run(cmd: string, cwd: string, ignoreExit = false): void {
  console.log(`\n> ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", cwd });
  } catch (e) {
    if (!ignoreExit) throw e;
  }
}

console.log("Building wesl...");
run("pnpm build", weslDir);

console.log("\nRunning CTS baseline tests...");
run(
  `tools/run_node --gpu-provider ${ctsDir}/transpiler/gpu_provider.ts ` +
    `--print-json --quiet 'webgpu:shader,validation,parse,*' > /tmp/baseline-cts.json`,
  ctsDir,
  true,
);

console.log("\nRunning CTS tests with wesl transpiler...");
run(
  `tools/run_node --gpu-provider ${ctsDir}/transpiler/gpu_provider.ts ` +
    `--shader-transpiler ${ctsDir}/transpiler/wesl/wesl_transpiler.ts ` +
    `--print-json --quiet 'webgpu:shader,validation,parse,*' > /tmp/transpiled-cts.json`,
  ctsDir,
  true,
);

console.log("\nComparing results...");
run(
  `transpiler/tools/compare_results.ts /tmp/baseline-cts.json /tmp/transpiled-cts.json`,
  ctsDir,
  true,
);
