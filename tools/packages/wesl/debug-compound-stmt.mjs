#!/usr/bin/env node
import { parseWeslV2 } from "./src/parse/v2/WeslParserV2.ts";

const src = `fn func() {
  @if(true) { const foo = 10; }
  @if(false) { const bar = 10; }
}`;

const srcModule = { src, modulePath: "test.wgsl", debugFilePath: "test.wgsl" };
const result = parseWeslV2(srcModule);

function showElem(elem, depth = 0, label = "") {
  const indent = "  ".repeat(depth);
  const labelStr = label ? ` (${label})` : "";

  if (elem.kind === "text") {
    const text = elem.srcModule.src.slice(elem.start, elem.end);
    const repr = JSON.stringify(text);
    const trimmed = text.trim() === "" ? " [WS]" : "";
    console.log(
      `${indent}text[${elem.start}-${elem.end}]: ${repr}${trimmed}${labelStr}`,
    );
  } else if (elem.kind === "attribute") {
    console.log(
      `${indent}attribute[${elem.start}-${elem.end}]: ${elem.attribute.kind}${labelStr}`,
    );
  } else {
    const attrs = elem.attributes?.map(a => a.attribute.kind).join(",") || "";
    const attrStr = attrs ? ` [@${attrs}]` : "";
    console.log(
      `${indent}${elem.kind}:${attrStr} [${elem.start}-${elem.end}]${labelStr}`,
    );

    // Show attributes separately
    if (elem.attributes) {
      for (const attr of elem.attributes) {
        showElem(attr, depth + 1, "attr");
      }
    }

    if (elem.contents) {
      for (const [i, child] of elem.contents.entries()) {
        showElem(child, depth + 1, `content[${i}]`);
      }
    }
  }
}

console.log("V2 AST for compound statement:");
showElem(result.moduleElem);
