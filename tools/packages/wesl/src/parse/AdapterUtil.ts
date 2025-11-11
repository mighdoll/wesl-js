import type { OptParserResult, ParserContext, Stream } from "mini-parse";
import { Parser } from "mini-parse";
import type { WeslToken } from "./WeslStream.ts";

/**
 * Create a mini-parse adapter from a direct parser function
 */
export function createAdapter<T>(
  parseFn: (context: ParserContext) => T | null,
  traceName: string,
): Parser<Stream<WeslToken>, T> {
  return new Parser<Stream<WeslToken>, T>({
    fn: (context: ParserContext): OptParserResult<T> => {
      const value = parseFn(context);
      return value ? { value } : null;
    },
    traceName,
    terminal: true,
  });
}
