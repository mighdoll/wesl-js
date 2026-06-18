import type { WeslAST } from "wesl";
import type { ScalarKind, TypeShape } from "wesl-reflect";
import { varReflection } from "wesl-reflect";

/** Decode each readback buffer as a flat number[] using its var's reflected type,
 *  keyed by var name. */
export function decodeReadbacks(
  ast: WeslAST,
  readbacks: Map<string, ArrayBuffer>,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const [name, data] of readbacks) {
    result[name] = decodeFlatBuffer(data, varReflection(ast, name).type);
  }
  return result;
}

/** Decode an ArrayBuffer as a flat number[] using the type's leaf scalar kind.
 *  Used by test runners that expect flat results (e.g. `array<u32, 4>` --> `[1,2,3,4]`).
 *  For nested/structured decoding, use wesl-reflect's `decodeBuffer`. */
export function decodeFlatBuffer(data: ArrayBuffer, type: TypeShape): number[] {
  const kind = leafScalar(type);
  switch (kind) {
    case "f32":
      return Array.from(new Float32Array(data));
    case "i32":
      return Array.from(new Int32Array(data));
    case "u32":
      return Array.from(new Uint32Array(data));
    default:
      throw new Error(`cannot decode buffer of kind '${kind}'`);
  }
}

/** Walk into arrays/vecs/mats/atomics to find the underlying scalar element kind. */
export function leafScalar(t: TypeShape): ScalarKind {
  if (t.kind === "scalar") return t.type;
  if (t.kind === "vec") return t.component;
  if (t.kind === "mat") return t.component;
  if (t.kind === "atomic") return t.component;
  if (t.kind === "array") return leafScalar(t.elem);
  throw new Error(`cannot find scalar of kind '${t.kind}'`);
}
