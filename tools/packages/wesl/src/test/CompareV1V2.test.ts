/**
 * Temporary test to compare V1 and V2 AST outputs
 */
import { test } from "vitest";
import { weslParserConfig } from "../ParseWESL.ts";
import { parseSrcModule } from "../ParseWESL.ts";
import type { SrcModule } from "../Scope.ts";

test("compare V1 vs V2 AST for simple struct", () => {
  const src = `
    struct Point { x: f32 }
    fn main() { var p: Point; }
  `;

  const srcModule: SrcModule = {
    modulePath: "test",
    debugFilePath: "test.wesl",
    src,
  };

  // Parse with V1
  weslParserConfig.useV2Parser = false;
  const astV1 = parseSrcModule(srcModule);

  // Parse with V2
  weslParserConfig.useV2Parser = true;
  const astV2 = parseSrcModule(srcModule);

  console.log("\n=== V1 Root Scope Contents ===");
  astV1.rootScope.contents.forEach((item, i) => {
    if ("kind" in item && item.kind === "scope") {
      console.log(`${i}: [Scope id=${item.id}, contents.length=${item.contents.length}]`);
      // Look inside the scope
      item.contents.forEach((subItem, j) => {
        if ("kind" in subItem) {
          console.log(`  ${j}: [Scope]`);
        } else {
          const type = "declElem" in subItem ? "DeclIdent" : "RefIdent";
          console.log(`  ${j}: ${type} "${subItem.originalName}"`);
        }
      });
    } else {
      const ident = item;
      const type = "declElem" in ident ? "DeclIdent" : "RefIdent";
      console.log(`${i}: ${type} "${ident.originalName}", isGlobal=${ident.isGlobal}`);
    }
  });

  console.log("\n=== V2 Root Scope Contents ===");
  astV2.rootScope.contents.forEach((item, i) => {
    if ("kind" in item && item.kind === "scope") {
      console.log(`${i}: [Scope id=${item.id}, contents.length=${item.contents.length}]`);
      // Look inside the scope
      item.contents.forEach((subItem, j) => {
        if ("kind" in subItem) {
          console.log(`  ${j}: [Scope]`);
        } else {
          const type = "declElem" in subItem ? "DeclIdent" : "RefIdent";
          console.log(`  ${j}: ${type} "${subItem.originalName}"`);
        }
      });
    } else {
      const ident = item;
      const type = "declElem" in ident ? "DeclIdent" : "RefIdent";
      console.log(`${i}: ${type} "${ident.originalName}", isGlobal=${ident.isGlobal}`);
    }
  });

  // Count and compare
  const v1Decls = astV1.rootScope.contents.filter(i => !("kind" in i) && "declElem" in i);
  const v2Decls = astV2.rootScope.contents.filter(i => !("kind" in i) && "declElem" in i);
  const v1Refs = astV1.rootScope.contents.filter(i => !("kind" in i) && !("declElem" in i));
  const v2Refs = astV2.rootScope.contents.filter(i => !("kind" in i) && !("declElem" in i));

  console.log("\n=== Summary ===");
  console.log(`V1 Root: ${v1Decls.length} DeclIdents, ${v1Refs.length} RefIdents`);
  console.log(`V2 Root: ${v2Decls.length} DeclIdents, ${v2Refs.length} RefIdents`);
});
