/** Custom parsers for WESL declarations */

import type {
  AliasElem,
  AttributeElem,
  ConstAssertElem,
  ConstElem,
  DeclIdentElem,
  GlobalVarElem,
  LetElem,
  NameElem,
  OverrideElem,
  StructElem,
  StructMemberElem,
  TypedDeclElem,
  TypeRefElem,
  VarElem,
} from "../AbstractElems.ts";
import type { Scope } from "../Scope.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import { parseSimpleExpression } from "./ExpressionParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import {
  attachAttributes,
  checkpoint,
  consume,
  expect,
  linkDeclIdent,
  linkDeclIdentElem,
  reset,
  throwParseError,
  tryConsumeKeyword,
} from "./ParseUtil.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import { closeElem, openElem } from "./v2/ContentsHelpers.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse optionally typed identifier
 *
 * Grammar: optionally_typed_ident : ident ( ':' type_specifier ) ?
 */
export function parseTypedDecl(
  stream: WeslStream,
  ctx: ParseContext,
  isGlobal = true,
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
    isGlobal,
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
  let typeRef: TypeRefElem | undefined;
  let typeScope: Scope | undefined;
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
 * Parse const declaration
 *
 * Grammar (global): global_value_decl : 'const' optionally_typed_ident '=' expression
 * Grammar (local):  variable_or_value_statement : 'const' optionally_typed_ident '=' expression
 */
export function parseConstDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): ConstElem | null {
  const startPos = checkpoint(stream);

  // Expect "const" keyword
  if (!consume(stream, "const")) return null;

  // Determine if this is a global const by checking if we're at module level
  // A global const is one whose containing scope is the module root scope
  // The module root scope has parent === null
  // Walk up through any partial scopes to find the actual containing scope
  let containingScope = ctx.currentScope();
  while (containingScope.kind === "partial" && containingScope.parent) {
    containingScope = containingScope.parent;
  }
  const isGlobal = containingScope.parent === null;

  // Push a partial scope for the entire const declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to collect contents
  openElem(ctx, { kind: "const", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx, isGlobal);
  if (!typedDecl) {
    throwParseError(stream, "Expected identifier after 'const'");
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
  // Use constScope (the partial scope) which contains both typeScope and initializer scope
  // This allows binding to recursively process all references
  if (typedDecl?.decl?.ident) {
    const constScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = constScope;
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
 * Parse override declaration
 *
 * Grammar: global_value_decl : attribute * 'override' optionally_typed_ident ( '=' expression ) ?
 */
export function parseOverrideDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): OverrideElem | null {
  const startPos = checkpoint(stream);

  // Expect "override" keyword
  if (!consume(stream, "override")) return null;

  // Push a partial scope for the entire override declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to collect contents
  openElem(ctx, { kind: "override", contents: [] });

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throwParseError(stream, "Expected identifier after 'override'");
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
  // Use overrideScope (the partial scope) which contains both typeScope and initializer scope
  // This allows binding to recursively process all references (same fix as const)
  if (typedDecl?.decl?.ident) {
    const overrideScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = overrideScope;
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
 * Parse global var declaration
 *
 * Grammar: global_variable_decl : attribute * variable_decl ( '=' expression ) ?
 * Grammar: variable_decl : 'var' _disambiguate_template template_list ? optionally_typed_ident
 */
export function parseVarDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): GlobalVarElem | null {
  const varToken = tryConsumeKeyword(stream, "var");
  if (!varToken) return null;

  const startPos = varToken.span[0];

  // Push a partial scope for the entire var declaration (matches V1 behavior)
  ctx.pushScope("partial");

  // Open element to start collecting contents
  openElem(ctx, { kind: "gvar", contents: [] });

  // Parse optional template list (e.g., <storage, read_write>)
  // Uses nextTemplateStartToken for proper disambiguation per WGSL spec
  const templateStart = stream.nextTemplateStartToken();
  if (templateStart) {
    // Var templates contain address space/access mode keywords
    // Skip contents since we don't need AST representation for these
    while (true) {
      const next = stream.peek();
      if (!next) throw new Error("Unclosed template in var declaration");

      // Check for closing >
      if (next.text.startsWith(">")) {
        stream.nextTemplateEndToken();
        break;
      }

      // Consume identifier or comma
      stream.nextToken();
    }
  }

  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx);
  if (!typedDecl) {
    throwParseError(stream, "Expected identifier after 'var'");
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
  // Use varScope (the partial scope) which contains both typeScope and initializer scope
  // This allows binding to recursively process all references (same fix as const)
  if (typedDecl?.decl?.ident) {
    const varScope = ctx.currentScope();
    typedDecl.decl.ident.dependentScope = varScope;
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
 * Parse type alias declaration
 *
 * Grammar: type_alias_decl : 'alias' ident '=' type_specifier
 */
export function parseAliasDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): AliasElem | null {
  const aliasToken = tryConsumeKeyword(stream, "alias");
  if (!aliasToken) return null;

  const startPos = aliasToken.span[0];

  // Open element to collect contents
  openElem(ctx, { kind: "alias", contents: [] });

  // Parse the name (just DeclIdentElem, not TypedDeclElem)
  const nameToken = stream.nextToken();
  if (!nameToken || nameToken.kind !== "word") {
    throwParseError(stream, "Expected identifier after 'alias'");
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

  // Push a scope for the type reference (matches V1's scopeCollectNoIf pattern)
  ctx.pushScope();

  // Parse the type reference
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) {
    throw new Error("Expected type after '=' in alias declaration");
  }

  // Add typeRef to contents so coverWithText doesn't duplicate its range
  ctx.addElem(typeRef);

  // Capture the type scope before popping (needed for binding)
  const typeRefScope = ctx.currentScope();
  declIdent.dependentScope = typeRefScope;

  // Pop the type reference scope
  ctx.popScope();

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
 * Parse struct member
 *
 * Grammar: struct_member : attribute * member_ident ':' type_specifier
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
 * Parse struct declaration
 *
 * Grammar: struct_decl : 'struct' ident struct_body_decl
 * Grammar: struct_body_decl : '{' struct_member ( ',' struct_member ) * ',' ? '}'
 */
export function parseStructDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): StructElem | null {
  const structToken = tryConsumeKeyword(stream, "struct");
  if (!structToken) return null;

  const startPos = structToken.span[0];

  const nameToken = stream.nextToken();
  if (nameToken?.kind !== "word") throwParseError(stream, "Expected identifier after 'struct'");

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
 * Parse const_assert
 *
 * Grammar: const_assert : 'const_assert' expression
 */
export function parseConstAssert(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): ConstAssertElem | null {
  const startPos = checkpoint(stream);

  // Expect "const_assert" keyword
  if (!consume(stream, "const_assert")) return null;

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
 * Parse local var declaration (inside function body)
 *
 * Grammar: variable_or_value_statement : variable_decl | variable_decl '=' expression
 * Grammar: variable_decl : 'var' _disambiguate_template template_list ? optionally_typed_ident
 */
export function parseLocalVarDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): VarElem | null {
  const startPos = checkpoint(stream);

  // Expect "var" keyword
  if (!consume(stream, "var")) return null;

  // Open element to collect contents
  openElem(ctx, { kind: "var", contents: [] });

  // Local var declarations are never global
  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx, false);
  if (!typedDecl) {
    throwParseError(stream, "Expected identifier after 'var'");
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
 * Parse let declaration (inside function body)
 *
 * Grammar: variable_or_value_statement : 'let' optionally_typed_ident '=' expression
 */
export function parseLetDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): LetElem | null {
  const startPos = checkpoint(stream);

  // Expect "let" keyword
  if (!consume(stream, "let")) return null;

  // Open element to collect contents
  openElem(ctx, { kind: "let", contents: [] });

  // Let declarations are always local (inside functions)
  // Parse the typed declaration (name with optional type)
  const typedDecl = parseTypedDecl(stream, ctx, false);
  if (!typedDecl) {
    throwParseError(stream, "Expected identifier after 'let'");
  }

  // Add typedDecl to contents
  ctx.addElem(typedDecl);

  // Expect initialization: "= expr"
  expect(
    stream,
    "=",
    "Expected '=' after let identifier (let requires initialization)",
  );
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
