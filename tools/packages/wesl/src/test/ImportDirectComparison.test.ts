import { expect, test } from "vitest";
import { weslImports, weslImportsDirect } from "../parse/ImportGrammar.ts";
import { testAppParse } from "./TestUtil.ts";

// Test that both parsers produce identical results
function compareDirectAndOriginal(src: string) {
  const original = testAppParse(weslImports, src);
  const direct = testAppParse(weslImportsDirect, src);

  // Compare the parsed values
  expect(direct.parsed?.value).toEqual(original.parsed?.value);

  // Compare stable imports
  expect(direct.stable.imports).toEqual(original.stable.imports);

  return { original, direct };
}

// Less strict comparison that ignores positions and attributes
function compareImportStructure(src: string) {
  const original = testAppParse(weslImports, src);
  const direct = testAppParse(weslImportsDirect, src);

  // Check we have the same number of imports
  expect(direct.parsed?.value?.length).toBe(original.parsed?.value?.length);

  // Compare just the import statements (ignoring positions and attributes)
  const originalImports = original.parsed?.value?.map(e => e.imports) ?? [];
  const directImports = direct.parsed?.value?.map(e => e.imports) ?? [];
  expect(directImports).toEqual(originalImports);

  // Compare stable imports
  expect(direct.stable.imports).toEqual(original.stable.imports);

  return { original, direct };
}

test("simple import", () => {
  compareDirectAndOriginal("import foo;");
});

test("multiple imports", () => {
  compareDirectAndOriginal(`
    import foo;
    import bar::baz;
    import package::utils;
  `);
});

test("complex import with collection", () => {
  compareDirectAndOriginal(
    "import bevy_pbr::{mesh_view_bindings, utils::{PI, noise}, lighting};",
  );
});

test("import with trailing comma", () => {
  compareDirectAndOriginal("import foo::{bar, baz,};");
});

test("conditional import", () => {
  const src = `
    @if(DEBUG) import package::debug;
    import regular::module;
  `;
  compareDirectAndOriginal(src);
});

test("empty source", () => {
  compareDirectAndOriginal("");
});

test("no imports just code", () => {
  compareDirectAndOriginal("fn main() { return vec4(1.0); }");
});

test("imports with attributes", () => {
  compareDirectAndOriginal(`
    @if(FEATURE_A) import a::module;
    @elif(FEATURE_B) import b::module;
    @else import c::module;
  `);
});

test("complex nested imports", () => {
  compareDirectAndOriginal(`
    import super::super::utils;
    import package::{
      common,
      math::{vec3, mat4},
      render::{
        pipeline,
        shaders::{vertex, fragment}
      }
    };
  `);
});

test("import structure matches (ignoring positions)", () => {
  // For imports with attributes, just check structure matches
  compareImportStructure(`
    @if(DEBUG) import package::debug;
    import regular::module;
  `);

  compareImportStructure(`
    @if(FEATURE_A) import a::module;
    @elif(FEATURE_B) import b::module;
    @else import c::module;
  `);
});
