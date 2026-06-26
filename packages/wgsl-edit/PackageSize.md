# wgsl-edit package-size analysis

Status: exploratory notes, June 2026. Branch `claude/wgsl-edit-package-size-jljnva`,
on top of `mighdoll-main`. Continues the method from
[`packages/wgsl-play/PackageSize.md`](../wgsl-play/PackageSize.md) — read that
first for the production-transform / measurement framing.

Goal: measure how big a built `wgsl-edit` is and attribute the size to its
pieces. Unlike wgsl-play (where parser-vs-linker was the story), `wgsl-edit` is a
[CodeMirror 6](https://codemirror.net/) editor, so **CodeMirror dominates** and
the interesting question is what is trimmable — lint, autocomplete, search,
syntax highlighting, and the WESL-specific grammar + linter.

Note: the `<wgsl-edit>` component is plain DOM (`document.createElement` +
shadow root), **not** preact — so unlike wgsl-play there is no UI-framework cost
in the bundle. `preact` appears only as a types-only import in `./jsx-preact`.

## How to reproduce

```
pnpm --filter wgsl-edit build:size
```

Runs `packages/wgsl-edit/scripts/size-check.ts`. Each variant is bundled with
vite (es lib, terser minify), applying the same production transforms wesl ships
in `vite.nodebug.config.ts` (debug/validation stripped, parser error-context
removed), then reported as raw / gzip / brotli. This matches wgsl-play's harness
so the numbers are comparable across packages.

Two stub tricks isolate features without editing component source:

- `editor-no-grammar` redirects `lezer-wesl` to `scripts/lezer-stub.ts` (a
  no-op parser), so the generated LR parse tables and `@lezer/lr` tree-shake out.
- `editor-no-autocomplete` / `editor-no-search` replace the whole CM feature
  package with inline no-op extensions, measuring removal *in context*.

## Measurements (current branch)

| variant | raw | gzip | brotli | what |
|---|---|---|---|---|
| `cm-core` | 190.6 kB | 60.5 kB | **52.5 kB** | bare CodeMirror: `EditorView` + `EditorState` (the floor) |
| `cm-basicSetup` | 367.2 kB | 115.6 kB | **98.3 kB** | the `codemirror` meta-package `basicSetup` reference editor |
| `feat-commands` | 251.3 kB | 79.7 kB | **69.1 kB** | core + history & keymaps (`@codemirror/commands`) |
| `feat-language` | 248.2 kB | 78.9 kB | **68.3 kB** | core + highlighting, folding, brackets, indent (`@codemirror/language`) |
| `feat-autocomplete` | 266.5 kB | 84.9 kB | **73.1 kB** | core + autocompletion & bracket closing (`@codemirror/autocomplete`) |
| `feat-lint` | 219.7 kB | 69.2 kB | **59.8 kB** | core + lint gutter/panel/keymap (`@codemirror/lint`) |
| `feat-search` | 216.7 kB | 68.4 kB | **59.2 kB** | core + search panel & keymap (`@codemirror/search`) |
| `lezer-wesl` | 76.5 kB | 27.5 kB | **24.4 kB** | the WESL grammar + highlighting tags alone |
| `wesl-syntax` | 278.2 kB | 91.6 kB | **78.9 kB** | `wesl()` LanguageSupport: grammar wired into CM, no linter |
| `wesl-bind-linter` | 43.3 kB | 14.0 kB | **12.6 kB** | wesl parse + bind + resolvers (what the WESL linter pulls) |
| `language-export` | 342.0 kB | 111.0 kB | **95.7 kB** | `./language` entry: grammar + CM lint + wesl bind linter |
| **`editor-full`** | **491.2 kB** | **158.1 kB** | **134.0 kB** | the `.` entry: the whole `<wgsl-edit>` element |
| `editor-no-grammar` | 447.9 kB | 141.3 kB | **120.4 kB** | editor minus WESL highlighting (lezer-wesl stubbed) |
| `editor-no-autocomplete` | 461.2 kB | 148.5 kB | **126.4 kB** | editor minus autocompletion (in context) |
| `editor-no-search` | 472.4 kB | 152.6 kB | **129.5 kB** | editor minus search (in context) |

The shipped `./bundle` artifact (`dist/wgsl-edit.js`, self-contained, built by
`pnpm --filter wgsl-edit build`), measured separately:

| artifact | raw | gzip | brotli | note |
|---|---|---|---|---|
| `./bundle` **as shipped** | 998.6 kB | 266.0 kB | **215.7 kB** | tsdown does **not** minify this entry |
| `./bundle` terser-minified | 494.0 kB | 159.5 kB | **135.2 kB** | same bytes, minified — matches `editor-full` |
| `GpuValidator` lazy chunk | 0.7 kB | 0.4 kB | **0.3 kB** | already a dynamic-import chunk; not in the main number |

The minified bundle (135.2 kB brotli) lands right on `editor-full` (134.0 kB) —
the 1 kB gap is the nodebug transforms the size harness applies — which
validates the harness against the real build output.

## Key findings

- **A full `<wgsl-edit>` is ~134 kB brotli** (158 kB gzip, 491 kB raw), minified.
  That is ~7.7× wesl-core alone (17.5 kB brotli). The editor, not WESL, is the
  cost.
- **CodeMirror dominates: ~73% of the bundle.** A bare `EditorView`+`EditorState`
  is already **52.5 kB brotli** (39% of the whole), and it is irreducible — it is
  the editor. A `basicSetup`-equivalent feature set is **98.3 kB**. wgsl-edit
  replicates roughly that set, so CodeMirror core+features ≈ ~98 kB of the 134.
- **WESL-specific code is only ~30 kB brotli (~23%):** the grammar (~13.6 kB
  in context) plus the linter (~16.8 kB). Everything else WESL-flavored
  (wesl-fetch, custom-element glue, CSS) is ~5 kB.
- **The published `./bundle` ships unminified.** At 215.7 kB brotli it is **80 kB
  (37%) larger than it needs to be**; minifying it yields 135.2 kB with zero
  feature loss. This is the single biggest, lowest-risk win. (Consumers importing
  `.` run their own bundler/minifier and are unaffected; only the drop-in
  `<script>` `./bundle` ships these bytes as-is.)
- **GPU validation is already lazy and free at load** — `GpuValidator.ts` is a
  `await import(...)` chunk (0.3 kB brotli) and not in the main bundle.

### Attribution of `editor-full` (134.0 kB brotli)

| piece | brotli | how derived |
|---|---|---|
| CodeMirror core (`view`+`state`) | ~52.5 kB | `cm-core` (the floor) |
| CodeMirror features (commands, language, autocomplete, lint, search, folding) | ~46 kB | `cm-basicSetup` 98.3 − core 52.5 |
| WESL grammar (lezer-wesl) | ~13.6 kB | `editor-full` − `editor-no-grammar` |
| WESL linter (wesl parse+bind + CM lint plumbing) | ~16.8 kB | `language-export` − `wesl-syntax` |
| wesl-fetch + custom-element glue + CSS | ~5 kB | residual (`editor-full` − `cm-basicSetup` − grammar − linter) |

Cross-check: `editor-full` 134.0 − `cm-basicSetup` 98.3 = 35.7 kB of WESL/glue,
and grammar 13.6 + linter 16.8 + ~5 glue = 35.4. The pieces reconcile.

### Feature costs: marginal vs in-context

Two different questions, two different numbers:

| feature | marginal over `cm-core` | in-context trim (removed from `editor-full`) |
|---|---|---|
| autocomplete | +20.6 kB | **−7.7 kB** |
| search | +6.7 kB | **−4.5 kB** |
| WESL grammar | (24.4 standalone) | **−13.6 kB** |
| commands | +16.7 kB | — |
| language services | +15.8 kB | — |
| lint plumbing | +7.3 kB | — |

**Marginal-over-core overstates trim savings**, because CM features share
infrastructure — panels, tooltips, rangesets, layer plumbing. Autocomplete
*adds* 20.6 kB to a bare core but only *frees* 7.7 kB when removed from the full
editor, because lint/search keep most of that shared infra alive. Likewise the
standalone `lezer-wesl` (24.4 kB) shrinks to 13.6 kB in context, because the
editor already ships `@lezer/highlight` + `@lezer/common`; only the generated
parse tables and `@lezer/lr`'s deserializer are truly grammar-only. **Use the
in-context column for trim decisions.**

## Trim & lazy-load recommendations

Ordered by value / risk:

1. **Minify the `./bundle` output (≈ −80 kB brotli, no feature loss).** The
   self-contained `dist/wgsl-edit.js` is published unminified. Add `minify: true`
   (or terser) to the bundle entry in `tsdown.config.ts`. Biggest single win,
   touches nobody's behavior.
2. **Lazy-load the WESL linter (≈ −17 kB brotli at load).** The linter — wesl's
   parse+bind path plus CM lint plumbing — is wired into the initial
   `EditorState` synchronously, so every editor pays for it upfront even with
   `lint="off"`. It is the natural next `await import(...)` after
   `GpuValidator`: defer the `wesl`/`createWeslLinter` import to the first lint
   pass. A highlight-only viewer would then never pull wesl's binder.
3. **Offer a build-time "viewer" / feature-flag profile.** For read-only or
   display use cases, dropping optional features compounds: autocomplete
   (−7.7 kB), search (−4.5 kB), lint (≈ part of the −17 kB above). A
   highlight-only viewer (no lint, no autocomplete, no search) is roughly
   `editor-full − ~30 kB ≈ 104 kB brotli`; dropping highlighting too approaches
   the `cm-core` floor (~52 kB) — at which point it is a plain CodeMirror.
4. **Don't chase CodeMirror core.** The 52.5 kB floor is the editor itself; it is
   not trimmable without replacing CodeMirror. It is the dominant cost and the
   honest headline: this package is "CodeMirror + ~30 kB of WESL."

The grammar (−13.6 kB) is real but usually not worth trimming — syntax
highlighting is most of why you'd embed this editor over a `<textarea>`.

## Caveats

- **In-context trims for lint and folding are derived, not stubbed.** The
  linter is entangled with the wesl import, so its ~17 kB comes from the
  `language-export − wesl-syntax` delta rather than an in-editor no-op stub like
  autocomplete/search. The number is a close estimate, not a measured removal.
- **Stub-based variants measure code, not behavior.** `editor-no-grammar` etc.
  bundle a no-op in place of the real module; they confirm what tree-shakes out,
  but the resulting editor would not actually highlight/complete. They are size
  probes, not shippable configs.
- **CodeMirror version drift moves these numbers.** All `@codemirror/*` are
  `^6` ranges; a minor bump can shift the core/feature split. Re-measure rather
  than trusting this table.
- **wesl numbers track trunk.** As in the wgsl-play round, the typed structural
  AST on `mighdoll-main` sets the wesl parse+bind cost; re-measure after wesl
  core changes.
