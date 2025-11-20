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
import {
  checkpoint,
  consume,
  consumeKind,
  expect,
  reset,
} from "./ParseUtil.ts";
import type { WeslStream, WeslToken } from "./WeslStream.ts";

/**
 * Parse literal
 *
 * Grammar: literal : int_literal | float_literal | bool_literal
 * Grammar: bool_literal : 'true' | 'false'
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
 * Parse identifier reference (including qualified names with ::)
 *
 * Grammar: ident : ident_pattern_token _disambiguate_template
 * WESL extension: qualified names with :: (e.g., package::bar, super::baz)
 */
export function parseSimpleIdentifier(
  stream: WeslStream,
  ctx: ParseContext,
): RefIdentElem | null {
  const startPos = checkpoint(stream);

  // Try to parse first part (word or keyword "package"/"super")
  let firstToken = consumeKind(stream, "word");
  if (!firstToken) {
    // Check for "package" or "super" keywords
    firstToken =
      consumeKind(stream, "keyword", "package") ||
      consumeKind(stream, "keyword", "super");
  }

  if (!firstToken) {
    reset(stream, startPos);
    return null;
  }

  // Build the full qualified name by following :: separators
  let fullName = firstToken.text;
  const nameStart = firstToken.span[0];
  let nameEnd = firstToken.span[1];

  // Parse :: word chains
  while (consume(stream, "::")) {
    // After ::, we can have a word or a keyword used as an identifier
    // Keywords like "else", "if", "for", etc. are valid identifiers after ::
    const nextToken = stream.peek();
    if (
      !nextToken ||
      (nextToken.kind !== "word" && nextToken.kind !== "keyword")
    ) {
      throw new Error(`Expected identifier after '::'`);
    }
    stream.nextToken(); // consume the word/keyword
    fullName += "::" + nextToken.text;
    nameEnd = nextToken.span[1];
  }

  // Create RefIdent using context
  const ident = ctx.createRefIdent(fullName, [nameStart, nameEnd]);

  // Create RefIdentElem
  const refIdentElem: RefIdentElem = {
    kind: "ref",
    ident,
    srcModule: ctx.srcModule,
    start: nameStart,
    end: nameEnd,
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
 * Parse function call arguments
 *
 * Grammar: argument_expression_list : '(' expression_comma_list ? ')'
 * Grammar: expression_comma_list : expression ( ',' expression ) * ',' ?
 */
function parseFunctionCallArgs(
  stream: WeslStream,
  ctx: ParseContext,
): { args: ExpressionElem[]; end: number } {
  const args: ExpressionElem[] = [];

  // Expect opening paren
  const openParen = consume(stream, "(");
  if (!openParen) {
    return { args, end: stream.peek()?.span[0] ?? 0 };
  }

  // Check for empty argument list
  const closeParen1 = consume(stream, ")");
  if (closeParen1) {
    return { args, end: closeParen1.span[1] };
  }

  // Parse comma-separated arguments
  let endPos = 0;
  while (true) {
    // Parse argument expression
    const arg = parseExpression(stream, ctx);
    if (!arg) {
      // Check if we're at a closing paren (trailing comma case)
      const closeParen = stream.peek();
      if (closeParen?.text === ")") {
        endPos = closeParen.span[1];
        stream.nextToken();
        break;
      }
      throw new Error("Expected expression in function arguments");
    }

    args.push(arg);

    // Check for comma or closing paren
    const next = stream.peek();
    if (!next) break;

    if (next.text === ",") {
      stream.nextToken();
      // Check for trailing comma before closing paren
      const closeParen = stream.peek();
      if (closeParen?.text === ")") {
        endPos = closeParen.span[1];
        stream.nextToken();
        break;
      }
      continue;
    }

    if (next.text === ")") {
      endPos = next.span[1];
      stream.nextToken();
      break;
    }

    throw new Error("Expected ',' or ')' in function arguments");
  }

  return { args, end: endPos };
}

/**
 * Parse postfix operations (component/swizzle specifiers and function calls)
 *
 * Grammar: component_or_swizzle_specifier :
 *   '[' expression ']' component_or_swizzle_specifier ?
 *   | '.' member_ident component_or_swizzle_specifier ?
 *   | '.' swizzle_name component_or_swizzle_specifier ?
 *
 * Grammar: call_phrase : template_elaborated_ident argument_expression_list
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
        start: current.start,
        end: memberName.end,
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

      const closeBracket = expect(
        stream,
        "]",
        "Expected ']' after array index",
      );

      // Create ComponentExpression
      const arrayExpr: ComponentExpression = {
        kind: "component-expression",
        base: current,
        access: indexExpr,
        start: current.start,
        end: closeBracket.span[1],
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
          const { args, end } = parseFunctionCallArgs(stream, ctx);

          // Create FunctionCallExpression (type constructors are function calls in AST)
          const callExpr: FunctionCallExpression = {
            kind: "call-expression",
            function: current,
            arguments: args,
            start: current.start,
            end,
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
      const { args, end } = parseFunctionCallArgs(stream, ctx);

      // Create FunctionCallExpression
      const callExpr: FunctionCallExpression = {
        kind: "call-expression",
        function: current,
        arguments: args,
        start: current.start,
        end,
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
 * Parse unary expression
 *
 * Grammar: unary_expression :
 *   singular_expression | '-' unary_expression | '!' unary_expression
 *   | '~' unary_expression | '*' unary_expression | '&' unary_expression
 */
function parseUnaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  const _startPos = checkpoint(stream);
  const token = stream.peek();

  if (!token) return null;

  // Check for unary operators
  if (
    token.text === "-" ||
    token.text === "!" ||
    token.text === "&" ||
    token.text === "*" ||
    token.text === "~"
  ) {
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
      start: operator.span[0],
      end: operand.end,
    };

    return unaryExpr;
  }

  // Not a unary operator, parse primary expression
  return parsePrimaryExpression(stream, ctx);
}

