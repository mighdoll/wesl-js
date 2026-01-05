import { test, expect } from "vitest";
import { parser } from "../parser.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(dir, "fixtures");

interface ParseResult {
  errors: number;
  positions: string[];
}

function parseSource(src: string): ParseResult {
  const tree = parser.parse(src);
  const positions: string[] = [];
  tree.iterate({
    enter(node) {
      if (node.type.isError) {
        const line = src.slice(0, node.from).split("\n").length;
        const snippet = src.slice(Math.max(0, node.from - 10), node.from + 20).replace(/\n/g, "\\n");
        positions.push(`line ${line}: ...${snippet}...`);
      }
    },
  });
  return { errors: positions.length, positions };
}

function parseFile(name: string): ParseResult {
  const src = readFileSync(join(fixtures, name), "utf-8");
  return parseSource(src);
}

function expectNoParsErrors(name: string) {
  const result = parseFile(name);
  if (result.errors > 0) {
    console.log(`\n${name} errors:\n  ${result.positions.join("\n  ")}`);
  }
  expect(result.errors).toBe(0);
}

test("parse imports.wesl", () => expectNoParsErrors("imports.wesl"));
test("parse compute.wgsl", () => expectNoParsErrors("compute.wgsl"));
test("parse render.wgsl", () => expectNoParsErrors("render.wgsl"));
test("parse statements.wgsl", () => expectNoParsErrors("statements.wgsl"));
