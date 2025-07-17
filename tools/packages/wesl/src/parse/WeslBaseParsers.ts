/**
 * Direct token-based parsers for basic WESL elements.
 * These parsers work directly with WeslStream without mini-parse combinators.
 */

import type { ParserContext } from "mini-parse";
import { consumeKind, tryParse } from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Parse a word token.
 */
export function parseWord(context: ParserContext): WeslToken | null {
  return consumeKind(context.stream, "word");
}

/**
 * Parse a keyword token.
 */
export function parseKeyword(context: ParserContext): WeslToken | null {
  return consumeKind(context.stream, "keyword");
}

/**
 * Parse a number token.
 */
export function parseNumber(context: ParserContext): WeslToken | null {
  return consumeKind(context.stream, "number");
}

/**
 * Parse a qualified identifier (e.g., foo::bar::baz).
 * Returns an array of tokens representing the identifier segments.
 */
export function parseQualifiedIdent(
  context: ParserContext,
): WeslToken[] | null {
  const { stream } = context;
  const weslStream = stream as WeslStream;

  return tryParse(stream, () => {
    const parts: WeslToken[] = [];

    // First part can be word, keyword, "package", or "super"
    let part =
      consumeKind(stream, "word") ||
      consumeKind(stream, "keyword") ||
      consumeKind(stream, "keyword", "package") ||
      consumeKind(stream, "keyword", "super");

    if (!part) return null;
    parts.push(part);

    // Continue parsing :: followed by identifier parts
    while (true) {
      const pos = weslStream.checkpoint();

      // Check for ::
      const sep = consumeKind(stream, "symbol", "::");
      if (!sep) break;

      // After ::, we need another identifier part
      part =
        consumeKind(stream, "word") ||
        consumeKind(stream, "keyword") ||
        consumeKind(stream, "keyword", "package") ||
        consumeKind(stream, "keyword", "super");

      if (!part) {
        // No identifier after ::, backtrack
        weslStream.reset(pos);
        break;
      }

      parts.push(part);
    }

    return parts;
  });
}
