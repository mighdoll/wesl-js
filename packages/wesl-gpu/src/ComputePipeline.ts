import type { AnnotatedLayout } from "wesl-reflect";
import { withErrorScopes } from "./ErrorScopes.ts";
import type { WeslOptions } from "./FragmentParams.ts";
import { linkWeslModule } from "./LinkWeslModule.ts";

export type LinkComputeParams = WeslOptions & {
  device: GPUDevice;
  /** WESL/WGSL compute shader source. */
  computeSource: string;
};

export interface LinkComputeResult {
  module: GPUShaderModule;
  layout: AnnotatedLayout | null;
}

export interface RunComputeParams {
  device: GPUDevice;
  module: GPUShaderModule;
  entryPoint: string;
  bindGroup: GPUBindGroup;
  pipelineLayout: GPUPipelineLayout;
  /** `@buffer` storage buffers to read back, keyed by var name. */
  readBuffers: Map<string, GPUBuffer>;
  /** Workgroup dispatch count. Single number for X only, or [x, y, z]. Default 1. */
  dispatchWorkgroups?: number | [number, number, number];
}

export interface ComputeRunResult {
  /** ArrayBuffer copied from each `@buffer` storage buffer, keyed by var name. */
  readbacks: Map<string, ArrayBuffer>;
}

/** Parameters for {@link recordComputePass}: dispatch one compute pipeline
 *  into a caller-provided encoder. */
export interface RecordComputePassParams {
  encoder: GPUCommandEncoder;
  pipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  /** Dispatch dims. Single number = x only; tuple = [x, y, z]. Default 1. */
  dispatchWorkgroups?: number | [number, number, number];
}

/** Link a WESL/WGSL compute shader into a GPU shader module.
 *  Mirrors `linkFragmentShader` without the synthetic vertex prelude. */
export async function linkComputeShader(
  params: LinkComputeParams,
): Promise<LinkComputeResult> {
  const { computeSource } = params;
  return linkWeslModule({
    ...params,
    rootSource: computeSource,
    scanSource: computeSource,
  });
}

/** Dispatch a compute shader and read back named storage buffers.
 *  Defaults to a (1,1,1) dispatch; override via `dispatchWorkgroups`. */
export async function runCompute(
  p: RunComputeParams,
): Promise<ComputeRunResult> {
  return withErrorScopes(p.device, () => dispatchAndReadback(p));
}

/** Record one compute pass into the caller's encoder; the caller submits.
 *  Used by interpreters that need many passes in a single command buffer. */
export function recordComputePass(p: RecordComputePassParams): void {
  const dispatch = p.dispatchWorkgroups ?? 1;
  const pass = p.encoder.beginComputePass();
  pass.setPipeline(p.pipeline);
  pass.setBindGroup(0, p.bindGroup);
  if (typeof dispatch === "number") pass.dispatchWorkgroups(dispatch);
  else pass.dispatchWorkgroups(...dispatch);
  pass.end();
}

/** Clear each buffer to zeros so re-runs / re-tests see deterministic initial state. */
export function clearBuffers(
  device: GPUDevice,
  buffers: Iterable<GPUBuffer>,
): void {
  const list = [...buffers];
  if (list.length === 0) return;
  const encoder = device.createCommandEncoder({ label: "clearBuffers" });
  for (const buffer of list) encoder.clearBuffer(buffer);
  device.queue.submit([encoder.finish()]);
}

/** Build the pipeline, dispatch, copy each readBuffer to a MAP_READ staging
 *  buffer, and return the mapped contents. */
async function dispatchAndReadback(
  p: RunComputeParams,
): Promise<ComputeRunResult> {
  const { device, module, entryPoint, bindGroup, pipelineLayout } = p;
  const pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module, entryPoint },
  });

  const stagingBuffers = new Map<string, GPUBuffer>();
  for (const [name, src] of p.readBuffers) {
    stagingBuffers.set(name, createStagingBuffer(device, src.size, name));
  }

  const encoder = device.createCommandEncoder();
  recordComputePass({
    encoder,
    pipeline,
    bindGroup,
    dispatchWorkgroups: p.dispatchWorkgroups,
  });
  for (const [name, src] of p.readBuffers) {
    const dst = stagingBuffers.get(name)!;
    encoder.copyBufferToBuffer(src, 0, dst, 0, src.size);
  }
  device.queue.submit([encoder.finish()]);

  const readbacks = new Map<string, ArrayBuffer>();
  for (const [name, staging] of stagingBuffers) {
    await staging.mapAsync(GPUMapMode.READ);
    readbacks.set(name, staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
  }
  return { readbacks };
}

/** Allocate a MAP_READ + COPY_DST buffer for compute readback. */
function createStagingBuffer(
  device: GPUDevice,
  size: number,
  name: string,
): GPUBuffer {
  return device.createBuffer({
    label: `compute-readback-${name}`,
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
}
