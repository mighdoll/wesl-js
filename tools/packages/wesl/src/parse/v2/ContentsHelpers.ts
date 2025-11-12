/**
 * Helper functions for V2 parsers to populate contents arrays with text elements.
 *
 * V1 combinator parser automatically fills contents arrays with:
 * - Child elements (typeDecl, expressions, etc.)
 * - TextElems to cover all gaps (keywords, punctuation, whitespace)
 *
 * V2 hand-written parser must explicitly:
 * - Push elements onto openElems stack before parsing
 * - Add children via ctx.addElem()
 * - Fill gaps with text via coverWithText() before popping
 */

import type { ContainerElem, GrammarElem, TextElem } from "../../AbstractElems.ts";
import type { WeslAST } from "../../ParseWESL.ts";
import type { ParseContext } from "../ParseContext.ts";

/**
 * Open an element for content collection.
 * Push it onto the openElems stack so children can be added via ctx.addElem().
 */
export function openElem<T extends ContainerElem>(
  ctx: ParseContext,
  partialElem: Pick<T, "kind" | "contents">,
): void {
  ctx.state.context.openElems.push(partialElem as any);
}

/**
 * Close an element, filling gaps with TextElems.
 * Call this after parsing all children and before finalizing the element.
 *
 * @param ctx Parse context
 * @param start Start position of the element
 * @param end End position of the element
 * @returns Contents array with all gaps filled by TextElems
 */
export function closeElem(
  ctx: ParseContext,
  start: number,
  end: number,
): GrammarElem[] {
  const openElem = ctx.state.context.openElems.pop();
  if (!openElem) {
    throw new Error("No open element to close");
  }

  // Fill gaps with text elements
  return coverWithText(ctx, openElem.contents, start, end);
}

/**
 * Cover the entire source range with Elems by creating TextElems to
 * cover any parts of the source that are not covered by other elems.
 *
 * @param ctx Parse context
 * @param contents Child elements already collected
 * @param start Start position to cover
 * @param end End position to cover
 * @returns Contents with TextElems filling all gaps
 */
function coverWithText(
  ctx: ParseContext,
  contents: GrammarElem[],
  start: number,
  end: number,
): GrammarElem[] {
  let pos = start;
  const ast: WeslAST = ctx.state.stable;
  const sorted = contents.slice().sort((a, b) => a.start - b.start);

  const elems: GrammarElem[] = [];
  for (const elem of sorted) {
    // Add text elem for gap before this child
    if (pos < elem.start) {
      elems.push(makeTextElem(pos, elem.start));
    }
    elems.push(elem);
    pos = elem.end;
  }

  // Add text elem for gap after last child
  if (pos < end) {
    elems.push(makeTextElem(pos, end));
  }

  return elems;

  function makeTextElem(textStart: number, textEnd: number): TextElem {
    return {
      kind: "text",
      start: textStart,
      end: textEnd,
      srcModule: ast.srcModule,
    };
  }
}

/**
 * Convenience wrapper for elements that don't need custom logic.
 * Opens element, runs parser function, closes with text cover.
 *
 * Usage:
 * ```typescript
 * return withContents(ctx, startPos, endPos, { kind: "gvar", name, ... }, () => {
 *   // Add children here via ctx.addElem(childElem)
 * });
 * ```
 */
export function withContents<T extends ContainerElem>(
  ctx: ParseContext,
  start: number,
  end: number,
  partialElem: Omit<T, "contents" | "start" | "end">,
  populateFn: () => void,
): T {
  // Open element for collection
  openElem(ctx, { kind: partialElem.kind, contents: [] });

  // Run populate function (may call ctx.addElem())
  populateFn();

  // Close and fill with text
  const contents = closeElem(ctx, start, end);

  return {
    ...partialElem,
    start,
    end,
    contents,
  } as T;
}
