/**
 * Full expression parsers for WESL v2
 *
 * Week 2: Basic literals and identifiers for const declarations
 * Week 11: Full expression support with operators, precedence, function calls
 */

import type {
  BinaryExpression,
  BinaryOperator,
  ComponentExpression,
  ComponentMemberExpression,
  ExpressionElem,
  FunctionCallExpression,
  Literal,
  NameElem,
  ParenthesizedExpression,
  RefIdentElem,
  UnaryExpression,
  UnaryOperator,
} from "../AbstractElems.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, consumeKind, expect, reset } from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Parse a numeric or boolean literal
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

  // Save the RefIdent to the current scope so binding can find it
  ctx.saveIdent(ident);

  // Add RefIdentElem to current open container's contents (for text element generation)
  // This makes V2 output match V1's flat text+ref structure
  ctx.addElem(refIdentElem);

  return refIdentElem;
}

/**
 * Parse function call arguments: (expr1, expr2, ...)
 * Returns full parsed ExpressionElem for each argument
 */
function parseFunctionCallArgs(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem[] {
  const args: ExpressionElem[] = [];

  // Expect opening paren
  if (!consume(stream, "(")) {
    return args;
  }

  // Check for empty argument list
  if (consume(stream, ")")) {
    return args;
  }

  // Parse comma-separated arguments
  while (true) {
    // Parse argument expression
    const arg = parseExpression(stream, ctx);
    if (!arg) {
      throw new Error("Expected expression in function arguments");
    }

    args.push(arg);

    // Check for comma or closing paren
    const next = stream.peek();
    if (!next) break;

    if (next.text === ",") {
      stream.nextToken();
      continue;
    }

    if (next.text === ")") {
      stream.nextToken();
      break;
    }

    throw new Error("Expected ',' or ')' in function arguments");
  }

  return args;
}

/**
 * Parse postfix operations: .member, [index], (args)
 * Week 11: Supports member access, array indexing, function calls
 */
function parsePostfixExpression(
  stream: WeslStream,
  ctx: ParseContext,
  base: ExpressionElem,
): ExpressionElem {
  let current = base;

  while (true) {
    const token = stream.peek();
    if (!token) break;

    // Member access: .member
    if (token.text === ".") {
      stream.nextToken(); // consume "."

      const memberToken = stream.peek();
      if (!memberToken || memberToken.kind !== "word") {
        throw new Error("Expected identifier after '.'");
      }
      stream.nextToken(); // consume member name

      const memberName: NameElem = {
        kind: "name",
        name: memberToken.text,
        start: memberToken.span[0],
        end: memberToken.span[1],
      };

      // Create ComponentMemberExpression
      const memberExpr: ComponentMemberExpression = {
        kind: "component-member-expression",
        base: current,
        access: memberName,
      };

      current = memberExpr;
      continue;
    }

    // Array indexing: [expr]
    if (token.text === "[") {
      stream.nextToken(); // consume "["

      // Parse index expression
      const indexExpr = parseExpression(stream, ctx);
      if (!indexExpr) {
        throw new Error("Expected expression in array index");
      }

      expect(stream, "]", "Expected ']' after array index");

      // Create ComponentExpression
      const arrayExpr: ComponentExpression = {
        kind: "component-expression",
        base: current,
        access: indexExpr,
      };

      current = arrayExpr;
      continue;
    }

    // Function call or type constructor: (args) or <template>(args)
    if (token.text === "(" || token.text === "<") {
      // Type constructor or function call requires the base to be a RefIdentElem
      if (current.kind !== "ref") {
        // Not an identifier, so can't be a function call
        break;
      }

      // Check for type constructor: identifier<template>(args)
      if (token.text === "<") {
        // Try to parse template parameters
        const checkpointPos = checkpoint(stream);

        // Skip template parameters (simple bracket matching)
        stream.nextToken(); // consume <
        let depth = 1;
        let success = true;

        while (depth > 0) {
          const t = stream.peek();
          if (!t) {
            success = false;
            break;
          }
          stream.nextToken();
          if (t.text === "<") depth++;
          if (t.text === ">") depth--;
        }

        // Check if followed by (
        const nextToken = stream.peek();
        if (success && nextToken && nextToken.text === "(") {
          // It's a type constructor! Parse the arguments
          const args = parseFunctionCallArgs(stream, ctx);

          // Create FunctionCallExpression (type constructors are function calls in AST)
          const callExpr: FunctionCallExpression = {
            kind: "call-expression",
            function: current,
            arguments: args,
          };

          current = callExpr;
          continue;
        } else {
          // Not a type constructor, reset and let binary operator parsing handle it
          reset(stream, checkpointPos);
          break;
        }
      }

      // Regular function call: identifier(args)
      const args = parseFunctionCallArgs(stream, ctx);

      // Create FunctionCallExpression
      const callExpr: FunctionCallExpression = {
        kind: "call-expression",
        function: current,
        arguments: args,
      };

      current = callExpr;
      continue;
    }

    // No more postfix operations
    break;
  }

  return current;
}

/**
 * Parse unary expression: -expr, !expr, &expr, *expr, ~expr
 * Week 11: Full unary operator support
 */
function parseUnaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  const startPos = checkpoint(stream);
  const token = stream.peek();

  if (!token) return null;

  // Check for unary operators
  if (token.text === "-" || token.text === "!" ||
      token.text === "&" || token.text === "*" || token.text === "~") {
    stream.nextToken(); // consume operator

    const operator: UnaryOperator = {
      value: token.text as UnaryOperator["value"],
      span: token.span,
    };

    // Recursively parse the operand
    const operand = parseUnaryExpression(stream, ctx);
    if (!operand) {
      throw new Error("Expected expression after unary operator");
    }

    // Create UnaryExpression
    const unaryExpr: UnaryExpression = {
      kind: "unary-expression",
      operator,
      expression: operand,
    };

    return unaryExpr;
  }

  // Not a unary operator, parse primary expression
  return parsePrimaryExpression(stream, ctx);
}

