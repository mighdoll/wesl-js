import { expect, test } from "vitest";
import { astToString } from "../debug/ASTtoString.ts";
import { parseTest } from "./TestUtil.ts";

test("parse complex condition", () => {
  const ast = parseTest("@if(true || (!foo&&!!false) )\nfn a() {}");
  expect(astToString(ast.moduleElem)).toMatchInlineSnapshot(`
    "module
      fn a() @if
        decl %a
        statement
          text '{}'"
  `);
});

test("@if(false) enable f16", () => {
  const src = `
    @if(false) enable f16;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        @if(false)'
      directive enable f16 @if
      text '
      '"
  `);
});

test("@if(false) const_assert true;", () => {
  const src = `
    @if(false) const_assert true;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      assert
        text ' const_assert true;'
      text '
      '"
  `);
});

test("@if(true) var x = 7", () => {
  const src = `
    @if(true) var x = 7; 
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      gvar %x @if
        text 'var'
        typeDecl %x
          text ' '
          decl %x
        text ' = 7;'
      text ' 
      '"
  `);
});

test("conditional statement", () => {
  const src = `
    fn main() {
      var x = 1;
      @if(true) x = 2 ;
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn main()
        decl %main
        statement
          text '{'
          var %x
            text '
          var'
            typeDecl %x
              text ' '
              decl %x
            text ' = 1;'
          text '
          @if(true)'
          statement @if
            text ' '
            ref x
            text ' = 2 ;'
          text '
        }'
      text '
      '"
  `);
});

test("compound statement", () => {
  const src = `
    fn main() {
      @if(false) {
        let x = 1;
      }
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn main()
        decl %main
        statement
          text '{
          @if(false) '
          statement @if
            text '{'
            let %x
              text '
            let'
              typeDecl %x
                text ' '
                decl %x
              text ' = 1;'
            text '
          }'
          text '
        }'
      text '
      '"
  `);
});

test("conditional local var", () => {
  const src = `
    fn main() {
      @if(true) var x = 1;
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn main()
        decl %main
        statement
          text '{
          @if(true)'
          var %x @if
            text ' var'
            typeDecl %x
              text ' '
              decl %x
            text ' = 1;'
          text '
        }'
      text '
      '"
  `);
});

test("@if(MOBILE) const x = 1", () => {
  const src = `
    @if(MOBILE) const x = 1;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      const %x @if
        text ' const'
        typeDecl %x
          text ' '
          decl %x
        text ' = 1;'
      text '
      '"
  `);
});

test("@else after @if", () => {
  const src = `
    @if(false) const x = 1;
    @else const x = 2;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      const %x @if
        text ' const'
        typeDecl %x
          text ' '
          decl %x
        text ' = 1;'
      const %x @else
        text ' const'
        typeDecl %x
          text ' '
          decl %x
        text ' = 2;'
      text '
      '"
  `);
});

test("@else with function", () => {
  const src = `
    @if(DEBUG) fn foo() { return 1; }
    @else fn foo() { return 2; }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn foo() @if
        decl %foo
        statement
          text '{'
          statement
            text ' return 1;'
          text ' }'
      fn foo() @else
        decl %foo
        statement
          text '{'
          statement
            text ' return 2;'
          text ' }'
      text '
      '"
  `);
});

test("@else with statement", () => {
  const src = `
    fn main() {
      @if(A) let x = 1.0;
      @else let x = 2.0;
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn main()
        decl %main
        statement
          text '{
          @if(A)'
          let %x @if
            text ' let'
            typeDecl %x
              text ' '
              decl %x
            text ' = 1.0;'
          text '
          @else'
          let %x @else
            text ' let'
            typeDecl %x
              text ' '
              decl %x
            text ' = 2.0;'
          text '
        }'
      text '
      '"
  `);
});

test("@else compound statement", () => {
  const src = `
    fn test() {
      @if(MOBILE) { let a = 1; }
      @else { let a = 2; }
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn test()
        decl %test
        statement
          text '{
          @if(MOBILE) '
          statement @if
            text '{'
            let %a
              text ' let'
              typeDecl %a
                text ' '
                decl %a
              text ' = 1;'
            text ' }'
          text '
          @else '
          statement @else
            text '{'
            let %a
              text ' let'
              typeDecl %a
                text ' '
                decl %a
              text ' = 2;'
            text ' }'
          text '
        }'
      text '
      '"
  `);
});

test("@else with struct member", () => {
  const src = `
    struct Point {
      @if(DIMENSIONS_2) x: f32,
      @else x: vec3<f32>,
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      struct Point
        text 'struct '
        decl %Point
        text ' {'
        member @if x: f32
          text '
          @if(DIMENSIONS_2) '
          name x
          text ': '
          type f32
            ref f32
        text ','
        member @else x: vec3<f32>
          text '
          @else '
          name x
          text ': '
          type vec3<f32>
            ref vec3
            text '<'
            type f32
              ref f32
            text '>'
        text ',
        }'
      text '
      '"
  `);
});

test("@if with import", () => {
  const src = `
    @if(DEBUG) import package::debug;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  // Expected output once grammar supports @if on imports:
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      import package::debug; @if
      text '
      '"
  `);
});

test("@else with import", () => {
  const src = `
    @if(false) import package::a;
    @else import package::b;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  // Expected output once grammar supports @if/@else on imports:
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      import package::a; @if
      text '
        '
      import package::b; @else
      text '
      '"
  `);
});

test("parse @else fn", () => {
  const src = `
    @if(FOO)
    fn testFn() { let a = 0; }
    @else
    fn testFn() { let a = 1; }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(
    `
    "module
      text '
        '
      fn testFn() @if
        decl %testFn
        statement
          text '{'
          let %a
            text ' let'
            typeDecl %a
              text ' '
              decl %a
            text ' = 0;'
          text ' }'
      fn testFn() @else
        decl %testFn
        statement
          text '{'
          let %a
            text ' let'
            typeDecl %a
              text ' '
              decl %a
            text ' = 1;'
          text ' }'
      text '
      '"
  `,
  );
});

// test("", () => {
//   const src = `
//   `;
//   const ast = parseTest(src);
//   const astString = astToString(ast.moduleElem);
//   expect(astString).toMatchInlineSnapshot('tbd');
// });
