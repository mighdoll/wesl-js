import type { SrcMapBuilder } from "mini-parse";
import type {
  AbstractElem,
  AttributeElem,
  ContainerElem,
  DeclIdentElem,
  DirectiveElem,
  ExpressionElem,
  FnElem,
  NameElem,
  RefIdentElem,
  StructElem,
  SyntheticElem,
  TextElem,
} from "./AbstractElems.ts";
import { assertThatDebug, assertUnreachable } from "./Assertions.ts";
import { isGlobal } from "./BindIdents.ts";
import { failIdentElem } from "./ClickableError.ts";
import { filterValidElements } from "./Conditions.ts";
import { identToString } from "./debug/ScopeToString.ts";
import { weslParserConfig } from "./ParseWESL.ts";
import type { Conditions, DeclIdent, Ident } from "./Scope.ts";

export interface EmitParams {
  srcBuilder: SrcMapBuilder;
  rootElems: readonly AbstractElem[];
  conditions: Conditions;
  /** are we extracting or copying the root module */
  extracting?: boolean;
  /** if true, rootElems are already validated (e.g., from findValidRootDecls) */
  skipConditionalFiltering?: boolean;
}

/** passed to the emitters */
interface EmitContext {
  srcBuilder: SrcMapBuilder;
  conditions: Conditions;
  extracting: boolean;
}

/** traverse the AST, starting from root elements, emitting wgsl for each */
export function lowerAndEmit(params: EmitParams): void {
  const { srcBuilder, rootElems, conditions } = params;
  const { extracting = true, skipConditionalFiltering = false } = params;

  const emitContext: EmitContext = { conditions, srcBuilder, extracting };
  const validElements = skipConditionalFiltering
    ? rootElems
    : filterValidElements(rootElems, conditions);
  validElements.forEach(e => {
    lowerAndEmitElem(e, emitContext);
  });
}

export function lowerAndEmitElem(e: AbstractElem, ctx: EmitContext): void {
  switch (e.kind) {
    // import statements are dropped from from emitted text
    case "import":
      return;

    // terminal elements copy strings to the output
    case "text":
      emitText(e, ctx);
      return;
    case "name":
      emitName(e, ctx);
      return;
    case "synthetic":
      emitSynthetic(e, ctx);
      return;

    // identifiers are copied to the output, but with potentially mangled names
    case "ref":
      emitRefIdent(e, ctx);
      return;
    case "decl":
      emitDeclIdent(e, ctx);
      return;

    // expression elements (V2 parser creates these)
    case "literal":
    case "translate-time-feature":
    case "binary-expression":
    case "unary-expression":
    case "call-expression":
    case "parenthesized-expression":
    case "component-expression":
    case "component-member-expression":
      emitExpression(e, ctx);
      return;

    // container elements just emit their child elements
    case "param":
    case "typeDecl":
    case "member":
    case "memberRef":
    case "expression":
    case "type":
    case "stuff":
    case "switch-clause":
      emitContents(e, ctx);
      return;

    case "module":
      // V2: Skip whitespace-only text elements at module level
      // (rely on emitRootElemNl for proper spacing)
      if (weslParserConfig.useV2Parser) {
        const validElements = filterValidElements(e.contents, ctx.conditions);
        validElements.forEach(child => {
          // Skip whitespace-only text elements
          if (child.kind === "text") {
            const text = child.srcModule.src.slice(child.start, child.end);
            if (text.trim() === "") {
              return; // Skip
            }
          }
          lowerAndEmitElem(child, ctx);
        });
      } else {
        emitContents(e, ctx);
      }
      return;

    // var, let, statement can have @if/@elif/@else attributes
    // V2: attributes not in contents, emit separately
    // V1: attributes in contents as TextElems, skip separate emission
    case "var":
    case "let":
    case "statement": {
      const attrsInContents =
        e.contents.length > 0 && e.contents[0].kind === "attribute";
      if (!attrsInContents) {
        emitAttributes(e.attributes, ctx);
      }
      emitContents(e, ctx);
      return;
    }

    // root level container elements get some extra newlines to make the output prettier
    case "override":
    case "const":
    case "assert":
    case "alias":
    case "gvar": {
      emitRootElemNl(ctx);
      // V2: attributes not in contents, emit separately
      // V1: attributes in contents as TextElems, skip separate emission
      const attrsInContents =
        e.contents.length > 0 && e.contents[0].kind === "attribute";
      if (!attrsInContents) {
        emitAttributes(e.attributes, ctx);
      }
      emitContents(e, ctx);
      return;
    }

    case "fn":
      emitRootElemNl(ctx);
      emitFn(e, ctx);
      return;

    case "struct":
      emitRootElemNl(ctx);
      emitStruct(e, ctx);
      return;

    case "attribute":
      emitAttribute(e, ctx);
      return;

    case "directive":
      emitDirective(e, ctx);
      return;

    default:
      assertUnreachable(e);
  }
}

