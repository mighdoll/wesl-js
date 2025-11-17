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
  GrammarElem,
  TypedDeclElem,
  TypeRefElem,
} from "../AbstractElems.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect } from "./ParseUtil.ts";
import { parseFunctionBody } from "./StatementParsers.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import { closeElem, openElem } from "./v2/ContentsHelpers.ts";
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
function linkDeclIdent(typedDecl: TypedDeclElem, declElem: FnParamElem): void {
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
  // Parse optional attributes
  const attributes = parseAttributeList(stream);

  // Peek at parameter name to get position
  const nameToken = stream.peek();
  if (!nameToken || nameToken.kind !== "word") {
    return null;
  }

  const startPos = nameToken.span[0];

  // Consume the name token
  stream.nextToken();

  // Open param element for content collection
  openElem(ctx, { kind: "param", contents: [] });

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
  let typeRef: TypeRefElem | undefined;
  let typeScope: undefined;

  if (consume(stream, ":")) {
    // Parse the type reference
    const parsedTypeRef = parseSimpleTypeRef(stream, ctx);
    if (!parsedTypeRef) {
      throw new Error("Expected type after ':' in function parameter");
    }
    ctx.addElem(parsedTypeRef);
    typeRef = parsedTypeRef;
  }

  const typeDeclEndPos = checkpoint(stream);

  // Create TypedDeclElem for the parameter (no separate contents, covered by param)
  const typedDecl: TypedDeclElem = {
    kind: "typeDecl",
    decl: declIdentElem,
    typeRef,
    typeScope,
    start: nameToken.span[0],
    end: typeDeclEndPos,
    contents: [], // TypedDecl inside param doesn't need separate contents
  };

  const endPos = checkpoint(stream);

  // Close param element and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create FnParamElem
  const paramElem: FnParamElem = {
    kind: "param",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
  };

  // Link the typed decl back to the param elem
  linkDeclIdent(typedDecl, paramElem);

  attachAttributes(paramElem, attributes.length > 0 ? attributes : undefined);

  return paramElem;
}

/**
 * Parse a function declaration: fn <name>(<params>) [-> <return_type>]? <body>
 * Week 5: Full signature parsing
 * Week 10: Real statement parsing for function bodies
 */
export function parseFnDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): FnElem | null {
  // Peek at "fn" keyword to get its position (don't use checkpoint to avoid including leading whitespace)
  const fnToken = stream.peek();
  if (!fnToken || fnToken.text !== "fn") {
    return null;
  }

  const startPos = fnToken.span[0];

  // Consume "fn" keyword
  stream.nextToken();

  // Push a partial scope for the entire function (matches V1 behavior)
  // This allows function body to see imports from parent scope
  ctx.pushScope("partial");

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

  // NOTE: FnElem does NOT use openElem/closeElem - build contents manually
  // See TEXT_ELEMENT_RULES.md: contents = [decl, ...params, returnType?, body]

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

  // Parse optional return type: -> [attributes]? type
  let returnType: TypeRefElem | undefined;
  let returnAttributes: AttributeElem[] | undefined;

  if (consume(stream, "->")) {
    // Parse optional return attributes before type
    const attrs = parseAttributeList(stream);
    if (attrs.length > 0) {
      returnAttributes = attrs;
    }

    // Parse return type
    const parsedReturnType = parseSimpleTypeRef(stream, ctx);
    if (!parsedReturnType) {
      throw new Error("Expected type after '->' and attributes");
    }

    returnType = parsedReturnType;
  }

  // Parse function body
  const body = parseFunctionBody(stream, ctx);
  if (!body) {
    throw new Error("Expected function body");
  }

  // Save the parameter scope as the dependentScope for binding
  // This allows binding to recursively process references inside the function body
  const paramScope = ctx.currentScope();
  declIdent.dependentScope = paramScope;

  // Pop the function parameter scope
  ctx.popScope();

  // Pop the partial scope for the function
  ctx.popScope();

  const endPos = checkpoint(stream);

  // Build contents manually (no text coverage for FnElem)
  const contents: GrammarElem[] = [declIdentElem, ...params];
  if (returnType) contents.push(returnType);
  contents.push(body);

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
    contents,
  };

  attachAttributes(fnElem, attributes);
  linkDeclIdentElem(declIdentElem, fnElem);

  return fnElem;
}
