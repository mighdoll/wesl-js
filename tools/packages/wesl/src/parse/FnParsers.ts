/**
 * Custom parsers for WESL function declarations
 * Week 5: fn declarations with stub body parsing
 * TODO Week 6+: Implement full statement parsing for function bodies
 */

import type {
  AttributeElem,
  DeclIdentElem,
  FnElem,
  FnParamElem,
  StatementElem,
  TypedDeclElem,
  TypeRefElem,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, consumeKind, expect, reset } from "./ParseUtil.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import type { WeslStream } from "./WeslStream.ts";

// Import helper functions from ConstParsers
// (We'll use the same attachment and linking patterns)

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
 * Link a DeclIdent back to its declaration element
 */
function linkDeclIdent(
  typedDecl: TypedDeclElem,
  declElem: FnParamElem,
): void {
  typedDecl.decl.ident.declElem = declElem;
}

/**
 * Link a DeclIdentElem back to its declaration element (for fn name)
 */
function linkDeclIdentElem(
  declIdentElem: DeclIdentElem,
  declElem: FnElem,
): void {
  declIdentElem.ident.declElem = declElem;
}

/**
 * Parse a function parameter: [@attrs] [name] [: type]?
 * Week 5: Similar to parseTypedDecl but for function parameters
 * Week 7: Attribute support
 */
function parseFnParam(
  stream: WeslStream,
  ctx: ParseContext,
): FnParamElem | null {
  const startPos = checkpoint(stream);

  // Parse optional attributes
  const attributes = parseAttributeList(stream);

  // Parse parameter name
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    reset(stream, startPos);
    return null;
  }

  // Create DeclIdent for this parameter
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    false, // isGlobal = false for function parameters
  );

  // Create DeclIdentElem
  const declIdentElem: DeclIdentElem = {
    kind: "decl",
    ident: declIdent,
    srcModule: ctx.srcModule,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };

  // Save the identifier in the current scope
  ctx.saveIdent(declIdent);

  // Check for optional type annotation `: type`
  let typeRef: undefined = undefined;
  let typeScope: undefined = undefined;

  if (consume(stream, ":")) {
    // Parse the type reference
    const parsedTypeRef = parseSimpleTypeRef(stream, ctx);
    if (!parsedTypeRef) {
      throw new Error("Expected type after ':' in function parameter");
    }
    // For now, we don't use the parsed type ref in the TypedDeclElem
    // This maintains compatibility with v1 while consuming the tokens
    // TODO: Store typeRef when we add full type support
  }

  const endPos = checkpoint(stream);

  // Create TypedDeclElem for the parameter
  const typedDecl: TypedDeclElem = {
    kind: "typeDecl",
    decl: declIdentElem,
    typeRef,
    typeScope,
    start: nameToken.span[0],
    end: endPos,
    contents: [],
  };

  // Create FnParamElem
  const paramElem: FnParamElem = {
    kind: "param",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents: [],
  };

  // Link the typed decl back to the param elem
  linkDeclIdent(typedDecl, paramElem);

  attachAttributes(paramElem, attributes.length > 0 ? attributes : undefined);

  return paramElem;
}

/**
 * Parse a stub function body by skipping tokens until matching `}`
 * Week 5: Minimal implementation to allow function parsing without full statement support
 * TODO Week 6+: Replace with full statement parser
 */
function parseStubFnBody(
  stream: WeslStream,
  _ctx: ParseContext,
): StatementElem | null {
  const startPos = checkpoint(stream);

  // Expect opening brace
  if (!consume(stream, "{")) {
    reset(stream, startPos);
    return null;
  }

  // Skip tokens until we find the matching closing brace
  let depth = 1;
  while (depth > 0) {
    const token = stream.nextToken();
    if (!token) {
      throw new Error("Unclosed function body, expected '}'");
    }
    if (token.text === "{") depth++;
    if (token.text === "}") depth--;
  }

  const endPos = checkpoint(stream);

  // Create a simple StatementElem stub for the body
  const bodyElem: StatementElem = {
    kind: "statement",
    start: startPos,
    end: endPos,
    contents: [],
  };

  return bodyElem;
}

/**
 * Parse a function declaration: fn <name>(<params>) [-> <return_type>]? <body>
 * Week 5: Full signature parsing with stub body
 */
export function parseFnDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): FnElem | null {
  const startPos = checkpoint(stream);

  // Expect "fn" keyword
  if (!consume(stream, "fn")) {
    reset(stream, startPos);
    return null;
  }

  // Parse function name
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    throw new Error("Expected identifier after 'fn'");
  }

  // Create DeclIdent for this function
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    true, // isGlobal for functions
  );

  // Create DeclIdentElem
  const declIdentElem: DeclIdentElem = {
    kind: "decl",
    ident: declIdent,
    srcModule: ctx.srcModule,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };

  // Save the identifier in the current scope
  ctx.saveIdent(declIdent);

  // Expect "("
  expect(stream, "(", "Expected '(' after function name");

  // Parse parameters
  const params: FnParamElem[] = [];

  // Push a new scope for function parameters
  ctx.pushScope();

  // Parse parameter list (comma-separated)
  while (true) {
    // Check for closing paren
    if (consume(stream, ")")) {
      break;
    }

    // Parse a parameter
    const param = parseFnParam(stream, ctx);
    if (!param) {
      throw new Error("Expected function parameter or ')'");
    }

    params.push(param);

    // Check for comma separator
    const hasComma = consume(stream, ",");

    // If there's no comma, we should see a closing paren next
    if (!hasComma) {
      expect(stream, ")", "Expected ',' or ')' after function parameter");
      break;
    }
  }

  // Parse optional return type: -> type
  let returnType: TypeRefElem | undefined = undefined;
  let returnAttributes: AttributeElem[] | undefined = undefined;

  if (consume(stream, "->")) {
    // TODO: Parse optional return attributes before type
    // For now, we'll skip this and just parse the type

    // Parse return type
    const parsedReturnType = parseSimpleTypeRef(stream, ctx);
    if (!parsedReturnType) {
      throw new Error("Expected type after '->'");
    }

    returnType = parsedReturnType;
  }

  // Parse function body
  const body = parseStubFnBody(stream, ctx);
  if (!body) {
    throw new Error("Expected function body");
  }

  // Pop the function parameter scope
  ctx.popScope();

  const endPos = checkpoint(stream);

  // Create FnElem
  const fnElem: FnElem = {
    kind: "fn",
    name: declIdentElem,
    params,
    body,
    returnType,
    returnAttributes,
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(fnElem, attributes);
  linkDeclIdentElem(declIdentElem, fnElem);

  return fnElem;
}
