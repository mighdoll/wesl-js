import { expect, test } from "vitest";
import { astToString } from "../debug/ASTtoString.ts";
import { importToString } from "../debug/ImportToString.ts";
import { parseTest, parseTestRaw } from "./TestUtil.ts";

test("parse empty string", () => {
  const ast = parseTest("");
  expect(astToString(ast.moduleElem)).toMatchInlineSnapshot(`"module"`);
});

test("parse fn foo() { }", () => {
  const src = "fn foo() { }";
  const ast = parseTest(src);
  expect(astToString(ast.moduleElem)).toMatchInlineSnapshot(`
    "module
      fn foo()
        decl %foo
        statement
          text '{ }'"
  `);
});

test("parse fn with calls", () => {
  const src = "fn foo() { foo(); bar(); }";
  const ast = parseTest(src);
  expect(astToString(ast.moduleElem)).toMatchInlineSnapshot(`
    "module
      fn foo()
        decl %foo
        statement
          text '{'
          statement
            text ' '
            ref foo
            text '();'
          statement
            text ' '
            ref bar
            text '();'
          text ' }'"
  `);
});

test("parse unicode ident", () => {
  // List taken straight from the examples at https://www.w3.org/TR/WGSL/#identifiers
  const src = `
  fn Δέλτα(){} 
  fn réflexion(){} 
  fn Кызыл(){} 
  fn 𐰓𐰏𐰇(){} 
  fn 朝焼け(){}
  fn سلام(){} 
  fn 검정(){} 
  fn שָׁלוֹם(){}
  fn गुलाबी(){}
  fn փիրուզ(){}
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchSnapshot();
});

test("parse global var", () => {
  const src = `var x: i32 = 1;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      gvar %x : i32
        text 'var'
        typeDecl %x : i32
          text ' '
          decl %x
          text ': '
          type i32
            ref i32
        text ' = 1;'"
  `);
});

test("parse alias", () => {
  const src = `alias Num = i32;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      alias %Num=i32
        text 'alias '
        decl %Num
        text ' = '
        type i32
          ref i32
        text ';'"
  `);
});

test("parse const", () => {
  const src = `const y = 11u;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      const %y
        text 'const'
        typeDecl %y
          text ' '
          decl %y
        text ' = 11u;'"
  `);
});

test("parse override ", () => {
  const src = `override z: f32;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      override %z : f32
        text 'override'
        typeDecl %z : f32
          text ' '
          decl %z
          text ': '
          type f32
            ref f32
        text ';'"
  `);
});

test("parse const_assert", () => {
  const src = `const_assert x < y;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      assert
        text 'const_assert '
        ref x
        text ' < '
        ref y
        text ';'"
  `);
});

test("parse struct", () => {
  const src = `struct foo { bar: i32, zip: u32, } ;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      struct foo
        text 'struct '
        decl %foo
        text ' {'
        member bar: i32
          text ' '
          name bar
          text ': '
          type i32
            ref i32
        text ','
        member zip: u32
          text ' '
          name zip
          text ': '
          type u32
            ref u32
        text ', }'
      text ' ;'"
  `);
});

test("parse global diagnostic", () => {
  const src = `
    diagnostic(off,derivative_uniformity);

    fn main() {}
    `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      directive diagnostic(off, derivative_uniformity)
      text '

        '
      fn main()
        decl %main
        statement
          text '{}'
      text '
        '"
  `);
});

test("parse @attribute before fn", () => {
  const src = `@compute fn main() {} `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main() @compute
        decl %main
        statement
          text '{}'
      text ' '"
  `);
});

test("parse @compute @workgroup_size(a, b, 1) before fn", () => {
  const src = `
    @compute 
    @workgroup_size(a, b, 1) 
    fn main() {}
    `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main() @compute @workgroup_size
        decl %main
        statement
          text '{}'
      text '
        '"
  `);
});

test("parse top level var", () => {
  const src = `
    @group(0) @binding(0) var<uniform> u: Uniforms;      

    fn main() {}
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      gvar %u : Uniforms @group @binding
        text 'var<uniform>'
        typeDecl %u : Uniforms
          text ' '
          decl %u
          text ': '
          type Uniforms
            ref Uniforms
        text ';'
      text '      

        '
      fn main()
        decl %main
        statement
          text '{}'
      text '
      '"
  `);
});

