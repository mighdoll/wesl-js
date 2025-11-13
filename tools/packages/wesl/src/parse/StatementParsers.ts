/**
 * Custom parsers for WESL statements
 * Week 10: Basic statement parsing for function bodies
 * Week 11: Full expression integration
 *
 * Strategy: Parse statement structure (blocks, control flow) with
 * full expression support for conditions and assignments.
 */

import type {
  AttributeElem,
  StatementElem,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import { parseConstDecl, parseLetDecl, parseLocalVarDecl } from "./ConstParsers.ts";
import { parseExpression } from "./ExpressionParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect, reset } from "./ParseUtil.ts";
import { closeElem, openElem } from "./v2/ContentsHelpers.ts";
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
 * Parse an optional expression followed by semicolon
 * Used for return, expression statements, etc.
 *
 * NOTE: Expressions create RefIdent elements which have positions and get added to contents.
 * We use openElem/closeElem to generate text elements covering all gaps.
 */
function parseOptionalExpressionStatement(
  stream: WeslStream,
  ctx: ParseContext,
): StatementElem {
  const startPos = checkpoint(stream);

  // Open statement to collect contents
  openElem(ctx, { kind: "statement", contents: [] });

  // Parse expression (RefIdent elements will be added to contents via ctx.addElem)
  const expr = parseExpression(stream, ctx);

  // Expect semicolon
  expect(stream, ";", "Expected ';' after statement");

  const endPos = checkpoint(stream);

  // Close and fill with text elements
  const contents = closeElem(ctx, startPos, endPos);

  const stmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  return stmt;
}

/**
 * Parse a compound statement (block) without creating a new scope.
 * Used for function bodies where the parameter scope serves as the block scope.
 */
export function parseUnscopedCompoundStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  // Peek to get position of '{' token
  const peeked = stream.peek();
  if (!peeked || peeked.text !== "{") {
    return null;
  }

  // Capture start position at the '{' token, not before it
  const startPos = peeked.span[0];

  // Consume "{"
  const consumed = consume(stream, "{");
  if (!consumed) {
    return null;
  }

  // Open statement element for content collection
  openElem(ctx, { kind: "statement", contents: [] });

  // NOTE: No pushScope() here - use existing scope

  // Parse nested statements
  while (true) {
    // Check for closing brace
    if (consume(stream, "}")) {
      break;
    }

    // Try to parse a statement
    const stmt = parseStatement(stream, ctx);
    if (!stmt) {
      throw new Error("Expected statement or '}'");
    }

    ctx.addElem(stmt);
  }

  // NOTE: No popScope() here

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  const statementElem: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(statementElem, attributes);

  return statementElem;
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
  // Peek to get position of '{' token
  const peeked = stream.peek();
  if (!peeked || peeked.text !== "{") {
    return null;
  }

  // Capture start position at the '{' token, not before it
  const startPos = peeked.span[0];

  // Consume "{"
  const consumed = consume(stream, "{");
  if (!consumed) {
    return null;
  }

  // Open statement element for content collection
  openElem(ctx, { kind: "statement", contents: [] });

  // Push new scope for block
  ctx.pushScope();

  // Parse nested statements
  while (true) {
    // Check for closing brace
    if (consume(stream, "}")) {
      break;
    }

    // Parse a statement
    const stmt = parseStatement(stream, ctx);
    if (stmt) {
      ctx.addElem(stmt);
    } else {
      throw new Error("Expected statement or '}'");
    }
  }

  // Pop scope
  ctx.popScope();

  const endPos = checkpoint(stream);

  // Close statement element and fill with text
  const contents = closeElem(ctx, startPos, endPos);

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
 * Week 11: Full expression parsing
 */
function parseSimpleStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Check for simple keywords
  const token = stream.peek();
  if (!token) return null;

  // Handle return statement with optional expression
  if (token.text === "return") {
    stream.nextToken(); // consume "return"

    // Open statement to collect contents including "return" keyword
    openElem(ctx, { kind: "statement", contents: [] });

    // Parse optional expression (RefIdent elements will be added to contents)
    const expr = parseExpression(stream, ctx);

    // Expect semicolon
    expect(stream, ";", "Expected ';' after return statement");

    const endPos = checkpoint(stream);

    // Close and fill with text elements
    const contents = closeElem(ctx, startPos, endPos);

    const stmt: StatementElem = {
      kind: "statement",
      start: startPos,
      end: endPos,
      contents,
    };

    attachAttributes(stmt, attributes);
    return stmt;
  }

  // Handle break, continue, discard (no expression)
  if (token.text === "break" || token.text === "continue" || token.text === "discard") {
    stream.nextToken(); // consume keyword
    expect(stream, ";", "Expected ';' after statement");

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

  // Try to parse as expression statement
  // This includes assignments like `i = i + 1;` or function calls like `foo();`

  // Open statement to collect contents (will be filled with text automatically)
  openElem(ctx, { kind: "statement", contents: [] });

  const expr = parseExpression(stream, ctx);
  if (expr) {
    // Check for assignment operators after the expression
    const assignToken = stream.peek();
    if (assignToken && isAssignmentOperator(assignToken.text)) {
      stream.nextToken(); // consume assignment operator

      // Parse right-hand side expression
      const rhs = parseExpression(stream, ctx);
      if (!rhs) {
        throw new Error("Expected expression after assignment operator");
      }

      // Expect semicolon
      expect(stream, ";", "Expected ';' after assignment");

      const endPos = checkpoint(stream);

      // Close and fill with text (don't add expression elements, just create text)
      const contents = closeElem(ctx, startPos, endPos);

      const stmt: StatementElem = {
        kind: "statement",
        start: startPos,
        end: endPos,
        contents,
      };

      attachAttributes(stmt, attributes);
      return stmt;
    }

    // Not an assignment, just an expression statement
    expect(stream, ";", "Expected ';' after expression");

    const endPos = checkpoint(stream);

    // Close and fill with text
    const contents = closeElem(ctx, startPos, endPos);

    const stmt: StatementElem = {
      kind: "statement",
      start: startPos,
      end: endPos,
      contents,
    };

    attachAttributes(stmt, attributes);
    return stmt;
  }

  // Failed to parse, close the element we opened
  closeElem(ctx, startPos, startPos);

  reset(stream, startPos);
  return null;
}

/**
 * Check if a token is an assignment operator
 */
function isAssignmentOperator(text: string): boolean {
  return text === "=" ||
         text === "+=" || text === "-=" ||
         text === "*=" || text === "/=" || text === "%=" ||
         text === "&=" || text === "|=" || text === "^=" ||
         text === "<<=" || text === ">>=";
}

/**
 * Parse an if statement: if condition { } [else if condition { }]* [else { }]
 * Week 11: Full expression parsing for conditions
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

  // Parse condition expression
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'if'");
  }

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

      // Parse else if condition
      const elseIfCondition = parseExpression(stream, ctx);
      if (!elseIfCondition) {
        throw new Error("Expected condition expression after 'else if'");
      }

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
 * Week 11: Full expression parsing for conditions
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

  // Parse condition expression
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'while'");
  }

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
 * Week 10.5: Added local var/let/const declarations
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

  // Try local variable declarations (var, let, const)
  const localVar = parseLocalVarDecl(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (localVar) return localVar as unknown as StatementElem;

  const letDecl = parseLetDecl(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (letDecl) return letDecl as unknown as StatementElem;

  const constDecl = parseConstDecl(stream, ctx, attributes.length > 0 ? attributes : undefined);
  if (constDecl) return constDecl as unknown as StatementElem;

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
  // Function bodies use unscoped compound statement because the parameter scope
  // serves as the body scope (matching V1 behavior)
  return parseUnscopedCompoundStatement(stream, ctx);
}
