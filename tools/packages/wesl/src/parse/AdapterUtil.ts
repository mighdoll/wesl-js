import type { OptParserResult, ParserContext, Stream } from "mini-parse";
import { Parser } from "mini-parse";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Create a mini-parse adapter from a direct parser function
 */
export function createAdapter<T>(
  parseFn: (stream: WeslStream) => T | null,
  traceName: string,
): Parser<Stream<WeslToken>, T> {
  return new Parser<Stream<WeslToken>, T>({
    fn: (context: ParserContext): OptParserResult<T> => {
      // Extract WeslStream from context and pass it to the parser
      const stream = context.stream as WeslStream;
      const value = parseFn(stream);
      return value ? { value } : null;
    },
    traceName,
    terminal: true,
  });
}
