/**
 * Direct token parsers for WESL attributes without mini-parse combinators.
 * These functions return null on parse failure for efficient backtracking.
 */
import type {
  AttributeElem,
  BinaryExpression,
  BinaryOperator,
  BuiltinAttribute,
  DiagnosticAttribute,
  ElifAttribute,
  ElseAttribute,
  ExpressionElem,
  IfAttribute,
  InterpolateAttribute,
  Literal,
  NameElem,
  ParenthesizedExpression,
  StandardAttribute,
  TranslateTimeExpressionElem,
  TranslateTimeFeature,
  UnaryExpression,
  UnaryOperator,
  UnknownExpressionElem,
} from "../AbstractElems.ts";
import {
  checkpoint,
  consume,
  consumeKind,
  expect,
  reset,
} from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Parse a list of attributes: @attr1 @attr2(args) ...
 * Returns empty array if no attributes found.
 * Week 7: Support for standard WGSL attributes on struct members and function parameters
 */
export function parseAttributeList(stream: WeslStream): AttributeElem[] {
  const attributes: AttributeElem[] = [];

  while (true) {
    const attr = parseAttribute(stream);
    if (!attr) break;
    attributes.push(attr);
  }

  return attributes;
}

/**
 * Parse a single attribute: @name or @name(args)
 * Returns null if no attribute found at current position.
 */
function parseAttribute(stream: WeslStream): AttributeElem | null {
  const startPos = checkpoint(stream);

  // Expect "@"
  if (!consume(stream, "@")) {
    reset(stream, startPos);
    return null;
  }

  // Try special WESL attributes first
  // These need to be checked before consuming the name token
  reset(stream, startPos);

  // Try @if
  const ifAttr = parseIfAttribute(stream);
  if (ifAttr) return wrapAttribute(ifAttr, startPos, checkpoint(stream));

  // Try @elif
  const elifAttr = parseElifAttribute(stream);
  if (elifAttr) return wrapAttribute(elifAttr, startPos, checkpoint(stream));

  // Try @else
  const elseAttr = parseElseAttribute(stream);
  if (elseAttr) return wrapAttribute(elseAttr, startPos, checkpoint(stream));

  // Back to parsing standard attributes
  reset(stream, startPos);
  consume(stream, "@"); // Re-consume the @

  // Parse attribute name
  const nameToken = stream.peek();
  if (!nameToken || nameToken.kind !== "word") {
    reset(stream, startPos);
    return null;
  }

  stream.nextToken(); // consume name
  const name = nameToken.text;

  // Special handling for specific attributes
  if (name === "builtin") {
    return parseBuiltinAttribute(stream, startPos);
  }

  if (name === "interpolate") {
    return parseInterpolateAttribute(stream, startPos);
  }

  if (name === "diagnostic") {
    return parseDiagnosticAttribute(stream, startPos);
  }

  // Standard attribute with optional parameters
  let params: UnknownExpressionElem[] | undefined;

  // Check for parameter list: (...)
  if (consume(stream, "(")) {
    params = parseAttributeParams(stream);
    expect(stream, ")", "Expected ')' after attribute parameters");
  }

  const endPos = checkpoint(stream);

  const stdAttr: StandardAttribute = {
    kind: "@attribute",
    name,
    params,
  };

  return wrapAttribute(stdAttr, startPos, endPos);
}

/**
 * Parse attribute parameters as stub expressions
 * Returns array of UnknownExpressionElem
 */
