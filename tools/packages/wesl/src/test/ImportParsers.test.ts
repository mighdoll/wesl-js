import { expect, test } from "vitest";
import {
  importCollectionAdapter,
  importPathOrItemAdapter,
  importStatementAdapter,
  importStatementBaseAdapter,
} from "../parse/ImportAdapters.ts";
import { testAppParse } from "./TestUtil.ts";

test("parse simple import item", () => {
  const result = testAppParse(importPathOrItemAdapter, "foo");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [],
    finalSegment: {
      kind: "import-item",
      name: "foo",
    },
  });
});

test("parse import with alias", () => {
  const result = testAppParse(importPathOrItemAdapter, "foo as bar");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [],
    finalSegment: {
      kind: "import-item",
      name: "foo",
      as: "bar",
    },
  });
});

test("parse simple import path", () => {
  const result = testAppParse(importPathOrItemAdapter, "foo::bar");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "foo",
      },
    ],
    finalSegment: {
      kind: "import-item",
      name: "bar",
    },
  });
});

test("parse import collection", () => {
  const result = testAppParse(importCollectionAdapter, "{ foo, bar }");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-collection",
    subtrees: [
      {
        kind: "import-statement",
        segments: [],
        finalSegment: { kind: "import-item", name: "foo" },
      },
      {
        kind: "import-statement",
        segments: [],
        finalSegment: { kind: "import-item", name: "bar" },
      },
    ],
  });
});

test("parse import with collection", () => {
  const result = testAppParse(importPathOrItemAdapter, "foo::{bar, baz}");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "foo",
      },
    ],
    finalSegment: {
      kind: "import-collection",
      subtrees: [
        {
          kind: "import-statement",
          segments: [],
          finalSegment: { kind: "import-item", name: "bar" },
        },
        {
          kind: "import-statement",
          segments: [],
          finalSegment: { kind: "import-item", name: "baz" },
        },
      ],
    },
  });
});

test("parse nested import path", () => {
  const result = testAppParse(importPathOrItemAdapter, "foo::bar::baz");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      { kind: "import-segment", name: "foo" },
      { kind: "import-segment", name: "bar" },
    ],
    finalSegment: {
      kind: "import-item",
      name: "baz",
    },
  });
});

test("parse complex nested collection", () => {
  const result = testAppParse(
    importPathOrItemAdapter,
    "pkg::{a, b::c, d::{e, f}}",
  );
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "pkg",
      },
    ],
    finalSegment: {
      kind: "import-collection",
      subtrees: [
        {
          kind: "import-statement",
          segments: [],
          finalSegment: { kind: "import-item", name: "a" },
        },
        {
          kind: "import-statement",
          segments: [{ kind: "import-segment", name: "b" }],
          finalSegment: { kind: "import-item", name: "c" },
        },
        {
          kind: "import-statement",
          segments: [{ kind: "import-segment", name: "d" }],
          finalSegment: {
            kind: "import-collection",
            subtrees: [
              {
                kind: "import-statement",
                segments: [],
                finalSegment: { kind: "import-item", name: "e" },
              },
              {
                kind: "import-statement",
                segments: [],
                finalSegment: { kind: "import-item", name: "f" },
              },
            ],
          },
        },
      ],
    },
  });
});

test("parse full import statement", () => {
  const result = testAppParse(importStatementBaseAdapter, "import foo::bar;");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "foo",
      },
    ],
    finalSegment: {
      kind: "import-item",
      name: "bar",
    },
  });
});

test("parse import statement with relative", () => {
  const result = testAppParse(
    importStatementBaseAdapter,
    "import package::foo;",
  );
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "package",
      },
    ],
    finalSegment: {
      kind: "import-item",
      name: "foo",
    },
  });
});

test("parse import elem", () => {
  const result = testAppParse(importStatementAdapter, "import foo;");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import",
    imports: {
      kind: "import-statement",
      segments: [],
      finalSegment: {
        kind: "import-item",
        name: "foo",
      },
    },
  });
});

test("parse import collection with trailing comma", () => {
  const result = testAppParse(importCollectionAdapter, "{ foo, bar, }");
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-collection",
    subtrees: [
      {
        kind: "import-statement",
        segments: [],
        finalSegment: { kind: "import-item", name: "foo" },
      },
      {
        kind: "import-statement",
        segments: [],
        finalSegment: { kind: "import-item", name: "bar" },
      },
    ],
  });
});

test("parse complex import with trailing comma", () => {
  const result = testAppParse(
    importStatementBaseAdapter,
    "import bevy_pbr::{pbr_functions, pbr_bindings,};",
  );
  expect(result).toBeTruthy();
  expect(result.parsed?.value).toMatchObject({
    kind: "import-statement",
    segments: [
      {
        kind: "import-segment",
        name: "bevy_pbr",
      },
    ],
    finalSegment: {
      kind: "import-collection",
      subtrees: [
        {
          kind: "import-statement",
          segments: [],
          finalSegment: { kind: "import-item", name: "pbr_functions" },
        },
        {
          kind: "import-statement",
          segments: [],
          finalSegment: { kind: "import-item", name: "pbr_bindings" },
        },
      ],
    },
  });
});
