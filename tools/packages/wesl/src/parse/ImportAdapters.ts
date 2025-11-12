/**
 * Adapters that wrap direct import parsers into mini-parse Parser instances.
 */

import { Parser, type ParserContext } from "mini-parse";
import { createAdapter } from "./AdapterUtil.ts";
import {
  parseImportCollection,
  parseImportPathOrItem,
  parseImportRelative,
  parseImportStatement,
  parseImportStatementBase,
  parsePackageWord,
  parseWeslImports,
} from "./ImportParsers.ts";

// Export adapted parsers
export const packageWordAdapter = createAdapter(
  parsePackageWord,
  "packageWord",
);
export const importRelativeAdapter = createAdapter(
  parseImportRelative,
  "import_relative",
);
export const importCollectionAdapter = createAdapter(
  parseImportCollection,
  "import_collection",
);
export const importPathOrItemAdapter = createAdapter(
  parseImportPathOrItem,
  "import_path_or_item",
);
// Special adapter for importStatementBase which returns { statement, importPos }
export const importStatementBaseAdapter = new Parser({
  fn: (context: ParserContext) => {
    const stream = context.stream as any; // Cast to WeslStream
    const result = parseImportStatementBase(stream);
    return result ? { value: result.statement } : null;
  },
  traceName: "import_statement_base",
  terminal: true,
});
export const importStatementAdapter = createAdapter(
  parseImportStatement,
  "import_statement",
);
export const weslImportsAdapter = createAdapter(
  parseWeslImports,
  "weslImports",
);
