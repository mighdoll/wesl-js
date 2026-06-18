import { type LinkParams, parseSrcModule, type WeslAST } from "wesl";
import { runCompute } from "wesl-gpu";
import {
  annotatedResourcesPlugin,
  type DiscoveredResource,
  findAnnotatedResources,
} from "wesl-reflect";
import { decodeReadbacks } from "./BufferDecode.ts";
import { compileShader } from "./CompileShader.ts";
import { resolveShaderSource } from "./ShaderModuleLoader.ts";
import { setupTestBindings } from "./TestResourceSetup.ts";

export interface ComputeTestParams {
  /** WESL/WGSL source code for the compute shader to test.
   * Either src or moduleName must be provided, but not both. */
  src?: string;

  /** Name of shader module to load from filesystem.
   * Supports: bare name (sum.wgsl), path (algorithms/sum.wgsl), or module path (package::algorithms::sum).
   * Either src or moduleName must be provided, but not both. */
  moduleName?: string;

  /** Project directory for resolving shader dependencies.
   * Allows the shader to import from npm shader libraries.
   * Optional: defaults to searching upward from cwd for package.json or wesl.toml.
   * Typically use `import.meta.url`. */
  projectDir?: string;

  /** GPU device for running the tests. */
  device: GPUDevice;

  /** Flags for conditional compilation to test shader specialization. */
  conditions?: LinkParams["conditions"];

  /** Constants for shader compilation, injected via the `constants::` namespace. */
  constants?: LinkParams["constants"];

  /** Use source shaders from current package instead of built bundles.
   * Default: true for faster iteration during development. */
  useSourceShaders?: boolean;

  /** Number of workgroups to dispatch. Default: 1
   * Can be a single number or [x, y, z] for multi-dimensional dispatch. */
  dispatchWorkgroups?: number | [number, number, number];
}

/** Sentinel pre-fill for storage buffers; unwritten slots remain visible. */
const sentinel = -999.0;

/**
 * Compile and run a compute shader on the GPU for testing.
 *
 * Each `@buffer` declared in the shader becomes a bound storage buffer; values
 * written to read_write buffers are returned in the result, keyed by var name.
 * Unwritten slots show as -999 (f32 sentinel pre-fill).
 *
 * Shader libraries mentioned in the source are auto-resolved from node_modules.
 *
 * Example:
 * ```ts
 * const { results } = await testCompute({ device, src: `
 *   @buffer var<storage, read_write> results: array<u32, 2>;
 *   @compute @workgroup_size(1) fn main() { results[0] = 42u; results[1] = 7u; }
 * `});
 * ```
 *
 * @returns Record keyed by `@buffer` var name; values are decoded as the
 *   buffer's leaf scalar type (f32/i32/u32).
 */
export async function testCompute(
  params: ComputeTestParams,
): Promise<Record<string, number[]>> {
  const { device, src, moduleName, projectDir } = params;
  const { conditions, constants, useSourceShaders } = params;
  const dispatchWorkgroups = params.dispatchWorkgroups ?? 1;

  const shaderSrc = await resolveShaderSource(src, moduleName, projectDir);
  const { ast, resources } = parseAndValidate(shaderSrc);

  const startBinding = 0;
  const module = await compileShader({
    projectDir,
    device,
    src: shaderSrc,
    conditions,
    constants,
    useSourceShaders,
    plugins: [annotatedResourcesPlugin(resources, startBinding)],
  });

  const { bindGroup, pipelineLayout, buffers } = await setupTestBindings(
    device,
    resources,
    startBinding,
    { prefill: sentinel },
  );

  const { readbacks } = await runCompute({
    device,
    module,
    entryPoint: "main",
    bindGroup,
    pipelineLayout,
    readBuffers: buffers,
    dispatchWorkgroups,
  });

  return decodeReadbacks(ast, readbacks);
}

/** Parse the shader and extract annotated resources; throws if no @buffer. */
function parseAndValidate(shaderSrc: string): {
  ast: WeslAST;
  resources: DiscoveredResource[];
} {
  const ast = parseSrcModule(
    { modulePath: "main", debugFilePath: "./main.wesl", src: shaderSrc },
    { weslExtensions: { doBlocks: true } },
  );
  const resources = findAnnotatedResources(ast);
  const hasBuffer = resources.some(r => r.kind === "buffer");
  if (!hasBuffer) {
    throw new Error(
      "testCompute: shader has no @buffer declarations. Add e.g. " +
        "`@buffer var<storage, read_write> results: array<u32, 4>;` to capture results.",
    );
  }
  return { ast, resources };
}
