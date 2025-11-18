import { scopeToString } from "./src/debug/ScopeToString.ts";
import { parseWeslV2 } from "./src/parse/v2/WeslParserV2.ts";

const src = `
fn func() {
  @if(true) { const foo = 10; }
  @if(false) { const bar = 10; }
}`;

const ast = parseWeslV2({
  src,
  modulePath: "test.wgsl",
  debugFilePath: "test.wgsl",
});
console.log("Scope tree:");
console.log(scopeToString(ast.rootScope));

// Find the foo identifier
function findIdent(scope: any, name: string): any {
  for (const item of scope.contents) {
    if (
      (item.kind === "ident" || item.kind === "decl" || item.kind === "ref") &&
      item.originalName === name
    ) {
      return item;
    }
    if (item.kind === "scope" || item.kind === "partial") {
      const found = findIdent(item, name);
      if (found) return found;
    }
  }
  return null;
}

const fooIdent = findIdent(ast.rootScope, "foo");
console.log("\nfoo identifier:");
console.log("  isGlobal property:", fooIdent.isGlobal);
console.log("  originalName:", fooIdent.originalName);
console.log("  mangledName:", fooIdent.mangledName);
console.log("  declElem.kind:", fooIdent.declElem?.kind);
