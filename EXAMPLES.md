# WESL Parser Examples

This document contains code examples from the WESL test suite.

## Simple Function

Here's how to parse a simple WGSL function:

<!-- snippet: simple-function -->
```typescript
const src = "fn foo() { }";
const ast = parseTest(src);
expect(astToString(ast.moduleElem)).toMatchInlineSnapshot(`
  "module
    fn foo()
      decl %foo
      statement
        text '{ }'"
`);
```
<!-- /snippet -->

## Struct Parsing

Example of parsing a struct definition:

<!-- snippet: parse-struct -->
```typescript
const src = `struct foo { bar: i32, zip: u32, } ;`;
const ast = parseTest(src);
const astString = astToString(ast.moduleElem);
expect(astString).toMatchInlineSnapshot(`
  "module
    struct foo
      text 'struct '
      decl %foo
      text ' { '
      member bar: i32
        name bar
        text ': '
        type i32
          ref i32
      text ', '
      member zip: u32
        name zip
        text ': '
        type u32
          ref u32
      text ', }'
    text ' ;'"
`);
```
<!-- /snippet -->

## Import Statement

Example of parsing an import statement:

<!-- snippet: import-example -->
```typescript
const src = ctx.task.name;
const ast = parseTest(src);
const astString = astToString(ast.moduleElem);
expect(astString).toMatchInlineSnapshot(`
  "module
    import package::foo::bar;"
`);
```
<!-- /snippet -->
