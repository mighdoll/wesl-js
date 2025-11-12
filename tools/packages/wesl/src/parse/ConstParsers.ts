/**
 * Custom parsers for WESL const declarations
 * Week 2: Basic const declarations with simple expressions
 */

import type {
  AttributeElem,
  ConstElem,
  DeclIdentElem,
  TypedDeclElem,
} from "../AbstractElems.ts";
import { parseSimpleExpression } from "./ExpressionParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect, reset } from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse a typed declaration: name [: type]?
 * Returns a TypedDeclElem with embedded DeclIdentElem
 */
export function parseTypedDecl(
  stream: WeslStream,
  ctx: ParseContext,
): TypedDeclElem | null {
  const startPos = checkpoint(stream);

  // Parse identifier name
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    reset(stream, startPos);
    return null;
  }

  // Create DeclIdent for this declaration
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    true, // isGlobal for const declarations
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
  const typeRef: undefined = undefined;
  const typeScope: undefined = undefined;
  const colonPos = checkpoint(stream);
  if (consume(stream, ":")) {
    // TODO: Parse type specifier
    // For Week 2, we'll skip type parsing and just note its presence
    // This will be expanded in later weeks
    reset(stream, colonPos); // For now, don't consume the type
  }

  // Create TypedDeclElem
  const typedDecl: TypedDeclElem = {
    kind: "typeDecl",
    decl: declIdentElem,
    typeRef,
    typeScope,
    start: nameToken.span[0],
    end: nameToken.span[1],
    contents: [],
  };

  return typedDecl;
}

/**
 * Parse a const declaration: const <name> [: <type>]? = <expr> ;
 */
export function parseConstDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): ConstElem | null {
  const startPos = checkpoint(stream);

  // Expect "const" keyword
  if (!consume(stream, "const")) {
    reset(stream, startPos);
    return null;
  }

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'const'");
  }

  // Expect "="
  expect(stream, "=", "Expected '=' after const identifier");

  // Parse the initializer expression
  // For Week 2: Use simple expression parser (literals and identifiers only)
  // TODO Week 7-8: Expand to full expression parsing
  const _exprStart = checkpoint(stream);
  const expr = parseSimpleExpression(stream, ctx);
  if (!expr) {
    throw new Error("Expected expression after '='");
  }
  const _exprEnd = checkpoint(stream);

  // Expect ";"
  expect(stream, ";", "Expected ';' after const declaration");

  const endPos = checkpoint(stream);

  // Create ConstElem
  const constElem: ConstElem = {
    kind: "const",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents: [],
  };

  // Add attributes if present
  if (attributes && attributes.length > 0) {
    (constElem as any).attributes = attributes;
  }

  // Link the DeclIdent back to this ConstElem
  const declIdent = typedDecl.decl.ident;
  declIdent.declElem = constElem;

  return constElem;
}
