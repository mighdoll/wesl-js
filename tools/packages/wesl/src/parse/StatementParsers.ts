/** Custom parsers for WESL statements */

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
import {
  attachAttributes,
  checkpoint,
  consume,
  expect,
  reset,
} from "./ParseUtil.ts";
import { closeElem, openElem } from "./v2/ContentsHelpers.ts";
import type { WeslStream } from "./WeslStream.ts";

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
 * Parse compound statement (block)
 *
 * Grammar: compound_statement : attribute * '{' statement * '}'
 * For loop bodies: '{' statement * continuing_statement ? '}'
 */
function parseCompoundStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
  loopBody?: boolean,
): StatementElem | null {
  // Peek to get position of '{' token
  const peeked = stream.peek();
  if (!peeked || peeked.text !== "{") {
    return null;
  }

  // Capture position at the '{' token
  const bracePos = peeked.span[0];
  const startPos = getStartWithAttributes(attributes, bracePos);

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
  const hasConditional = attributes?.some(
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

      // In loop body mode, continuing must be last (followed only by })
      if (loopBody) {
        const stmtText = stream.src.substring(stmt.start, stmt.end).trimStart();
        if (stmtText.startsWith("continuing")) {
          expect(stream, "}", "Expected '}' after continuing block");
          break;
        }
      }
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
 * Parse simple statement
 *
 * Grammar: return_statement : 'return' expression ?
 * Grammar: break_statement : 'break'
 * Grammar: continue_statement : 'continue'
 * Grammar: variable_updating_statement : assignment_statement | increment_statement | decrement_statement
 * Grammar: func_call_statement : call_phrase
 */
function parseSimpleStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);
  const startPos = getStartWithAttributes(attributes, keywordPos);

  // Check for simple keywords
  const token = stream.peek();
  if (!token) return null;

  // Handle return statement with optional expression
  if (token.text === "return") {
    stream.nextToken();

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
    stream.nextToken();

    // Check for "break if" statement
    if (token.text === "break") {
      const nextToken = stream.peek();
      if (nextToken && nextToken.text === "if") {
        stream.nextToken();

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
    stream.nextToken();

    // Expect assignment operator
    const assignOp = stream.peek();
    if (!assignOp || !isAssignmentOperator(assignOp.text)) {
      throw new Error("Expected assignment operator after '_'");
    }
    stream.nextToken();

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
      stream.nextToken();

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
      stream.nextToken();

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
 * Parse if statement
 *
 * Grammar: if_statement : attribute * if_clause else_if_clause * else_clause ?
 * Grammar: if_clause : 'if' expression compound_statement
 * Grammar: else_if_clause : 'else' 'if' expression compound_statement
 * Grammar: else_clause : 'else' compound_statement
 */
function parseIfStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);

  // Expect "if"
  if (!consume(stream, "if")) return null;

  const startPos = getStartWithAttributes(attributes, keywordPos);

  // Open statement to collect contents including "if" keyword and condition
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse condition expression (will be added to contents)
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'if'");
  }

  // Parse then block with optional attributes
  const thenAttrs = parseAttributeList(stream);
  const thenBlock = parseCompoundStatement(stream, ctx, thenAttrs.length > 0 ? thenAttrs : undefined);
  if (!thenBlock) {
    throw new Error("Expected '{' after if condition");
  }
  ctx.addElem(thenBlock);

  // Parse else if / else chains
  while (true) {
    const elseToken = stream.peek();
    if (!elseToken || elseToken.text !== "else") break;

    stream.nextToken();

    const nextToken = stream.peek();
    if (!nextToken) {
      throw new Error("Expected 'if' or '{' after 'else'");
    }

    if (nextToken.text === "if") {
      // else if branch
      stream.nextToken();
      // Parse else if condition
      const elseIfCondition = parseExpression(stream, ctx);
      if (!elseIfCondition) {
        throw new Error("Expected condition expression after 'else if'");
      }

      const elseIfAttrs = parseAttributeList(stream);
      const elseIfBlock = parseCompoundStatement(stream, ctx, elseIfAttrs.length > 0 ? elseIfAttrs : undefined);
      if (!elseIfBlock) {
        throw new Error("Expected '{' after else if condition");
      }
      ctx.addElem(elseIfBlock);
    } else {
      // Final else branch with optional attributes
      const elseAttrs = parseAttributeList(stream);
      const elseBlock = parseCompoundStatement(stream, ctx, elseAttrs.length > 0 ? elseAttrs : undefined);
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
 * Parse for statement
 *
 * Grammar: for_statement : attribute * 'for' '(' for_header ')' compound_statement
 * Grammar: for_header : for_init ? ';' expression ? ';' for_update ?
 * Grammar: for_init : variable_or_value_statement | variable_updating_statement | func_call_statement
 * Grammar: for_update : variable_updating_statement | func_call_statement
 */
function parseForStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);

  // Expect "for"
  if (!consume(stream, "for")) return null;

  const startPos = getStartWithAttributes(attributes, keywordPos);

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
      stream.nextToken();

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
        stream.nextToken();
      }
    }
  }
  expect(stream, ")", "Expected ')' after for loop header");

  // Parse body with optional attributes
  const bodyAttrs = parseAttributeList(stream);
  const body = parseCompoundStatement(stream, ctx, bodyAttrs.length > 0 ? bodyAttrs : undefined);
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
 * Parse while statement
 *
 * Grammar: while_statement : attribute * 'while' expression compound_statement
 */
function parseWhileStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);

  // Expect "while"
  if (!consume(stream, "while")) return null;

  const startPos = getStartWithAttributes(attributes, keywordPos);

  // Open statement to collect contents including "while" keyword and condition
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse condition expression (will be added to contents)
  const condition = parseExpression(stream, ctx);
  if (!condition) {
    throw new Error("Expected condition expression after 'while'");
  }

  // Parse body with optional attributes
  const bodyAttrs = parseAttributeList(stream);
  const body = parseCompoundStatement(stream, ctx, bodyAttrs.length > 0 ? bodyAttrs : undefined);
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
 * Parse loop statement
 *
 * Grammar: loop_statement : attribute * 'loop' attribute * '{' statement * continuing_statement ? '}'
 */
function parseLoopStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);

  // Expect "loop"
  if (!consume(stream, "loop")) return null;

  const startPos = getStartWithAttributes(attributes, keywordPos);

  // Open statement to collect contents including "loop" keyword
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse loop body with optional attributes (loopBody=true for strict continuing handling)
  const bodyAttrs = parseAttributeList(stream);
  const body = parseCompoundStatement(stream, ctx, bodyAttrs.length > 0 ? bodyAttrs : undefined, true);
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
 * Parse continuing statement (inside loop)
 *
 * Grammar: continuing_statement : 'continuing' continuing_compound_statement
 * Grammar: continuing_compound_statement : attribute * '{' statement * break_if_statement ? '}'
 * Grammar: break_if_statement : 'break' 'if' expression ';'
 */
function parseContinuingStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect "continuing"
  if (!consume(stream, "continuing")) return null;

  // Open statement to collect contents including "continuing" keyword
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse body with optional attributes
  const bodyAttrs = parseAttributeList(stream);
  const body = parseCompoundStatement(stream, ctx, bodyAttrs.length > 0 ? bodyAttrs : undefined);
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
 * Parse switch statement
 *
 * Grammar: switch_statement : attribute * 'switch' expression switch_body
 * Grammar: switch_body : attribute * '{' switch_clause + '}'
 * Grammar: switch_clause : case_clause | default_alone_clause
 * Grammar: case_clause : 'case' case_selectors ':' ? compound_statement
 * Grammar: case_selectors : case_selector ( ',' case_selector ) * ',' ?
 * Grammar: case_selector : 'default' | expression
 * Grammar: default_alone_clause : 'default' ':' ? compound_statement
 */
