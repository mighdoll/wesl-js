/**
 * Minimal type parsers for WESL v2
 *
 * Week 3: Basic type references for alias declarations
 * Week 6: Type template support (array<f32>, vec4<f32>, etc.)
 */

import type {
  RefIdentElem,
  TypeRefElem,
  TypeTemplateParameter,
  UnknownExpressionElem,
} from "../../AbstractElems.ts";
import type { WeslStream } from "../WeslStream.ts";
import { closeElem, openElem } from "./ContentsHelpers.ts";
import type { ParseContext } from "./ParseContext.ts";

/**
 * Check if a type name is a built-in WGSL type
 * NOTE: Currently unused - binding handles built-in detection
 */
function _isBuiltInType(name: string): boolean {
  // Scalar types
  if (["bool", "i32", "u32", "f32", "f16"].includes(name)) return true;

  // Vector types (shorthand)
  if (/^vec[234][iuf]$/.test(name)) return true; // vec2i, vec3f, vec4u, etc.

  // Matrix types (shorthand)
  if (/^mat[234]x[234][fh]$/.test(name)) return true; // mat2x2f, mat3x3f, etc.

  // Common generic types that can appear without template params in some contexts
  if (["vec2", "vec3", "vec4"].includes(name)) return true;
  if (
    [
      "mat2x2",
      "mat2x3",
      "mat2x4",
      "mat3x2",
      "mat3x3",
      "mat3x4",
      "mat4x2",
      "mat4x3",
      "mat4x4",
    ].includes(name)
  )
    return true;

  // Atomic, array, ptr
  if (["atomic", "array", "ptr"].includes(name)) return true;

  // Sampler types
  if (["sampler", "sampler_comparison"].includes(name)) return true;

  // Texture types
  if (name.startsWith("texture_")) return true; // texture_1d, texture_2d, texture_3d, etc.

  return false;
}

/**
 * Parse a stub expression for template parameters
 * Week 6: Minimal implementation - just consume tokens until comma or >
 * TODO Week 7+: Replace with full expression parser
 */
function parseStubTemplateExpression(
  stream: WeslStream,
  _ctx: ParseContext,
): UnknownExpressionElem | null {
  const startPos = stream.checkpoint();

  // Consume tokens until we hit a comma or closing >
  // This is a simplified approach - a real parser would handle nested templates
  let depth = 0;
  const expressionStart = startPos;

  while (true) {
    const token = stream.peek();
    if (!token) {
      // Unexpected end of input
      stream.reset(startPos);
      return null;
    }

    // Check if we've reached the end of this template parameter
    // Note: token.text could be ">", ">>", or ">=" at the end of a template
    if (depth === 0 && (token.text === "," || token.text.startsWith(">"))) {
      // We're done with this expression
      break;
    }

    // Track nesting depth for angle brackets
    // Only count single < or > tokens, not operators like << or >>
    if (token.text === "<") depth++;
    if (token.text === ">") depth--;

    // Consume the token
    stream.nextToken();
  }

  const endPos = stream.checkpoint();

  // Make sure we consumed at least one token
  if (endPos === expressionStart) {
    stream.reset(startPos);
    return null;
  }

  // Create TextElem to cover the consumed expression tokens
  const textElem = {
    kind: "text" as const,
    start: startPos,
    end: endPos,
    srcModule: _ctx.srcModule,
  };

  // Create UnknownExpressionElem with TextElem in contents
  const exprElem: UnknownExpressionElem = {
    kind: "expression",
    start: startPos,
    end: endPos,
    contents: [textElem],
  };

  return exprElem;
}

/**
 * Parse type reference
 *
 * Grammar: type_specifier : template_elaborated_ident
 * Grammar: template_elaborated_ident : ident _disambiguate_template template_list ?
 * Grammar: template_list : _template_args_start template_arg_comma_list _template_args_end
 * Grammar: template_arg_comma_list : template_arg_expression ( ',' template_arg_expression ) * ',' ?
 *
 * WESL extension: qualified names with :: (e.g., pkg::Type)
 */