test("parse top level override and const", () => {
  const src = `
    override x = 21;
    const y = 1;

    fn main() {}
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      override %x
        text '
        override'
        typeDecl %x
          text ' '
          decl %x
        text ' = 21;'
      const %y
        text '
        const'
        typeDecl %y
          text ' '
          decl %y
        text ' = 1;'
      text '

        '
      fn main()
        decl %main
        statement
          text '{}'
      text '
      '"
  `);
});

test("parse root level ;;", () => {
  const src = ";;";
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text ';;'"
  `);
});

test("parse simple alias", () => {
  const src = `alias NewType = OldType;`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      alias %NewType=OldType
        text 'alias '
        decl %NewType
        text ' = '
        type OldType
          ref OldType
        text ';'"
  `);
});

test("parse array alias", () => {
  const src = `
    alias Points3 = array<Point, 3>;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      alias %Points3=array<Point, >
        text 'alias '
        decl %Points3
        text ' = '
        type array<Point, >
          ref array
          text '<Point,'
          expression 
          text '>'
        text ';'
      text '
      '"
  `);
});

test("fnDecl parses fn with return type", () => {
  const src = `fn foo() -> MyType { }`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn foo() -> MyType
        decl %foo
        type MyType
          ref MyType
        statement
          text '{ }'"
  `);
});

test("fnDecl parses :type specifier in fn args", () => {
  const src = `
    fn foo(a: MyType) { }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn foo(a: MyType)
        decl %foo
        param
          text 'a: '
          type MyType
            ref MyType
        statement
          text '{ }'
      text '
      '"
  `);
});

test("fnDecl parses :type specifier in fn block", () => {
  const src = `
    fn foo() { 
      var b:MyType;
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn foo()
        decl %foo
        statement
          text '{'
          var %b : MyType
            text ' 
          var'
            typeDecl %b : MyType
              text ' '
              decl %b
              text ':'
              type MyType
                ref MyType
            text ';'
          text '
        }'
      text '
      '"
  `);
});

test("parse type in <template> in fn args", () => {
  const src = `
    fn foo(a: vec2<MyStruct>) { };`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn foo(a: vec2<MyStruct>)
        decl %foo
        param
          text 'a: '
          type vec2<MyStruct>
            ref vec2
            text '<MyStruct>'
        statement
          text '{ }'
      text ';'"
  `);
});

test("parse simple templated type", () => {
  const src = `fn main(a: array<MyStruct,4>) { }`;

  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main(a: array<MyStruct, >)
        decl %main
        param
          text 'a: '
          type array<MyStruct, >
            ref array
            text '<MyStruct,'
            expression 
            text '>'
        statement
          text '{ }'"
  `);
});

test("parse with space before template", () => {
  const src = `fn main(a: array <MyStruct,4>) { }`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main(a: array<MyStruct, >)
        decl %main
        param
          text 'a: '
          type array<MyStruct, >
            ref array
            text ' <MyStruct,'
            expression 
            text '>'
        statement
          text '{ }'"
  `);
});

test("parse nested template that ends with >> ", () => {
  const src = `fn main(a: vec2<array <MyStruct,4>>) { }`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main(a: vec2<array<MyStruct, '4'>>)
        decl %main
        param
          decl %a
          typeDecl %a : vec2<array<MyStruct, '4'>>
            text ': '
            type vec2<array<MyStruct, '4'>>
              ref vec2
              text '<'
              type array<MyStruct, '4'>
                ref array
                text ' <'
                type MyStruct
                  ref MyStruct
                text ','
                expression '4'
                  text '4'
                text '>'
              text '>'
        statement
          text '{ }'"
  `);
});

test("parse type in <template> in global var", () => {
  const src = `var<private> x:array<MyStruct, 8>;`;

  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      gvar %x : array<MyStruct, >
        text 'var<private>'
        typeDecl %x : array<MyStruct, >
          text ' '
          decl %x
          text ':'
          type array<MyStruct, >
            ref array
            text '<MyStruct,'
            expression 
            text '>'
        text ';'"
  `);
});

test("parse for(;;) {} not as a fn call", () => {
  const src = `
    fn main() {
      for (var a = 1; a < 10; a++) {}
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
          for ('
          var %a
            text 'var '
            typeDecl %a
              decl %a
            text ' = 1'
          text '; '
          ref a
          text ' < 10; '
          ref a
          text '++) '
          statement
            text '{}'
          text '
        }'
      text '
      '"
  `);
});

test("eolf followed by blank line", () => {
  const src = `
    fn foo() { }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn foo()
        decl %foo
        statement
          text '{ }'
      text '
      '"
  `);
});

