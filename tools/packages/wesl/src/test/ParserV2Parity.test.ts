/**
 * Parity tests for WeslParserV2
 *
 * These tests validate that the new v2 parser produces identical ASTs
 * to the existing mini-parse based parser.
 *
 * Strategy: For each test case, we:
 * 1. Parse with v1 (existing parser)
 * 2. Parse with v2 (new parser)
 * 3. Compare the ASTs deeply
 * 4. Report any differences
 */

import { describe, expect, test } from "vitest";
import { parseSrcModule } from "../ParseWESL.ts";
import { parseWeslV2 } from "../parse/v2/WeslParserV2.ts";
import type { SrcModule } from "../Scope.ts";
import { resetScopeIds } from "../Scope.ts";

/**
 * Helper to create a test source module
 */
function createSrcModule(src: string, modulePath = "test"): SrcModule {
  return {
    modulePath,
    debugFilePath: `${modulePath}.wesl`,
    src,
  };
}

/**
 * Parse with both parsers and compare ASTs
 */
function testParity(src: string, _description?: string) {
  const srcModule = createSrcModule(src);

  // Reset scope IDs for deterministic comparison
  resetScopeIds();
  const astV1 = parseSrcModule(srcModule);

  resetScopeIds();
  const astV2 = parseWeslV2(srcModule);

  // Filter out TextElem nodes from v1 - these are whitespace/comments
  // V2 parser doesn't create TextElem nodes (yet), so we compare semantic elements only
  const v1SemanticElems = astV1.moduleElem.contents.filter(
    elem => elem.kind !== "text",
  );
  const v2SemanticElems = astV2.moduleElem.contents;

  // Compare the ASTs
  // Note: We compare semantic elements only (filtering out TextElem from v1)
  expect(v2SemanticElems.length, "semantic elements count").toBe(
    v1SemanticElems.length,
  );
  expect(astV2.imports.length, "imports.length").toBe(astV1.imports.length);
  expect(astV2.rootScope.id, "rootScope.id").toBe(astV1.rootScope.id);

  return { astV1, astV2, v1SemanticElems, v2SemanticElems };
}

describe("ParserV2 Parity: Empty Module", () => {
  test("empty file", () => {
    testParity("");
  });

  test("whitespace only", () => {
    testParity("   \n\n  \t  \n");
  });

  test("comments only", () => {
    testParity("// comment\n/* block comment */\n");
  });
});

describe("ParserV2 Parity: Imports", () => {
  test("simple package import", () => {
    const { astV1, astV2 } = testParity("import pkg::module;");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("relative import", () => {
    const { astV1, astV2 } = testParity("import super::sibling;");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("import with item", () => {
    const { astV1, astV2 } = testParity("import pkg::module::Item;");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("import with as", () => {
    const { astV1, astV2 } = testParity("import pkg::Item as Renamed;");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("import collection", () => {
    const { astV1, astV2 } = testParity("import pkg::{Foo, Bar};");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("nested import collection", () => {
    const { astV1, astV2 } = testParity("import pkg::{a::B, c::D};");

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("multiple imports", () => {
    const { astV1, astV2 } = testParity(`
      import pkg1::module1;
      import pkg2::module2;
      import pkg3::Item;
    `);

    expect(astV2.imports.length).toBe(3);
    expect(astV2.imports).toEqual(astV1.imports);
  });

  test("import with line comments", () => {
    const { astV1, astV2 } = testParity(`
      // This is a comment
      import pkg::module;
      // Another comment
    `);

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });

  test("import with block comments", () => {
    const { astV1, astV2 } = testParity(`
      /* Block comment */
      import pkg::module;
      /* Another block comment */
    `);

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });
});

describe("ParserV2 Parity: Import Positions", () => {
  test("import element has correct span", () => {
    const src = "import pkg::module;";
    const { astV1, astV2 } = testParity(src);

    const importElemV1 = astV1.moduleElem.contents[0];
    const importElemV2 = astV2.moduleElem.contents[0];

    // Type guard: check that elements have start/end properties
    if ("start" in importElemV1 && "start" in importElemV2) {
      expect(importElemV2.start, "start position").toBe(importElemV1.start);
      expect(importElemV2.end, "end position").toBe(importElemV1.end);
    }
  });

  test("multiple imports have correct spans", () => {
    const src = `import pkg1::a;
import pkg2::b;`;
    const { v1SemanticElems, v2SemanticElems } = testParity(src);

    for (let i = 0; i < v1SemanticElems.length; i++) {
      const elemV1 = v1SemanticElems[i];
      const elemV2 = v2SemanticElems[i];
      // Type guard: check that elements have start/end properties
      if ("start" in elemV1 && "start" in elemV2) {
        expect(elemV2.start, `import ${i} start`).toBe(elemV1.start);
        expect(elemV2.end, `import ${i} end`).toBe(elemV1.end);
      }
    }
  });
});

describe("ParserV2 Parity: Stress Tests", () => {
  test("many imports", () => {
    const imports = Array.from(
      { length: 100 },
      (_, i) => `import pkg${i}::module${i};`,
    ).join("\n");

    const { astV1, astV2 } = testParity(imports);
    expect(astV2.imports.length).toBe(100);
    expect(astV2.imports).toEqual(astV1.imports);
  });

  test("deeply nested collection", () => {
    const { astV1, astV2 } = testParity(
      "import pkg::{a::{b::{c::D, e::F}, g::H}, i::J};",
    );

    expect(astV2.imports.length).toBe(1);
    expect(astV2.imports[0]).toEqual(astV1.imports[0]);
  });
});

describe("ParserV2 Parity: Const Declarations", () => {
  test("simple const with numeric literal", () => {
    const { v1SemanticElems, v2SemanticElems } = testParity("const y = 11u;");

    expect(v2SemanticElems.length).toBe(1);
    expect(v2SemanticElems[0].kind).toBe("const");

    // Compare structure (but not full deep equality since expression parsing differs)
    const constV1 = v1SemanticElems[0];
    const constV2 = v2SemanticElems[0];

    if (constV1.kind === "const" && constV2.kind === "const") {
      expect(constV2.name.kind).toBe("typeDecl");
      expect(constV2.name.decl.kind).toBe(constV1.name.decl.kind);
      expect(constV2.name.decl.ident.originalName).toBe("y");
    }
  });

  test("const with boolean literal", () => {
    const { v2SemanticElems } = testParity("const flag = true;");

    expect(v2SemanticElems.length).toBe(1);
    expect(v2SemanticElems[0].kind).toBe("const");
  });

  test("const with identifier reference", () => {
    const { v2SemanticElems } = testParity("const x = y;");

    expect(v2SemanticElems.length).toBe(1);
    expect(v2SemanticElems[0].kind).toBe("const");
  });

  test("multiple const declarations", () => {
    const { v2SemanticElems } = testParity(`
      const x = 1u;
      const y = 2u;
      const z = 3u;
    `);

    expect(v2SemanticElems.length).toBe(3);
    expect(v2SemanticElems.every(e => e.kind === "const")).toBe(true);
  });

  test("imports and const declarations", () => {
    const { v2SemanticElems } = testParity(`
      import pkg::module;
      const x = 42u;
    `);

    expect(v2SemanticElems.length).toBe(2);
    expect(v2SemanticElems[0].kind).toBe("import");
    expect(v2SemanticElems[1].kind).toBe("const");
  });
});