/**
 * Parse primary expression: literal, identifier, (expr)
 * Week 11: With postfix operations
 */
function parsePrimaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  const startPos = checkpoint(stream);

  // Try parenthesized expression
  if (consume(stream, "(")) {
    const expr = parseExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '('");
    }

    expect(stream, ")", "Expected ')' after expression");

    // Create ParenthesizedExpression
    const parenExpr: ParenthesizedExpression = {
      kind: "parenthesized-expression",
      expression: expr,
    };

    // Check for postfix operations
    return parsePostfixExpression(stream, ctx, parenExpr);
  }

  // Try literal
  const literal = parseSimpleLiteral(stream);
  if (literal) {
    return parsePostfixExpression(stream, ctx, literal);
  }

  // Try identifier
  const ident = parseSimpleIdentifier(stream, ctx);
  if (ident) {
    return parsePostfixExpression(stream, ctx, ident);
  }

  reset(stream, startPos);
  return null;
}

/**
 * Binary operator precedence levels
 */
const BINARY_PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "|": 3,
  "^": 4,
  "&": 5,
  "==": 6, "!=": 6,
  "<": 7, "<=": 7, ">": 7, ">=": 7,
  "<<": 8, ">>": 8,
  "+": 9, "-": 9,
  "*": 10, "/": 10, "%": 10,
};

/**
 * Check if a token is a binary operator
 */
function isBinaryOperator(text: string): boolean {
  return text in BINARY_PRECEDENCE;
}

/**
 * Get precedence of a binary operator (higher = tighter binding)
 */
function getPrecedence(op: string): number {
  return BINARY_PRECEDENCE[op] || 0;
}

/**
 * Parse binary expression with precedence climbing
 * Week 11: Full binary operator support
 */
function parseBinaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
  minPrecedence: number,
  left: ExpressionElem,
): ExpressionElem {
  while (true) {
    const token = stream.peek();
    if (!token) break;

    // Check if this is a binary operator
    if (!isBinaryOperator(token.text)) break;

    const precedence = getPrecedence(token.text);
    if (precedence < minPrecedence) break;

    const opToken = token;
    stream.nextToken(); // consume operator

    const operator: BinaryOperator = {
      value: opToken.text as BinaryOperator["value"],
      span: opToken.span,
    };

    // Parse right side
    let right = parseUnaryExpression(stream, ctx);
    if (!right) {
      throw new Error("Expected expression after binary operator");
    }

    // Look ahead for higher precedence operators
    while (true) {
      const nextToken = stream.peek();
      if (!nextToken || !isBinaryOperator(nextToken.text)) break;

      const nextPrecedence = getPrecedence(nextToken.text);
      if (nextPrecedence <= precedence) break;

      // Right side has higher precedence, parse it first
      right = parseBinaryExpression(stream, ctx, nextPrecedence, right);
    }

    // Create BinaryExpression
    const binaryExpr: BinaryExpression = {
      kind: "binary-expression",
      operator,
      left,
      right,
    };

    left = binaryExpr;
  }

  return left;
}

/**
 * Parse a full expression with all operators
 * Week 2: Simple literals and identifiers
 * Week 11: Full expression support with operators, calls, member access
 */
export function parseExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  const startExpr = parseUnaryExpression(stream, ctx);
  if (!startExpr) return null;

  // Parse binary operators with precedence climbing
  return parseBinaryExpression(stream, ctx, 1, startExpr);
}

/**
 * Parse a simple expression (legacy alias for compatibility)
 */
export function parseSimpleExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  return parseExpression(stream, ctx);
}

// Helper functions

function makeLiteral(token: WeslToken<"keyword" | "number">): Literal {
  return {
    kind: "literal",
    value: token.text,
    span: token.span,
  };
}
