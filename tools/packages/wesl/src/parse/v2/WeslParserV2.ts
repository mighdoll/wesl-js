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
import { parseAttributeList } from "../AttributeParsers.ts";
import {
  parseAliasDecl,
  parseConstAssert,
  parseConstDecl,
  parseOverrideDecl,
  parseStructDecl,
  parseVarDecl,
} from "../ConstParsers.ts";
import { parseDirective } from "../DirectiveParsers.ts";
import { parseFnDecl } from "../FnParsers.ts";
import { parseWeslImports } from "../ImportParsers.ts";
import type { ParseContext } from "../ParseContext.ts";
import { createParseContext } from "../ParseContext.ts";
import { WeslStream } from "../WeslStream.ts";
import { closeElem, openElem } from "./ContentsHelpers.ts";

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
    // Use openElem to collect module contents properly
    openElem(this.ctx, { kind: "module", contents: [] });

    this.parseModule();

    // Close module and fill with text elements
    const moduleElem = this.state.stable.moduleElem;
    const contents = closeElem(this.ctx, 0, moduleElem.end);
    moduleElem.contents = contents;

    return this.state.stable;
  }

  /**
   * Parse module-level declarations
   * Currently: imports, directives, and global declarations
   */
  private parseModule(): void {
    // Week 1: Imports + Attributes
    this.parseImports();

    // Week 8: Global directives (enable, requires, diagnostic)
    this.parseDirectives();

    // Week 2-5: Global declarations (const, override, var, alias, struct, fn)
    this.parseDeclarations();
  }

  /**
   * Parse all import statements at the beginning of the module
   */
  private parseImports(): void {
    // Use Phase 2 custom import parser
    const importElems = parseWeslImports(this.ctx.stream);

    // Add import elements to the module via context (for proper text element generation)
    for (const importElem of importElems) {
      this.ctx.addElem(importElem);

      // Extract ImportStatements for the stable state
      this.state.stable.imports.push(importElem.imports);
    }
  }

  /**
   * Parse global directives (enable, requires, diagnostic)
   * Week 8: Directive support
   */
  private parseDirectives(): void {
    const stream = this.ctx.stream;

    // Keep parsing directives until we can't parse any more
    while (true) {
      const token = stream.peek();
      if (!token) break;

      const directiveElem = parseDirective(stream, this.ctx);
      if (directiveElem) {
        this.ctx.addElem(directiveElem);
      } else {
        // No more directives
        break;
      }
    }
  }

  /**
   * Parse global declarations (const, alias, var, override, struct, fn)
   * Week 2: const
   * Week 3: override, var, alias
   * Week 4: struct
   * Week 5: fn (with stub body parsing)
   */
  private parseDeclarations(): void {
    const stream = this.ctx.stream;

    // Array of declaration parsers to try in order
    const parsers = [
      parseConstDecl, // Week 2
      parseOverrideDecl, // Week 3
      parseVarDecl, // Week 3
      parseAliasDecl, // Week 3
      parseStructDecl, // Week 4
      parseFnDecl, // Week 5
      parseConstAssert, // Week 9
    ];

    // Keep parsing declarations until we can't parse any more
    while (true) {
      // Skip whitespace and check if we're at end of input
      const token = stream.peek();
      if (!token) break;

      // Try to parse attributes before the declaration
      // Save position before attributes so we can pass it to the parser
      const beforeAttributes = stream.checkpoint();
      const attributes = parseAttributeList(stream);

      // Try each parser until one succeeds
      let parsed = false;
      for (const parser of parsers) {
        const elem = parser(stream, this.ctx, attributes.length > 0 ? attributes : undefined);
        if (elem) {
          // If we parsed attributes, we need to adjust the element's start position
          // to include the attributes, so coverWithText doesn't create duplicate TextElems
          if (attributes.length > 0 && elem.start > beforeAttributes) {
            elem.start = beforeAttributes;
          }
          this.ctx.addElem(elem);
          parsed = true;
          break;
        }
      }

      if (parsed) {
        continue;
      }

      // If we parsed attributes but no declaration followed, that's an error
      if (attributes.length > 0) {
        throw new Error("Expected declaration after attributes");
      }

      // No parser succeeded - we're done
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
