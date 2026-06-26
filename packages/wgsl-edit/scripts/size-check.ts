#!/usr/bin/env node
// Measures the built wgsl-edit package and attributes its size to CodeMirror
// core, each editor feature, and the WESL grammar / linter — so we can see what
// is trimmable in a downstream consumer.
//
// wgsl-edit is a CodeMirror 6 editor (no preact in the component itself — the UI
// is plain DOM), so CodeMirror dominates. The interesting question is what each
// feature costs (lint / autocomplete / search / commands / language services)
// and how much the WESL pieces add (the lezer-wesl grammar + wesl's bind-based
// linter).
//
// Variant families (all minified with terser, then gzip + brotli):
//   cm-core            - bare CodeMirror: EditorView + EditorState. The floor.
//   cm-basicSetup      - the `codemirror` meta-package `basicSetup` reference.
//   feat-*             - cm-core plus ONE feature area's exports (as imported by
//                        WgslEdit), so the delta vs cm-core is that feature's
//                        marginal cost.
//   lezer-wesl         - the WESL grammar + highlighting tags alone.
//   wesl-syntax        - wesl() LanguageSupport: the grammar wired into CM
//                        (highlighting only, no linter).
//   wesl-bind-linter   - the wesl symbols the linter pulls (parse + bind +
//                        resolvers), standalone.
//   language-export    - the `./language` entry (Language.ts): grammar +
//                        CM lint plumbing + wesl bind linter.
//   editor-full        - the `.` entry (index.ts): the whole custom element.
//   editor-no-grammar  - editor-full with lezer-wesl stubbed out: the editor
//                        minus WESL syntax highlighting.
//
// All variants apply the same production transforms wesl ships in
// vite.nodebug.config.ts (debug/validation stripped, parser error context
// removed), matching wgsl-play's size-check so the numbers are comparable.

import {
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build, type Plugin } from "vite";

const scriptDir = import.meta.dirname;
const pkgDir = resolve(scriptDir, "..");
const srcDir = resolve(pkgDir, "src");
const tmpRoot = resolve(pkgDir, ".size-check-tmp");
const lezerStub = resolve(scriptDir, "lezer-stub.ts");

interface Sizes {
  raw: number;
  gzip: number;
  brotli: number;
}

interface Variant {
  name: string;
  blurb: string;
  /** Entry module source. Bare specifiers resolve from the wgsl-edit package. */
  entry: string;
  /** Replace the lezer-wesl grammar with a stub so the parser tree-shakes out. */
  stubGrammar?: boolean;
  /** Replace whole modules with no-op stubs to measure removing a feature
   *  *in context* (true trim savings, vs the additive feature marginals). */
  stubModules?: Record<string, string>;
}

// No-op stand-ins for CM feature packages, so a feature can be removed from the
// real editor without editing WgslEdit.ts. Each export is replaced with an
// empty Extension (or a harmless value) — the editor still constructs; the
// feature's code tree-shakes away.
const AUTOCOMPLETE_STUB =
  `export const autocompletion = () => [];\n` +
  `export const closeBrackets = () => [];\n` +
  `export const closeBracketsKeymap = [];\n` +
  `export const completionKeymap = [];\n`;
const SEARCH_STUB =
  `export const searchKeymap = [];\n` +
  `export const search = () => [];\n` +
  `export const openSearchPanel = () => false;\n` +
  `export const highlightSelectionMatches = () => [];\n`;

// Bare CodeMirror core: the editor view + state, nothing else. Every feature
// variant starts from exactly this so deltas are clean marginal costs.
const CORE = `export { EditorView } from "@codemirror/view";\nexport { EditorState } from "@codemirror/state";\n`;

