# wgsl-play / wesl runtime package-size analysis

Status: exploratory notes, June 2026. Branch `claude/wgsl-play-package-size-q6un65`,
on top of `mighdoll-main` (the trunk where do blocks are interpreted).

Goal: understand how big a shipped `wgsl-play` (and smaller do-block-capable
runtimes) needs to be, and map the design directions for shrinking it — so we
can pick one once do blocks and their example libraries mature. **No build is
planned yet**; this is the measurement + design groundwork.

## How to reproduce

```
pnpm --filter wgsl-play build:size
```

Runs `packages/wgsl-play/scripts/size-check.ts`. It bundles each variant with
vite (es lib, terser minify) applying the same production transforms wesl ships
in `vite.nodebug.config.ts` (debug/validation stripped, parser error-context
removed), then reports raw / gzip / brotli. The `wesl-core` row reproduces
wesl's own `pnpm --filter wesl build:size`, which validates the methodology.

## Measurements (current branch)

| variant | raw | gzip | brotli | what |
|---|---|---|---|---|
| `do-interpreter` | 16.5 kB | 6.6 kB | **5.9 kB** | the do-block CPU interpreter alone (executor residue) |
| `relink-no-parser` | 27.9 kB | 9.7 kB | **8.7 kB** | bind + emit + conditions, parser stubbed (Direction-A floor) |
| `wesl-core` | 62.4 kB | 19.4 kB | **17.5 kB** | `link` — parse + link baseline |
| `core+do-interpreter` | 72.9 kB | 23.1 kB | **20.7 kB** | link + interpreter, no UI (generic do-block runtime, `?link` model) |
| `do-blocks-runtime` | 89.6 kB | 28.1 kB | **25.1 kB** | core + wgsl-play's headless GPU compute/render pipeline, no UI |
| `wgsl-play-full` | 128.8 kB | 40.1 kB | **35.7 kB** | full custom element incl. preact UI |

Deltas vs `wesl-core` (brotli): do-blocks-runtime +7.7 kB (44%); wgsl-play-full
+18.3 kB (105%); core+do-interpreter +3.2 kB (18%); do-interpreter −11.6 kB
(66% smaller); relink-no-parser −8.7 kB (50% smaller).

Note: an earlier round measured ~1.8 kB less across the board; the **typed
structural AST** landing on trunk enlarged core from 15.7 → 17.5 kB brotli.

## Key findings

- **wesl core compressed ≈ 16 kB** was the original estimate; it's now **17.5 kB
  brotli** (19.4 kB gzip) after the typed AST.
- **The parser is ~half the core.** `parse/` is ~3,500 LOC vs ~2,400 for the
  linker. Stubbing the grammar so it tree-shakes drops core to **8.7 kB brotli**
  (`relink-no-parser`). Dropping the parser is by far the biggest single lever.
- **The do-block interpreter is small: 5.9 kB standalone, +3.2 kB marginal** on a
  runtime that already links (it shares the reflect/GPU deps with `link`).
- **The preact UI costs ~10 kB** (wgsl-play-full 35.7 − do-blocks-runtime 25.1).
- **Generic do-block runtime, no UI ≈ 20.7 kB** (`core+do-interpreter`) — and
  it's *smaller* than wgsl-play's render path (25.1 kB) because it skips the
  canvas/render machinery.

## Architecture facts that make "drop the parser" feasible

- The pipeline already separates parse from link. `link()` parses, then calls
  `linkRegistry()` — a public entry **designed to re-link already-parsed modules**
  with different conditions. The design notes in `Linker.ts` spell out the
  re-link flow: clear bind-mutated ident fields, re-bind, re-emit. No re-parse.
- **Live conditions need only bind + emit.** `Conditions.ts` evaluates
  `@if/@elif/@else` against AST attributes at bind time (which decl an ident
  resolves to) and emit time (which elements survive). The parser isn't involved
  in toggling conditions.
- **One parser coupling remains in the bind/emit path:** `BindIdents.ts:448`
  calls `parseSrcModule(...)` to parse virtual/runtime-generated module text
  (e.g. the `constants` virtual lib). Severable for a built app that bakes
  constants at build time.
- **Emit is span-based.** `LowerAndEmit` copies slices of the original source
  (`addCopy(start,end)`, `srcModule.src.slice(start,end)`). So a no-parser
  runtime must ship a **pre-parsed AST + source text** as data, and a runtime
  **rehydrator** for the cyclic scope/ident graph. The cost moves from code to
  data + a deserializer (which adds some code back, partially offsetting).
- **The interpreter is nearly standalone.** `DoInterpreter.ts` imports types only
  from `wesl`, plus `recordComputePass` (wesl-gpu), `classifyEntryPoints`
  (wesl-reflect), and a tiny `declsOfKind`/`findAnnotation`. It walks the typed
  AST directly; it does **not** pull bind/emit. So an interpreter-only runtime is
  viable when the shader text is supplied pre-assembled.

