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
  ElifAttribute,
  ElseAttribute,
  IfAttribute,
  StatementElem,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import {
  parseConstAssert,
  parseConstDecl,
  parseLetDecl,
  parseLocalVarDecl,
} from "./ConstParsers.ts";
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
function _parseOptionalExpressionStatement(
  stream: WeslStream,
  ctx: ParseContext,
): StatementElem {
  const startPos = checkpoint(stream);

  // Open statement to collect contents
  openElem(ctx, { kind: "statement", contents: [] });

  // Parse expression (RefIdent elements will be added to contents via ctx.addElem)
  const _expr = parseExpression(stream, ctx);

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
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Check if block is empty (just "{ }")
  const nextToken = stream.peek();
  const isEmpty = nextToken && nextToken.text === "}";

  // Only push scope if block is non-empty AND no conditional attributes
  // (if conditional attributes exist, the partial scope is already pushed by parseStatement)
  const hasConditional =
    attributes &&
    attributes.some(
      attr =>
        attr.kind === "attribute" &&
        (attr.attribute.kind === "@if" ||
          attr.attribute.kind === "@elif" ||
          attr.attribute.kind === "@else"),
    );

  const shouldPushScope = !isEmpty && !hasConditional;
  if (shouldPushScope) {
    ctx.pushScope();
  }

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

  // Pop scope only if we pushed one
  if (shouldPushScope) {
    ctx.popScope();
  }

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
    const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
    openElem(ctx, { kind: "statement", contents: initialContents });

    // Parse optional expression (RefIdent elements will be added to contents)
    const _expr = parseExpression(stream, ctx);

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
  if (
    token.text === "break" ||
    token.text === "continue" ||
    token.text === "discard"
  ) {
    stream.nextToken(); // consume keyword

    // Check for "break if" statement
    if (token.text === "break") {
      const nextToken = stream.peek();
      if (nextToken && nextToken.text === "if") {
        stream.nextToken(); // consume "if"

        // Open statement to collect contents including "break if" keywords
        const initialContents: AttributeElem[] = attributes
          ? [...attributes]
          : [];
        openElem(ctx, { kind: "statement", contents: initialContents });

        // Parse condition expression
        const _expr = parseExpression(stream, ctx);
        if (!_expr) {
          throw new Error("Expected condition expression after 'break if'");
        }

        // Expect semicolon
        expect(stream, ";", "Expected ';' after break if statement");

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
    }

    // Regular break/continue/discard - use openElem/closeElem for text coverage
    const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
    openElem(ctx, { kind: "statement", contents: initialContents });

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

  // Handle underscore assignment: _ = expr;
  if (token.text === "_") {
    stream.nextToken(); // consume "_"

    // Expect assignment operator
    const assignOp = stream.peek();
    if (!assignOp || !isAssignmentOperator(assignOp.text)) {
      throw new Error("Expected assignment operator after '_'");
    }
    stream.nextToken(); // consume assignment operator

    // Open statement to collect contents
    openElem(ctx, { kind: "statement", contents: [] });

    // Parse right-hand side expression
    const rhs = parseExpression(stream, ctx);
    if (!rhs) {
      throw new Error("Expected expression after assignment operator");
    }

    // Expect semicolon
    expect(stream, ";", "Expected ';' after assignment");

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

  // Try to parse as expression statement
  // This includes assignments like `i = i + 1;` or function calls like `foo();`

  // Open statement to collect contents (will be filled with text automatically)
  openElem(ctx, { kind: "statement", contents: [] });

  const expr = parseExpression(stream, ctx);
  if (expr) {
    // Check for postfix increment/decrement operators (e.g., x++, x--)
    const postfixToken = stream.peek();
    if (
      postfixToken &&
      (postfixToken.text === "++" || postfixToken.text === "--")
    ) {
      stream.nextToken(); // consume postfix operator

      // Expect semicolon
      expect(stream, ";", "Expected ';' after postfix operator");

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
  return (
    text === "=" ||
    text === "+=" ||
    text === "-=" ||
    text === "*=" ||
    text === "/=" ||
    text === "%=" ||
    text === "&=" ||
    text === "|=" ||
    text === "^=" ||
    text === "<<=" ||
    text === ">>="
  );
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

  // Open statement to collect contents including "if" keyword and condition
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse condition expression (will be added to contents)
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'if'");
  }

  // Parse then block
  const thenBlock = parseCompoundStatement(stream, ctx);
  if (!thenBlock) {
    throw new Error("Expected '{' after if condition");
  }
  ctx.addElem(thenBlock);

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
      ctx.addElem(elseIfBlock);
    } else {
      // Final else branch
      const elseBlock = parseCompoundStatement(stream, ctx);
      if (!elseBlock) {
        throw new Error("Expected '{' after else");
      }
      ctx.addElem(elseBlock);
      break;
    }
  }

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

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

  // Open statement to collect contents
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Create scope for loop variables
  ctx.pushScope();

  // Expect "("
  expect(stream, "(", "Expected '(' after 'for'");

  // Parse init (optional) - could be var declaration or expression
  const nextToken = stream.peek();
  if (nextToken && nextToken.text !== ";") {
    // Try variable declaration first (parseLocalVarDecl consumes the semicolon)
    const varDecl = parseLocalVarDecl(stream, ctx);
    if (varDecl) {
      ctx.addElem(varDecl);
    } else {
      // Parse expression (RefIdent elements will be added to contents automatically)
      const _initExpr = parseExpression(stream, ctx);
      expect(stream, ";", "Expected ';' after for loop init");
    }
  } else {
    // Empty init, consume the semicolon
    expect(stream, ";", "Expected ';' after for loop init");
  }

  // Parse condition (optional) - RefIdent elements added to contents automatically
  const condToken = stream.peek();
  if (condToken && condToken.text !== ";") {
    const _condition = parseExpression(stream, ctx);
  }
  expect(stream, ";", "Expected ';' after for loop condition");

  // Parse update (optional) - RefIdent elements added to contents automatically
  // Update can be: assignment (e.g., i += 1), expression (e.g., i = i + 1), postfix ++/--, or function call
  const updateToken = stream.peek();
  if (updateToken && updateToken.text !== ")") {
    const _update = parseExpression(stream, ctx);

    // Check for assignment operators after the expression (e.g., i += 1, i = i + 1)
    const assignToken = stream.peek();
    if (assignToken && isAssignmentOperator(assignToken.text)) {
      stream.nextToken(); // consume assignment operator

      // Parse right-hand side expression
      const _rhs = parseExpression(stream, ctx);
    } else {
      // Check for postfix ++ or -- (e.g., i++, count--)
      // These are consumed as text, not as part of the expression AST
      const postfixToken = stream.peek();
      if (
        postfixToken &&
        (postfixToken.text === "++" || postfixToken.text === "--")
      ) {
        stream.nextToken(); // consume the postfix operator (will be covered by text)
      }
    }
  }
  expect(stream, ")", "Expected ')' after for loop header");

  // Parse body
  const body = parseCompoundStatement(stream, ctx);
  if (!body) {
    throw new Error("Expected '{' after for loop header");
  }
  ctx.addElem(body);

  ctx.popScope();

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  const forStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
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

  // Open statement to collect contents including "while" keyword and condition
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse condition expression (will be added to contents)
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'while'");
  }

  // Parse body
  const body = parseCompoundStatement(stream, ctx);
  if (!body) {
    throw new Error("Expected '{' after while condition");
  }
  ctx.addElem(body);

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  const whileStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
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

  // Open statement to collect contents including "loop" keyword
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse loop body (continuing blocks are now parsed as regular statements)
  const body = parseCompoundStatement(stream, ctx);
  if (!body) {
    throw new Error("Expected '{' after 'loop'");
  }
  ctx.addElem(body);

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

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
 * Parse a continuing statement: continuing { }
 * Used inside loop statements
 */
function parseContinuingStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "continuing"
  if (!consume(stream, "continuing")) {
    reset(stream, startPos);
    return null;
  }

  // Open statement to collect contents including "continuing" keyword
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse body
  const body = parseCompoundStatement(stream, ctx);
  if (!body) {
    throw new Error("Expected '{' after 'continuing'");
  }
  ctx.addElem(body);

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  const continuingStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(continuingStmt, attributes);
  return continuingStmt;
}

/**
 * Parse a switch statement: switch expr { case expr: block, default: block }
 */
function parseSwitchStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "switch"
  if (!consume(stream, "switch")) {
    reset(stream, startPos);
    return null;
  }

  // Open statement to collect contents
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse switch expression
  const expr = parseExpression(stream, ctx);
  if (!expr) {
    throw new Error("Expected expression after 'switch'");
  }

  // Expect opening brace
  expect(stream, "{", "Expected '{' after switch expression");

  // Parse case clauses
  while (true) {
    // Parse optional attributes for the case/default clause
    const clauseAttrs = parseAttributeList(stream);

    const token = stream.peek();
    if (!token) {
      throw new Error("Unexpected end of input in switch statement");
    }

    // Check for closing brace
    if (token.text === "}") {
      stream.nextToken();
      break;
    }

    // Parse case or default
    if (token.text === "case") {
      stream.nextToken(); // consume "case"

      // Parse case value expression
      const caseExpr = parseExpression(stream, ctx);
      if (!caseExpr) {
        throw new Error("Expected expression after 'case'");
      }

      // Check for optional colon (WGSL allows both `case 0:` and `case 0 { }`)
      const colonToken = stream.peek();
      if (colonToken && colonToken.text === ":") {
        stream.nextToken(); // consume ":"
      }

      // Parse case body (compound statement)
      const caseBody = parseCompoundStatement(
        stream,
        ctx,
        clauseAttrs.length > 0 ? clauseAttrs : undefined,
      );
      if (!caseBody) {
        throw new Error("Expected '{' after case value");
      }
      ctx.addElem(caseBody);
    } else if (token.text === "default") {
      stream.nextToken(); // consume "default"

      // Check for optional colon (WGSL allows both `default:` and `default { }`)
      const colonToken = stream.peek();
      if (colonToken && colonToken.text === ":") {
        stream.nextToken(); // consume ":"
      }

      // Parse default body (compound statement)
      const defaultBody = parseCompoundStatement(
        stream,
        ctx,
        clauseAttrs.length > 0 ? clauseAttrs : undefined,
      );
      if (!defaultBody) {
        throw new Error("Expected '{' after 'default'");
      }
      ctx.addElem(defaultBody);
    } else {
      throw new Error("Expected 'case' or 'default' in switch body");
    }
  }

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  const switchStmt: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(switchStmt, attributes);
  return switchStmt;
}

