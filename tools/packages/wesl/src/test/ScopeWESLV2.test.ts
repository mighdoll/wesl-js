/**
 * V2 Parser Scope Tests
 *
 * These tests validate V2 parser scope structure with V2's consecutive scope ID numbering.
 * The scope structure should match V1, but V2 creates consecutive IDs (0,1,2,3...)
 * while V1 creates IDs with gaps (0,1,2,skip 3,4,5...).
 *
 * What matters: scope structure (partial vs regular, nesting, contents)
 * What doesn't matter: exact scope ID numbers
 */

import { expect, test } from "vitest";
import { scopeToString } from "../debug/ScopeToString.ts";
import type { WeslAST } from "../ParseWESL.ts";
import { resetScopeIds } from "../Scope.ts";
import { parseWESL } from "./TestUtil.ts";

function testParseWESL(src: string): WeslAST {
  resetScopeIds();
  return parseWESL(src);
}

test("scope from simple fn", () => {
  const src = `
    fn main() {
      var x: i32 = 1;
    }
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %main 
        { %x 
          { i32 } #3
        } #2
      } #1
    } #0"
  `);
});

test("two fns", () => {
  const src = `
    fn foo() {}
    fn bar() {}
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %foo 
        {  } #2
      } #1
      -{ %bar 
        {  } #4
      } #3
    } #0"
  `);
});

test("two fns, one with a decl", () => {
  const src = `
    fn foo() {
      var a:u32;
    }
    fn bar() {}
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %foo 
        { %a 
          { u32 } #3
        } #2
      } #1
      -{ %bar 
        {  } #5
      } #4
    } #0"
  `);
});

test("fn ref", () => {
  const src = `
    fn foo() {
      bar();
    }
    fn bar() {}
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %foo 
        { bar } #2
      } #1
      -{ %bar 
        {  } #4
      } #3
    } #0"
  `);
});

test("struct", () => {
  const src = `
    struct A {
      a: B,
    }
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ %A 
      { B } #1
    } #0"
  `);
});

test("alias", () => {
  const src = `
    alias A = B;
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ %A 
      { B } #1
    } #0"
  `);
});

test("builtin scope", () => {
  const src = `fn main( @builtin(vertex_index) a: u32) { }`;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %main 
        { %a u32 } #2
      } #1
    } #0"
  `);
});

test("builtin enums", () => {
  const src = `struct read { a: vec2f } var<storage, read_write> storage_buffer: read;`;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ %read 
      { vec2f } #1
      -{ %storage_buffer 
        { read } #3
      } #2
    } #0"
  `);
});

test("texture_storage_2d", () => {
  const src = `
    @binding(3) @group(0) var tex_out : texture_storage_2d<rgba8unorm, write>;
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %tex_out 
        { texture_storage_2d rgba8unorm write } #2
      } #1
    } #0"
  `);
});

test("ptr 2 params", () => {
  const src = `
    fn foo(ptr: ptr<private, u32>) { }
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %foo 
        { %ptr ptr private u32 } #2
      } #1
    } #0"
  `);
});

test("ptr 3 params", () => {
  const src = `
    fn foo(ptr: ptr<storage, array<u32, 128>, read>) { }
  `;
  const { rootScope } = testParseWESL(src);
  expect(scopeToString(rootScope)).toMatchInlineSnapshot(`
    "{ 
      -{ %foo 
        { %ptr ptr storage array u32 read } #2
      } #1
    } #0"
  `);
});