/** emit root elems with a blank line inbetween */
function emitRootElemNl(ctx: EmitContext): void {
  if (ctx.extracting) {
    ctx.srcBuilder.addNl();
    ctx.srcBuilder.addNl();
  }
}

// TODO: This function will be obsoleted when we implement Text→Comment conversion
//
// Current issue: V2 stores attributes separately from contents, but closeElem()
// creates TextElems that span over attribute source ranges. This causes duplicate
// attribute text to appear in TextElems, requiring this filtering workaround.
//
// Future: TextElems will be replaced with CommentElems (only comments preserved).
// All keywords, punctuation, and whitespace will be regenerated during emission.
export function emitText(e: TextElem, ctx: EmitContext): void {
  // V2: Check if this text element contains conditional attributes that should be filtered
  // This happens when text between parent start and child element contains @if/@elif/@else
  // but the child element with that attribute was filtered out
  const text = e.srcModule.src.slice(e.start, e.end);
  // Match: @if(...), @elif(...), or @else (no parens)
  const conditionalMatch = text.match(/@(if|elif)\s*\([^)]*\)|@else\b/);

  if (conditionalMatch) {
    // Emit text before the conditional
    const beforeMatch = text.substring(0, conditionalMatch.index!);
    if (beforeMatch) {
      ctx.srcBuilder.add(beforeMatch, e.start, e.start + beforeMatch.length);
    }
    // Skip the conditional attribute part
    // Note: text after the conditional is typically whitespace and will be part of next element
  } else {
    // No conditional, emit normally
    ctx.srcBuilder.addCopy(e.start, e.end);
  }
}

export function emitName(e: NameElem, ctx: EmitContext): void {
  ctx.srcBuilder.add(e.name, e.start, e.end);
}

/** emit function explicitly so we can control commas between conditional parameters */
export function emitFn(e: FnElem, ctx: EmitContext): void {
  const { attributes, name, params, returnAttributes, returnType, body } = e;
  const { conditions, srcBuilder: builder } = ctx;

  emitAttributes(attributes, ctx);

  builder.add("fn ", name.start - 3, name.start);
  emitDeclIdent(name, ctx);

  builder.appendNext("(");
  const validParams = filterValidElements(params, conditions);
  validParams.forEach((p, i) => {
    // V2: attributes not in contents, emit separately
    // V1: attributes in contents as TextElems, skip separate emission
    const attrsInContents =
      p.contents.length > 0 && p.contents[0].kind === "attribute";
    if (!attrsInContents) {
      emitAttributes(p.attributes, ctx);
    }
    emitContentsNoWs(p as ContainerElem, ctx);
    if (i < validParams.length - 1) {
      builder.appendNext(", ");
    }
  });
  builder.appendNext(") ");

  if (returnType) {
    builder.appendNext("-> ");
    emitAttributes(returnAttributes, ctx);
    emitContentsNoWs(returnType, ctx);
    builder.appendNext(" ");
  }

  emitContents(body, ctx);
}

function emitAttributes(
  attributes: AttributeElem[] | undefined,
  ctx: EmitContext,
): void {
  attributes?.forEach(a => {
    const emitted = emitAttribute(a, ctx);
    if (emitted) {
      ctx.srcBuilder.add(" ", a.start, a.end);
    }
  });
}

/** emit structs explicitly so we can control commas between conditional members */
export function emitStruct(e: StructElem, ctx: EmitContext): void {
  const { name, members, start } = e;
  const { srcBuilder, conditions } = ctx;

  const validMembers = filterValidElements(members, conditions);
  const validLength = validMembers.length;

  if (validLength === 0) {
    warnEmptyStruct(e);
    return;
  }

  srcBuilder.add("struct ", start, name.start);
  emitDeclIdent(name, ctx);

  if (validLength === 1) {
    srcBuilder.appendNext(" { ");
    emitContentsNoWs(validMembers[0] as ContainerElem, ctx);
    srcBuilder.appendNext(" }");
    srcBuilder.addNl();
  } else {
    srcBuilder.appendNext(" {");
    srcBuilder.addNl();

    validMembers.forEach(m => {
      srcBuilder.appendNext("  ");
      emitContentsNoWs(m as ContainerElem, ctx);
      srcBuilder.appendNext(",");
      srcBuilder.addNl();
    });

    srcBuilder.appendNext("}");
    srcBuilder.addNl();
  }
}