/** Check if attributes contain @if/@elif/@else */
function hasConditionalAttribute(attributes: AttributeElem[]): boolean {
  return attributes.some(
    attr =>
      attr.kind === "attribute" &&
      (attr.attribute.kind === "@if" ||
        attr.attribute.kind === "@elif" ||
        attr.attribute.kind === "@else"),
  );
}

/** Get the conditional attribute from a list */
function getConditionalAttribute(
  attributes: AttributeElem[],
): IfAttribute | ElifAttribute | ElseAttribute | undefined {
  const elem = attributes.find(
    attr =>
      attr.kind === "attribute" &&
      (attr.attribute.kind === "@if" ||
        attr.attribute.kind === "@elif" ||
        attr.attribute.kind === "@else"),
  );
  return elem?.attribute as
    | IfAttribute
    | ElifAttribute
    | ElseAttribute
    | undefined;
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

  // If we have conditional attributes, create a partial scope
  const hasConditional =
    attributes.length > 0 && hasConditionalAttribute(attributes);
  if (hasConditional) {
    ctx.pushScope("partial");
  }

  let stmt: StatementElem | null = null;

  // Try local variable declarations (var, let, const)
  const attrsOrUndef = attributes.length > 0 ? attributes : undefined;

  stmt = parseLocalVarDecl(stream, ctx, attrsOrUndef) as any;
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt as unknown as StatementElem;
  }

  stmt = parseLetDecl(stream, ctx, attrsOrUndef) as any;
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt as unknown as StatementElem;
  }

  stmt = parseConstDecl(stream, ctx, attrsOrUndef) as any;
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt as unknown as StatementElem;
  }

  // Try const_assert statement
  stmt = parseConstAssert(stream, ctx, attrsOrUndef) as any;
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt as unknown as StatementElem;
  }

  // Try compound statement (block)
  stmt = parseCompoundStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  // Try control flow statements
  stmt = parseIfStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  stmt = parseSwitchStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  stmt = parseForStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  stmt = parseWhileStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  stmt = parseLoopStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  stmt = parseContinuingStatement(stream, ctx, attrsOrUndef);
  if (stmt) {
    if (hasConditional) {
      const partialScope = ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
    return stmt;
  }

  // Fall back to simple statement
  stmt = parseSimpleStatement(stream, ctx, attrsOrUndef);
  if (stmt && hasConditional) {
    const partialScope = ctx.popScope();
    partialScope.condAttribute = getConditionalAttribute(attributes);
  }

  return stmt;
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