function parseSwitchStatement(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StatementElem | null {
  const keywordPos = checkpoint(stream);

  // Expect "switch"
  if (!consume(stream, "switch")) return null;

  const startPos = getStartWithAttributes(attributes, keywordPos);

  // Open statement to collect contents
  const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
  openElem(ctx, { kind: "statement", contents: initialContents });

  // Parse switch expression
  const expr = parseExpression(stream, ctx);
  if (!expr) {
    throw new Error("Expected expression after 'switch'");
  }

  // Parse optional attributes for switch body, then opening brace
  // Note: attributes are consumed to allow parsing (switch body doesn't have a separate element)
  parseAttributeList(stream);
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
      stream.nextToken();

      // Parse case value expression(s) - can be comma-separated (e.g., case 1u, 2u, 3u:)
      const caseExpr = parseExpression(stream, ctx);
      if (!caseExpr) {
        throw new Error("Expected expression after 'case'");
      }

      // Check for additional comma-separated case values
      while (true) {
        const commaToken = stream.peek();
        if (!commaToken || commaToken.text !== ",") break;

        stream.nextToken();

        // Parse next case value
        const nextExpr = parseExpression(stream, ctx);
        if (!nextExpr) {
          throw new Error("Expected expression after ',' in case values");
        }
      }

      // Check for optional colon (WGSL allows both `case 0:` and `case 0 { }`)
      const colonToken = stream.peek();
      if (colonToken && colonToken.text === ":") {
        stream.nextToken();
      }

      // Parse body attributes (for the compound statement)
      const bodyAttrs = parseAttributeList(stream);
      // Merge clause attrs with body attrs
      const allAttrs = [...clauseAttrs, ...bodyAttrs];

      // Parse case body (compound statement)
      const caseBody = parseCompoundStatement(
        stream,
        ctx,
        allAttrs.length > 0 ? allAttrs : undefined,
      );
      if (!caseBody) {
        throw new Error("Expected '{' after case value");
      }
      ctx.addElem(caseBody);
    } else if (token.text === "default") {
      stream.nextToken();

      // Check for optional colon (WGSL allows both `default:` and `default { }`)
      const colonToken = stream.peek();
      if (colonToken && colonToken.text === ":") {
        stream.nextToken();
      }

      // Parse body attributes (for the compound statement)
      const defaultBodyAttrs = parseAttributeList(stream);
      // Merge clause attrs with body attrs
      const allDefaultAttrs = [...clauseAttrs, ...defaultBodyAttrs];

      // Parse default body (compound statement)
      const defaultBody = parseCompoundStatement(
        stream,
        ctx,
        allDefaultAttrs.length > 0 ? allDefaultAttrs : undefined,
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

/**
 * Get adjusted start position that includes emitted attributes.
 * Only non-conditional attributes (not @if/@else/@elif) affect the span,
 * since conditional attributes are dropped during emission.
 */
function getStartWithAttributes(
  attributes: AttributeElem[] | undefined,
  keywordPos: number,
): number {
  const firstEmitted = attributes?.find(
    attr =>
      attr.kind === "attribute" &&
      attr.attribute.kind !== "@if" &&
      attr.attribute.kind !== "@elif" &&
      attr.attribute.kind !== "@else",
  );
  return firstEmitted ? firstEmitted.start : keywordPos;
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

/** Helper to finalize statement with conditional scope handling */
function finalizeConditional(
  ctx: ParseContext,
  hasConditional: boolean,
  attributes: AttributeElem[],
): void {
  if (hasConditional) {
    const partialScope = ctx.popScope();
    partialScope.condAttribute = getConditionalAttribute(attributes);
  }
}

/**
 * Parse any statement
 *
 * Grammar: statement :
 *   ';' | return_statement ';' | if_statement | switch_statement | loop_statement
 *   | for_statement | while_statement | func_call_statement ';'
 *   | variable_or_value_statement ';' | break_statement ';' | continue_statement ';'
 *   | 'discard' ';' | variable_updating_statement ';' | compound_statement
 *   | assert_statement ';'
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

  const attrsOrUndef = attributes.length > 0 ? attributes : undefined;

  // Try each parser in order
  const parsers = [
    parseLocalVarDecl,
    parseLetDecl,
    parseConstDecl,
    parseConstAssert,
    parseCompoundStatement,
    parseIfStatement,
    parseSwitchStatement,
    parseForStatement,
    parseWhileStatement,
    parseLoopStatement,
    parseContinuingStatement,
    parseSimpleStatement,
  ];

  for (const parser of parsers) {
    const stmt = parser(stream, ctx, attrsOrUndef);
    if (stmt) {
      finalizeConditional(ctx, hasConditional, attributes);
      return stmt as StatementElem;
    }
  }

  return null;
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