export function parseSimpleTypeRef(
  stream: WeslStream,
  ctx: ParseContext,
): TypeRefElem | null {
  const checkpointPos = stream.checkpoint();

  // Parse the type name (may be qualified: pkg::Type)
  // Qualified names are separated by "::"
  const nameParts: string[] = [];

  // First part must be a word (or special keywords like "package", "super")
  const firstToken = stream.peek();
  if (!firstToken) {
    stream.reset(checkpointPos);
    return null;
  }

  // Accept word, or special keywords: "package", "super"
  if (
    firstToken.kind === "word" ||
    firstToken.text === "package" ||
    firstToken.text === "super"
  ) {
    stream.nextToken();
    nameParts.push(firstToken.text);
  } else {
    stream.reset(checkpointPos);
    return null;
  }

  // Parse additional :: separated parts
  while (true) {
    const colonColon = stream.peek();
    if (!colonColon || colonColon.text !== "::") {
      break;
    }

    // Consume "::"
    stream.nextToken();

    // Expect another identifier
    const nextPart = stream.peek();
    if (
      !nextPart ||
      (nextPart.kind !== "word" &&
        nextPart.text !== "package" &&
        nextPart.text !== "super")
    ) {
      throw new Error("Expected identifier after '::'");
    }

    stream.nextToken();
    nameParts.push(nextPart.text);
  }

  // Construct the full qualified name
  const fullName = nameParts.join("::");

  // Create RefIdent with the full qualified name
  // The span should cover from the first token to current position
  const nameEndPos = stream.checkpoint();
  // Use firstToken's start position for accurate span (not checkpoint which may include leading whitespace)
  const startPos = firstToken.span[0];
  const nameStartPos = startPos;
  const refIdent = ctx.createRefIdent(fullName, [nameStartPos, nameEndPos]);

  // NOTE: Don't mark types as std during parsing - binding will handle it
  // This allows user-defined aliases to shadow built-in types (e.g., alias f32 = MyStruct;)

  // Open element to collect contents
  openElem(ctx, { kind: "type", contents: [] });

  // Create RefIdentElem for the type name
  const refIdentElem: RefIdentElem = {
    kind: "ref",
    ident: refIdent,
    srcModule: ctx.srcModule,
    start: nameStartPos, // Use actual token start, not checkpoint before whitespace
    end: nameEndPos,
  };

  // Link RefIdent back to RefIdentElem (required for binding)
  refIdent.refIdentElem = refIdentElem;

  // Save the RefIdent to the current scope so binding can find it
  ctx.saveIdent(refIdent);

  // Add ref to contents
  ctx.addElem(refIdentElem);

  // Check for template parameters: <param1, param2, ...>
  let templateParams: TypeTemplateParameter[] | undefined;

  // Use the special template opening token handler
  const templateStart = stream.nextTemplateStartToken();
  if (templateStart) {
    templateParams = [];

    // Parse comma-separated template parameters
    while (true) {
      // Peek to see if we have a closing >
      // Use peek instead of nextTemplateEndToken to avoid consuming the token
      const next = stream.peek();
      if (!next) {
        throw new Error("Unexpected end of input in template parameters");
      }

      // If next token starts with >, we're at the end
      // This handles both > and >> (which gets split by nextTemplateEndToken)
      if (next.text.startsWith(">")) {
        const templateEnd = stream.nextTemplateEndToken();
        if (!templateEnd) {
          throw new Error("Expected '>' to close template parameters");
        }
        break;
      }

      // Try to parse as a type first (recursive call for nested templates)
      const typeParam = parseSimpleTypeRef(stream, ctx);
      if (typeParam) {
        templateParams.push(typeParam);
        ctx.addElem(typeParam); // Add to contents so it appears in AST
      } else {
        // If not a type, try to parse as an expression
        const exprParam = parseStubTemplateExpression(stream, ctx);
        if (exprParam) {
          templateParams.push(exprParam);
          ctx.addElem(exprParam);
        } else {
          throw new Error("Expected type or expression in template parameters");
        }
      }

      // Check for comma (more parameters) or closing >
      const nextAfter = stream.peek();
      if (!nextAfter) {
        throw new Error("Unexpected end of input in template parameters");
      }

      if (nextAfter.text === ",") {
        stream.nextToken(); // consume comma
        continue;
      }

      // Should be closing >
      if (!nextAfter.text.startsWith(">")) {
        throw new Error("Expected '>' or ',' after template parameter");
      }
      const templateEnd = stream.nextTemplateEndToken();
      if (!templateEnd) {
        throw new Error("Expected '>' to close template parameters");
      }
      break;
    }
  }

  const endPos = stream.checkpoint();

  // Close and fill with text
  const contents = closeElem(ctx, startPos, endPos);

  // Create TypeRefElem with optional template parameters
  const typeRef: TypeRefElem = {
    kind: "type",
    name: refIdent,
    templateParams,
    start: startPos,
    end: endPos,
    contents,
  };

  return typeRef;
}
