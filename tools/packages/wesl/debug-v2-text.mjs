#!/usr/bin/env node
import { parseWeslV2 } from "./src/parse/v2/WeslParserV2.ts";

const src = `@if(true) const c1 = 10;
@if(true) const c2 = 10;
@if(true) const c3 = 10;`;

const srcModule = { src, modulePath: "test.wgsl", debugFilePath: "test.wgsl" };
const result = parseWeslV2(srcModule);

function showTextElems(elem, depth = 0) {
  const indent = "  ".repeat(depth);

  if (elem.kind === "text") {
    const text = elem.srcModule.src.slice(elem.start, elem.end);
    const repr = JSON.stringify(text);
    const trimmed = text.trim() === "" ? " [WHITESPACE-ONLY]" : "";
    console.log(`${indent}text[${elem.start}-${elem.end}]: ${repr}${trimmed}`);
  } else if (elem.contents) {
    console.log(`${indent}${elem.kind}:` + (elem.attributes ? ` [@${elem.attributes[0]?.condition}]` : ""));
    elem.contents.forEach(child => showTextElems(child, depth + 1));
  }
}

console.log("V2 Text Elements with @if attributes:");
showTextElems(result.moduleElem);
