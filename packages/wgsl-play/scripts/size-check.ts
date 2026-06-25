#!/usr/bin/env node
// Measures realistic bundle size for wgsl-play and two smaller variants, so we
// can see what each capability tier costs a downstream consumer.
//
// Variants (all minified with terser, then gzip + brotli):
//   1. wesl-core         - just `link` from wesl. The parse + link baseline.
//   2. do-blocks-runtime - wesl core + the headless do-block execution runtime
//                          (GPU compute/render pipeline from wgsl-play, plus
//                          wesl-gpu / wesl-reflect), but NO preact UI. This is
//                          the "do blocks for any wesl library" tier.
//   3. wgsl-play-full    - the whole wgsl-play custom element, including the
//                          preact UI (results panel, controls, overlays, css).
//
// All variants apply the same production transforms wesl ships in
// vite.nodebug.config.ts (debug/validation stripped, parser error context
// removed) so the wesl-core number here reproduces wesl's own `build:size`.

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

interface Sizes {
  raw: number;
  gzip: number;
  brotli: number;
}

interface Variant {
  name: string;
  blurb: string;
  /** Entry module source. Imports resolve from the wgsl-play package. */
  entry: string;
}

const variants: Variant[] = [
  {
    name: "wesl-core",
    blurb: "link only (parse + link baseline)",
    entry: `export { link } from "wesl";\n`,
  },
  {
    name: "do-blocks-runtime",
    blurb: "wesl core + headless do-block GPU runtime, no UI",
    entry:
      `export { link } from "wesl";\n` +
      `export * from ${json(`${srcDir}/Renderer.ts`)};\n` +
      `export * from ${json(`${srcDir}/ComputeBuild.ts`)};\n` +
      `export * from ${json(`${srcDir}/FragmentRender.ts`)};\n` +
      `export * from ${json(`${srcDir}/RenderResources.ts`)};\n`,
  },
  {
    name: "wgsl-play-full",
    blurb: "full custom element + preact UI",
    entry: `export * from ${json(`${srcDir}/index.ts`)};\n`,
  },
];

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
    plugins: [rawImports(), nodebugTransform()],
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

  // Deltas over the wesl-core baseline (brotli).
  const base = rows[0].s.brotli;
  for (const { v, s } of rows.slice(1)) {
    const d = s.brotli - base;
    console.log(
      `${v.name}: +${(d / 1024).toFixed(1)} kB brotli over wesl-core (${((d / base) * 100).toFixed(0)}% more)`,
    );
  }
  console.log();

  rmSync(tmpRoot, { recursive: true, force: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
