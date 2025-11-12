/**
 * Adapter for direct import parsers to work with mini-parse collection system.
 */

import {
  type OptParserResult,
  Parser,
  type ParserContext,
  type Stream,
} from "mini-parse";
import type { ImportElem } from "../AbstractElems.ts";
import { parseWeslImports } from "./ImportParsers.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Primary adapter for WESL import parsing.
 * Uses direct token parsing for performance while maintaining compatibility
 * with the mini-parse collection system.
 */
export function createWeslImportsAdapter(): Parser<
  Stream<WeslToken>,
  ImportElem[]
> {
  return new Parser<Stream<WeslToken>, ImportElem[]>({
    fn: (context: ParserContext): OptParserResult<ImportElem[]> => {
      // Extract WeslStream from context and pass it to the parser
      const stream = context.stream as WeslStream;
      const imports = parseWeslImports(stream);

      // Return the array (even if empty) to match repeat() behavior
      // The result will be tagged with "owo" by ptag() and then collected
      return { value: imports };
    },
    traceName: "weslImports_direct",
    terminal: false,
  });
}