test("parse fn with attributes and suffix comma", () => {
  const src = `
  @compute
  @workgroup_size(workgroupThreads, 1, 1) 
  fn main(
      @builtin(global_invocation_id) grid: vec3<u32>,
      @builtin(local_invocation_index) localIndex: u32,  
  ) { }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main(grid: vec3<u32>, localIndex: u32) @compute @workgroup_size
        decl %main
        param
          text 'grid: '
          type vec3<u32>
            ref vec3
            text '<u32>'
        param
          text 'localIndex: '
          type u32
            ref u32
        statement
          text '{ }'
      text '
      '"
  `);
});

test("parse fn", () => {
  const src = `fn foo(x: i32, y: u32) -> f32 { return 1.0; }`;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn foo(x: i32, y: u32) -> f32
        decl %foo
        param
          text 'x: '
          type i32
            ref i32
        param
          text 'y: '
          type u32
            ref u32
        type f32
          ref f32
        statement
          text '{'
          statement
            text ' return 1.0;'
          text ' }'"
  `);
});

test("parse @attribute before fn", () => {
  const src = `@compute fn main() {} `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main() @compute
        decl %main
        statement
          text '{}'
      text ' '"
  `);
});

test("import package::foo::bar;", ctx => {
  const src = ctx.task.name;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      import package::foo::bar;"
  `);
});

test("parse foo::bar(); ", () => {
  const src = "fn main() { foo::bar(); }";
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main()
        decl %main
        statement
          text '{'
          statement
            text ' '
            ref foo::bar
            text '();'
          text ' }'"
  `);
});

test("parse let x: foo::bar; ", () => {
  const src = "fn main() { let x: foo::bar = 1; }";
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main()
        decl %main
        statement
          text '{'
          let %x : foo::bar
            text ' let'
            typeDecl %x : foo::bar
              text ' '
              decl %x
              text ': '
              type foo::bar
                ref foo::bar
            text ' = 1;'
          text ' }'"
  `);
});

test("parse var x: foo::bar;", () => {
  const src = `
     var<private> x: foo::bar;
     fn main() { }
  `;

  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
         '
      gvar %x : foo::bar
        text 'var<private>'
        typeDecl %x : foo::bar
          text ' '
          decl %x
          text ': '
          type foo::bar
            ref foo::bar
        text ';'
      text '
         '
      fn main()
        decl %main
        statement
          text '{ }'
      text '
      '"
  `);
});

test("parse switch statement", () => {
  const src = `
    fn main(x: i32) {
      switch (x) {
        case 1: { break; }
        default: { break; }
      }
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn main(x: i32)
        decl %main
        param
          text 'x: '
          type i32
            ref i32
        statement
          text '{'
          statement
            text '
          switch ('
            ref x
            text ') {
            case 1: '
            statement
              text '{'
              statement
              text ' }'
            text '
            default: '
            statement
              text '{'
              statement
              text ' }'
            text '
          }'
          text '
        }'
      text '
      '"
  `);
});

test("parse switch statement-2", () => {
  const src = `

    fn main(x: u32) {
      switch ( code ) {
        case 5u: { if 1 > 0 { } }
        default: { break; }
      }
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '

        '
      fn main(x: u32)
        decl %main
        param
          text 'x: '
          type u32
            ref u32
        statement
          text '{'
          statement
            text '
          switch ( '
            ref code
            text ' ) {
            case 5u: '
            statement
              text '{'
              statement
                statement
                  text '{ }'
              text ' }'
            text '
            default: '
            statement
              text '{'
              statement
              text ' }'
            text '
          }'
          text '
        }'
      text '
      '"
  `);
});

test("parse struct constructor in assignment", () => {
  const src = `
    fn main() {
      var x = AStruct(1u);
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
            text ' = '
            ref AStruct
            text '(1u);'
          text '
        }'
      text '
       '"
  `);
});

test("parse struct.member (component_or_swizzle)", () => {
  const src = `
    fn main() {
        let x = u.frame;
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
          let %x
            text '
            let'
            typeDecl %x
              text ' '
              decl %x
            text ' = '
            ref u
            text '.frame;'
          text '
        }'
      text '
      '"
  `);
});

test("var<workgroup> work: array<u32, 128>;", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      gvar %work : array<u32, >
        text 'var<workgroup>'
        typeDecl %work : array<u32, >
          text ' '
          decl %work
          text ': '
          type array<u32, >
            ref array
            text '<u32,'
            expression 
            text '>'
        text ';'"
  `);
});

test("fn f() { _ = 1; }", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn f()
        decl %f
        statement
          text '{'
          statement
            text ' _ = 1;'
          text ' }'"
  `);
});