function warnEmptyStruct(e: StructElem): void {
  const { name, members } = e;
  const condStr = members.length ? "(with current conditions)" : "";
  const message = `struct '${name.ident.originalName}' has no members ${condStr}`;
  failIdentElem(name, message);
}

export function emitSynthetic(e: SyntheticElem, ctx: EmitContext): void {
  const { text } = e;
  ctx.srcBuilder.addSynthetic(text, text, 0, text.length);
}

export function emitContents(elem: ContainerElem, ctx: EmitContext): void {
  const validElements = filterValidElements(elem.contents, ctx.conditions);
  validElements.forEach(e => {
    lowerAndEmitElem(e, ctx);
  });
}

/** emit contents w/o white space */
function emitContentsNoWs(elem: ContainerElem, ctx: EmitContext): void {
  const validElements = filterValidElements(elem.contents, ctx.conditions);
  validElements.forEach(e => {
    if (e.kind === "text") {
      const { srcModule, start, end } = e;
      const text = srcModule.src.slice(start, end);
      if (text.trim() === "") {
        return;
      }
    }
    lowerAndEmitElem(e, ctx);
  });
}

export function emitRefIdent(e: RefIdentElem, ctx: EmitContext): void {
  if (e.ident.std) {
    ctx.srcBuilder.add(e.ident.originalName, e.start, e.end);
  } else {
    const declIdent = findDecl(e.ident);
    const mangledName = displayName(declIdent);
    ctx.srcBuilder.add(mangledName!, e.start, e.end);
  }
}

export function emitDeclIdent(e: DeclIdentElem, ctx: EmitContext): void {
  const mangledName = displayName(e.ident);
  ctx.srcBuilder.add(mangledName!, e.start, e.end);
}

function emitExpression(e: ExpressionElem, ctx: EmitContext): void {
  const { kind } = e;

  if (kind === "literal") {
    ctx.srcBuilder.add(e.value, e.start, e.end);
  } else if (kind === "translate-time-feature") {
    ctx.srcBuilder.add(e.name, e.start, e.end);
  } else if (kind === "ref") {
    emitRefIdent(e, ctx);
  } else if (kind === "binary-expression") {
    emitExpression(e.left, ctx);
    ctx.srcBuilder.add(
      ` ${e.operator.value} `,
      e.operator.span[0],
      e.operator.span[1],
    );
    emitExpression(e.right, ctx);
  } else if (kind === "unary-expression") {
    ctx.srcBuilder.add(
      e.operator.value,
      e.operator.span[0],
      e.operator.span[1],
    );
    emitExpression(e.expression, ctx);
  } else if (kind === "parenthesized-expression") {
    // For parenthesized expressions, emit the inner expression
    // The parentheses should be in text elements
    emitExpression(e.expression, ctx);
  } else if (kind === "call-expression") {
    emitExpression(e.function, ctx);
    // Arguments should be in text elements with parentheses
    e.arguments.forEach(arg => {
      emitExpression(arg, ctx);
    });
  } else if (kind === "component-expression") {
    emitExpression(e.base, ctx);
    emitExpression(e.access, ctx);
  } else if (kind === "component-member-expression") {
    emitExpression(e.base, ctx);
    // The member name should be in text elements with dot
    if (e.access.kind === "name") {
      ctx.srcBuilder.add(e.access.name, e.access.start, e.access.end);
    }
  } else {
    assertUnreachable(kind);
  }
}

