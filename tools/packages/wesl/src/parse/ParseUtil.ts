/**
 * Parser utility functions for building WESL parsers.
 * Expect-Oriented API (Recursive Descent style)
 */

import {
  ParseError,
  type ParserContext,
  type Stream,
  type Token,
} from "mini-parse";
import type { WeslStream, WeslToken, WeslTokenKind } from "./WeslStream.ts";

/** Try to consume a token by text only */
export function consume<T extends Token>(
  stream: Stream<T>,
  text: string,
): WeslToken | null {
  const weslStream = stream as WeslStream;
  const pos = weslStream.checkpoint();
  const token = weslStream.nextToken();

  if (!token) {
    weslStream.reset(pos);
    return null;
  }

  if (token.text === text) {
    return token;
  }

  weslStream.reset(pos);
  return null;
}

/** Expect a token by text only */
export function expect<T extends Token>(
  stream: Stream<T>,
  text: string,
  errorMsg?: string,
): WeslToken {
  const token = consume(stream, text);
  if (!token) {
    const pos = (stream as WeslStream).checkpoint();
    throw new ParseError(errorMsg || `Expected "${text}"`, [pos, pos]);
  }
  return token;
}

/** Consume any token of the given kind, optionally matching text */
export function consumeKind<T extends Token>(
  stream: Stream<T>,
  kind: WeslTokenKind,
  text?: string,
): WeslToken | null {
  const weslStream = stream as WeslStream;
  const pos = weslStream.checkpoint();
  const token = weslStream.nextToken();

  if (!token) {
    weslStream.reset(pos);
    return null;
  }

  if (token.kind === kind && (!text || token.text === text)) {
    return token;
  }

  weslStream.reset(pos);
  return null;
}

/** Expect any token of the given kind, optionally matching text */
export function expectKind<T extends Token>(
  stream: Stream<T>,
  kind: WeslTokenKind,
  errorMsg?: string,
  text?: string,
): WeslToken {
  const token = consumeKind(stream, kind, text);
  if (!token) {
    const pos = (stream as WeslStream).checkpoint();
    const msg =
      errorMsg || (text ? `Expected ${kind} "${text}"` : `Expected ${kind}`);
    throw new ParseError(msg, [pos, pos]);
  }
  return token;
}

/**
 * Manual backtracking helper - checkpoint and reset on null return.
 * Use this pattern instead of try/catch for performance.
 *
 * Example:
 * ```typescript
 * const pos = (stream as WeslStream).checkpoint();
 * if (consume(stream, "keyword")) {
 *   if (!consume(stream, "::")) {
 *     (stream as WeslStream).reset(pos);  // Backtrack
 *     return null;
 *   }
 *   return result;
 * }
 * return null;
 * ```
 */
export function checkpoint<T extends Token>(stream: Stream<T>): number {
  return (stream as WeslStream).checkpoint();
}

export function reset<T extends Token>(stream: Stream<T>, pos: number): void {
  (stream as WeslStream).reset(pos);
}

// ============================================================================
// Example: Parse attribute_if_expression
// ============================================================================

export function parseAttributeIfExpression(context: ParserContext): any {
  const { stream } = context;

  function parsePrimary(): any {
    // Literal - concise text matching
    let token = consume(stream, "true") || consume(stream, "false");
    if (token) {
      return { kind: "literal", value: token.text };
    }

    // Parenthesized
    if (consume(stream, "(")) {
      const expr = parseExpression();
      expect(stream, ")", "Expected ')' after expression");
      return { kind: "paren", expr };
    }

    // Feature identifier
    token = consumeKind(stream, "word");
    if (token) {
      return { kind: "feature", name: token.text };
    }

    return null;
  }

  function parseUnary(): any {
    if (consume(stream, "!")) {
      const expr = parseUnary();
      return { kind: "unary", op: "!", expr };
    }

    return parsePrimary();
  }

  function parseExpression(): any {
    const _pos = checkpoint(stream);
    let left = parseUnary();
    if (!left) return null;

    while (true) {
      const op = consume(stream, "&&") || consume(stream, "||");
      if (!op) break;

      // Expect the right side after operator
      const right = parseUnary();
      if (!right) {
        throw new ParseError(`Expected expression after ${op.text}`, op.span);
      }

      left = { kind: "binary", op: op.text, left, right };
    }

    return left;
  }

  return parseExpression();
}

// ============================================================================
// API Documentation
// ============================================================================

/**
 * Expect-Oriented Parser API
 *
 * This API provides a clean balance for writing WESL parsers:
 * - Clean code for simple cases (consume)
 * - Good error handling when needed (expect)
 * - Natural recursive descent style for expressions
 * - Manual backtracking with checkpoint/reset for performance
 *
 * ## Error Handling Rules
 *
 * 1. **Return null for backtracking** - When parse might succeed elsewhere
 * 2. **Throw ParseError only after commit** - When we know this is the right path
 * 3. **Use checkpoint/reset** - Manual backtracking, no try/catch
 *
 * ## Commit Points
 * A "commit point" is when we've consumed enough tokens to know this is the
 * correct parse path. After commit, throw ParseError for missing elements.
 *
 * Example commit points:
 * - After consuming "import" keyword
 * - After consuming opening brace "{"
 * - After consuming operator in binary expression
 *
 * ## Token Matching
 * 1. Text-based matching: `consume(stream, "@")` - matches "@" regardless of kind
 * 2. Kind-based matching: `consumeKind(stream, "word")` - any word token
 *    - With optional text: `consumeKind(stream, "keyword", "true")` - specific keyword
 *
 * This makes parsers more readable since most tokens have unique text
 * (e.g., "@" is always a symbol, "else" is always a keyword).
 *
 * ## Example Usage
 * ```typescript
 * export function parseElseAttribute(context: ParserContext): ElseAttribute | null {
 *   const { stream } = context;
 *
 *   // Clean text-based matching
 *   if (!consume(stream, "@")) return null;
 *   if (!consume(stream, "else")) return null;
 *
 *   return makeElseAttribute();
 * }
 *
 * export function parseImportStatement(context: ParserContext): ImportStatement | null {
 *   const { stream } = context;
 *   const pos = checkpoint(stream);
 *
 *   // Not committed yet - return null if no import
 *   if (!consume(stream, "import")) return null;
 *
 *   // NOW we're committed - errors are real parse errors
 *   const body = parseImportBody(context);
 *   if (!body) {
 *     throw new ParseError("expected import body", [pos, checkpoint(stream)]);
 *   }
 *
 *   if (!consume(stream, ";")) {
 *     throw new ParseError("expected semicolon", [pos, checkpoint(stream)]);
 *   }
 *
 *   return { kind: "import", body };
 * }
 * ```
 */
