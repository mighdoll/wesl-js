/**
 * WeslParserV2 - Custom recursive descent parser for WESL
 *
 * This is a complete replacement for the mini-parse combinator-based parser.
 * It uses direct token manipulation for better performance and maintainability.
 *
 * Strategy: Build parser incrementally, use existing parser as oracle for validation.
 * Each grammar construct is validated against existing parser's AST output.
 */

import type { Span } from "mini-parse";
import type {
  ModuleElem,
  ImportStatement,
  AbstractElem,
  ImportElem,
} from "../../AbstractElems.ts";
import type { SrcModule, Scope } from "../../Scope.ts";
import { emptyScope } from "../../Scope.ts";
import { WeslStream } from "../WeslStream.ts";
import type { ParseContext } from "../ParseContext.ts";
import { createParseContext } from "../ParseContext.ts";
import type { WeslParseState, WeslAST } from "../../ParseWESL.ts";
import { parseWeslImports } from "../ImportParsers.ts";

/**
 * Main parser class for WESL v2
 */
export class WeslParserV2 {
  private ctx: ParseContext;
  private state: WeslParseState;

  constructor(srcModule: SrcModule) {
    const stream = new WeslStream(srcModule.src);
    const rootScope = emptyScope(null);

    const moduleElem: ModuleElem = {
      kind: "module",
      contents: [],
      start: 0,
      end: srcModule.src.length,
    };

    this.state = {
      context: {
        scope: rootScope,
        openElems: [],
      },
      stable: {
        srcModule,
        moduleElem,
        rootScope,
        imports: [],
      },
    };

    this.ctx = createParseContext(stream, this.state);
  }

  /**
   * Parse the entire WESL module
   */
  parse(): WeslAST {
    this.parseModule();
    return this.state.stable;
  }

  /**
   * Parse module-level declarations
   * Currently: imports, attributes, and other global declarations
   */
  private parseModule(): void {
    // Week 1: Imports + Attributes
    this.parseImports();

    // TODO: Week 2-5: Declarations (const, alias, var, override, struct, fn)
    // TODO: Week 6: Statements
    // TODO: Week 7-8: Expressions
  }

  /**
   * Parse all import statements at the beginning of the module
   */
  private parseImports(): void {
    // Use Phase 2 custom import parser
    const importElems = parseWeslImports(this.ctx);

    // Add import elements to the module
    for (const importElem of importElems) {
      this.state.stable.moduleElem.contents.push(importElem);

      // Extract ImportStatements for the stable state
      this.state.stable.imports.push(importElem.imports);
    }
  }
}

/**
 * Parse a WESL source module using v2 parser
 */
export function parseWeslV2(srcModule: SrcModule): WeslAST {
  const parser = new WeslParserV2(srcModule);
  return parser.parse();
}
