/** Custom parsers for WESL function declarations */

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
import {
  attachAttributes,
  checkpoint,
  consume,
  expect,
  linkDeclIdent,
  linkDeclIdentElem,
  tryConsumeKeyword,
} from "./ParseUtil.ts";
import { parseFunctionBody } from "./StatementParsers.ts";
import { parseSimpleTypeRef } from "./TypeParsers.ts";
import { closeElem, openElem } from "./v2/ContentsHelpers.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse function parameter
 *
 * Grammar: param : attribute * ident ':' type_specifier
 */
function parseFnParam(
  stream: WeslStream,
  ctx: ParseContext,
): FnParamElem | null {
  const attributes = parseAttributeList(stream);

  const nameToken = stream.peek();
  if (nameToken?.kind !== "word") return null;

  const startPos = nameToken.span[0];
  stream.nextToken();
  openElem(ctx, { kind: "param", contents: [] });
  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    false, // isGlobal = false for function parameters
  );

  const declIdentElem: DeclIdentElem = {
    kind: "decl",
    ident: declIdent,
    srcModule: ctx.srcModule,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };
  ctx.saveIdent(declIdent);

  let typeRef: TypeRefElem | undefined;
  if (consume(stream, ":")) {
    const parsedTypeRef = parseSimpleTypeRef(stream, ctx);
    if (!parsedTypeRef) {
      throw new Error("Expected type after ':' in function parameter");
    }
    ctx.addElem(parsedTypeRef);
    typeRef = parsedTypeRef;
  }

  const typeDeclEndPos = checkpoint(stream);
  const typedDecl: TypedDeclElem = {
    kind: "typeDecl",
    decl: declIdentElem,
    typeRef,
    start: nameToken.span[0],
    end: typeDeclEndPos,
    contents: [],
  };

  const endPos = checkpoint(stream);
  const contents = closeElem(ctx, startPos, endPos);
  const paramElem: FnParamElem = {
    kind: "param",
    name: typedDecl,
    start: startPos,
    end: endPos,
    contents,
  };
  linkDeclIdent(typedDecl, paramElem);
  attachAttributes(paramElem, attributes.length > 0 ? attributes : undefined);
  return paramElem;
}

/** Parse comma-separated parameter list */
function parseFnParams(
  stream: WeslStream,
  ctx: ParseContext,
): FnParamElem[] {
  const params: FnParamElem[] = [];

  while (true) {
    if (consume(stream, ")")) break;

    const param = parseFnParam(stream, ctx);
    if (!param) throw new Error("Expected function parameter or ')'");

    params.push(param);

    if (!consume(stream, ",")) {
      expect(stream, ")", "Expected ',' or ')' after function parameter");
      break;
    }
  }

  return params;
}

/** Parse optional return type: -> [attributes]? type */
function parseFnReturnType(
  stream: WeslStream,
  ctx: ParseContext,
): { typeRef?: TypeRefElem; attrs?: AttributeElem[] } {
  if (!consume(stream, "->")) return {};

  const attrs = parseAttributeList(stream);
  const typeRef = parseSimpleTypeRef(stream, ctx);
  if (!typeRef) throw new Error("Expected type after '->'");

  return { typeRef, attrs: attrs.length > 0 ? attrs : undefined };
}

/**
 * Parse function declaration
 *
 * Grammar: function_decl : attribute * function_header compound_statement
 * Grammar: function_header : 'fn' ident '(' param_list ? ')' ( '->' attribute * template_elaborated_ident ) ?
 * Grammar: param_list : param ( ',' param ) * ',' ?
 */
export function parseFnDecl(
  stream: WeslStream,
  ctx: ParseContext,
  attributes?: AttributeElem[],
): FnElem | null {
  const fnToken = tryConsumeKeyword(stream, "fn");
  if (!fnToken) return null;

  const startPos = fnToken.span[0];
  ctx.pushScope("partial");

  const nameToken = stream.nextToken();
  if (nameToken?.kind !== "word") throw new Error("Expected identifier after 'fn'");

  const declIdent = ctx.createDeclIdent(
    nameToken.text,
    nameToken.span,
    true, // isGlobal for functions
  );

  const declIdentElem: DeclIdentElem = {
    kind: "decl",
    ident: declIdent,
    srcModule: ctx.srcModule,
    start: nameToken.span[0],
    end: nameToken.span[1],
  };
  ctx.saveIdent(declIdent);

  // FnElem does NOT use openElem/closeElem - see TEXT_ELEMENT_RULES.md
  expect(stream, "(", "Expected '(' after function name");
  ctx.pushScope();
  const params = parseFnParams(stream, ctx);
  const { typeRef: returnType, attrs: returnAttributes } = parseFnReturnType(
    stream,
    ctx,
  );

  const body = parseFunctionBody(stream, ctx);
  if (!body) throw new Error("Expected function body");

  declIdent.dependentScope = ctx.currentScope();
  ctx.popScope();
  ctx.popScope();

  const endPos = checkpoint(stream);
  const contents: GrammarElem[] = [declIdentElem, ...params];
  if (returnType) contents.push(returnType);
  contents.push(body);

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
