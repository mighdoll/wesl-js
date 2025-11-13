/**
 * Custom parsers for WESL declarations
 * Week 2: const declarations
 * Week 3: override, var, alias declarations
 * Week 4: struct declarations
 */

import type {
  AliasElem,
  AttributeElem,
  ConstAssertElem,
  ConstElem,
  DeclarationElem,
  DeclIdentElem,
  GlobalVarElem,
  LetElem,
  NameElem,
  OverrideElem,
  StructElem,
  StructMemberElem,
  TypedDeclElem,
  VarElem,
} from "../AbstractElems.ts";
import type { Scope } from "../Scope.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import { parseSimpleExpression } from "./ExpressionParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consume, expect, reset } from "./ParseUtil.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import type { WeslStream } from "./WeslStream.ts";
import { openElem, closeElem } from "./v2/ContentsHelpers.ts";

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

  // Open element to collect contents
  openElem(ctx, { kind: "typeDecl", contents: [] });

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

  // Add decl to contents
  ctx.addElem(declIdentElem);

  // Save the identifier in the current scope
  ctx.saveIdent(declIdent);

  // Check for optional type annotation `: type`
  let typeRef: TypeRefElem | undefined = undefined;
  let typeScope: Scope | undefined = undefined;
  const colonPos = checkpoint(stream);
  if (consume(stream, ":")) {
    // Push a scope for the type reference (matches V1's scopeCollectNoIf pattern)
    ctx.pushScope();

    // Parse the type reference
    // Week 3: Use simple type parser for basic type names
    const parsedTypeRef = parseSimpleTypeRef(stream, ctx);
    if (!parsedTypeRef) {
      throw new Error("Expected type after ':'");
    }
    // Add type to contents
    ctx.addElem(parsedTypeRef);
    // Store the typeRef for astToString summary
    typeRef = parsedTypeRef;

    // Capture the type scope before popping (needed for binding)
    typeScope = ctx.currentScope();

    // Pop the type reference scope
    ctx.popScope();
  }

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create TypedDeclElem
  const typedDecl: TypedDeclElem = {
    kind: "typeDecl",
    decl: declIdentElem,
    typeRef,
    typeScope,
    start: startPos,
    end: endPos,
    contents,
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

  // Push a partial scope for the entire const declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to collect contents
  openElem(ctx, { kind: "const", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'const'");
  }

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Expect "="
  expect(stream, "=", "Expected '=' after const identifier");

  // Push a scope for the initializer expression (matches V1's scopeCollectNoIf pattern)
  ctx.pushScope();

  // Parse the initializer expression
  // For Week 2: Use simple expression parser (literals and identifiers only)
  // TODO Week 7-8: Expand to full expression parsing
  const expr = parseSimpleExpression(stream, ctx);
  if (!expr) {
    throw new Error("Expected expression after '='");
  }

  // Note: Don't add expr to contents - expressions are ExpressionElem, not GrammarElem
  // They'll be covered by text elements automatically

  // Pop the initializer expression scope
  ctx.popScope();

  // Expect ";"
  expect(stream, ";", "Expected ';' after const declaration");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Save the scope as the dependentScope for binding
  // Prefer typeScope (for type references) over partial scope (for initializers)
  // This matches V1 behavior and allows binding to recursively process references
  if (typedDecl?.decl?.ident) {
    const constScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = typedDecl.typeScope || constScope;
  }

  // Pop the partial scope for the const declaration
  ctx.popScope();

  // Create ConstElem
  const constElem: ConstElem = {
    kind: "const",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
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

  // Push a partial scope for the entire override declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to collect contents
  openElem(ctx, { kind: "override", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'override'");
  }

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Optional initialization: "= expr"
  if (consume(stream, "=")) {
    // Push a scope for the initializer expression (matches V1's scopeCollectNoIf pattern)
    ctx.pushScope();

    const expr = parseSimpleExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '='");
    }
    // Note: Don't add expr to contents - will be covered by text elements

    // Pop the initializer expression scope
    ctx.popScope();
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after override declaration");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Save the scope as the dependentScope for binding
  // Prefer typeScope (for type references) over partial scope (for initializers)
  // This matches V1 behavior and allows binding to recursively process references
  if (typedDecl?.decl?.ident) {
    const overrideScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = typedDecl.typeScope || overrideScope;
  }

  // Pop the partial scope for the override declaration
  ctx.popScope();

  // Create OverrideElem
  const overrideElem: OverrideElem = {
    kind: "override",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
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
  // Peek at "var" keyword to get its position
  const varToken = stream.peek();
  if (!varToken || varToken.text !== "var") {
    return null;
  }

  const startPos = varToken.span[0];

  // Consume "var" keyword
  stream.nextToken();

  // Push a partial scope for the entire var declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to start collecting contents
  openElem(ctx, { kind: "gvar", contents: [] });

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

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Optional initialization: "= expr"
  if (consume(stream, "=")) {
    // Push a scope for the initializer expression (matches V1's scopeCollectNoIf pattern)
    ctx.pushScope();

    const expr = parseSimpleExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '='");
    }
    // Note: Don't add expr to contents - will be covered by text elements

    // Pop the initializer expression scope
    ctx.popScope();
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after var declaration");

  const endPos = checkpoint(stream);

  // Close element and fill gaps with text
  const contents = closeElem(ctx, startPos, endPos);

  // Save the scope as the dependentScope for binding
  // Prefer typeScope (for type references) over partial scope (for initializers)
  // This matches V1 behavior and allows binding to recursively process references
  if (typedDecl?.decl?.ident) {
    const varScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = typedDecl.typeScope || varScope;
  }

  // Pop the partial scope for the var declaration
  ctx.popScope();

  // Create GlobalVarElem
  const varElem: GlobalVarElem = {
    kind: "gvar",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
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
  // Peek at "alias" keyword to get its position (don't use checkpoint to avoid including leading whitespace)
  const aliasToken = stream.peek();
  if (!aliasToken || aliasToken.text !== "alias") {
    return null;
  }

  const startPos = aliasToken.span[0];

  // Consume "alias" keyword
  stream.nextToken();

  // Open element to collect contents
  openElem(ctx, { kind: "alias", contents: [] });

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

  // Add declIdentElem to contents
  ctx.addElem(declIdentElem);

  // Save the identifier in the current scope
  ctx.saveIdent(declIdent);

  // Expect "="
  expect(stream, "=", "Expected '=' after alias name");

  // Parse the type reference
  // parseSimpleTypeRef creates its own scope for the type ref, which matches V1's scopeCollect behavior
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) {
    throw new Error("Expected type after '=' in alias declaration");
  }

  // Add typeRef to contents so coverWithText doesn't duplicate its range
  ctx.addElem(typeRef);

  // The scope created by parseSimpleTypeRef is now in the current scope's contents
  // Find it and assign as the dependentScope for binding
  const currentScope = ctx.currentScope();
  const typeRefScope = currentScope.contents.findLast(c => c.kind === "scope");
  if (!typeRefScope || typeRefScope.kind !== "scope") {
    throw new Error("Expected scope for type reference in alias");
  }
  declIdent.dependentScope = typeRefScope;

  // Expect ";"
  expect(stream, ";", "Expected ';' after alias declaration");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create AliasElem
  const aliasElem: AliasElem = {
    kind: "alias",
    name: declIdentElem,
    typeRef,
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(aliasElem, attributes);
  linkDeclIdentElem(declIdentElem, aliasElem);

  return aliasElem;
}

/**
 * Parse a struct member: [@attrs] <name>: <type>
 * Week 4: Simple members
 * Week 7: Attribute support (@location, @builtin, etc.)
 */
function parseStructMember(
  stream: WeslStream,
  ctx: ParseContext,
): StructMemberElem | null {
  const startPos = checkpoint(stream);

  // Parse optional attributes
  const attributes = parseAttributeList(stream);

  // Open element to collect contents
  openElem(ctx, { kind: "member", contents: [] });

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

  // Add name to contents
  ctx.addElem(nameElem);

  // Expect ":"
  if (!consume(stream, ":")) {
    throw new Error("Expected ':' after struct member name");
  }

  // Parse type reference
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) {
    throw new Error("Expected type after ':' in struct member");
  }

  // Add typeRef to contents so coverWithText doesn't duplicate its range
  ctx.addElem(typeRef);

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create StructMemberElem
  const memberElem: StructMemberElem = {
    kind: "member",
    name: nameElem,
    typeRef,
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(memberElem, attributes.length > 0 ? attributes : undefined);

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
  // Peek at "struct" keyword to get its position
  const structToken = stream.peek();
  if (!structToken || structToken.text !== "struct") {
    return null;
  }

  const startPos = structToken.span[0];

  // Consume "struct" keyword
  stream.nextToken();

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

  // Open element to collect contents
  openElem(ctx, { kind: "struct", contents: [] });

  // Add the decl to contents
  ctx.addElem(declIdentElem);

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
    // Member adds itself to contents via its own open/close
    ctx.addElem(member);

    // Check for comma separator
    // In WGSL, members can be separated by commas, but the last comma is optional
    const hasComma = consume(stream, ",");

    // If there's no comma, we should see a closing brace next
    if (!hasComma) {
      expect(stream, "}", "Expected ',' or '}' after struct member");
      break;
    }
  }

  // Save the struct scope as the dependentScope for binding
  // This allows binding to recursively process references inside the struct
  const structScope = ctx.currentScope();
  declIdent.dependentScope = structScope;

  // Pop the struct scope
  ctx.popScope();

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create StructElem
  const structElem: StructElem = {
    kind: "struct",
    name: declIdentElem,
    members,
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(structElem, attributes);
  linkDeclIdentElem(declIdentElem, structElem);

  return structElem;
}

/**
 * Parse a const_assert statement: const_assert <expression>;
 * Week 9: Global const_assert support
 */
export function parseConstAssert(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): ConstAssertElem | null {
  const startPos = checkpoint(stream);

  // Expect "const_assert" keyword
  if (!consume(stream, "const_assert")) {
    reset(stream, startPos);
    return null;
  }

  // Open element to collect contents
  openElem(ctx, { kind: "assert", contents: [] });

  // Parse expression (using stub expression parser)
  const expression = parseSimpleExpression(stream, ctx);
  if (!expression) {
    throw new Error("Expected expression after 'const_assert'");
  }

  // Note: Don't add expression to contents - will be covered by text elements

  // Expect semicolon
  expect(stream, ";", "Expected ';' after const_assert expression");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create ConstAssertElem
  const assertElem: ConstAssertElem = {
    kind: "assert",
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(assertElem, attributes);

  return assertElem;
}

/**
 * Parse a local var declaration (inside function body): var <name> [: <type>]? [= <expr>]? ;
 * Week 10.5: Local variable declarations in function bodies
 */
export function parseLocalVarDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): VarElem | null {
  const startPos = checkpoint(stream);

  // Expect "var" keyword
  if (!consume(stream, "var")) {
    reset(stream, startPos);
    return null;
  }

  // Open element to collect contents
  openElem(ctx, { kind: "var", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'var'");
  }

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Optional initialization: "= expr"
  if (consume(stream, "=")) {
    const expr = parseSimpleExpression(stream, ctx);
    if (!expr) {
      throw new Error("Expected expression after '='");
    }
    // Note: Don't add expr to contents - will be covered by text elements
  }

  // Expect ";"
  expect(stream, ";", "Expected ';' after var declaration");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create VarElem (local var, not global)
  const varElem: VarElem = {
    kind: "var",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(varElem, attributes);
  linkDeclIdent(typedDecl, varElem);

  return varElem;
}

/**
 * Parse a let declaration (inside function body): let <name> [: <type>]? = <expr> ;
 * Week 10.5: Local let declarations in function bodies
 */
export function parseLetDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): LetElem | null {
  const startPos = checkpoint(stream);

  // Expect "let" keyword
  if (!consume(stream, "let")) {
    reset(stream, startPos);
    return null;
  }

  // Open element to collect contents
  openElem(ctx, { kind: "let", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throw new Error("Expected identifier after 'let'");
  }

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Expect initialization: "= expr"
  expect(stream, "=", "Expected '=' after let identifier (let requires initialization)");
  const expr = parseSimpleExpression(stream, ctx);
  if (!expr) {
    throw new Error("Expected expression after '='");
  }

  // Note: Don't add expr to contents - will be covered by text elements

  // Expect ";"
  expect(stream, ";", "Expected ';' after let declaration");

  const endPos = checkpoint(stream);

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create LetElem
  const letElem: LetElem = {
    kind: "let",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
  };

  attachAttributes(letElem, attributes);
  linkDeclIdent(typedDecl, letElem);

  return letElem;
}
