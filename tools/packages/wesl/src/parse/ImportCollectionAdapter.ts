/**
 * Adapter that allows direct import parsers to work with mini-parse collection system.
 * This is a simpler approach than trying to inject CollectContext.
 */

import {
  type OptParserResult,
  Parser,
  type ParserContext,
  type Stream,
} from "mini-parse";
import type { ImportElem } from "../AbstractElems.ts";
import { parseWeslImports } from "./ImportParsers.ts";
import type { WeslToken } from "./WeslStream.ts";

/**
 * Parser adapter that uses direct import parsers but returns results
 * in a format compatible with mini-parse collection.
 *
 * Usage:
 * ```
 * const weslImports = tagScope(
 *   createImportCollectionAdapter().ptag("owo").collect(importElem)
 * );
 * ```
 */
export function createImportCollectionAdapter(): Parser<
  Stream<WeslToken>,
  ImportElem[]
> {
  return new Parser<Stream<WeslToken>, ImportElem[]>({
    fn: (context: ParserContext): OptParserResult<ImportElem[]> => {
      // Use direct parser to get imports
      const imports = parseWeslImports(context);

      // Return in format expected by collection system
      return imports.length > 0 ? { value: imports } : null;
    },
    traceName: "weslImports",
    terminal: false,
  });
}

/**
 * Alternative approach: Create a parser that mimics repeat(import_statement)
 * This allows us to gradually replace just the repeat() part.
 */
export function createRepeatImportAdapter(): Parser<
  Stream<WeslToken>,
  ImportElem[]
> {
  return new Parser<Stream<WeslToken>, ImportElem[]>({
    fn: (context: ParserContext): OptParserResult<ImportElem[]> => {
      const _imports: ImportElem[] = [];
      const { stream } = context;

      // Save initial position for potential reset
      const startPos = (stream as any).checkpoint();

      try {
        // Keep parsing imports until we can't find any more
        const parsedImports = parseWeslImports(context);

        // Always return an array (even if empty) to match repeat() behavior
        return { value: parsedImports };
      } catch (_error) {
        // On error, reset stream and return empty array
        (stream as any).reset(startPos);
        return { value: [] };
      }
    },
    traceName: "repeat_imports",
    terminal: false,
  });
}

/**
 * Direct replacement for repeat(import_statement).
 * This parser returns ImportElem[] just like the original,
 * so it works seamlessly with .ptag() and .collect().
 */
export function createWeslImportsAdapter(): Parser<
  Stream<WeslToken>,
  ImportElem[]
> {
  return new Parser<Stream<WeslToken>, ImportElem[]>({
    fn: (context: ParserContext): OptParserResult<ImportElem[]> => {
      // Use our direct parser to get all imports
      const imports = parseWeslImports(context);

      // Return the array (even if empty) to match repeat() behavior
      // The result will be tagged with "owo" by ptag() and then collected
      return { value: imports };
    },
    traceName: "weslImports_direct",
    terminal: false,
  });
}
