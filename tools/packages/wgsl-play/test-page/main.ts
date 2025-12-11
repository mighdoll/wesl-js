import { defaults, resetConfig } from "../src/index.ts";
import type { WgslPlay } from "../src/WgslPlay.ts";

// Basic player controls
const player1 = document.querySelector<WgslPlay>("#player1")!;
document.querySelector("#play1")!.addEventListener("click", () => player1.play());
document.querySelector("#pause1")!.addEventListener("click", () => player1.pause());

// Dev mode test
const player2 = document.querySelector<WgslPlay>("#player2")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#mode-select")!;
const status = document.querySelector<HTMLPreElement>("#status")!;

// Test shader that imports from random_wgsl
const testShader = `
import random_wgsl::pcg_2u_3f;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy;
  let seed = vec2u(u32(uv.x), u32(uv.y));
  let color = pcg_2u_3f(seed);
  return vec4f(color, 1.0);
}
`;

document.querySelector("#load-dev")!.addEventListener("click", async () => {
  const mode = modeSelect.value;
  status.textContent = `Status: Loading with mode="${mode}"...`;

  try {
    resetConfig();

    // Vite's @fs prefix allows serving files from outside project root
    // For dev testing, we use the absolute path to packages directory
    // In production, this would be configured differently (npm or explicit URL)
    const packageBase = "/@fs/Users/lee/wesl/worktrees/play-dev-mode/tools/packages";

    if (mode === "npm") {
      // Default: fetch from npm registry
      defaults({ packageBase: "npm", mode: "bundle" });
    } else if (mode === "bundle") {
      // Dev mode: fetch bundles from local server
      defaults({ packageBase, mode: "bundle" });
    } else if (mode === "source") {
      // Dev mode: fetch source files from local server
      defaults({ packageBase, mode: "source" });
    }

    const configInfo = mode === "npm" ? "npm registry" : `packageBase="${packageBase}", mode="${mode}"`;
    status.textContent = `Status: Config set (${configInfo}), compiling shader...`;

    player2.source = testShader;

    // Wait a bit for compilation
    await new Promise(r => setTimeout(r, 2000));

    if (player2.hasError) {
      status.textContent = `Status: Error - ${player2.errorMessage}`;
    } else {
      status.textContent = `Status: Success! Mode="${mode}"`;
    }
  } catch (error) {
    status.textContent = `Status: Error - ${error}`;
    console.error(error);
  }
});

// Expose for console debugging
Object.assign(window, { defaults, resetConfig, player2 });