test("var foo: vec2<f32 >= vec2( 0.5, -0.5);", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      gvar %foo : vec2<f32>
        text 'var'
        typeDecl %foo : vec2<f32>
          text ' '
          decl %foo
          text ': '
          type vec2<f32>
            ref vec2
            text '<f32 >'
        text '= '
        ref vec2
        text '( 0.5, -0.5);'"
  `);
});

test("fn main() { var tmp: array<i32, 1 << 1>=array(1, 2); }", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn main()
        decl %main
        statement
          text '{ '
          var %tmp : array<i32, '1 << 1'>
            text 'var '
            typeDecl %tmp : array<i32, '1 << 1'>
              decl %tmp
              text ': '
              type array<i32, '1 << 1'>
                ref array
                text '<'
                type i32
                  ref i32
                text ', '
                expression '1 << 1'
                  text '1 << 1'
                text '>'
            text '='
            ref array
            text '(1, 2)'
          text '; }'"
  `);
});

test("import a::b::c;", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      import a::b::c;"
  `);
});

test("import package::file1::{foo, bar};", ctx => {
  const src = ctx.task.name;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      import package::file1::{foo, bar};"
  `);
});

test("import package::file1::{foo, bar};", ctx => {
  const src = ctx.task.name;
  const ast = parseTest(src);
  const imps = ast.imports.map(t => importToString(t)).join("\n");

  expect(imps).toMatchInlineSnapshot(`"package::file1::{foo, bar};"`);
});

test("import foo_bar::boo;", ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      import foo_bar::boo;"
  `);
});

test(`import a::{ b };`, ctx => {
  const ast = parseTest(ctx.task.name);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      import a::{b};"
  `);
});

test(`import a::{ b, c::{d, e}, f };`, ctx => {
  const src = ctx.task.name;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);

  expect(astString).toMatchInlineSnapshot(`
    "module
      import a::{b, c::{d, e}, f};"
  `);
});

test(`parse ptr`, () => {
  const src = `
    var particles: ptr<storage, f32, read_write>;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      gvar %particles : ptr<storage, f32, read_write>
        text 'var'
        typeDecl %particles : ptr<storage, f32, read_write>
          text ' '
          decl %particles
          text ': '
          type ptr<storage, f32, read_write>
            ref ptr
            text '<storage, f32, read_write>'
        text ';'
      text '
      '"
  `);
});

test(`parse ptr with internal array`, () => {
  const src = `
    var particles: ptr<storage, array<f32>, read_write>;
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      gvar %particles : ptr<storage, array<f32>, read_write>
        text 'var'
        typeDecl %particles : ptr<storage, array<f32>, read_write>
          text ' '
          decl %particles
          text ': '
          type ptr<storage, array<f32>, read_write>
            ref ptr
            text '<storage, array<f32>, read_write>'
        text ';'
      text '
      '"
  `);
});

test(`parse binding struct`, () => {
  const src = `
    struct Bindings {
      @group(0) @binding(0) particles: ptr<storage, array<f32>, read_write>, 
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      struct Bindings
        text 'struct '
        decl %Bindings
        text ' {'
        member @group @binding particles: ptr<storage, array<f32>, read_write>
          text '
          @group(0) @binding(0) '
          name particles
          text ': '
          type ptr<storage, array<f32>, read_write>
            ref ptr
            text '<storage, array<f32>, read_write>'
        text ', 
        }'
      text '
      '"
  `);
});

test(`parse struct reference`, () => {
  const src = `
    fn f() { let x = a.b[0]; };
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn f()
        decl %f
        statement
          text '{'
          let %x
            text ' let'
            typeDecl %x
              text ' '
              decl %x
            text ' = '
            ref a
            text '.b[0];'
          text ' }'
      text ';
      '"
  `);
});

