/**
 * Temporary test to compare V1 and V2 AST outputs
 */
import { test } from "vitest";
import { scopeToStringLong } from "../debug/ScopeToString.ts";
import { parseSrcModule, weslParserConfig } from "../ParseWESL.ts";
import type { SrcModule } from "../Scope.ts";

test("compare V1 vs V2 for import test case", async () => {
  // Use actual test case that fails in V2 but passes in V1
  const { importCases } = await import("wesl-testsuite");
  const testCase = importCases.find(
    t => t.name === "import twice doesn't get two copies",
  );

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

  console.log("\n=== V1 Scope Tree (scopeToStringLong) ===");
  console.log(scopeToStringLong(astV1.rootScope));

  console.log("\n=== V2 Scope Tree (scopeToStringLong) ===");
  console.log(scopeToStringLong(astV2.rootScope));

  console.log("\n=== V1 Root Scope Contents ===");
  astV1.rootScope.contents.forEach((item, i) => {
    if ("kind" in item && (item.kind === "scope" || item.kind === "partial")) {
      console.log(
        `${i}: [Scope id=${item.id}, contents.length=${item.contents.length}]`,
      );
      // Look inside the scope
      item.contents.forEach((subItem, j) => {
        if (
          "kind" in subItem &&
          (subItem.kind === "scope" || subItem.kind === "partial")
        ) {
          console.log(`  ${j}: [Scope]`);
        } else {
          const type = "declElem" in subItem ? "DeclIdent" : "RefIdent";
          console.log(`  ${j}: ${type} "${subItem.originalName}"`);
        }
      });
    } else {
      const type = "declElem" in item ? "DeclIdent" : "RefIdent";
      const isGlobal = "declElem" in item ? item.isGlobal : "N/A";
      console.log(`${i}: ${type} "${item.originalName}", isGlobal=${isGlobal}`);
    }
  });

  console.log("\n=== V2 Root Scope Contents ===");
  astV2.rootScope.contents.forEach((item, i) => {
    if ("kind" in item && (item.kind === "scope" || item.kind === "partial")) {
      console.log(
        `${i}: [Scope id=${item.id}, contents.length=${item.contents.length}]`,
      );
      // Look inside the scope
      item.contents.forEach((subItem, j) => {
        if (
          "kind" in subItem &&
          (subItem.kind === "scope" || subItem.kind === "partial")
        ) {
          console.log(`  ${j}: [Scope]`);
        } else {
          const type = "declElem" in subItem ? "DeclIdent" : "RefIdent";
          console.log(`  ${j}: ${type} "${subItem.originalName}"`);
        }
      });
    } else {
      const type = "declElem" in item ? "DeclIdent" : "RefIdent";
      const isGlobal = "declElem" in item ? item.isGlobal : "N/A";
      console.log(`${i}: ${type} "${item.originalName}", isGlobal=${isGlobal}`);
    }
  });

  // Count and compare
  const v1Decls = astV1.rootScope.contents.filter(
    i => !("kind" in i) && "declElem" in i,
  );
  const v2Decls = astV2.rootScope.contents.filter(
    i => !("kind" in i) && "declElem" in i,
  );
  const v1Refs = astV1.rootScope.contents.filter(
    i => !("kind" in i) && !("declElem" in i),
  );
  const v2Refs = astV2.rootScope.contents.filter(
    i => !("kind" in i) && !("declElem" in i),
  );

  console.log("\n=== V1 Imports ===");
  astV1.imports.forEach((imp, i) => {
    console.log(`${i}:`, JSON.stringify(imp, null, 2));
  });

  console.log("\n=== V2 Imports ===");
  astV2.imports.forEach((imp, i) => {
    console.log(`${i}:`, JSON.stringify(imp, null, 2));
  });

  console.log("\n=== Summary ===");
  console.log(
    `V1 Root: ${v1Decls.length} DeclIdents, ${v1Refs.length} RefIdents, ${astV1.imports.length} imports`,
  );
  console.log(
    `V2 Root: ${v2Decls.length} DeclIdents, ${v2Refs.length} RefIdents, ${astV2.imports.length} imports`,
  );

  // Find and compare the "foo" RefIdents
  function findRefIdent(scope: any, name: string): any {
    for (const item of scope.contents) {
      if (
        "kind" in item &&
        (item.kind === "scope" || item.kind === "partial")
      ) {
        const found = findRefIdent(item, name);
        if (found) return found;
      } else if (
        "originalName" in item &&
        item.originalName === name &&
        !("declElem" in item)
      ) {
        return item;
      }
    }
    return null;
  }

  const v1Foo = findRefIdent(astV1.rootScope, "foo");
  const v2Foo = findRefIdent(astV2.rootScope, "foo");

  console.log("\n=== V1 'foo' RefIdent ===");
  if (v1Foo) {
    console.log("Keys:", Object.keys(v1Foo));
    console.log("originalName:", v1Foo.originalName);
    console.log("isGlobal:", v1Foo.isGlobal);
    console.log("ast?.srcModule.modulePath:", v1Foo.ast?.srcModule.modulePath);
    console.log(
      "refIdentElem:",
      v1Foo.refIdentElem ? "exists" : "null/undefined",
    );
  }

  console.log("\n=== V2 'foo' RefIdent ===");
  if (v2Foo) {
    console.log("Keys:", Object.keys(v2Foo));
    console.log("originalName:", v2Foo.originalName);
    console.log("isGlobal:", v2Foo.isGlobal);
    console.log("ast?.srcModule.modulePath:", v2Foo.ast?.srcModule.modulePath);
    console.log(
      "refIdentElem:",
      v2Foo.refIdentElem ? "exists" : "null/undefined",
    );
  }
});
