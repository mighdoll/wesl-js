/**
 * Custom parsers for WESL statements
 * Week 10: Basic statement parsing for function bodies
 *
 * Strategy: Parse statement structure (blocks, control flow) while using
 * stub expression parsing. This allows proper AST structure without
 * requiring full expression support yet.
 */

import type {
  AttributeElem,
  StatementElem,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect, reset } from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Attach attributes to an element if present
 */
function attachAttributes<T extends { attributes?: AttributeElem[] }>(
  elem: T,
  attributes?: AttributeElem[],
): void {
  if (attributes && attributes.length > 0) {
    elem.attributes = attributes;
  }
}

/**
 * Skip tokens until we find a semicolon (for simple statements)
 * Returns the position after the semicolon
 */
function skipUntilSemicolon(stream: WeslStream): void {
  while (true) {
    const token = stream.peek();
    if (!token) {
      throw new Error("Unexpected end of input, expected ';'");
    }

    if (token.text === ";") {
      stream.nextToken(); // consume the semicolon
      break;
    }

    stream.nextToken();
  }
}

/**
 * Skip tokens for a condition expression (used in if/while/for)
 * Handles nested parentheses properly
 */
function skipConditionExpression(stream: WeslStream): void {
  let depth = 0;
  while (true) {
    const token = stream.peek();
    if (!token) {
      throw new Error("Unexpected end of input in condition expression");
    }

    if (token.text === "(") depth++;
    if (token.text === ")") depth--;
    if (token.text === "{" && depth === 0) {
      // Reached the body of the statement
      break;
    }

    stream.nextToken();
  }
}

/**
 * Parse a compound statement (block): { statements }
 * Week 10: Recursive statement parsing
 */
function parseCompoundStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "{"
  if (!consume(stream, "{")) {
    reset(stream, startPos);
    return null;
  }

  // Push new scope for block
  ctx.pushScope();

  // Parse nested statements
  const contents: StatementElem[] = [];
  while (true) {
    // Check for closing brace
    if (consume(stream, "}")) {
      break;
    }

    // Parse a statement
    const stmt = parseStatement(stream, ctx);
    if (stmt) {
      contents.push(stmt);
    } else {
      throw new Error("Expected statement or '}'");
    }
  }

  // Pop scope
  ctx.popScope();

  const endPos = checkpoint(stream);

  const blockStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(blockStmt, attributes);

  return blockStmt;
}

/**
 * Parse a simple statement (return, break, continue, discard, or expression)
 * Week 10: Stub implementation - just skip to semicolon
 */
function parseSimpleStatement(
  stream: WeslStream,
  _ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Check for simple keywords
  const token = stream.peek();
  if (!token) return null;

  // Handle simple keyword statements
  if (token.text === "return" ||
      token.text === "break" ||
      token.text === "continue" ||
      token.text === "discard") {
    stream.nextToken(); // consume keyword
    skipUntilSemicolon(stream);

    const endPos = checkpoint(stream);

    const stmt: StatementElem = {
      kind: "statement",
      start: startPos,
      end: endPos,
      contents: [],
    };

    attachAttributes(stmt, attributes);
    return stmt;
  }

  // Handle empty statement ";"
  if (token.text === ";") {
    stream.nextToken();

    const endPos = checkpoint(stream);

    const stmt: StatementElem = {
      kind: "statement",
      start: startPos,
      end: endPos,
      contents: [],
    };

    attachAttributes(stmt, attributes);
    return stmt;
  }

  // Otherwise, assume it's an expression statement or variable declaration
  // Just skip to semicolon
  skipUntilSemicolon(stream);

  const endPos = checkpoint(stream);

  const stmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(stmt, attributes);
  return stmt;
}

/**
 * Parse an if statement: if condition { } [else if condition { }]* [else { }]
 * Week 10: Structure parsing with stub expressions
 */
function parseIfStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "if"
  if (!consume(stream, "if")) {
    reset(stream, startPos);
    return null;
  }

  // Skip condition expression
  skipConditionExpression(stream);

  // Parse then block
  const thenBlock = parseCompoundStatement(stream, ctx);
  if (!thenBlock) {
    throw new Error("Expected '{' after if condition");
  }

  const contents: StatementElem[] = [thenBlock];

  // Parse else if / else chains
  while (true) {
    const elseToken = stream.peek();
    if (!elseToken || elseToken.text !== "else") break;

    stream.nextToken(); // consume "else"

    const nextToken = stream.peek();
    if (!nextToken) {
      throw new Error("Expected 'if' or '{' after 'else'");
    }

    if (nextToken.text === "if") {
      // else if branch
      stream.nextToken(); // consume "if"
      skipConditionExpression(stream);

      const elseIfBlock = parseCompoundStatement(stream, ctx);
      if (!elseIfBlock) {
        throw new Error("Expected '{' after else if condition");
      }
      contents.push(elseIfBlock);
    } else {
      // Final else branch
      const elseBlock = parseCompoundStatement(stream, ctx);
      if (!elseBlock) {
        throw new Error("Expected '{' after else");
      }
      contents.push(elseBlock);
      break;
    }
  }

  const endPos = checkpoint(stream);

  const ifStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(ifStmt, attributes);
  return ifStmt;
}

