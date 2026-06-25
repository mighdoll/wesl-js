// Size-measurement stub: stands in for the WESL grammar root (parse/ParseWesl.ts)
// so the entire parser tree-shakes out of the bundle. Used by size-check.ts to
// measure the bind + emit + conditions "runtime floor" (Direction A: a built app
// that ships a pre-parsed AST and only re-links with live conditions at runtime).
export function parseWesl(): never {
  throw new Error("parser stripped (size measurement stub)");
}
