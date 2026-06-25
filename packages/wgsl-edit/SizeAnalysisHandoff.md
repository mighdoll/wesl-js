# Handoff: wgsl-edit package-size analysis

Paste this as the opening prompt for a fresh session. Continues the size work
done for `wgsl-play`.

## Context

- Repo `mighdoll/wesl-js`. Prior work is on branch
  `claude/wgsl-play-package-size-q6un65` (pushed). Start a **new branch off
  `origin/mighdoll-main`** for wgsl-edit (any name).
- Read **`packages/wgsl-play/PackageSize.md`** first — full methodology, data
  table, and the runtime design framing from the wgsl-play round.

## Goal

Measure how big a built `wgsl-edit` package is, and what each piece costs.
Unlike wgsl-play (where parser-vs-linker was the story), wgsl-edit is a
**CodeMirror 6** editor, so CodeMirror will likely dominate and the interesting
question is what's trimmable (lint / autocomplete / search / highlighting).

## Reuse the tooling

`packages/wgsl-play/scripts/size-check.ts` is the measurement harness — vite
es-lib bundle, terser minify, gzip + brotli, with wesl's `nodebug` production
transforms applied so numbers are comparable and reproduce wesl's own
`pnpm --filter wesl build:size`. Adapt/copy it for wgsl-edit (or parameterize it
by package). It already handles `?inline` css / `?raw` svg via a virtual-id
plugin, and has a parser-stub trick for tree-shaking experiments.

## wgsl-edit specifics

- CodeMirror-6 editor. Deps: `@codemirror/{state,view,commands,language,
  autocomplete,lint,search}`, `codemirror`, `@lezer/highlight`, `lezer-wesl`
  (workspace grammar), `wesl`, `wesl-fetch`; preact via `./jsx-preact`.
- Exports: `.` (index.ts), `./element` (WgslEdit.ts), `./language`
  (Language.ts), `./autosave`, `./jsx-preact`, `./bundle`
  (self-contained `dist/wgsl-edit.js`, like wgsl-play).
- Build: `tsdown` (`pnpm --filter wgsl-edit build`). Also measure the existing
  `./bundle` output.
- Suggested variants: full editor; editor minus `lezer-wesl` highlighting;
  `./language` alone; bare CodeMirror baseline (state+view). Goal: attribute the
  size to CodeMirror core vs each feature vs the wesl grammar.

## Environment gotchas (carry these forward)

- Trunk is **`origin/mighdoll-main`**, NOT `origin/main` (main is ~3400 commits
  stale). Branch/rebase off mighdoll-main.
- `pnpm install` preinstall hook tries to clone `webgpu-tools/{cts,
  wesl-testsuite}` submodules and **403s** (org egress policy). Install still
  populates `node_modules` despite the non-zero exit — ignore it.
- The typed-AST change on trunk made wesl numbers ~1.8 kB bigger than the first
  round; always re-measure, don't trust stale figures.
- No PR is open on the wgsl-play branch (per default — open only if asked).

## Deliverables (mirror the wgsl-play round)

1. A size-check script for wgsl-edit (committed, runnable via a `build:size`
   script).
2. A `packages/wgsl-edit/PackageSize.md` with methodology, data table, findings,
   and any trim/lazy-load recommendations.
