// Size-measurement stub: stands in for the `lezer-wesl` grammar so the generated
// LR parser tables (and @lezer/lr's deserializer) tree-shake out of the bundle.
// Used by size-check.ts to measure the editor *without* WESL syntax highlighting.
//
// The editor never parses during a size build — vite only bundles — so a plain
// object that satisfies what `LRLanguage.define`/`Language` touch at module-eval
// time (configure() returning a parser-like, hasWrappers()) is enough. The real
// grammar would otherwise pull ~the whole generated parse table.
const stubParser = {
  configure() {
    return stubParser;
  },
  hasWrappers() {
    return false;
  },
};

export const parser = stubParser;

// `weslHighlighting` is only handed to parser.configure({ props }); an empty
// object is harmless for a no-parse size build.
export const weslHighlighting = {};