/**
 * Parse a for statement: for (init; condition; update) { }
 * Week 10: Structure parsing with stub expressions
 */
function parseForStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "for"
  if (!consume(stream, "for")) {
    reset(stream, startPos);
    return null;
  }

  // Expect "("
  expect(stream, "(", "Expected '(' after 'for'");

  // Skip init (could be empty, declaration, or expression)
  let depth = 1;
  while (depth > 0) {
    const token = stream.peek();
    if (!token) {
      throw new Error("Unexpected end of input in for loop header");
    }

    if (token.text === "(") depth++;
    if (token.text === ")") depth--;

    stream.nextToken();
  }

  // Now parse the body
  ctx.pushScope();
  const body = parseCompoundStatement(stream, ctx);
  ctx.popScope();

  if (!body) {
    throw new Error("Expected '{' after for loop header");
  }

  const endPos = checkpoint(stream);

  const forStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents: [body],
  };

  attachAttributes(forStmt, attributes);
  return forStmt;
}

/**
 * Parse a while statement: while condition { }
 * Week 10: Structure parsing with stub expressions
 */
function parseWhileStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "while"
  if (!consume(stream, "while")) {
    reset(stream, startPos);
    return null;
  }

  // Skip condition expression
  skipConditionExpression(stream);

  // Parse body
  const body = parseCompoundStatement(stream, ctx);
  if (!body) {
    throw new Error("Expected '{' after while condition");
  }

  const endPos = checkpoint(stream);

  const whileStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents: [body],
  };

  attachAttributes(whileStmt, attributes);
  return whileStmt;
}

/**
 * Parse a loop statement: loop { [continuing { }] }
 * Week 10: Structure parsing
 */
function parseLoopStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "loop"
  if (!consume(stream, "loop")) {
    reset(stream, startPos);
    return null;
  }

  // Parse loop body (manually to handle continuing block)
  expect(stream, "{", "Expected '{' after 'loop'");

  ctx.pushScope();

  const contents: StatementElem[] = [];
  while (true) {
    const token = stream.peek();
    if (!token) {
      throw new Error("Unexpected end of input in loop body");
    }

    if (token.text === "}") {
      stream.nextToken();
      break;
    }

    // Check for continuing block
    if (token.text === "continuing") {
      stream.nextToken();
      const continuingBlock = parseCompoundStatement(stream, ctx);
      if (continuingBlock) {
        contents.push(continuingBlock);
      }
      continue;
    }

    // Regular statement
    const stmt = parseStatement(stream, ctx);
    if (stmt) {
      contents.push(stmt);
    }
  }

  ctx.popScope();

  const endPos = checkpoint(stream);

  const loopStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(loopStmt, attributes);
  return loopStmt;
}

/**
 * Parse a single statement
 * Week 10: Handles all statement types with structural parsing
 */
export function parseStatement(
  stream: WeslStream,
  ctx: ParseContext,
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Parse optional attributes
  const attributes = parseAttributeList(stream);

  // Check for end of block
  const token = stream.peek();
  if (!token || token.text === "}") {
    reset(stream, startPos);
    return null;
  }

  // Try compound statement (block)
  const compoundStmt = parseCompoundStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (compoundStmt) return compoundStmt;

  // Try control flow statements
  const ifStmt = parseIfStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (ifStmt) return ifStmt;

  const forStmt = parseForStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (forStmt) return forStmt;

  const whileStmt = parseWhileStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (whileStmt) return whileStmt;

  const loopStmt = parseLoopStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (loopStmt) return loopStmt;

  // Fall back to simple statement
  return parseSimpleStatement(stream, ctx, attributes.length > 0 ? attributes : undefined);
}

/**
 * Parse a function body: { statements }
 * Week 10: Replaces stub body parser with real structural parsing
 */
export function parseFunctionBody(
  stream: WeslStream,
  ctx: ParseContext,
): StatementElem | null {
  return parseCompoundStatement(stream, ctx);
}
