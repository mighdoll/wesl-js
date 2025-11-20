import { expect, test } from "vitest";
import { link } from "../Linker.ts";

test("bind standard types in function signatures - V2", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        fn test() -> vec4f {
          return vec4f(1.0, 2.0, 3.0, 4.0);
        }

        fn main() {
          let x = test();
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  // Should successfully link without "unresolved identifier" errors
  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("fn test()");
  expect(result.dest).toContain("fn main()");
});

test("bind mat3x3 in function signatures", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        fn identity() -> mat3x3f {
          return mat3x3f(
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
          );
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("mat3x3f");
});

test("bind vec3f in struct members", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        struct Vertex {
          position: vec3f,
          normal: vec3f,
        }

        fn getVertex() -> Vertex {
          return Vertex(vec3f(0.0), vec3f(1.0, 0.0, 0.0));
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec3f");
  expect(result.dest).toContain("struct Vertex");
});

test("bind types in @if partials", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        @if(USE_VEC4)
        fn process() -> vec4f {
          return vec4f(1.0);
        }

        @if(USE_MAT)
        fn transform() -> mat4x4f {
          return mat4x4f();
        }

        fn main() {
          let x = process();
          let y = transform();
        }
      `,
    },
    rootModuleName: "main.wesl",
    conditions: { USE_VEC4: true, USE_MAT: true },
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("mat4x4f");
  expect(result.dest).toContain("fn process()");
  expect(result.dest).toContain("fn transform()");
});

test("bind types in const declarations - like lygia", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        const SCALE: vec4f = vec4f(0.1031, 0.1030, 0.0973, 0.1099);

        fn random(p: f32) -> f32 {
          var x = fract(p * SCALE.x);
          return x;
        }

        fn main() {
          let r = random(1.0);
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("const SCALE");
  expect(result.dest).toContain("fn random");
});

test("bind types in override declarations with type annotation and initializer", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        override SCALE: vec4f = vec4f(0.1, 0.2, 0.3, 0.4);

        fn main() {
          let s = SCALE.x;
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("override SCALE");
});

test("bind types in global var declarations with type annotation and initializer", async () => {
  const result = await link({
    weslSrc: {
      "main.wesl": `
        var<private> color: vec4f = vec4f(1.0, 0.0, 0.0, 1.0);

        fn main() {
          let c = color.rgb;
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("var<private> color");
});

test("bind mat4x4f constructor in override initializer (tests initializer scope binding)", async () => {
  // This tests that the initializer expression's type refs are bound
  // If only typeScope is used for dependentScope, mat4x4f in initializer won't be bound
  const result = await link({
    weslSrc: {
      "main.wesl": `
        override MATRIX: mat4x4f = mat4x4f(1.0, 0.0, 0.0, 0.0,
                                           0.0, 1.0, 0.0, 0.0,
                                           0.0, 0.0, 1.0, 0.0,
                                           0.0, 0.0, 0.0, 1.0);

        fn main() {
          let m = MATRIX;
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("mat4x4f");
  expect(result.dest).toContain("override MATRIX");
});

test("bind vec3f constructor in global var initializer (tests initializer scope binding)", async () => {
  // This tests that the initializer expression's type refs are bound
  // If only typeScope is used for dependentScope, vec3f in initializer won't be bound
  const result = await link({
    weslSrc: {
      "main.wesl": `
        var<private> position: vec3f = vec3f(1.0, 2.0, 3.0);

        fn main() {
          let p = position;
        }
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec3f");
  expect(result.dest).toContain("var<private> position");
});

test("bind initializer types in imported override (cross-module)", async () => {
  // This test exposes the bug: when override is imported from another module,
  // only dependentScope is processed. If dependentScope = typeScope (not full scope),
  // the initializer's vec4f won't be bound.
  const result = await link({
    weslSrc: {
      "main.wesl": `
        import package::lib::SCALE;

        fn main() {
          let s = SCALE.x;
        }
      `,
      "lib.wesl": `
        override SCALE: vec4f = vec4f(0.1, 0.2, 0.3, 0.4);
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("override SCALE");
});

test("bind initializer types in imported global var (cross-module)", async () => {
  // Same bug for global var: dependentScope = typeScope means initializer not bound
  const result = await link({
    weslSrc: {
      "main.wesl": `
        import package::lib::color;

        fn main() {
          let c = color.rgb;
        }
      `,
      "lib.wesl": `
        var<private> color: vec4f = vec4f(1.0, 0.0, 0.0, 1.0);
      `,
    },
    rootModuleName: "main.wesl",
  });

  expect(result.dest).toContain("vec4f");
  expect(result.dest).toContain("var<private> color");
});
