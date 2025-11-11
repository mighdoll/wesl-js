/**
 * Direct token-based parsers for WESL import statements.
 * These parsers work directly with WeslStream without mini-parse combinators.
 */

import { ParseError, type ParserContext } from "mini-parse";
import type {
  AttributeElem,
  ElifAttribute,
  ElseAttribute,
  IfAttribute,
  ImportCollection,
  ImportElem,
  ImportItem,
  ImportSegment,
  ImportStatement,
} from "../AbstractElems.ts";
import {
  parseElifAttribute,
  parseElseAttribute,
  parseIfAttribute,
} from "./AttributeParsers.ts";
import { checkpoint, consume, consumeKind, reset } from "./ParseUtil.ts";
import type { WeslStream } from "./WeslStream.ts";

// ============================================================================
// Helper Functions
// ============================================================================

export function makeStatement(
  segments: ImportSegment[],
  finalSegment: ImportCollection | ImportItem,
): ImportStatement {
  return { kind: "import-statement", segments, finalSegment };
}

export function makeSegment(name: string): ImportSegment {
  return { kind: "import-segment", name };
}

export function makeCollection(subtrees: ImportStatement[]): ImportCollection {
  return {
    kind: "import-collection",
    subtrees,
  };
}

export function makeItem(name: string, as?: string): ImportItem {
  return { kind: "import-item", name, as };
}

export function prependSegments(
  segments: ImportSegment[],
  statement: ImportStatement,
): ImportStatement {
  statement.segments = segments.concat(statement.segments);
  return statement;
}

// ============================================================================
// Phase 1 Parsers - Simple parsers with no dependencies
// ============================================================================

/**
 * Check if the current token is a blacklisted segment word.
 * Returns true if the token is "super", "package", "import", or "as".
 */
export function isSegmentBlacklist(context: ParserContext): boolean {
  const { stream } = context;
  const weslStream = stream as WeslStream;
  const pos = weslStream.checkpoint();
  const token = weslStream.nextToken();

  if (!token) {
    return false;
  }

  const isBlacklisted =
    token.text === "super" ||
    token.text === "package" ||
    token.text === "import" ||
    token.text === "as";

  weslStream.reset(pos); // Don't consume, just check
  return isBlacklisted;
}

/**
 * Parse a word that can be used in an import path segment.
 * This is any word or keyword that is not in the blacklist.
 */
export function parsePackageWord(context: ParserContext): string | null {
  const { stream } = context;

  // Check blacklist first
  if (isSegmentBlacklist(context)) {
    return null;
  }

  // Try to parse a word or keyword
  const token = consumeKind(stream, "word") || consumeKind(stream, "keyword");
  return token ? token.text : null;
}

/**
 * Parse relative import prefix: "package::" or one or more "super::"
 * Returns array of ImportSegments or null if no relative prefix found.
 */
export function parseImportRelative(
  context: ParserContext,
): ImportSegment[] | null {
  const { stream } = context;
  const pos = checkpoint(stream);

  // Try "package::"
  if (consume(stream, "package")) {
    if (!consume(stream, "::")) {
      // Not a valid package prefix, backtrack
      reset(stream, pos);
      return null;
    }
    return [makeSegment("package")];
  }

  // Try one or more "super::"
  const segments: ImportSegment[] = [];
  while (consume(stream, "super")) {
    if (!consume(stream, "::")) {
      // Invalid super prefix, backtrack completely
      reset(stream, pos);
      return null;
    }
    segments.push(makeSegment("super"));
  }

  return segments.length > 0 ? segments : null;
}

// ============================================================================
// Phase 2 Parsers - Breaking mutual recursion
// ============================================================================

// Forward declarations for mutual recursion
// biome-ignore lint/style/useConst: mutual recursion requires reassignment
export let parseImportCollection: (
  context: ParserContext,
) => ImportCollection | null;
// biome-ignore lint/style/useConst: mutual recursion requires reassignment
export let parseImportPathOrItem: (
  context: ParserContext,
) => ImportStatement | null;

