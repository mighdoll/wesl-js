/**
 * Minimal type parsers for WESL v2
 *
 * Week 3: Basic type references for alias declarations
 * Week 6: Type template support (array<f32>, vec4<f32>, etc.)
 */

import type {
  TypeRefElem,
  TypeTemplateParameter,
  UnknownExpressionElem,
} from "../AbstractElems.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consumeKind, reset } from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse a stub expression for template parameters
 * Week 6: Minimal implementation - just consume tokens until comma or >
 * TODO Week 7+: Replace with full expression parser
 */
function parseStubTemplateExpression(
  stream: WeslStream,
  _ctx: ParseContext,
): UnknownExpressionElem | null {
  const startPos = checkpoint(stream);

  // Consume tokens until we hit a comma or closing >
  // This is a simplified approach - a real parser would handle nested templates
  let depth = 0;
  const expressionStart = startPos;

  while (true) {
    const token = stream.peek();
    if (!token) {
      // Unexpected end of input
      reset(stream, startPos);
      return null;
    }

    // Check if we've reached the end of this template parameter
    if (depth === 0 && (token.text === "," || token.text === ">")) {
      // We're done with this expression
      break;
    }

    // Track nesting depth for angle brackets
    if (token.text === "<") depth++;
    if (token.text === ">") depth--;

    // Consume the token
    stream.nextToken();
  }

  const endPos = checkpoint(stream);

  // Make sure we consumed at least one token
  if (endPos === expressionStart) {
    reset(stream, startPos);
    return null;
  }

  // Create UnknownExpressionElem
  const exprElem: UnknownExpressionElem = {
    kind: "expression",
    start: startPos,
    end: endPos,
    contents: [],
  };

  return exprElem;
}

/**
 * Parse a type reference with optional template parameters
 * Week 3: Basic type references (identifiers only)
 * Week 6: Template support (array<f32, 10>, vec4<f32>, etc.)
 */
export function parseSimpleTypeRef(
  stream: WeslStream,
  ctx: ParseContext,
): TypeRefElem | null {
  const startPos = checkpoint(stream);

  // Parse the type name (identifier)
  const token = consumeKind(stream, "word");
  if (!token) {
    reset(stream, startPos);
    return null;
  }

  // Create RefIdent for this type reference
  const refIdent = ctx.createRefIdent(token.text, token.span);

  // Check for template parameters: <param1, param2, ...>
  let templateParams: TypeTemplateParameter[] | undefined = undefined;

  // Use the special template opening token handler
  const templateStart = stream.nextTemplateStartToken();
  if (templateStart) {
    templateParams = [];

    // Parse comma-separated template parameters
    while (true) {
      // Try to parse as a type first (recursive call for nested templates)
      const typeParam = parseSimpleTypeRef(stream, ctx);
      if (typeParam) {
        templateParams.push(typeParam);
      } else {
        // If not a type, try to parse as an expression
        const exprParam = parseStubTemplateExpression(stream, ctx);
        if (exprParam) {
          templateParams.push(exprParam);
        } else {
          throw new Error("Expected type or expression in template parameters");
        }
      }

      // Check for comma (more parameters) or closing >
      const next = stream.peek();
      if (!next) {
        throw new Error("Unexpected end of input in template parameters");
      }

      if (next.text === ",") {
        stream.nextToken(); // consume comma
        continue;
      }

      // Should be closing >
      const templateEnd = stream.nextTemplateEndToken();
      if (!templateEnd) {
        throw new Error("Expected '>' to close template parameters");
      }
      break;
    }
  }

  const endPos = checkpoint(stream);

  // Create TypeRefElem with optional template parameters
  const typeRef: TypeRefElem = {
    kind: "type",
    name: refIdent,
    templateParams,
    start: startPos,
    end: endPos,
    contents: [],
  };

  return typeRef;
}