function emitAttribute(e: AttributeElem, ctx: EmitContext): boolean {
  const { kind } = e.attribute;
  // LATER emit more precise source map info by making use of all the spans
  // Like the first case does
  if (kind === "@attribute") {
    const { params } = e.attribute;
    if (!params || params.length === 0) {
      ctx.srcBuilder.add("@" + e.attribute.name, e.start, e.end);
    } else {
      ctx.srcBuilder.add(
        "@" + e.attribute.name + "(",
        e.start,
        params[0].start,
      );
      for (let i = 0; i < params.length; i++) {
        // Copy parameter from source (don't use emitContents as V2 params may have empty contents)
        ctx.srcBuilder.addCopy(params[i].start, params[i].end);
        if (i < params.length - 1) {
          ctx.srcBuilder.add(",", params[i].end, params[i + 1].start);
        }
      }
      ctx.srcBuilder.add(")", params[params.length - 1].end, e.end);
    }
    return true;
  } else if (kind === "@builtin") {
    ctx.srcBuilder.add(
      "@builtin(" + e.attribute.param.name + ")",
      e.start,
      e.end,
    );
    return true;
  } else if (kind === "@diagnostic") {
    ctx.srcBuilder.add(
      "@diagnostic" +
        diagnosticControlToString(e.attribute.severity, e.attribute.rule),
      e.start,
      e.end,
    );
    return true;
  } else if (kind === "@if") {
    // (@if is wesl only, dropped from wgsl)
    return false;
  } else if (kind === "@interpolate") {
    ctx.srcBuilder.add(
      `@interpolate(${e.attribute.params.map(v => v.name).join(", ")})`,
      e.start,
      e.end,
    );
    return true;
  } else if (kind === "@elif") {
    // @elif is wesl only, dropped from wgsl
    return false;
  } else if (kind === "@else") {
    // @else is wesl only, dropped from wgsl
    return false;
  } else {
    assertUnreachable(kind);
  }
}

export function diagnosticControlToString(
  severity: NameElem,
  rule: [NameElem, NameElem | null],
): string {
  const ruleStr = rule[0].name + (rule[1] !== null ? "." + rule[1].name : "");
  return `(${severity.name}, ${ruleStr})`;
}

export function expressionToString(elem: ExpressionElem): string {
  const { kind } = elem;
  if (kind === "binary-expression") {
    return `${expressionToString(elem.left)} ${elem.operator.value} ${expressionToString(elem.right)}`;
  } else if (kind === "unary-expression") {
    return `${elem.operator.value}${expressionToString(elem.expression)}`;
  } else if (kind === "ref") {
    return elem.ident.originalName;
  } else if (kind === "literal") {
    return elem.value;
  } else if (kind === "translate-time-feature") {
    return elem.name;
  } else if (kind === "parenthesized-expression") {
    return `(${expressionToString(elem.expression)})`;
  } else if (kind === "component-expression") {
    return `${expressionToString(elem.base)}[${elem.access}]`;
  } else if (kind === "component-member-expression") {
    return `${expressionToString(elem.base)}.${elem.access}`;
  } else if (kind === "call-expression") {
    return `${elem.function.ident.originalName}(${elem.arguments.map(expressionToString).join(", ")})`;
  } else {
    assertUnreachable(kind);
  }
}

function emitDirective(e: DirectiveElem, ctx: EmitContext): void {
  const { directive } = e;
  const { kind } = directive;
  if (kind === "diagnostic") {
    ctx.srcBuilder.add(
      `diagnostic${diagnosticControlToString(directive.severity, directive.rule)};`,
      e.start,
      e.end,
    );
  } else if (kind === "enable") {
    ctx.srcBuilder.add(
      `enable ${directive.extensions.map(v => v.name).join(", ")};`,
      e.start,
      e.end,
    );
  } else if (kind === "requires") {
    ctx.srcBuilder.add(
      `requires ${directive.extensions.map(v => v.name).join(", ")};`,
      e.start,
      e.end,
    );
  } else {
    assertUnreachable(kind);
  }
}

function displayName(declIdent: DeclIdent): string {
  if (isGlobal(declIdent)) {
    assertThatDebug(
      declIdent.mangledName,
      `ERR: mangled name not found for decl ident ${identToString(declIdent)}`,
    );
    // mangled name was set in binding step
    return declIdent.mangledName as string;
  }

  return declIdent.mangledName || declIdent.originalName;
}

/** trace through refersTo links in reference Idents until we find the declaration
 * expects that bindIdents has filled in all refersTo: links
 */
export function findDecl(ident: Ident): DeclIdent {
  let i: Ident | undefined = ident;
  do {
    if (i.kind === "decl") {
      return i;
    }
    i = i.refersTo;
  } while (i);

  // TODO show source position if this can happen in a non buggy linker.
  throw new Error(`unresolved identifer: ${ident.originalName}`);
}
