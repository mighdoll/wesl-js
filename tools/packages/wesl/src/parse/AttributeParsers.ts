/**
 * Direct token parsers for WESL attributes without mini-parse combinators.
 * These functions return null on parse failure for efficient backtracking.
 */
import type {
  BinaryExpression,
  BinaryOperator,
  ElifAttribute,
  ElseAttribute,
  ExpressionElem,
  IfAttribute,
  Literal,
  ParenthesizedExpression,
  TranslateTimeExpressionElem,
  TranslateTimeFeature,
  UnaryExpression,
  UnaryOperator,
} from "../AbstractElems.ts";
import {
  checkpoint,
  consume,
  consumeKind,
  expect,
  reset,
} from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

// Parser functions that return null on failure
export function parseLiteral(stream: WeslStream): Literal | null {
  // Check by kind and text
  const token =
    consumeKind(stream, "keyword", "true") ||
    consumeKind(stream, "keyword", "false");

  if (token) {
    return makeLiteral(token as WeslToken<"keyword">);
  }

  return null;
}

export function parseTranslateTimeFeature(
  stream: WeslStream,
): TranslateTimeFeature | null {
  const token = consumeKind(stream, "word");

  return token ? makeTranslateTimeFeature(token as WeslToken<"word">) : null;
}

export function parseElseAttribute(stream: WeslStream): ElseAttribute | null {
  // Clean text-based matching
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "else")) return null;

  return makeElseAttribute();
}

// Expression parsers for @if conditions
export function parseAttributeIfPrimaryExpression(
  stream: WeslStream,
): Literal | ParenthesizedExpression | TranslateTimeFeature | null {
  // Try literal first
  const literal = parseLiteral(stream);
  if (literal) return literal;

  // Try parenthesized expression
  if (consume(stream, "(")) {
    const expr = parseAttributeIfExpression(stream);
    if (!expr) return null;
    expect(stream, ")", "Expected ')' after expression");
    return makeParenthesizedExpression(expr);
  }

  // Try translate-time feature
  return parseTranslateTimeFeature(stream);
}

export function parseAttributeIfUnaryExpression(
  stream: WeslStream,
): ExpressionElem | null {
  // Try unary operator
  const opToken = consume(stream, "!");
  if (opToken) {
    const expr = parseAttributeIfUnaryExpression(stream);
    if (!expr) return null;
    return makeUnaryExpression(
      makeUnaryOperator(opToken as WeslToken<"symbol">),
      expr,
    );
  }

  // Fall back to primary expression
  return parseAttributeIfPrimaryExpression(stream);
}

function parseBinaryOperatorChain(
  stream: WeslStream,
  left: ExpressionElem,
  operator: "||" | "&&",
  firstToken: WeslToken,
): ExpressionElem | null {
  const operands: [BinaryOperator, ExpressionElem][] = [];

  // Add first operand
  const op = makeBinaryOperator({ text: operator, span: firstToken.span });
  const right = parseAttributeIfUnaryExpression(stream);
  if (!right) return null;
  operands.push([op, right]);

  // Continue collecting same operators
  while (true) {
    const nextToken = consume(stream, operator);
    if (!nextToken) break;

    const nextOp = makeBinaryOperator({ text: operator, span: nextToken.span });
    const nextRight = parseAttributeIfUnaryExpression(stream);
    if (!nextRight) return null;
    operands.push([nextOp, nextRight]);
  }

  return makeRepeatingBinaryExpression(left, operands);
}

export function parseAttributeIfExpression(
  stream: WeslStream,
): ExpressionElem | null {
  const left = parseAttributeIfUnaryExpression(stream);
  if (!left) return null;

  // Check for || operators first
  const firstOr = consume(stream, "||");
  if (firstOr) {
    return parseBinaryOperatorChain(stream, left, "||", firstOr);
  }

  // Otherwise check for && operators
  const firstAnd = consume(stream, "&&");
  if (firstAnd) {
    return parseBinaryOperatorChain(stream, left, "&&", firstAnd);
  }

  return left;
}

export function parseIfAttribute(stream: WeslStream): IfAttribute | null {
  const pos = checkpoint(stream);

  // Capture position before @
  const atPos = checkpoint(stream);
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "if")) {
    reset(stream, pos);
    return null;
  }

  // COMMIT POINT: We have "@if", so this must be an if attribute
  expect(stream, "(", "Expected '(' after @if");

  const expr = parseAttributeIfExpression(stream);
  if (!expr) return null;

  consume(stream, ","); // optional comma
  expect(stream, ")", "Expected ')' after @if expression");
  const endPos = checkpoint(stream);

  const translateTimeExpr = makeTranslateTimeExpressionElem({
    value: expr,
    span: [atPos, endPos],
  });

  return makeIfAttribute(translateTimeExpr);
}

export function parseElifAttribute(stream: WeslStream): ElifAttribute | null {
  const pos = checkpoint(stream);

  // Capture position before @
  const atPos = checkpoint(stream);
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "elif")) {
    reset(stream, pos);
    return null;
  }

  // COMMIT POINT: We have "@elif", so this must be an elif attribute
  expect(stream, "(", "Expected '(' after @elif");

  const expr = parseAttributeIfExpression(stream);
  if (!expr) return null;

  consume(stream, ","); // optional comma
  expect(stream, ")", "Expected ')' after @elif expression");
  const endPos = checkpoint(stream);

  const translateTimeExpr = makeTranslateTimeExpressionElem({
    value: expr,
    span: [atPos, endPos],
  });

  return makeElifAttribute(translateTimeExpr);
}

// Helper functions to create AST nodes
function makeLiteral(token: WeslToken<"keyword" | "number">): Literal {
  return {
    kind: "literal",
    value: token.text,
    span: token.span,
  };
}

function makeTranslateTimeFeature(
  token: WeslToken<"word">,
): TranslateTimeFeature {
  return {
    kind: "translate-time-feature",
    name: token.text,
    span: token.span,
  };
}

function makeElseAttribute(): ElseAttribute {
  return { kind: "@else" };
}

function makeIfAttribute(param: TranslateTimeExpressionElem): IfAttribute {
  return { kind: "@if", param };
}

function makeElifAttribute(param: TranslateTimeExpressionElem): ElifAttribute {
  return { kind: "@elif", param };
}

function makeTranslateTimeExpressionElem(args: {
  value: ExpressionElem;
  span: [number, number];
}): TranslateTimeExpressionElem {
  return {
    kind: "translate-time-expression",
    expression: args.value,
    span: args.span,
  };
}

function makeParenthesizedExpression(
  expression: ExpressionElem,
): ParenthesizedExpression {
  return {
    kind: "parenthesized-expression",
    expression,
  };
}

function makeUnaryOperator(token: WeslToken<"symbol">): UnaryOperator {
  return { value: token.text as any, span: token.span };
}

function makeBinaryOperator(token: {
  text: string;
  span: readonly [number, number];
}): BinaryOperator {
  return { value: token.text as any, span: token.span as [number, number] };
}

function makeUnaryExpression(
  operator: UnaryOperator,
  expression: ExpressionElem,
): UnaryExpression {
  return { kind: "unary-expression", operator, expression };
}

function makeRepeatingBinaryExpression(
  start: ExpressionElem,
  repeating: [BinaryOperator, ExpressionElem][],
): ExpressionElem {
  let result: ExpressionElem = start;
  for (const [op, right] of repeating) {
    const binaryExpression: BinaryExpression = {
      kind: "binary-expression",
      operator: op,
      left: result,
      right,
    };
    result = binaryExpression;
  }
  return result;
}