/**
 * Parse an import collection: { item1, item2, ... }
 * FULL VERSION: Supports comma-separated path_or_item elements
 */
parseImportCollection = (context: ParserContext): ImportCollection | null => {
  const { stream } = context;
  const weslStream = stream as WeslStream;

  if (!consume(stream, "{")) return null;

  // COMMIT POINT: We've consumed "{", so this is definitely a collection
  const statements: ImportStatement[] = [];

  // Parse first item (required - empty collections not allowed)
  const firstItem = parseImportPathOrItem(context);
  if (!firstItem) {
    const currentPos = checkpoint(stream);
    throw new ParseError("invalid import collection, expected name", [
      currentPos,
      currentPos,
    ]);
  }
  statements.push(firstItem);

  // Parse remaining comma-separated items
  while (consume(stream, ",")) {
    // Check for trailing comma (next token is closing brace)
    const nextToken = weslStream.peek();

    if (nextToken && nextToken.text === "}") {
      // Trailing comma before closing brace - this is allowed
      break;
    }

    const item = parseImportPathOrItem(context);
    if (!item) {
      const currentPos = checkpoint(stream);
      throw new ParseError(
        "invalid import collection, expected name after ','",
        [currentPos, currentPos],
      );
    }
    statements.push(item);
  }

  if (!consume(stream, "}")) {
    const currentPos = checkpoint(stream);
    throw new ParseError("invalid import collection, expected }", [
      currentPos,
      currentPos,
    ]);
  }

  return makeCollection(statements);
};

/**
 * Parse an import path or item: foo, foo as bar, foo::bar, foo::{...}, etc.
 * FULL VERSION: Includes collection support with mutual recursion
 */
parseImportPathOrItem = (context: ParserContext): ImportStatement | null => {
  const { stream } = context;

  const name = parsePackageWord(context);
  if (!name) return null;

  // Check what follows the name
  if (consume(stream, "::")) {
    // COMMIT POINT: We have "name::", so this must be a path

    // Path continues - could be collection or another path_or_item
    const collection = parseImportCollection(context);
    if (collection) {
      // name::{...}
      return makeStatement([makeSegment(name)], collection);
    }

    // Try parsing as path_or_item
    const pathOrItem = parseImportPathOrItem(context);
    if (pathOrItem) {
      // name::path_or_item - prepend our segment
      return prependSegments([makeSegment(name)], pathOrItem);
    }

    const currentPos = checkpoint(stream);
    throw new ParseError("invalid import, expected '{' or name", [
      currentPos,
      currentPos,
    ]);
  } else if (consume(stream, "as")) {
    // COMMIT POINT: We have "name as", so this must be an alias

    const alias = consumeKind(stream, "word");
    if (!alias) {
      const currentPos = checkpoint(stream);
      throw new ParseError("invalid alias, expected name", [
        currentPos,
        currentPos,
      ]);
    }

    const item = makeItem(name, alias.text);
    return makeStatement([], item);
  } else {
    // Simple item
    const item = makeItem(name);
    return makeStatement([], item);
  }
};

// ============================================================================
// Phase 4 Parsers - Statement integration
// ============================================================================

/**
 * Parse the base import statement: import <relative>? <collection_or_path> ;
 * Returns the statement and the position where "import" was found.
 */
export function parseImportStatementBase(
  context: ParserContext,
): { statement: ImportStatement; importPos: number } | null {
  const { stream } = context;
  const weslStream = stream as WeslStream;

  // Peek at import token to get its position
  const importToken = weslStream.peek();
  if (!importToken || importToken.text !== "import") {
    return null;
  }
  const importPos = importToken.span[0];

  // Now consume it - COMMIT POINT
  if (!consume(stream, "import")) return null;

  // Parse optional relative prefix
  const relative = parseImportRelative(context);

  // Parse collection or path_or_item
  const collectionOrStatement =
    parseImportCollection(context) || parseImportPathOrItem(context);
  if (!collectionOrStatement) {
    const pos = checkpoint(stream);
    throw new ParseError("invalid import, expected { or name", [pos, pos]);
  }

  // Expect semicolon
  if (!consume(stream, ";")) {
    const pos = checkpoint(stream);
    throw new ParseError("invalid import, expected ';'", [pos, pos]);
  }

  // Combine the parts
  let statement: ImportStatement;
  if (collectionOrStatement.kind === "import-statement") {
    // It's already a statement, prepend relative segments if any
    statement = prependSegments(relative ?? [], collectionOrStatement);
  } else {
    // It's a collection, create a statement
    statement = makeStatement(relative ?? [], collectionOrStatement);
  }

  return { statement, importPos };
}