/**
 * Parse primary expression
 *
 * Grammar: primary_expression :
 *   template_elaborated_ident | call_expression | literal | paren_expression
 *
 * Grammar: paren_expression : '(' expression ')'
 * Grammar: singular_expression : primary_expression component_or_swizzle_specifier ?
 */
function parsePrimaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
): ExpressionElem | null {
  const startPos = checkpoint(stream);

  // Try parenthesized expression
  const openParen = consume(stream, "(");
  if (openParen) {
    const expr = parseExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '('");
    }

    const closeParen = expect(stream, ")", "Expected ')' after expression");

    // Create ParenthesizedExpression
    const parenExpr: ParenthesizedExpression = {
      kind: "parenthesized-expression",
      expression: expr,
      start: openParen.span[0],
      end: closeParen.span[1],
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
  "==": 6,
  "!=": 6,
  "<": 7,
  "<=": 7,
  ">": 7,
  ">=": 7,
  "<<": 8,
  ">>": 8,
  "+": 9,
  "-": 9,
  "*": 10,
  "/": 10,
  "%": 10,
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
 *
 * Grammar: multiplicative_expression : unary_expression | multiplicative_expression ('*'|'/'|'%') unary_expression
 * Grammar: additive_expression : multiplicative_expression | additive_expression ('+'|'-') multiplicative_expression
 * Grammar: shift_expression : additive_expression | unary_expression ('<<'|'>>') unary_expression
 * Grammar: relational_expression : shift_expression | shift_expression ('<'|'>'|'<='|'>='|'=='|'!=') shift_expression
 * Grammar: bitwise_expression : binary_and_expression '&' unary_expression | binary_or_expression '|' unary_expression | binary_xor_expression '^' unary_expression
 * Grammar: short_circuit_and_expression : relational_expression | short_circuit_and_expression '&&' relational_expression
 * Grammar: short_circuit_or_expression : relational_expression | short_circuit_or_expression '||' relational_expression
 */
function parseBinaryExpression(
  stream: WeslStream,
  ctx: ParseContext,
  minPrecedence: number,
  left: ExpressionElem,
): ExpressionElem {
  let current = left;
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
      left: current,
      right,
      start: current.start,
      end: right.end,
    };

    current = binaryExpr;
  }

  return current;
}

/**
 * Parse full expression
 *
 * Grammar: expression :
 *   relational_expression
 *   | short_circuit_or_expression '||' relational_expression
 *   | short_circuit_and_expression '&&' relational_expression
 *   | bitwise_expression
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
  const [start, end] = token.span;
  return {
    kind: "literal",
    value: token.text,
    start,
    end,
  };
}
