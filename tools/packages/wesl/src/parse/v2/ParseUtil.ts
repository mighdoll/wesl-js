import {
  ParseError,
  type ParserContext,
  type Stream,
  type Token,
} from "mini-parse";
import type {
  AttributeElem,
  DeclarationElem,
  DeclIdentElem,
  TypedDeclElem,
} from "../../AbstractElems.ts";
import type { WeslStream, WeslToken, WeslTokenKind } from "../WeslStream.ts";

const conditionalKinds: readonly string[] = ["@if", "@elif", "@else"];

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

/**
 * Peek and consume a keyword if it matches, returning the token.
 * More efficient than consume() when you need the token's position.
 */
export function consumeKeyword(
  stream: WeslStream,
  keyword: string,
): WeslToken | null {
  const token = stream.peek();
  if (token?.text === keyword) {
    stream.nextToken();
    return token;
  }
  return null;
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
 * Throw a ParseError with the span of the current/next token
 * Use this when you encounter an unexpected token or missing token
 */
export function throwParseError(stream: Stream<Token>, message: string): never {
  const weslStream = stream as WeslStream;
  const token = weslStream.peek();
  if (token) {
    // Use the actual token's span for better highlighting
    throw new ParseError(message, token.span);
  } else {
    // At EOF, use current position
    const pos = weslStream.checkpoint();
    throw new ParseError(message, [pos, pos]);
  }
}

/** Check if attributes contain @if/@elif/@else */
export function hasConditionalAttribute(attributes: AttributeElem[]): boolean {
  return attributes.some(attr =>
    conditionalKinds.includes(attr.attribute.kind),
  );
}

/** Attach attributes to an element if present */
export function attachAttributes<T extends { attributes?: AttributeElem[] }>(
  elem: T,
  attributes?: AttributeElem[],
): void {
  if (attributes && attributes.length > 0) {
    elem.attributes = attributes;
  }
}

/** Link a DeclIdent back to its declaration element */
export function linkDeclIdent(
  typedDecl: TypedDeclElem,
  declElem: DeclarationElem,
): void {
  typedDecl.decl.ident.declElem = declElem;
}

/** Link a DeclIdentElem back to its declaration element */
export function linkDeclIdentElem(
  declIdentElem: DeclIdentElem,
  declElem: DeclarationElem,
): void {
  declIdentElem.ident.declElem = declElem;
}

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
 */