const variants: Variant[] = [
  {
    name: "cm-core",
    blurb: "bare CodeMirror: EditorView + EditorState (the floor)",
    entry: CORE,
  },
  {
    name: "cm-basicSetup",
    blurb: "the `codemirror` meta-package basicSetup reference editor",
    entry: `export { EditorView, basicSetup } from "codemirror";\n`,
  },
  {
    name: "feat-commands",
    blurb: "+ history & default/history keymaps (@codemirror/commands)",
    entry:
      CORE +
      `export { defaultKeymap, history, historyKeymap } from "@codemirror/commands";\n`,
  },
  {
    name: "feat-language",
    blurb:
      "+ syntax highlighting, folding, bracket matching, indent (@codemirror/language)",
    entry:
      CORE +
      `export {\n` +
      `  bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap,\n` +
      `  HighlightStyle, indentOnInput, syntaxHighlighting, LanguageSupport, LRLanguage,\n` +
      `} from "@codemirror/language";\n`,
  },
  {
    name: "feat-autocomplete",
    blurb:
      "+ autocompletion & bracket closing (@codemirror/autocomplete)",
    entry:
      CORE +
      `export {\n` +
      `  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap,\n` +
      `} from "@codemirror/autocomplete";\n`,
  },
  {
    name: "feat-lint",
    blurb: "+ lint gutter, panel & keymap (@codemirror/lint)",
    entry:
      CORE +
      `export { forceLinting, linter, lintKeymap } from "@codemirror/lint";\n`,
  },
  {
    name: "feat-search",
    blurb: "+ search panel & keymap (@codemirror/search)",
    entry:
      CORE +
      `export { search, searchKeymap, openSearchPanel } from "@codemirror/search";\n`,
  },
  {
    name: "lezer-wesl",
    blurb: "the WESL grammar + highlighting tags alone (lezer-wesl)",
    entry: `export { parser, weslHighlighting } from "lezer-wesl";\n`,
  },
  {
    name: "wesl-syntax",
    blurb: "wesl() LanguageSupport: WESL highlighting wired into CM, no linter",
    entry: `export { wesl, weslLanguage } from ${json(`${srcDir}/Language.ts`)};\n`,
  },
  {
    name: "wesl-bind-linter",
    blurb: "wesl parse + bind + resolvers (what the WESL linter pulls)",
    entry:
      `export {\n` +
      `  bindIdents, BundleResolver, CompositeResolver, RecordResolver, WeslParseError,\n` +
      `} from "wesl";\n`,
  },
  {
    name: "language-export",
    blurb: "./language entry: grammar + CM lint + wesl bind linter",
    entry: `export * from ${json(`${srcDir}/Language.ts`)};\n`,
  },
  {
    name: "editor-full",
    blurb: "the . entry (index.ts): the whole <wgsl-edit> custom element",
    entry: `export * from ${json(`${srcDir}/index.ts`)};\n`,
  },
  {
    name: "editor-no-grammar",
    blurb: "editor-full minus WESL syntax highlighting (lezer-wesl stubbed)",
    entry: `export * from ${json(`${srcDir}/index.ts`)};\n`,
    stubGrammar: true,
  },
  {
    name: "editor-no-autocomplete",
    blurb: "editor-full minus autocompletion + bracket closing (in context)",
    entry: `export * from ${json(`${srcDir}/index.ts`)};\n`,
    stubModules: { "@codemirror/autocomplete": AUTOCOMPLETE_STUB },
  },
  {
    name: "editor-no-search",
    blurb: "editor-full minus search (in context)",
    entry: `export * from ${json(`${srcDir}/index.ts`)};\n`,
    stubModules: { "@codemirror/search": SEARCH_STUB },
  },
];

/** Redirect the `lezer-wesl` grammar to a stub so its parse tables tree-shake. */
function stubGrammarPlugin(): Plugin {
  return {
    name: "stub-lezer-wesl",
    enforce: "pre",
    resolveId(source) {
      if (source === "lezer-wesl") return lezerStub;
    },
  };
}

/** Replace whole modules with inline no-op source, to remove a feature in context. */
function stubModulesPlugin(stubs: Record<string, string>): Plugin {
  const PREFIX = "\0modstub:";
  return {
    name: "stub-modules",
    enforce: "pre",
    resolveId(source) {
      if (source in stubs) return PREFIX + source;
    },
    load(id) {
      if (id.startsWith(PREFIX)) return stubs[id.slice(PREFIX.length)];
    },
  };
}

function json(s: string): string {
  return JSON.stringify(s);
}

/**
 * Handle `?inline` (css) and `?raw` (svg) imports by reading the file as a
 * string, via a virtual id so vite's css pipeline doesn't intercept `.css`.
 */
function rawImports(): Plugin {
  const PREFIX = "\0rawfile:";
  const suffixes = ["?inline", "?raw"];
  return {
    name: "raw-imports",
    resolveId(source, importer) {
      const suffix = suffixes.find(s => source.endsWith(s));
      if (suffix && importer) {
        const file = resolve(dirname(importer), source.slice(0, -suffix.length));
        return PREFIX + file;
      }
    },
    load(id) {
      if (id.startsWith(PREFIX)) {
        const content = readFileSync(id.slice(PREFIX.length), "utf8");
        return `export default ${JSON.stringify(content)};`;
      }
    },
  };
}

