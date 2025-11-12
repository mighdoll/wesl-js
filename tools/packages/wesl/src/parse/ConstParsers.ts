/**
 * Custom parsers for WESL declarations
 * Week 2: const declarations
 * Week 3: override, var, alias declarations
 * Week 4: struct declarations
 */

import type {
  AliasElem,
  AttributeElem,
  ConstElem,
  DeclarationElem,
  DeclIdentElem,
  GlobalVarElem,
  NameElem,
  OverrideElem,
  StructElem,
  StructMemberElem,
  TypedDeclElem,
} from "../AbstractElems.ts";
import { parseSimpleExpression } from "./ExpressionParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect, reset } from "./ParseUtil.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import type { WeslStream } from "./WeslStream.ts";

// Helper functions to reduce duplication

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
  declElem: DeclarationElem,
): void {
  typedDecl.decl.ident.declElem = declElem;
}

/**
 * Link a DeclIdentElem back to its declaration element (for alias)
 */
function linkDeclIdentElem(
  declIdentElem: DeclIdentElem,
  declElem: DeclarationElem,
): void {
  declIdentElem.ident.declElem = declElem;
}

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
  let typeRef: undefined = undefined;
  let typeScope: undefined = undefined;
  const colonPos = checkpoint(stream);
  if (consume(stream, ":")) {
    // Parse the type reference
    // Week 3: Use simple type parser for basic type names
    const parsedTypeRef = parseSimpleTypeRef(stream, ctx);
    if (!parsedTypeRef) {
      throw new Error("Expected type after ':'");
    }
    // For now, we don't use the parsed type ref in the TypedDeclElem
    // This maintains compatibility with v1 while consuming the tokens
    // TODO: Store typeRef when we add full type support
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

  attachAttributes(constElem, attributes);
  linkDeclIdent(typedDecl, constElem);

  return constElem;
}

/**
 * Parse an override declaration: override <name> [: <type>]? [= <expr>]? ;
 * Week 3: Similar to const but with optional initialization
 */
export function parseOverrideDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): OverrideElem | null {
  const startPos = checkpoint(stream);

  // Expect "override" keyword
  if (!consume(stream, "override")) {
    reset(stream, startPos);
    return null;
  }

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'override'");
  }

  // Optional initialization: "= expr"
  if (consume(stream, "=")) {
    const expr = parseSimpleExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '='");
    }
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after override declaration");

  const endPos = checkpoint(stream);

  // Create OverrideElem
  const overrideElem: OverrideElem = {
    kind: "override",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(overrideElem, attributes);
  linkDeclIdent(typedDecl, overrideElem);

  return overrideElem;
}

/**
 * Parse a global var declaration: var [<template>]? <name> [: <type>]? [= <expr>]? ;
 * Week 3: Minimal implementation without template support
 * TODO: Add support for address space templates like <storage, read_write>
 */
export function parseVarDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): GlobalVarElem | null {
  const startPos = checkpoint(stream);

  // Expect "var" keyword
  if (!consume(stream, "var")) {
    reset(stream, startPos);
    return null;
  }

  // TODO Week 3: Skip template list for now (e.g., <storage, read_write>)
  // We'll add this in a future iteration
  if (consume(stream, "<")) {
    // Skip until we find the closing >
    let depth = 1;
    while (depth > 0) {
      const token = stream.nextToken();
      if (!token) throw new Error("Unclosed template in var declaration");
      if (token.text === "<") depth++;
      if (token.text === ">") depth--;
    }
  }

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'var'");
  }

  // Optional initialization: "= expr"
  if (consume(stream, "=")) {
    const expr = parseSimpleExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '='");
    }
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after var declaration");

  const endPos = checkpoint(stream);

  // Create GlobalVarElem
  const varElem: GlobalVarElem = {
    kind: "gvar",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(varElem, attributes);
  linkDeclIdent(typedDecl, varElem);

  return varElem;
}

/**
 * Parse an alias declaration: alias <name> = <type> ;
 * Week 3: Minimal type support (simple identifiers only)
 */
export function parseAliasDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): AliasElem | null {
  const startPos = checkpoint(stream);

  // Expect "alias" keyword
  if (!consume(stream, "alias")) {
    reset(stream, startPos);
    return null;
  }

  // Parse the name (just DeclIdentElem, not TypedDeclElem)
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    throw new Error("Expected identifier after 'alias'");
  }

  // Create DeclIdent for this alias
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    true, // isGlobal
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

  // Expect "="
  expect(stream, "=", "Expected '=' after alias name");

  // Parse the type reference
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) {
    throw new Error("Expected type after '=' in alias declaration");
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after alias declaration");

  const endPos = checkpoint(stream);

  // Create AliasElem
  const aliasElem: AliasElem = {
    kind: "alias",
    name: declIdentElem,
    typeRef,
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(aliasElem, attributes);
  linkDeclIdentElem(declIdentElem, aliasElem);

  return aliasElem;
}

/**
 * Parse a struct member: <name>: <type>
 * Week 4: Simple members without attributes
 * TODO: Add attribute support for struct members
 */
function parseStructMember(
  stream: WeslStream,
  ctx: ParseContext,
): StructMemberElem | null {
  const startPos = checkpoint(stream);

  // Parse member name
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    reset(stream, startPos);
    return null;
  }

  // Create NameElem for the member
  const nameElem: NameElem = {
    kind: "name",
    name: nameToken.text,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };

  // Expect ":"
  if (!consume(stream, ":")) {
    throw new Error("Expected ':' after struct member name");
  }

  // Parse type reference
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) {
    throw new Error("Expected type after ':' in struct member");
  }

  const endPos = checkpoint(stream);

  // Create StructMemberElem
  const memberElem: StructMemberElem = {
    kind: "member",
    name: nameElem,
    typeRef,
    start: startPos,
    end: endPos,
    contents: [],
  };

  // TODO: Add attribute support
  // attachAttributes(memberElem, attributes);

  return memberElem;
}

/**
 * Parse a struct declaration: struct <name> { <members> }
 * Week 4: Basic struct support
 */
export function parseStructDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StructElem | null {
  const startPos = checkpoint(stream);

  // Expect "struct" keyword
  if (!consume(stream, "struct")) {
    reset(stream, startPos);
    return null;
  }

  // Parse struct name
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    throw new Error("Expected identifier after 'struct'");
  }

  // Create DeclIdent for this struct
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    true, // isGlobal
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

  // Expect "{"
  expect(stream, "{", "Expected '{' after struct name");

  // Parse members separated by commas
  const members: StructMemberElem[] = [];

  // Push a new scope for the struct body
  ctx.pushScope();

  while (true) {
    // Check for closing brace
    if (consume(stream, "}")) {
      break;
    }

    // Parse a member
    const member = parseStructMember(stream, ctx);
    if (!member) {
      throw new Error("Expected struct member or '}'");
    }

    members.push(member);

    // Check for comma separator
    // In WGSL, members can be separated by commas, but the last comma is optional
    const hasComma = consume(stream, ",");

    // If there's no comma, we should see a closing brace next
    if (!hasComma) {
      expect(stream, "}", "Expected ',' or '}' after struct member");
      break;
    }
  }

  // Pop the struct scope
  ctx.popScope();

  const endPos = checkpoint(stream);

  // Create StructElem
  const structElem: StructElem = {
    kind: "struct",
    name: declIdentElem,
    members,
    start: startPos,
    end: endPos,
    contents: [],
  };

  attachAttributes(structElem, attributes);
  linkDeclIdentElem(declIdentElem, structElem);

  return structElem;
}