## Runtime design spectrum

The question is what stays at runtime after the build fixes everything knowable.
Both "middle ground" rows below drop the parser (the shared ~8–9 kB win); they
differ in how conditions are handled and whether do blocks are present.

| design | parser | bind/emit | interpreter | do blocks | conditions | code (brotli) |
|---|---|---|---|---|---|---|
| `?static` (exists) | ✗ | ✗ | ✗ | ✗ | none (baked) | ~0 |
| **MG2** — reassemble fragments by condition | ✗ | ✗ | ✗ | ✗ | enumerable | ~0 + WGSL data |
| **Hybrid** — assembled fragments + interpret do blocks | ✗ | ✗ | ✓ | ✓ | enumerable | ~6 kB + WGSL data |
| **MG1** — pre-parsed AST + bind/emit + interpreter | ✗ | ✓ | ✓ | ✓ | arbitrary | ~12 kB + AST/src data |
| `?link` (today) | ✓ | ✓ | ✓ | ✓ | arbitrary | ~21 kB |

- **The fork between MG1 and MG2 is the presence of do blocks.** Do blocks force
  a runtime executor (data-dependent dispatch — e.g. radix passes, recursive
  `reduce` — can't be enumerated into static fragments), so anything with do
  blocks lands in MG1 or the Hybrid. Conditions-only lands in MG2.
- **MG1** is fully general: ~8.7 kB (bind+emit+conditions floor) + ~3.2 kB
  interpreter ≈ ~12 kB code, plus the AST rehydrator and AST/source payload.
- **MG2** is a specialized artifact: the build enumerates the dynamic condition
  space, runs the *real* linker per combo, diffs the outputs, and emits a
  template + holes + a tiny JS assembler. ~0 runtime wesl code.
- **Hybrid** is the smallest do-block-capable runtime: handle conditions
  MG2-style (pre-assembled, compiled to pipelines at startup) and interpret do
  blocks over those pipelines. Drops bind/emit too → ~6 kB. Natural target for
  "a do-block library in a small built app with a few feature flags."

## Specialization verdict (transpiling do blocks → JS)

**Possible and broadly applicable, but too marginal to be worth it for do blocks
specifically.** The interpreter is only +3.2 kB marginal, and the orchestration
language is tiny (scalar-int locals, if/for/while/loop, recursion, calls that
resolve to a compute dispatch or another do block). Transpiling to JS at build
would save ~3 kB of shipped code in exchange for building and maintaining a
WGSL→JS transpiler that must mirror the interpreter's semantics (u32/i32
wrapping, scope/shadowing, depth/iteration guards, call resolution) forever.
Bad trade on size grounds.

- It is **not "too rare"** — do-block bodies are build-time-known and
  data-dependent loops transpile fine (compile the loop, don't unroll). It's
  "too cheap to bother replacing."
- The real leverage is elsewhere: **drop the parser** (~8–9 kB, Direction A) and
  **`?static`** (the whole runtime). Do-block transpile is a ~3 kB last-mile.
- Where a transpiler *would* earn its keep is **performance, not size**: a
  per-frame `do frame()` or a tight loop pays interpreter overhead — fresh `Map`
  per scope, and `break`/`continue`/`return` implemented as thrown signals. If
  profiling ever shows orchestration is hot (unlikely — GPU dispatch usually
  dominates), transpiling to native JS control flow is the fix.

## Caveats

- **MG2 / Hybrid depend on conditions having *localized* effects.** Fragments are
  derived by diffing real link outputs (not source-splicing — a condition can
  shift mangling/binding globally). Local diff → clean template + holes. Global
  diff → degrades to a per-combo string table (still no parser, but bigger data).
- **MG1 pays in data, not code** — span-based emit means shipping AST + source
  text + a rehydrator for the cyclic scope graph.
- **The interpreter is early.** Values are `number` only; no struct/uniform field
  access yet (`do frame(u: Uniforms, …)` not really supported); calling user WGSL
  functions is explicitly rejected. As it grows toward vec/struct/float the
  orchestration language stays small (it's glue, not compute), so the conclusions
  hold — *unless* do blocks evolve into a place for heavy CPU math, which would
  flip the transpile calculus to a speed win.

## When to revisit

Wait for the do-block implementation and example libraries to mature. Then:

1. If shipping small built apps with do blocks + a few feature flags → prototype
   the **Hybrid** (~6 kB target); measure with a real assembler instead of a stub.
2. If apps need arbitrary runtime re-linking with do blocks → **MG1**; the first
   real work is the AST serializer/rehydrator across the build→runtime boundary.
3. Only build a do-block **transpiler** if profiling shows orchestration is hot,
   or for an absolute-minimum static build where the do-block AST is the last
   general-purpose thing standing.
