import { afterAll, beforeAll, expect, test } from "vitest";
import { runDoBlock } from "../RunDoBlock.ts";
import { runWesl } from "../TestWesl.ts";
import { destroySharedDevice, getGPUDevice } from "../WebGPUTestSetup.ts";
import { parseTest } from "./TestSupport.ts";

let device: GPUDevice;

const pipelineSrc = `
@buffer var<storage, read_write> data: array<u32, 4>;

@compute @workgroup_size(1)
fn fill() { for (var i = 0u; i < 4u; i++) { data[i] = i + 1u; } }

@compute @workgroup_size(1)
fn double_it() { for (var i = 0u; i < 4u; i++) { data[i] = data[i] * 2u; } }

@test @entry
do test_pipeline() {
  fill(1, 1, 1);
  double_it(1, 1, 1);
}
`;

beforeAll(async () => {
  device = await getGPUDevice();
});

afterAll(() => {
  destroySharedDevice();
});

test("runWesl runs a simple test", async () => {
  const results = await runWesl({ device, src: pipelineSrc });
  expect(results).toHaveLength(1);
  expect(results[0].name).toBe("test_pipeline");
  expect(results[0].passed).toBe(true);
});

test("external buffer validation: data = [2, 4, 6, 8]", async () => {
  const ast = parseTest(pipelineSrc);
  const result = await runDoBlock({
    device,
    ast,
    shaderSrc: pipelineSrc,
    blockName: "test_pipeline",
  });
  expect(result.data).toEqual([2, 4, 6, 8]);
});

test("let binding evaluates and drives dispatch count", async () => {
  // fill_one writes `i+1` at index i; one element per workgroup, n workgroups.
  const src = `
@buffer var<storage, read_write> data: array<u32, 4>;

@compute @workgroup_size(1)
fn fill_one(@builtin(workgroup_id) g: vec3u) { data[g.x] = g.x + 1u; }

@test @entry
do test_let() {
  let n = 4u;
  fill_one(n, 1, 1);
}
`;
  const ast = parseTest(src);
  const result = await runDoBlock({
    device,
    ast,
    shaderSrc: src,
    blockName: "test_let",
  });
  expect(result.data).toEqual([1, 2, 3, 4]);
});

test("undefined entry-point call surfaces as a failure naming the block", async () => {
  const src = `
@buffer var<storage, read_write> data: array<u32, 1>;

@compute @workgroup_size(1) fn defined() { data[0] = 1u; }

@test @entry
do test_missing() {
  defined(1, 1, 1);
  not_defined(1, 1, 1);
}
`;
  const results = await runWesl({ device, src });
  expect(results).toHaveLength(1);
  expect(results[0].passed).toBe(false);
  expect(results[0].message).toMatch(/test_missing/);
  expect(results[0].message).toMatch(/not_defined/);
});

test("depth guard fires at 256 for mutually-recursive straight-line do blocks", async () => {
  const src = `
@buffer var<storage, read_write> data: array<u32, 1>;

@compute @workgroup_size(1) fn noop() { data[0] = 0u; }

do a() { b(); }
do b() { a(); }

@test @entry
do test_recurse() { a(); }
`;
  const ast = parseTest(src);
  await expect(
    runDoBlock({ device, ast, shaderSrc: src, blockName: "test_recurse" }),
  ).rejects.toThrow(/recursion depth/);
});

test("a do-body containing `if` is rejected with a clear error", async () => {
  const src = `
@buffer var<storage, read_write> data: array<u32, 1>;

@compute @workgroup_size(1) fn step() { data[0] = 1u; }

@test @entry
do test_if() {
  if 1u > 0u { step(1, 1, 1); }
}
`;
  const ast = parseTest(src);
  await expect(
    runDoBlock({ device, ast, shaderSrc: src, blockName: "test_if" }),
  ).rejects.toThrow(/straight-line only/);
});
