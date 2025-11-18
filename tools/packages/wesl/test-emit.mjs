#!/usr/bin/env node
import { weslParserConfig } from "./src/ParseWESL.ts";
import { parseWeslV2 } from "./src/parse/v2/WeslParserV2.ts";
import { lowerAndEmit } from "./src/LowerAndEmit.ts";
import { SrcMapBuilder } from "mini-parse";

weslParserConfig.useV2Parser = true;

const src = `@if(true) const c1 = 10;
@if(true) const c2 = 10;
@if(true) const c3 = 10;`;

const srcModule = { src, modulePath: "test.wgsl", debugFilePath: "test.wgsl" };
const result = parseWeslV2(srcModule);

const srcBuilder = new SrcMapBuilder([srcModule]);
lowerAndEmit({
  srcBuilder,
  rootElems: result.moduleElem.contents,
  conditions: { true: true },
  extracting: true
});

const output = srcBuilder.finish();
console.log("Output:");
console.log(JSON.stringify(output.src));
console.log("\nActual output:");
console.log(output.src);
