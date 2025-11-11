import { type Parser, type Stream, tagScope, tracing } from "mini-parse";
import type { ImportElem } from "../AbstractElems.ts";
import { importElem } from "../WESLCollect.ts";
import { createWeslImportsAdapter } from "./ImportCollectionAdapter.ts";
import type { WeslToken } from "./WeslStream.ts";

/**
 * WESL import statement parser.
 *
 * Uses direct token parsing for optimal performance while maintaining compatibility
 * with the mini-parse collection system. This parser handles all WESL import syntax
 * including conditional imports, relative imports, and destructured imports.
 */
export const weslImportsDirect: Parser<
  Stream<WeslToken>,
  ImportElem[]
> = tagScope(createWeslImportsAdapter().ptag("owo").collect(importElem));

/** @deprecated Use weslImportsDirect instead */
export const weslImports = weslImportsDirect;

if (tracing) {
  weslImportsDirect.setTraceName("weslImportsDirect");
}
