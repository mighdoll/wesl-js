/**
 * WeslParserV2 - Custom recursive descent parser for WESL
 *
 * This is a complete replacement for the mini-parse combinator-based parser.
 * It uses direct token manipulation for better performance and maintainability.
 *
 * Strategy: Build parser incrementally, use existing parser as oracle for validation.
 * Each grammar construct is validated against existing parser's AST output.
 */

import { ParseError } from "mini-parse";
import type { ModuleElem } from "../../AbstractElems.ts";
import type { WeslAST, WeslParseState } from "../../ParseWESL.ts";
import { WeslParseError } from "../../ParseWESL.ts";
import type { SrcModule } from "../../Scope.ts";
import { emptyScope } from "../../Scope.ts";
import { WeslStream } from "../WeslStream.ts";
import { parseAttributeList } from "./AttributeParsers.ts";
import {
  parseAliasDecl,
  parseConstAssert,
  parseConstDecl,
  parseOverrideDecl,
  parseStructDecl,
  parseVarDecl,
} from "./ConstParsers.ts";
import { closeElem, openElem } from "./ContentsHelpers.ts";
import { parseDirective } from "./DirectiveParsers.ts";
import { parseFnDecl } from "./FnParsers.ts";
import { parseWeslImports } from "./ImportParsers.ts";
import type { ParseContext } from "./ParseContext.ts";
import { createParseContext } from "./ParseContext.ts";
import { hasConditionalAttribute } from "./ParseUtil.ts";

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
   *
   * Grammar: translation_unit :
   *   global_directive * ( global_decl | global_assert | ';' ) *
   *
   * Note: imports are a WESL extension, parsed before WGSL grammar elements
   */
  private parseModule(): void {
    this.parseImports();
    this.parseDirectives();
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
   * Parse global directives
   *
   * Grammar: global_directive :
   *   diagnostic_directive | enable_directive | requires_directive
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
   * Parse global declarations
   *
   * Grammar: global_decl :
   *   global_variable_decl ';' | global_value_decl ';' | type_alias_decl ';'
   *   | struct_decl | function_decl
   *
   * Grammar: global_assert : const_assert ';'
   */
  private parseDeclarations(): void {
    const stream = this.ctx.stream;

    const parsers = [
      parseConstDecl,
      parseOverrideDecl,
      parseVarDecl,
      parseAliasDecl,
      parseStructDecl,
      parseFnDecl,
      parseConstAssert,
    ];

    // Keep parsing declarations until we can't parse any more
    while (true) {
      // Skip whitespace and check if we're at end of input
      const token = stream.peek();
      if (!token) break;

      // Skip standalone semicolons (valid WGSL after structs - see gpuweb/gpuweb#2492)
      if (token.text === ";") {
        stream.nextToken();
        continue;
      }

      // Try to parse attributes before the declaration
      // Save position before attributes so we can pass it to the parser
      const beforeAttributes = stream.checkpoint();
      const attributes = parseAttributeList(stream);

      const hasConditional = hasConditionalAttribute(attributes);

      // Create partial scope if conditional attributes present
      if (hasConditional) {
        this.ctx.pushScope("partial");
      }

      // Try each parser until one succeeds
      let parsed = false;
      for (const parser of parsers) {
        const elem = parser(
          stream,
          this.ctx,
          attributes.length > 0 ? attributes : undefined,
        );
        if (elem) {
          // If we parsed attributes, we need to adjust the element's start position
          // to include the attributes, so coverWithText doesn't create duplicate TextElems
          if (attributes.length > 0 && elem.start > beforeAttributes) {
            elem.start = beforeAttributes;
          }
          this.ctx.addElem(elem);

          // Collect const_assert elements into moduleAsserts array
          if (elem.kind === "assert") {
            const ast = this.state.stable;
            if (!ast.moduleAsserts) ast.moduleAsserts = [];
            ast.moduleAsserts.push(elem);
          }

          parsed = true;
          break;
        }
      }

      // Pop partial scope and set conditional attribute
      if (hasConditional && parsed) {
        const partialScope = this.ctx.popScope();
        const condAttr = attributes.find(
          attr =>
            attr.kind === "attribute" &&
            (attr.attribute.kind === "@if" ||
              attr.attribute.kind === "@elif" ||
              attr.attribute.kind === "@else"),
        );
        if (condAttr && condAttr.kind === "attribute") {
          const attr = condAttr.attribute;
          if (
            attr.kind === "@if" ||
            attr.kind === "@elif" ||
            attr.kind === "@else"
          ) {
            partialScope.condAttribute = attr;
          }
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
  try {
    return parser.parse();
  } catch (e) {
    // Re-throw ParseError with proper formatting
    if (e instanceof ParseError) {
      throw new WeslParseError({ cause: e, src: srcModule });
    }
    // Convert plain Error to ParseError with position 0
    const parseError = new ParseError(
      e instanceof Error ? e.message : String(e),
      [0, 0],
    );
    throw new WeslParseError({ cause: parseError, src: srcModule });
  }
}
