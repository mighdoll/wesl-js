import type { FnElem, WeslAST } from "wesl";
import { findAnnotation } from "wesl-reflect";

export interface TestFunctionInfo {
  name: string;
  description?: string;
  fn: FnElem;
}

export interface SnapshotFunctionInfo {
  name: string;
  snapshotName: string;
  extent: [number, number];
  fn: FnElem;
}

/** Format test name for display: "fnName" or "fnName - description" */
export function testDisplayName(name: string, description?: string): string {
  return description ? `${name} - ${description}` : name;
}

/** Find all functions marked with @test attribute (excluding @snapshot fns). */
export function findTestFunctions(ast: WeslAST): TestFunctionInfo[] {
  return ast.moduleElem.contents
    .filter((e): e is FnElem => e.kind === "fn")
    .filter(fn => findAnnotation(fn, "test") && !findAnnotation(fn, "snapshot"))
    .filter(fn => {
      if (fn.params.length > 0) {
        const name = fn.name.ident.originalName;
        console.warn(
          `@test function '${name}' has parameters and will be skipped`,
        );
        return false;
      }
      return true;
    })
    .map(fn => ({
      name: fn.name.ident.originalName,
      description: getTestDescription(fn),
      fn,
    }));
}

/** Find all @fragment @snapshot functions in a parsed WESL module. */
export function findSnapshotFunctions(ast: WeslAST): SnapshotFunctionInfo[] {
  const src = ast.srcModule.src;
  return ast.moduleElem.contents
    .filter((e): e is FnElem => e.kind === "fn")
    .filter(
      fn => findAnnotation(fn, "fragment") && findAnnotation(fn, "snapshot"),
    )
    .map(fn => ({
      name: fn.name.ident.originalName,
      snapshotName: extractSnapshotName(fn),
      extent: extractExtent(fn, src),
      fn,
    }));
}

/** Extract description from @test(description) attribute. */
function getTestDescription(fn: FnElem): string | undefined {
  const param = findAnnotation(fn, "test")?.params?.[0];
  const ref = param?.contents.find(c => c.kind === "ref");
  return ref?.kind === "ref" ? ref.ident.originalName : undefined;
}

/** Extract snapshot name from @snapshot(name) or fall back to fn name. */
function extractSnapshotName(fn: FnElem): string {
  const param = findAnnotation(fn, "snapshot")?.params?.[0];
  const ref = param?.contents.find(c => c.kind === "ref");
  if (ref?.kind === "ref") return ref.ident.originalName;
  return fn.name.ident.originalName;
}

/** Extract extent from @extent(w, h), default [256, 256]. */
function extractExtent(fn: FnElem, src: string): [number, number] {
  const attr = findAnnotation(fn, "extent");
  if (!attr?.params) return [256, 256];
  const nums = attr.params.map(p => {
    const text = src.slice(p.start, p.end).trim();
    return Number.parseInt(text, 10) || 256;
  });
  return [nums[0] ?? 256, nums[1] ?? nums[0] ?? 256];
}
