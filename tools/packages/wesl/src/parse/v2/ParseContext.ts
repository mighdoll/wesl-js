/**
 * ParseContext for custom WESL parsers.
 *
 * This provides a bridge between custom direct token parsers and the existing
 * mini-parse collection system. Eventually this will replace CollectContext entirely.
 *
 * For now, it wraps WeslParseState to provide convenient methods for custom parsers.
 */

import type { Span } from "mini-parse";
import type { AbstractElem } from "../../AbstractElems.ts";
import type { WeslParseContext, WeslParseState } from "../../ParseWESL.ts";
import {
  type DeclIdent,
  emptyScope,
  type Ident,
  nextIdentId,
  type RefIdent,
  type Scope,
  type SrcModule,
} from "../../Scope.ts";
import type { WeslStream } from "../WeslStream.ts";

/**
 * Context for custom parsers that need to build AST and manage scopes.
 *
 * This mimics mini-parse's CollectContext but is designed for custom parsers.
 */
export interface ParseContext {
  /** Token stream being parsed */
  stream: WeslStream;

  /** Source text */
  src: string;

  /** Source module info */
  srcModule: SrcModule;

  /** Application state (scope, openElems, etc.) */
  state: WeslParseState;

  // Convenience methods

  /** Get current position in stream */
  position(): number;

  /** Get current scope */
  currentScope(): Scope;

  /** Add element to current open container */
  addElem(elem: AbstractElem): void;

  /** Start a new child scope */
  pushScope(kind?: Scope["kind"]): void;

  /** Close current scope and return it */
  popScope(): Scope;

  /** Create and register a reference identifier */
  createRefIdent(name: string, span: Span): RefIdent;

  /** Create and register a declaration identifier */
  createDeclIdent(name: string, span: Span, isGlobal?: boolean): DeclIdent;

  /** Add identifier to current scope */
  saveIdent(ident: Ident): void;
}

/**
 * Create a ParseContext for custom parsers.
 *
 * This wraps the existing WeslParseState to provide convenient methods.
 */
export function createParseContext(
  stream: WeslStream,
  state: WeslParseState,
): ParseContext {
  const { srcModule } = state.stable;
  const src = srcModule.src;

  return {
    stream,
    src,
    srcModule,
    state,

    position(): number {
      return stream.checkpoint();
    },

    currentScope(): Scope {
      return state.context.scope;
    },

    addElem(elem: AbstractElem): void {
      const { openElems } = state.context;
      if (openElems.length > 0) {
        const open = openElems[openElems.length - 1];
        open.contents.push(elem);
      }
    },

    pushScope(kind: Scope["kind"] = "scope"): void {
      const { scope } = state.context;
      const newScope = emptyScope(scope, kind);
      scope.contents.push(newScope);
      state.context.scope = newScope;
    },

    popScope(): Scope {
      const weslContext = state.context as WeslParseContext;
      const completedScope = weslContext.scope;

      if (completedScope.parent) {
        weslContext.scope = completedScope.parent;
      }

      return completedScope;
    },

    createRefIdent(name: string, _span: Span): RefIdent {
      const ident: RefIdent = {
        kind: "ref",
        originalName: name,
        ast: state.stable,
        id: nextIdentId(),
        refIdentElem: null as any, // set by caller
      };
      return ident;
    },

    createDeclIdent(name: string, _span: Span, isGlobal = false): DeclIdent {
      const containingScope = state.context.scope;
      const ident: DeclIdent = {
        kind: "decl",
        originalName: name,
        containingScope,
        isGlobal,
        id: nextIdentId(),
        srcModule,
        declElem: null as any, // set by caller
      };
      return ident;
    },

    saveIdent(ident: Ident): void {
      state.context.scope.contents.push(ident);
    },
  };
}

/**
 * Helper: Create a span from start and end positions
 */
export function makeSpan(start: number, end: number): Span {
  return [start, end] as Span;
}
