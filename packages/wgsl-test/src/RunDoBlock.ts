import type { LinkParams, WeslAST } from "wesl";
import { withErrorScopes } from "wesl-gpu";
import {
  annotatedResourcesPlugin,
  classifyEntryPoints,
  findAnnotatedResources,
} from "wesl-reflect";
import { decodeReadbacks } from "./BufferDecode.ts";
import {
  compileShader,
  resolveShaderContext,
  type ShaderContext,
} from "./CompileShader.ts";
import { runDoInterpreter } from "./DoInterpreter.ts";
import { setupTestBindings } from "./TestResourceSetup.ts";

export interface RunDoBlockParams {
  device: GPUDevice;
  ast: WeslAST;
  shaderSrc: string;
  blockName: string;
  shaderContext?: ShaderContext;
  projectDir?: string;
  useSourceShaders?: boolean;
  conditions?: LinkParams["conditions"];
  constants?: LinkParams["constants"];
  /** Override recursion-depth limit (default 256). */
  maxDepth?: number;
  /** Override per-loop iteration limit (default 1,000,000). */
  maxIterations?: number;
}

interface ReadbackPair {
  varName: string;
  src: GPUBuffer;
  dst: GPUBuffer;
}

/** Execute a `do` block, dispatching its GPU work in a single command submit.
 *  Returns decoded @buffer readbacks keyed by var name. */
export async function runDoBlock(
  p: RunDoBlockParams,
): Promise<Record<string, number[]>> {
  return withErrorScopes(p.device, () => runDoBlockInner(p));
}

async function runDoBlockInner(
  p: RunDoBlockParams,
): Promise<Record<string, number[]>> {
  const { device, ast, shaderSrc, blockName } = p;
  const resources = findAnnotatedResources(ast);
  const shaderContext =
    p.shaderContext ??
    (await resolveShaderContext({
      src: shaderSrc,
      projectDir: p.projectDir,
      useSourceShaders: p.useSourceShaders,
      virtualLibNames: [],
    }));

  // bindings live at @group(0) @binding(0..N-1); no TestResult struct in front.
  const startBinding = 0;
  const module = await compileShader({
    device,
    src: shaderSrc,
    shaderContext,
    conditions: p.conditions,
    constants: p.constants,
    plugins: [annotatedResourcesPlugin(resources, startBinding)],
  });

  const bindings = await setupTestBindings(device, resources, startBinding);
  const { bindGroup, pipelineLayout, buffers } = bindings;
  const pipelines = buildComputePipelines(device, ast, module, pipelineLayout);

  const encoder = device.createCommandEncoder({ label: `do-${blockName}` });
  runDoInterpreter({
    ast,
    blockName,
    device,
    encoder,
    bindGroup,
    pipelines,
    maxDepth: p.maxDepth,
    maxIterations: p.maxIterations,
  });

  const readbackPlan = planReadbacks(device, buffers);
  for (const { src, dst } of readbackPlan) {
    encoder.copyBufferToBuffer(src, 0, dst, 0, src.size);
  }
  device.queue.submit([encoder.finish()]);

  return decodeReadbacks(ast, await mapReadbacks(readbackPlan));
}

/** Build one compute pipeline per `@compute` fn in the module, sharing layout. */
function buildComputePipelines(
  device: GPUDevice,
  ast: WeslAST,
  module: GPUShaderModule,
  layout: GPUPipelineLayout,
): Map<string, GPUComputePipeline> {
  const out = new Map<string, GPUComputePipeline>();
  for (const ep of classifyEntryPoints(ast)) {
    if (ep.stage !== "compute") continue;
    const compute = { module, entryPoint: ep.fnName };
    out.set(ep.fnName, device.createComputePipeline({ layout, compute }));
  }
  return out;
}

/** Allocate a MAP_READ staging buffer for each read_write @buffer. */
function planReadbacks(
  device: GPUDevice,
  buffers: Map<string, GPUBuffer>,
): ReadbackPair[] {
  const usage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
  return [...buffers].map(([varName, src]) => {
    const label = `do-readback-${varName}`;
    const dst = device.createBuffer({ label, size: src.size, usage });
    return { varName, src, dst };
  });
}

/** Map each staging buffer to an ArrayBuffer keyed by var name, then free the copy. */
async function mapReadbacks(
  plan: ReadbackPair[],
): Promise<Map<string, ArrayBuffer>> {
  const readbacks = new Map<string, ArrayBuffer>();
  for (const { varName, dst } of plan) {
    await dst.mapAsync(GPUMapMode.READ);
    readbacks.set(varName, dst.getMappedRange().slice(0));
    dst.unmap();
    dst.destroy();
  }
  return readbacks;
}
