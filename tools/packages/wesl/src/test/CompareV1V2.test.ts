/**
 * Temporary test to compare V1 and V2 AST outputs
 */
import { test } from "vitest";
import { weslParserConfig } from "../ParseWESL.ts";
import { parseSrcModule } from "../ParseWESL.ts";
import type { SrcModule } from "../Scope.ts";

test("compare V1 vs V2 for import test case", async () => {
  // Use actual test case that fails in V2 but passes in V1
  const { importCases } = await import("wesl-testsuite");
  const testCase = importCases.find(t => t.name === "import twice doesn't get two copies");

  if (!testCase) {
    console.log("Test case not found!");
    return;
  }

  console.log("\n=== Test Case ===");
  console.log("Name:", testCase.name);
  const srcKeys = Object.keys(testCase.weslSrc);
  console.log("Source files:", srcKeys);

  // Parse main module with both parsers
  const mainKey = srcKeys.find(k => k.includes("main")) || srcKeys[0];
  const mainSrc = testCase.weslSrc[mainKey];
  const srcModule: SrcModule = {
    modulePath: "main",
    debugFilePath: "main.wesl",
    src: mainSrc,
  };

  console.log("\n=== Main Source (from key:", mainKey, ") ===");
  console.log(mainSrc);

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

  console.log("\n=== V1 Imports ===");
  astV1.imports.forEach((imp, i) => {
    console.log(`${i}:`, JSON.stringify(imp, null, 2));
  });

  console.log("\n=== V2 Imports ===");
  astV2.imports.forEach((imp, i) => {
    console.log(`${i}:`, JSON.stringify(imp, null, 2));
  });

  console.log("\n=== Summary ===");
  console.log(`V1 Root: ${v1Decls.length} DeclIdents, ${v1Refs.length} RefIdents, ${astV1.imports.length} imports`);
  console.log(`V2 Root: ${v2Decls.length} DeclIdents, ${v2Refs.length} RefIdents, ${astV2.imports.length} imports`);
});
