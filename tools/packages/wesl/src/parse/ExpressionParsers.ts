/**
 * Minimal expression parsers for WESL v2
 *
 * Week 2: Basic literals and identifiers for const declarations
 * Will be expanded in Weeks 7-8 for full expression support
 */

import type {
  ExpressionElem,
  Literal,
  RefIdentElem,
} from "../AbstractElems.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consumeKind, reset } from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Parse a numeric or boolean literal
 * Week 2: Minimal implementation for const declarations
 */
export function parseSimpleLiteral(stream: WeslStream): Literal | null {
  const pos = checkpoint(stream);

  // Try numeric literal
  const numToken = consumeKind(stream, "number");
  if (numToken) {
    return makeLiteral(numToken as WeslToken<"number">);
  }

  // Try boolean literal
  const boolToken =
    consumeKind(stream, "keyword", "true") ||
    consumeKind(stream, "keyword", "false");
  if (boolToken) {
    return makeLiteral(boolToken as WeslToken<"keyword">);
  }

  reset(stream, pos);
  return null;
}

/**
 * Parse a simple identifier reference
 */
export function parseSimpleIdentifier(
  stream: WeslStream,
  ctx: ParseContext,
): RefIdentElem | null {
  const token = consumeKind(stream, "word");
  if (!token) return null;

  // Create RefIdent using context
  const ident = ctx.createRefIdent(token.text, token.span);

  // Create RefIdentElem
  const refIdentElem: RefIdentElem = {
    kind: "ref",
    ident,
    srcModule: ctx.srcModule,
    start: token.span[0],
    end: token.span[1],
  };

  // Link back from ident to elem
  ident.refIdentElem = refIdentElem;

  return refIdentElem;
}

/**
 * Parse a simple primary expression (literal or identifier)
 * Week 2: Minimal implementation
 * TODO Week 7-8: Expand to handle operators, function calls, etc.
 */
export function parseSimpleExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  // Try literal first
  const literal = parseSimpleLiteral(stream);
  if (literal) return literal;

  // Try identifier
  const ident = parseSimpleIdentifier(stream, ctx);
  if (ident) return ident;

  return null;
}

// Helper functions

function makeLiteral(token: WeslToken<"keyword" | "number">): Literal {
  return {
    kind: "literal",
    value: token.text,
    span: token.span,
  };
}
