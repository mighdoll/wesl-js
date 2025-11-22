import { expect, test } from "vitest";
import { parseTest } from "./TestUtil.ts";

// Category 1: @diagnostic on statements (~140 CTS failures)
test("@diagnostic on if statement", () => {
  const src = `fn foo() { @diagnostic(info, derivative_uniformity) if true { } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("@diagnostic on for statement", () => {
  const src = `fn foo() { @diagnostic(error, derivative_uniformity) for (var i = 0; i < 10; i++) { } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("@diagnostic on while statement", () => {
  const src = `fn foo() { @diagnostic(info, derivative_uniformity) while true { } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("@diagnostic on loop statement", () => {
  const src = `fn foo() { @diagnostic(info, derivative_uniformity) loop { break; } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("@diagnostic on switch statement", () => {
  const src = `fn foo() { @diagnostic(info, derivative_uniformity) switch 0 { default { } } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("@diagnostic on for body", () => {
  const src = `fn foo() { for (var i = 0; i < 10; i++) @diagnostic(info, derivative_uniformity) { } }`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

// Category 2: binding_array as identifier (10 CTS failures)
test("binding_array as var name", () => {
  const src = `var<private> binding_array : i32;`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("binding_array as fn name", () => {
  const src = `fn binding_array() {}`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

test("binding_array as alias name", () => {
  const src = `alias binding_array = i32;`;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBeGreaterThan(0);
});

// Category 3: @must_use with empty parentheses (1 CTS failure - should reject)
test("@must_use with empty parens should fail", () => {
  const src = `@must_use() fn foo() -> u32 { return 0; }`;
  expect(() => parseTest(src)).toThrow();
});

// Category 4: semicolon after continuing (1 CTS failure - should reject)
test("semicolon after continuing block should fail", () => {
  const src = `fn f() { loop { break; continuing{}; } }`;
  expect(() => parseTest(src)).toThrow();
});

// Category 5: empty source (1 CTS failure)
test("empty source", () => {
  const src = ``;
  const ast = parseTest(src);
  expect(ast.moduleElem.contents.length).toBe(0);
});
