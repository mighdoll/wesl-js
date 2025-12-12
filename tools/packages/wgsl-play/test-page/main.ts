import type { WgslPlay } from "../src/WgslPlay.ts";

// Basic player controls
const player1 = document.querySelector<WgslPlay>("#player1")!;
document
  .querySelector("#play1")!
  .addEventListener("click", () => player1.play());
document
  .querySelector("#pause1")!
  .addEventListener("click", () => player1.pause());

// npm CDN test (external imports)
const player2 = document.querySelector<WgslPlay>("#player2")!;
const npmStatus = document.querySelector<HTMLPreElement>("#npm-status")!;

const npmShader = `
import random_wgsl::pcg_2u_3f;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy;
  let seed = vec2u(u32(uv.x), u32(uv.y));
  let color = pcg_2u_3f(seed);
  return vec4f(color, 1.0);
}
`;

document.querySelector("#load-npm")!.addEventListener("click", async () => {
  npmStatus.textContent = "Status: Loading from npm...";
  try {
    player2.source = npmShader;
    await new Promise(r => setTimeout(r, 2000));
    npmStatus.textContent = player2.hasError
      ? `Status: Error - ${player2.errorMessage}`
      : "Status: Success!";
  } catch (error) {
    npmStatus.textContent = `Status: Error - ${error}`;
  }
});

// shaderRoot test (internal imports)
const player3 = document.querySelector<WgslPlay>("#player3")!;
const internalStatus =
  document.querySelector<HTMLPreElement>("#internal-status")!;

const internalShader = `
import package::utils::gradient;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / 512.0;
  let color = gradient(uv);
  return vec4f(color, 1.0);
}
`;

document
  .querySelector("#load-internal")!
  .addEventListener("click", async () => {
    internalStatus.textContent = "Status: Loading from shaderRoot...";
    try {
      player3.source = internalShader;
      await new Promise(r => setTimeout(r, 1000));
      internalStatus.textContent = player3.hasError
        ? `Status: Error - ${player3.errorMessage}`
        : "Status: Success!";
    } catch (error) {
      internalStatus.textContent = `Status: Error - ${error}`;
    }
  });

// src attribute with shaderRoot test
const player4 = document.querySelector<WgslPlay>("#player4")!;
const srcStatus = document.querySelector<HTMLPreElement>("#src-status")!;

document.querySelector("#load-src")!.addEventListener("click", async () => {
  srcStatus.textContent = "Status: Loading from src...";
  try {
    player4.setAttribute("src", "/shaders/effects/main.wesl");
    await new Promise(r => setTimeout(r, 1500));
    srcStatus.textContent = player4.hasError
      ? `Status: Error - ${player4.errorMessage}`
      : "Status: Success!";
  } catch (error) {
    srcStatus.textContent = `Status: Error - ${error}`;
  }
});

// Expose for console debugging
Object.assign(window, { player1, player2, player3, player4 });
