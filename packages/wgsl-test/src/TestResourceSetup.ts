import {
  checkerboardTexture,
  colorBarsTexture,
  createBindResources,
  edgePatternTexture,
  gradientTexture,
  noiseTexture,
  radialGradientTexture,
  solidTexture,
  type TextureBinding,
} from "wesl-gpu";
import type { DiscoveredBuffer, DiscoveredResource } from "wesl-reflect";
import { lemurTexture } from "./ExampleImages.ts";

/** GPU resources created for annotated test vars. */
export interface TestResources {
  /** Bind group entries for annotated resources (binding 1, 2, ...). */
  entries: GPUBindGroupEntry[];
  /** Layout entries for annotated resources. */
  layoutEntries: GPUBindGroupLayoutEntry[];
  /** Read-write storage buffers, keyed by var name (re-zeroed between tests). */
  buffers: Map<string, GPUBuffer>;
}

export interface CreateTestResourcesOptions {
  /** f32 sentinel to pre-fill storage buffers, so unwritten slots are visible in failing tests. */
  prefill?: number;
}

/** Test bind group + pipeline layout for annotated resources. */
export interface TestBindings {
  bindGroup: GPUBindGroup;
  pipelineLayout: GPUPipelineLayout;
  /** Read-write storage buffers, keyed by var name. */
  buffers: Map<string, GPUBuffer>;
}

type TextureGenerator = (
  device: GPUDevice,
  params: number[],
) => GPUTexture | Promise<GPUTexture>;

const textureGenerators: Record<string, TextureGenerator> = {
  checkerboard: (dev, p) =>
    checkerboardTexture(dev, p[0] ?? 256, p[1] ?? 256, p[2]),
  gradient: (dev, p) => gradientTexture(dev, p[0] ?? 256, p[1] ?? 256),
  radial_gradient: (dev, p) => radialGradientTexture(dev, p[0] ?? 256),
  color_bars: (dev, p) => colorBarsTexture(dev, p[0] ?? 256),
  edge_pattern: (dev, p) => edgePatternTexture(dev, p[0] ?? 256),
  noise: (dev, p) => noiseTexture(dev, p[0] ?? 256),
  solid: (dev, p) =>
    solidTexture(dev, [p[0] ?? 1, p[1] ?? 1, p[2] ?? 1, p[3] ?? 1], 1, 1),
  lemur: (dev, p) => lemurTexture(dev, (p[0] === 256 ? 256 : 512) as 256 | 512),
};

/** Create GPU resources from discovered annotated vars for testing. */
export async function createTestResources(
  device: GPUDevice,
  resources: DiscoveredResource[],
  startBinding = 1,
  opts: CreateTestResourcesOptions = {},
): Promise<TestResources> {
  const out = await createBindResources({
    device,
    resources,
    startBinding,
    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    textureHandler: testTextureHandler,
    prefill: opts.prefill,
  });
  const buffers = collectReadWriteBuffers(resources, out.buffers);
  return { entries: out.entries, layoutEntries: out.layoutEntries, buffers };
}

/** Allocate test resources and build the matching bind group + pipeline layout. */
export async function setupTestBindings(
  device: GPUDevice,
  resources: DiscoveredResource[],
  startBinding: number,
  opts: CreateTestResourcesOptions = {},
): Promise<TestBindings> {
  const test = await createTestResources(device, resources, startBinding, opts);
  const layout = device.createBindGroupLayout({ entries: test.layoutEntries });
  const bindGroup = device.createBindGroup({ layout, entries: test.entries });
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout],
  });
  return { bindGroup, pipelineLayout, buffers: test.buffers };
}

/** Generate a test texture from the named source. */
async function testTextureHandler(
  device: GPUDevice,
  r: DiscoveredResource,
): Promise<TextureBinding> {
  if (r.kind === "texture") {
    throw new Error(
      `@texture(${r.source}) requires a host-provided image and is not supported in wgsl-test — use @test_texture(...) instead (var '${r.varName}')`,
    );
  }
  if (r.kind !== "test_texture") {
    throw new Error(`unexpected resource kind for test: ${r.kind}`);
  }
  const gen = textureGenerators[r.source];
  if (!gen) throw new Error(`Unknown test texture source: ${r.source}`);
  return { texture: await gen(device, r.params) };
}

/** Map each read_write @buffer var name to its GPU storage buffer.
 *  `allBuffers` is in buffer-declaration order, so index `i` over the buffer
 *  resources lines up with it. Keying by name frees consumers from that order. */
function collectReadWriteBuffers(
  resources: DiscoveredResource[],
  allBuffers: GPUBuffer[],
): Map<string, GPUBuffer> {
  const isBuffer = (r: DiscoveredResource): r is DiscoveredBuffer =>
    r.kind === "buffer";
  const pairs = resources
    .filter(isBuffer)
    .flatMap((r, i): [string, GPUBuffer][] =>
      r.access === "read_write" ? [[r.varName, allBuffers[i]]] : [],
    );
  return new Map(pairs);
}