/**
 * Wrap raw attributes into AttributeElem structures
 */
export function wrapAttributes(
  rawAttributes: (IfAttribute | ElifAttribute | ElseAttribute)[],
): AttributeElem[] {
  return rawAttributes.map(attribute => ({
    kind: "attribute",
    attribute,
    contents: [],
    start: 0,
    end: 0,
  }));
}

/**
 * Parse import attributes (@if, @elif, @else)
 * Returns parsed attributes and the start position of the first attribute
 */
function parseImportAttributes(context: ParserContext): {
  attributes: (IfAttribute | ElifAttribute | ElseAttribute)[];
  startPos: number | null;
} {
  const { stream } = context;
  const weslStream = stream as WeslStream;
  const attributes: (IfAttribute | ElifAttribute | ElseAttribute)[] = [];
  let actualStartPos: number | null = null;

  while (true) {
    const checkPos = weslStream.checkpoint();

    // Peek to see if we have an attribute
    const peeked = weslStream.peek();
    if (peeked && peeked.text === "@") {
      // Capture position of @ token if this is our first attribute
      if (actualStartPos === null) {
        actualStartPos = peeked.span[0];
      }
    }

    // Try @if
    const ifAttr = parseIfAttribute(context);
    if (ifAttr) {
      attributes.push(ifAttr);
      continue;
    }

    // Try @elif
    const elifAttr = parseElifAttribute(context);
    if (elifAttr) {
      attributes.push(elifAttr);
      continue;
    }

    // Try @else
    const elseAttr = parseElseAttribute(context);
    if (elseAttr) {
      attributes.push(elseAttr);
      continue;
    }

    // No more attributes found, reset to check position
    weslStream.reset(checkPos);
    break;
  }

  return { attributes, startPos: actualStartPos };
}

/**
 * Parse an import statement with optional attributes
 * Returns an ImportElem which includes the statement and any attributes
 */
export function parseImportStatement(
  context: ParserContext,
): ImportElem | null {
  const { stream } = context;
  const startCheckpoint = checkpoint(stream);

  // Parse optional attributes
  const { attributes, startPos: actualStartPos } =
    parseImportAttributes(context);

  // Parse the import statement
  const parseResult = parseImportStatementBase(context);
  if (!parseResult) {
    // If we parsed attributes but no import, we need to reset
    // to allow parsing as a different statement type
    if (attributes.length > 0) {
      reset(stream, actualStartPos!);
    } else {
      reset(stream, startCheckpoint);
    }
    return null;
  }

  const { statement: imports, importPos } = parseResult;
  const endPos = checkpoint(stream);

  // Use the position of the first token we actually parsed
  const startPos = actualStartPos ?? importPos;

  // Create ImportElem
  const importElem: ImportElem = {
    kind: "import",
    imports,
    start: startPos,
    end: endPos,
  };

  // Add attributes if any
  if (attributes.length > 0) {
    return { ...importElem, attributes: wrapAttributes(attributes) };
  }

  return importElem;
}

/**
 * Parse all import statements in a WESL file
 * Returns an array of ImportElem
 */
export function parseWeslImports(context: ParserContext): ImportElem[] {
  const imports: ImportElem[] = [];

  // Keep parsing import statements until we can't find any more
  while (true) {
    const importElem = parseImportStatement(context);
    if (!importElem) break;
    imports.push(importElem);
  }

  return imports;
}
