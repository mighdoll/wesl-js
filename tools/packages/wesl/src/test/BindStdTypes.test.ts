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