function parseAttributeParams(stream: WeslStream): UnknownExpressionElem[] {
  const params: UnknownExpressionElem[] = [];

  // Parse comma-separated parameters
  while (true) {
    const paramStart = checkpoint(stream);

    // Consume tokens until we hit comma or closing paren
    // This is a stub - doesn't parse the full expression structure
    let depth = 0;
    while (true) {
      const token = stream.peek();
      if (!token) {
        throw new Error("Unexpected end of input in attribute parameters");
      }

      // Check if we've reached the end of this parameter
      if (depth === 0 && (token.text === "," || token.text === ")")) {
        break;
      }

      // Track nesting depth for parentheses
      if (token.text === "(") depth++;
      if (token.text === ")") depth--;

      stream.nextToken();
    }

    const paramEnd = checkpoint(stream);

    // Create UnknownExpressionElem for this parameter
    if (paramEnd > paramStart) {
      const param: UnknownExpressionElem = {
        kind: "expression",
        start: paramStart,
        end: paramEnd,
        contents: [],
      };
      params.push(param);
    }

    // Check for comma (more parameters) or closing paren
    const next = stream.peek();
    if (!next || next.text !== ",") {
      break;
    }

    stream.nextToken(); // consume comma
  }

  return params;
}

/**
 * Parse @builtin(name) attribute
 */
function parseBuiltinAttribute(
  stream: WeslStream,
  startPos: number,
): AttributeElem {
  expect(stream, "(", "Expected '(' after @builtin");

  const nameToken = stream.peek();
  if (!nameToken || nameToken.kind !== "word") {
    throw new Error("Expected identifier in @builtin attribute");
  }

  stream.nextToken();

  const nameElem: NameElem = {
    kind: "name",
    name: nameToken.text,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };

  expect(stream, ")", "Expected ')' after @builtin parameter");

  const endPos = checkpoint(stream);

  const builtinAttr: BuiltinAttribute = {
    kind: "@builtin",
    param: nameElem,
  };

  return wrapAttribute(builtinAttr, startPos, endPos);
}

/**
 * Parse @interpolate(param1, param2, ...) attribute
 */
function parseInterpolateAttribute(
  stream: WeslStream,
  startPos: number,
): AttributeElem {
  expect(stream, "(", "Expected '(' after @interpolate");

  const params: NameElem[] = [];

  // Parse comma-separated name parameters
  while (true) {
    const nameToken = stream.peek();
    if (!nameToken || nameToken.kind !== "word") {
      throw new Error("Expected identifier in @interpolate attribute");
    }

    stream.nextToken();

    const nameElem: NameElem = {
      kind: "name",
      name: nameToken.text,
      start: nameToken.span[0],
      end: nameToken.span[1],
    };

    params.push(nameElem);

    // Check for comma or closing paren
    const next = stream.peek();
    if (!next) {
      throw new Error("Unexpected end of input in @interpolate attribute");
    }

    if (next.text === ",") {
      stream.nextToken(); // consume comma
      continue;
    }

    break;
  }

  expect(stream, ")", "Expected ')' after @interpolate parameters");

  const endPos = checkpoint(stream);

  const interpolateAttr: InterpolateAttribute = {
    kind: "@interpolate",
    params,
  };

  return wrapAttribute(interpolateAttr, startPos, endPos);
}

/**
 * Parse @diagnostic(...) attribute
 * Stub implementation - just consume the tokens
 */
function parseDiagnosticAttribute(
  stream: WeslStream,
  startPos: number,
): AttributeElem {
  expect(stream, "(", "Expected '(' after @diagnostic");

  // For now, just consume tokens until closing paren
  let depth = 1;
  while (depth > 0) {
    const token = stream.nextToken();
    if (!token) {
      throw new Error("Unexpected end of input in @diagnostic attribute");
    }
    if (token.text === "(") depth++;
    if (token.text === ")") depth--;
  }

  const endPos = checkpoint(stream);

  // Create a stub diagnostic attribute
  // TODO: Parse the actual severity and rule name
  const diagnosticAttr: DiagnosticAttribute = {
    kind: "@diagnostic",
    severity: { kind: "name", name: "error", start: startPos, end: endPos },
    rule: [{ kind: "name", name: "rule", start: startPos, end: endPos }, null],
  };

  return wrapAttribute(diagnosticAttr, startPos, endPos);
}

/**
 * Wrap an Attribute in an AttributeElem
 */
function wrapAttribute(
  attribute: any,
  start: number,
  end: number,
): AttributeElem {
  return {
    kind: "attribute",
    attribute,
    start,
    end,
    contents: [],
  };
}

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
