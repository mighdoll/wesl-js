/**
 * WeslParserV2 - Custom recursive descent parser for WESL
 *
 * This is a complete replacement for the mini-parse combinator-based parser.
 * It uses direct token manipulation for better performance and maintainability.
 *
 * Strategy: Build parser incrementally, use existing parser as oracle for validation.
 * Each grammar construct is validated against existing parser's AST output.
 */

import type { ModuleElem } from "../../AbstractElems.ts";
import type { WeslAST, WeslParseState } from "../../ParseWESL.ts";
import type { SrcModule } from "../../Scope.ts";
import { emptyScope } from "../../Scope.ts";
import {
  parseAliasDecl,
  parseConstDecl,
  parseOverrideDecl,
  parseVarDecl,
} from "../ConstParsers.ts";
import { parseWeslImports } from "../ImportParsers.ts";
import type { ParseContext } from "../ParseContext.ts";
import { createParseContext } from "../ParseContext.ts";
import { WeslStream } from "../WeslStream.ts";

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

    // Week 2-3: Global declarations (const, override, var, alias)
    this.parseDeclarations();

    // TODO: Week 4-5: More declarations (struct, fn)
    // TODO: Week 6: Statements
    // TODO: Week 7-8: Expressions
  }

  /**
   * Parse all import statements at the beginning of the module
   */
  private parseImports(): void {
    // Use Phase 2 custom import parser
    const importElems = parseWeslImports(this.ctx.stream);

    // Add import elements to the module
    for (const importElem of importElems) {
      this.state.stable.moduleElem.contents.push(importElem);

      // Extract ImportStatements for the stable state
      this.state.stable.imports.push(importElem.imports);
    }
  }

  /**
   * Parse global declarations (const, alias, var, override, struct, fn)
   * Week 2: const
   * Week 3: override, var, alias
   */
  private parseDeclarations(): void {
    const stream = this.ctx.stream;

    // Keep parsing declarations until we can't parse any more
    while (true) {
      // Skip whitespace and check if we're at end of input
      const token = stream.peek();
      if (!token) break;

      // Try to parse declarations in order
      // Week 2: const
      const constElem = parseConstDecl(stream, this.ctx);
      if (constElem) {
        this.state.stable.moduleElem.contents.push(constElem);
        continue;
      }

      // Week 3: override
      const overrideElem = parseOverrideDecl(stream, this.ctx);
      if (overrideElem) {
        this.state.stable.moduleElem.contents.push(overrideElem);
        continue;
      }

      // Week 3: var
      const varElem = parseVarDecl(stream, this.ctx);
      if (varElem) {
        this.state.stable.moduleElem.contents.push(varElem);
        continue;
      }

      // Week 3: alias
      const aliasElem = parseAliasDecl(stream, this.ctx);
      if (aliasElem) {
        this.state.stable.moduleElem.contents.push(aliasElem);
        continue;
      }

      // TODO: Week 4-5: struct, fn

      // No more declarations we can parse
      break;
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
