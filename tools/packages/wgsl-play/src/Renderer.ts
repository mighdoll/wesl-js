import type { LinkParams, WeslBundle } from "wesl";
import { RecordResolver, requestWeslDevice } from "wesl";
import {
  linkAndCreatePipeline,
  linkFragmentShader,
  renderFrame,
  updateRenderUniforms,
} from "wesl-gpu";

/** WebGPU state */
export interface RenderState {
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  uniformBuffer: GPUBuffer;
  pipelineLayout: GPUPipelineLayout;
  bindGroup: GPUBindGroup;
  pipeline?: GPURenderPipeline;
}

/** Animation state */
export interface PlaybackState {
  isPlaying: boolean;
  startTime: number;
  pausedDuration: number;
}

/** Initialize WebGPU for a canvas element. */
export async function initWebGPU(
  canvas: HTMLCanvasElement,
): Promise<RenderState> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter not available");

  const device = await requestWeslDevice(adapter);
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("WebGPU context not available");

  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "opaque",
  });

  const uniformBuffer = device.createBuffer({
    size: 32, // vec2f + f32 + padding + vec2f
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Explicit layout for now. LATER will construct layout based on reflection
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }],
  });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  return {
    device,
    canvas,
    context,
    presentationFormat,
    uniformBuffer,
    pipelineLayout,
    bindGroup,
  };
}

export type LinkOptions = Pick<
  LinkParams,
  "packageName" | "conditions" | "constants"
> & {
  /** Library sources for source mode (alternative to bundles). */
  libSources?: Record<string, string>;
};

/** Compile WESL fragment shader and create render pipeline. */
export async function createPipeline(
  state: RenderState,
  fragmentSource: string,
  bundles: WeslBundle[],
  options?: LinkOptions,
): Promise<void> {
  const { libSources, conditions, constants, packageName } = options ?? {};

  if (libSources && Object.keys(libSources).length > 0) {
    // Source mode: use resolver with fetched sources
    const resolver = new RecordResolver(libSources);
    const module = await linkFragmentShader({
      device: state.device,
      fragmentSource,
      resolver,
      conditions,
      constants,
      packageName,
    });
    state.pipeline = createPipelineFromModule(state, module);
  } else {
    // Bundle mode: use pre-loaded bundles
    state.pipeline = await linkAndCreatePipeline({
      device: state.device,
      fragmentSource,
      bundles,
      format: state.presentationFormat,
      layout: state.pipelineLayout,
      conditions,
      constants,
      packageName,
    });
  }
}

/** Create render pipeline from a shader module. */
function createPipelineFromModule(
  state: RenderState,
  module: GPUShaderModule,
): GPURenderPipeline {
  return state.device.createRenderPipeline({
    layout: state.pipelineLayout,
    vertex: { module },
    fragment: { module, targets: [{ format: state.presentationFormat }] },
    primitive: { topology: "triangle-list" },
  });
}

/** Start the render loop. Returns a stop function. */
export function startRenderLoop(
  state: RenderState,
  playback: PlaybackState,
): () => void {
  let animationId: number;

  function render(): void {
    if (!state.pipeline) {
      animationId = requestAnimationFrame(render);
      return;
    }

    const time = calculateTime(playback);
    const resolution: [number, number] = [
      state.canvas.width,
      state.canvas.height,
    ];
    const mouse: [number, number] = [0.0, 0.0];

    updateRenderUniforms(
      state.uniformBuffer,
      state.device,
      resolution,
      time,
      mouse,
    );
    renderFrame({
      device: state.device,
      pipeline: state.pipeline,
      bindGroup: state.bindGroup,
      targetView: state.context.getCurrentTexture().createView(),
    });
    animationId = requestAnimationFrame(render);
  }

  animationId = requestAnimationFrame(render);

  return () => cancelAnimationFrame(animationId);
}

function calculateTime(playback: PlaybackState): number {
  const currentTime = playback.isPlaying
    ? performance.now()
    : playback.startTime + playback.pausedDuration;
  return (currentTime - playback.startTime) / 1000;
}
