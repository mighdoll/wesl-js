/**
 * Minimal type parsers for WESL v2
 *
 * Week 3: Basic type references for alias declarations
 * Will be expanded later for full type support (templates, arrays, etc.)
 */

import type { TypeRefElem } from "../AbstractElems.ts";
import type { ParseContext } from "./ParseContext.ts";
import { checkpoint, consumeKind, reset } from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

/**
 * Parse a simple type reference (identifier only, no templates yet)
 * Week 3: Minimal implementation for alias declarations
 * TODO: Add template support for types like array<f32, 10>
 */
export function parseSimpleTypeRef(
  stream: WeslStream,
  ctx: ParseContext,
): TypeRefElem | null {
  const startPos = checkpoint(stream);

  // For now, just parse a simple identifier
  // TODO: Support qualified names (pkg::Type), templates (array<f32>), etc.
  const token = consumeKind(stream, "word");
  if (!token) {
    reset(stream, startPos);
    return null;
  }

  // Create RefIdent for this type reference
  const refIdent = ctx.createRefIdent(token.text, token.span);

  const endPos = checkpoint(stream);

  // Create TypeRefElem with the required name field
  const typeRef: TypeRefElem = {
    kind: "type",
    name: refIdent,
    start: startPos,
    end: endPos,
    contents: [],
  };

  // Link back from ident to elem (TypeRefElem is not in RefIdent's type though)
  // For now, we'll skip this linking

  return typeRef;
}