test("member reference with extra components", () => {
  const src = `
  fn foo() {
    output[ out + 0u ] = c.p0.t0.x;
  }
 `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
      '
      fn foo()
        decl %foo
        statement
          text '{'
          statement
            text '
        '
            ref output
            text '[ '
            ref out
            text ' + 0u ] = '
            ref c
            text '.p0.t0.x;'
          text '
      }'
      text '
     '"
  `);
});

test("parse let declaration", () => {
  const src = `
    fn vertexMain() {
      let char = array<u32, 2>(0, 0);
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn vertexMain()
        decl %vertexMain
        statement
          text '{'
          let %char
            text '
          let'
            typeDecl %char
              text ' '
              decl %char
            text ' = '
            ref array
            text '<u32, 2>(0, 0);'
          text '
        }'
      text '
      '"
  `);
});

test("parse let declaration with type", () => {
  const src = `
    fn vertexMain() {
      let char : u32 = 0;
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn vertexMain()
        decl %vertexMain
        statement
          text '{'
          let %char : u32
            text '
          let'
            typeDecl %char : u32
              text ' '
              decl %char
              text ' : '
              type u32
                ref u32
            text ' = 0;'
          text '
        }'
      text '
      '"
  `);
});

test("separator in let assignment", () => {
  const src = `
    fn vertexMain() {
      let a = b::c;
    }
  `;
  const ast = parseTestRaw(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn vertexMain()
        decl %vertexMain
        statement
          text '{'
          let %a
            text '
          let'
            typeDecl %a
              text ' '
              decl %a
            text ' = '
            ref b::c
            text ';'
          text '
        }'
      text '
      '"
  `);
});

test("separator in fn call ", () => {
  const src = `
    fn vertexMain() {
      b::c();
    }
  `;
  const ast = parseTestRaw(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      fn vertexMain()
        decl %vertexMain
        statement
          text '{'
          statement
            text '
          '
            ref b::c
            text '();'
          text '
        }'
      text '
      '"
  `);
});

test("binding struct", () => {
  const src = `
    struct Bindings {
      @group(0) @binding(0) particles: ptr<storage, array<f32>, read_write>, 
      @group(0) @binding(1) uniforms: ptr<uniform, Uniforms>, 
      @group(0) @binding(2) tex: texture_2d<rgba8unorm>,
      @group(0) @binding(3) samp: sampler,
    }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      text '
        '
      struct Bindings
        text 'struct '
        decl %Bindings
        text ' {'
        member @group @binding particles: ptr<storage, array<f32>, read_write>
          text '
          @group(0) @binding(0) '
          name particles
          text ': '
          type ptr<storage, array<f32>, read_write>
            ref ptr
            text '<storage, array<f32>, read_write>'
        text ','
        member @group @binding uniforms: ptr<uniform, Uniforms>
          text ' 
          @group(0) @binding(1) '
          name uniforms
          text ': '
          type ptr<uniform, Uniforms>
            ref ptr
            text '<uniform, Uniforms>'
        text ','
        member @group @binding tex: texture_2d<rgba8unorm>
          text ' 
          @group(0) @binding(2) '
          name tex
          text ': '
          type texture_2d<rgba8unorm>
            ref texture_2d
            text '<rgba8unorm>'
        text ','
        member @group @binding samp: sampler
          text '
          @group(0) @binding(3) '
          name samp
          text ': '
          type sampler
            ref sampler
        text ',
        }'
      text '
      '"
  `);
});

test("memberRefs with extra components", () => {
  const src = `
    fn main() {
      b.particles[0] = b.uniforms.foo;
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
          statement
            text '
          '
            ref b
            text '.particles[0] = '
            ref b
            text '.uniforms.foo;'
          text '
        }'
      text '
      '"
  `);
});

test("memberRef with ref in array", () => {
  const src = `
    fn main() {
      vsOut.barycenticCoord[vertNdx] = 1.0;
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
          statement
            text '
          '
            ref vsOut
            text '.barycenticCoord['
            ref vertNdx
            text '] = 1.0;'
          text '
        }'
      text '
      '"
  `);
});

test("parse inline package reference", () => {
  const src = `
    fn main() {
      package::foo::bar();
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
          statement
            text '
          '
            ref package::foo::bar
            text '();'
          text '
        }'
      text '
      '"
  `);
});

test("parse @location", () => {
  const src = `
      @fragment
      fn fragmentMain(@builtin(position) pos: vec4f) -> @location(0) vec4f { 
        return pos;
      }
  `;
  const ast = parseTest(src);
  const astString = astToString(ast.moduleElem);
  expect(astString).toMatchInlineSnapshot(`
    "module
      fn fragmentMain(pos: vec4f) @fragment -> vec4f
        decl %fragmentMain
        param
          text 'pos: '
          type vec4f
            ref vec4f
        type vec4f
          ref vec4f
        statement
          text '{'
          statement
            text ' 
            return '
            ref pos
            text ';'
          text '
          }'
      text '
      '"
  `);
});

test("parse foo::else()", () => {
  const src = `
    fn main() {
      foo::else();
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
          statement
            text '
          '
            ref foo::else
            text '();'
          text '
        }'
      text '
      '"
  `);
});