/**
 * Apply the same production transforms wesl ships in vite.nodebug.config.ts:
 * flip the debug/validation flags off and strip parser error-context strings.
 */
function nodebugTransform(): Plugin {
  return {
    name: "wesl-nodebug",
    transform(code, id) {
      if (!id.endsWith(".ts")) return null;
      let result = code;
      result = result.replace(/const debug = true/g, "const debug = false");
      result = result.replace(
        /const validation = true/g,
        "const validation = false",
      );
      result = result.replace(
        /\bexpect\(([^,]+),\s*("[^"]*"),\s*("[^"]*"|`[^`]*`)\)/g,
        "expect($1, $2)",
      );
      result = result.replace(
        /\bexpectWord\(([^,]+),\s*("[^"]*"|`[^`]*`)\)/g,
        'expectWord($1, "")',
      );
      result = result.replace(
        /\bexpectExpression\(([^,]+),\s*("[^"]*"|`[^`]*`)\)/g,
        "expectExpression($1)",
      );
      result = result.replace(
        /\bthrowParseError\(([^,]+),\s*("[^"]*"|`[^`]*`)\)/g,
        'throwParseError($1, "")',
      );
      if (result !== code) return { code: result, map: null };
      return null;
    },
  };
}

async function measure(variant: Variant): Promise<Sizes> {
  const outDir = resolve(tmpRoot, variant.name);
  mkdirSync(outDir, { recursive: true });
  const entryFile = resolve(outDir, "entry.ts");
  writeFileSync(entryFile, variant.entry);

  const outFile = "out.js";
  await build({
    configFile: false,
    logLevel: "error",
    plugins: [
      ...(variant.stubGrammar ? [stubGrammarPlugin()] : []),
      ...(variant.stubModules ? [stubModulesPlugin(variant.stubModules)] : []),
      rawImports(),
      nodebugTransform(),
    ],
    build: {
      target: "es2024",
      lib: { entry: entryFile, formats: ["es"], fileName: () => outFile },
      outDir,
      emptyOutDir: false,
      minify: "terser",
      sourcemap: false,
      rollupOptions: { external: [] },
    },
  });

  const bytes = readFileSync(resolve(outDir, outFile));
  return {
    raw: statSync(resolve(outDir, outFile)).size,
    gzip: gzipSync(bytes).length,
    brotli: brotliCompressSync(bytes).length,
  };
}

function kB(n: number): string {
  return `${(n / 1024).toFixed(1)} kB`.padStart(9);
}

async function main() {
  rmSync(tmpRoot, { recursive: true, force: true });
  mkdirSync(tmpRoot, { recursive: true });

  const rows: Array<{ v: Variant; s: Sizes }> = [];
  for (const v of variants) {
    process.stdout.write(`measuring ${v.name}... `);
    const s = await measure(v);
    console.log("done");
    rows.push({ v, s });
  }

  console.log();
  const head = `${"variant".padEnd(20)}${"raw".padStart(9)}${"gzip".padStart(9)}${"brotli".padStart(9)}   what`;
  console.log(head);
  console.log("-".repeat(head.length));
  for (const { v, s } of rows) {
    console.log(
      `${v.name.padEnd(20)}${kB(s.raw)}${kB(s.gzip)}${kB(s.brotli)}   ${v.blurb}`,
    );
  }
  console.log();

  // Marginal feature costs vs the cm-core baseline (brotli). These are additive
  // over the bare core, so they double-count infrastructure shared between
  // features (panels, tooltips, rangesets) and overstate isolated trim savings.
  const core = rows.find(r => r.v.name === "cm-core")!.s.brotli;
  for (const { v, s } of rows) {
    if (!v.name.startsWith("feat-")) continue;
    const d = s.brotli - core;
    console.log(
      `${v.name}: +${(d / 1024).toFixed(1)} kB brotli over cm-core`,
    );
  }
  console.log();

  // True in-context trim savings: full editor minus one feature (brotli).
  const full = rows.find(r => r.v.name === "editor-full")!.s.brotli;
  for (const { v, s } of rows) {
    if (!v.name.startsWith("editor-no-")) continue;
    const d = full - s.brotli;
    console.log(
      `${v.name}: -${(d / 1024).toFixed(1)} kB brotli removed from editor-full`,
    );
  }
  console.log();

  rmSync(tmpRoot, { recursive: true, force: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
