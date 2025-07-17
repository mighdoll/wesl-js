/**
 * Adapters that wrap direct parsers into mini-parse Parser instances.
 */

import {
  type OptParserResult,
  Parser,
  type ParserContext,
  type Stream,
} from "mini-parse";
import {
  parseKeyword,
  parseNumber,
  parseQualifiedIdent,
  parseWord,
} from "./WeslBaseParsers.ts";
import type { WeslToken } from "./WeslStream.ts";

// Generic adapter for single token parsers that returns the token text
function createTokenAdapter(
  parseFn: (context: ParserContext) => WeslToken | null,
  traceName: string,
): Parser<Stream<WeslToken>, string> {
  return new Parser<Stream<WeslToken>, string>({
    fn: (context: ParserContext): OptParserResult<string> => {
      const token = parseFn(context);
      return token ? { value: token.text } : null;
    },
    traceName,
    terminal: true,
  });
}

// Adapter for qualified_ident which returns an array of strings
function createQualifiedIdentAdapter(
  parseFn: (context: ParserContext) => WeslToken[] | null,
  traceName: string,
): Parser<Stream<WeslToken>, string[]> {
  return new Parser<Stream<WeslToken>, string[]>({
    fn: (context: ParserContext): OptParserResult<string[]> => {
      const tokens = parseFn(context);
      return tokens ? { value: tokens.map(t => t.text) } : null;
    },
    traceName,
    terminal: true,
  });
}

// Export adapted parsers
export const word = createTokenAdapter(parseWord, "word");
export const keyword = createTokenAdapter(parseKeyword, "keyword");
export const number = createTokenAdapter(parseNumber, "number");
export const qualified_ident = createQualifiedIdentAdapter(
  parseQualifiedIdent,
  "qualified_ident",
);
