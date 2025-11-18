#!/usr/bin/env node
import { parseWeslV2 } from "./src/parse/v2/WeslParserV2.ts";
import { weslParserConfig } from "./src/ParseWESL.ts";
import { lowerAndEmit } from "./src/LowerAndEmit.ts";
import { SrcMapBuilder } from "mini-parse";

const src = `const c1 = 10;
const c2 = 10;
const c3 = 10;`;

weslParserConfig.useV2Parser = true;

const srcModule = { src, modulePath: "test.wgsl", debugFilePath: "test.wgsl" };
const result = parseWeslV2(srcModule);

const srcBuilder = new SrcMapBuilder();

lowerAndEmit({
  srcBuilder,
  rootElems: result.moduleElem.contents,
  conditions: {},
  extracting: true,
});

console.log("Output:");
console.log(JSON.stringify(srcBuilder.src()));
console.log("\nExpected:");
console.log(JSON.stringify("const c1 = 10;\n\nconst c2 = 10;\n\nconst c3 = 10;\n\n"));
