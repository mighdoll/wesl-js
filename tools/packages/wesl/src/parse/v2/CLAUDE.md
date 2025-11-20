# WESL Parser V2 - Custom Recursive Descent Parser

## Overview

**Parser V2** is a ground-up rewrite of the WESL parser using **custom recursive descent parsing** instead of mini-parse combinators. This directory contains the v2 implementation and related documentation.

**Current Status**: V2 production-ready with 100% test pass rate on all major test suites

## Why V2?

The v1 parser uses mini-parse combinators throughout. While elegant, this approach has limitations:

- **Bundle Size**: mini-parse is ~38KB (27% of the 140KB WESL bundle)
- **Performance**: Combinator overhead in hot paths
- **Control**: Limited ability to customize error messages and parsing behavior
- **Maintenance**: External dependency on mini-parse evolution

**V2 Goals**:
1. Remove mini-parse dependency (~30KB bundle savings)
2. Faster parsing (2-3x expected)
3. Full control over parser behavior
4. Traditional recursive descent approach (easier to understand/maintain)

## Strategy: Parallel Parser with V1 Test Validation

Rather than replacing the parser all at once, we build v2 **alongside v1**, using the existing 440+ tests as an oracle.

**Primary Validation: V1 Tests with useV2Parser Flag**

The main validation strategy is to run the existing V1 tests using the V2 parser:

```typescript
// In TestSetup.ts or vitest.config.ts
weslParserConfig.useV2Parser = true;  // Use V2 parser for all tests

// Tests run normally - they validate output, not AST structure
test("import a transitive struct", () => {
  const result = link(sources);  // Uses V2 parser internally
  expect(result.wgsl).toBe(expectedOutput);
});
```

**Secondary Validation: Parity Tests for AST Structure**

For specific structural validation, parity tests compare v1 and v2 ASTs:

```typescript
test("parser parity", () => {
  const astV1 = parseSrcModule(srcModule);  // v1 (mini-parse)
  const astV2 = parseWeslV2(srcModule);     // v2 (custom)

  expect(semanticElems(astV2)).toEqual(semanticElems(astV1));
});
```

**Benefits**:
- ✅ Continuous validation (existing tests catch regressions immediately)
- ✅ Real-world validation (tests validate output, not just AST structure)
- ✅ Incremental progress (can ship at any milestone)
- ✅ Lower risk (v1 keeps working throughout)
- ✅ Clear feedback (test passes or fails)

## Progress Tracking

### Progress Documents (Convention)

We use `v2-progress-update-N.md` files to track progress updates:

- **v2-progress-update-34.md** - Latest: Fixed vec4f/override/var binding, 630/630 lygia tests
- **v2-progress-update-33.md** - V2 feature-complete, code review phase
- **v2-progress-update-32.md** - Bundle size & performance analysis (2.8x faster, +7% size)
- **v2-progress-update-31.md** - V2 as global default, complete test infrastructure
- Earlier updates: 1-30

Each document includes:
- Session summary and goals
- Changes made and fixes implemented
- Test results
- Investigation findings
- Remaining issues
- Next steps and recommendations

### Current Status

**What's Working**:
- ✅ WeslParserV2 class (foundation)
- ✅ Import statement parsing
- ✅ Declaration parsing (const, var, alias, struct, fn)
- ✅ All statement types (for, while, loop, if, switch, break, continue, discard, continuing)
- ✅ Full expression parsing
- ✅ V2 tests: 524/526 passing (2 skipped - const_assert edge case)
- ✅ ConditionalTranslationCases: 49/49 passing (100%)
- ✅ Lygia shader library: 630/630 passing (100%)
- ✅ Performance: 2.8x faster than V1 (exceeds 2-3x target)
- ✅ Bundle size: +7% overhead (17.7KB vs 16.5KB brotli-compressed)

**See**: Latest progress in [v2-progress-update-34.md](../../v2-progress-update-34.md)

## Architecture

### Core Files in v2/

1. **WeslParserV2.ts** (~190 lines)
   - Main parser class
   - Entry point: `parseWeslV2(srcModule)`
   - Coordinates parsing phases (imports → directives → declarations)

2. **ContentsHelpers.ts** (~130 lines)
   - `openElem()` / `closeElem()` - Manage element stack
   - `coverWithText()` - Fill gaps with TextElems
   - `withContents()` - Convenience wrapper

3. **TEXT_ELEMENT_RULES.md**
   - Documents when v1 creates TextElems
   - Guides v2 implementation to match

### Related Files (Outside v2/)

**Custom Parsers (Phase 2 - Reused by V2)**:
- `ImportParsers.ts` - Import statement parsing
- `AttributeParsers.ts` - @if/@else/@elif attribute parsing
- `DirectiveParsers.ts` - enable/diagnostic/requires directives
- `ConstParsers.ts` - const/alias/var/override declarations
- `FnParsers.ts` - Function declarations
- `ParseUtil.ts` - Core parsing utilities (consume, expect, checkpoint, reset)

**Parser Context**:
- `ParseContext.ts` - Provides scope management, identifier creation
- `WeslStream.ts` - Token stream for parsing

**Tests**:
- `test/ParserV2Parity.test.ts` - Parity tests comparing v1 and v2 ASTs

## Key Design Patterns

### 1. Element Contents Pattern

Most elements use `openElem()`/`closeElem()` to automatically fill gaps with TextElems:

```typescript
function parseConstDecl(stream, ctx, attributes): ConstElem | null {
  const start = stream.checkpoint();

  // Open element for content collection
  openElem(ctx, { kind: "const", contents: [] });

  // Parse child elements - they're added via ctx.addElem()
  const nameDecl = parseTypedDecl(stream, ctx);  // Added to contents
  const expr = parseExpression(stream, ctx);     // Added to contents

  // Close element - fills gaps with TextElems
  const contents = closeElem(ctx, start, stream.checkpoint());

  return { kind: "const", name: nameDecl, value: expr, contents, ... };
}
```

### 2. Exception: FnElem Has No Text Coverage

Function elements **don't use openElem/closeElem** - they build contents manually:

```typescript
// FnElem special case - see TEXT_ELEMENT_RULES.md
const contents = [declIdentElem, ...params];
if (returnType) contents.push(returnType);
contents.push(body);

return { kind: "fn", name: declIdentElem, contents, ... };
```

### 3. Commit Points in Parsing

Parsers use **commit points** to know when to return null vs throw errors:

```typescript
function parseIfAttribute(stream, ctx): IfAttribute | null {
  const pos = stream.checkpoint();

  // NOT committed yet - can backtrack
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "if")) {
    stream.reset(pos);
    return null;
  }

  // COMMIT POINT: We have "@if", must be an if attribute
  expect(stream, "(", "Expected '(' after @if");  // Throws on failure
  const expr = expectExpression(stream, ctx);     // Throws on failure
  expect(stream, ")", "Expected ')' after expression");

  return makeIfAttribute(expr);
}
```

## Future Work

### Before Merge

1. **Grammar audit against WGSL spec**
   - Extract productions from WGSL spec grammar
   - Map each production to our parser functions
   - Document coverage gaps
   - Can start now while CTS automation is in progress

2. **Test with CTS** (requires upstream infrastructure)
   - Prototype works but not yet automatable
   - Will validate parser against WGSL spec compliance
   - Use to verify grammar audit findings

3. **Test with bevy_wgsl** (requires upstream setup)
   - Real-world shader library validation
   - Performance benchmarking with complex shaders

4. **Code review for improvements**
   - DRY opportunities across parsers
   - Clarity and naming improvements
   - Architectural cleanups
   - Potential bundle size reductions

### After Merge

5. **Remove mini-parse dependency and V1 code**
   - Delete WeslGrammar.ts and V1-specific files
   - Remove mini-parse from package.json
   - Target bundle: ~16.5KB (match V1 size)

6. **Design new Reflection API for V2**
   - Clean-slate design based on V2 architecture
   - V1 Reflection.test.ts excluded (obsolete API)
   - Implement when user needs are clearer

### Long-Term (Architectural)

7. **Text → Comment Element Conversion**
   - Replace TextElems with CommentElems (preserve only comments)
   - Regenerate keywords/punctuation/whitespace during emission
   - Benefits: ~35% smaller AST, better tooling support
   - See: [COMMENT_POSITIONING_AND_VALIDATION.md](../../COMMENT_POSITIONING_AND_VALIDATION.md)

## Historical Context

The V2 parser project evolved through multiple phases:

**Phase 1-2**: Custom parsers for imports/attributes with mini-parse adapter (complete)
**Phase 3**: Multiple attempts at piecemeal replacement revealed collection system is foundational
**V2 Approach**: Build complete parser alongside V1, use tests as oracle

**Key Documents**:
- [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md) - V2 parallel parser plan
- [Custom-Parser.md](../Custom-Parser.md) - Phase 1-2 hybrid approach
- [Bundle-Analysis.md](../Bundle-Analysis.md) - Original bundle measurements (pre-V2)

**Original Bundle Analysis** (historical):
- WESL total: ~140KB uncompressed
- mini-parse: ~38KB (27% of bundle)
- Actual V2 results: 17.7KB brotli-compressed (+7% vs V1)

## Testing Strategy

### Running Tests

From the `tools/packages/wesl` directory, use these commands:

```bash
# Run V1 tests only (pristine, excludes all V2-specific tests)
bb test:v1

# Run V2 tests only (includes all V2-specific tests)
bb test:v2

# Run both V1 and V2 in parallel (dual parser mode)
bb test
```

**Test Counts**:
- `bb test:v1`: ~411 tests (matches main branch exactly, includes BulkTests)
- `bb test:v2`: ~551 tests (includes V2-specific tests + BulkTests)
- `bb test`: ~962 tests total (runs most tests twice, once with each parser)

**V2-Specific Tests** (excluded from V1 mode):
- ParserV2Parity.test.ts - AST structure comparison
- ImportCasesV2.test.ts - V2 import validation
- LinkerV2.test.ts - V2 linker validation
- ScopeWESLV2.test.ts - V2 scope validation
- CompareV1V2.test.ts - Debug comparison tool
- DebugImportBinding.test.ts - Debug investigation tool
- ParseContext.test.ts - V2 infrastructure tests

### V1 Tests with useV2Parser (Primary Validation)

The **primary validation strategy** is to run existing V1 tests using the V2 parser. These tests validate the end-to-end pipeline (parse → bind → emit) and ensure V2 produces correct WGSL output:

```typescript
// In test setup or config
weslParserConfig.useV2Parser = true;

// Existing tests run with V2 parser
test("import a transitive struct", () => {
  const result = link(sources);  // Internally uses V2 parser
  expect(result.wgsl).toBe(expectedOutput);  // Validates final output
});
```

**Why this is primary**:
- ✅ Tests real-world usage (parse → bind → emit pipeline)
- ✅ Validates correctness of output, not just AST structure
- ✅ Catches integration issues between parser and linker
- ✅ Tests already known good (440+ tests from V1)
- ✅ No need to write new test expectations

**Current Results**:
- V2 tests: 524/526 passing (2 skipped)
- ConditionalTranslationCases: 49/49 passing (100%)
- Lygia shader library: 630/630 passing (100%)

### Parity Tests (Secondary Validation)

For specific AST structure validation, parity tests compare v1 and v2 ASTs:

```typescript
// test/ParserV2Parity.test.ts
test("parse: const x = 5;", () => {
  const src = "const x = 5;";
  const astV1 = parseSrcModule({ src, name: "test.wgsl" });
  const astV2 = parseWeslV2({ src, name: "test.wgsl" });

  // Filter out TextElems (whitespace handling may differ)
  const v1Semantic = filterSemanticElems(astV1);
  const v2Semantic = filterSemanticElems(astV2);

  expect(v2Semantic).toEqual(v1Semantic);
});
```

**Why filter TextElems?** V1 creates TextElems during parsing, v2 creates them in closeElem(). Semantic structure must match, but exact TextElem boundaries may differ.

### Existing Tests (Regression Prevention)

All 456 existing tests must pass throughout v2 development. These tests validate the entire pipeline (parse → bind → emit).

## Common Patterns & Utilities

### ParseUtil Functions

From `../ParseUtil.ts`:

```typescript
// Try to consume - returns null on failure
consume(stream, "const")

// Consume or throw - use after commit point
expect(stream, "=", "Expected '=' after name")

// Consume by token kind
consumeKind(stream, "word")
expectKind(stream, "word", "Expected identifier")

// Backtracking
const pos = stream.checkpoint()
stream.reset(pos)
```

### ParseContext Methods

From `../ParseContext.ts`:

```typescript
ctx.currentScope()           // Get current scope
ctx.pushScope("block")       // Create new scope
ctx.popScope()               // Exit scope

ctx.createDeclIdent(name, span, isGlobal)  // Create declaration
ctx.createRefIdent(name, span)              // Create reference
ctx.saveIdent(ident)                        // Register in scope

ctx.addElem(elem)            // Add to open element's contents
```

## Current Focus

V2 is **production-ready** with all major test suites at 100%. The parser is feature-complete with:

1. **Full Test Coverage** ✅
   - V2 tests: 524/526 passing
   - ConditionalTranslationCases: 49/49 passing (100%)
   - Lygia shader library: 630/630 passing (100%)
   - V1 tests: 409/411 passing (no regressions)

2. **Performance & Size Validated** ✅
   - 2.8x faster than V1 (exceeds 2-3x target)
   - +7% bundle size overhead (17.7KB vs 16.5KB)

3. **Remaining Work**
   - 1 skipped test: "const_asserts in used modules are included"
   - Eventually: Remove mini-parse dependency and V1 code

**See latest progress**: [v2-progress-update-34.md](../../v2-progress-update-34.md)

## References

### Project Documentation

- [CLAUDE.md](../CLAUDE.md) - Parser architecture guide (v1 combinator approach)
- [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md) - V2 parallel parser plan (historical)
- [v2-progress-update-34.md](../../v2-progress-update-34.md) - Latest progress report ⭐
- [TEXT_ELEMENT_RULES.md](./TEXT_ELEMENT_RULES.md) - TextElem generation rules ⭐
- [COMMENT_POSITIONING_AND_VALIDATION.md](../../COMMENT_POSITIONING_AND_VALIDATION.md) - Future: text → comment conversion ⭐

### Historical Documents (Obsolete but Informative)

- [Custom-Parser.md](../Custom-Parser.md) - Phase 1-2 hybrid approach
- [Phase3-Realistic-Roadmap.md](../Phase3-Realistic-Roadmap.md) - Early Phase 3 plan
- [Custom-Parser-Phase3.md](../Custom-Parser-Phase3.md) - Stepwise replacement attempt
- [Custom-Parser-Phase3-Revised.md](../Custom-Parser-Phase3-Revised.md) - ParseContext foundation
- [Custom-Parser-Recommendation.md](../Custom-Parser-Recommendation.md) - Should we continue?
- [Bundle-Analysis.md](../Bundle-Analysis.md) - Bundle size measurements

### Related Code

- [../../ParseWESL.ts](../../ParseWESL.ts) - V1 parser entry point
- [../../AbstractElems.ts](../../AbstractElems.ts) - AST element types
- [../../Scope.ts](../../Scope.ts) - Scope and identifier types
- [../WeslGrammar.ts](../WeslGrammar.ts) - V1 mini-parse grammar (to be replaced)

### Reference Implementations (for Tint/Naga parity checks)

- **Tint (Dawn)**: `~/wesl/dawn` - Google's WGSL compiler
- **Naga (wgpu)**: `~/wesl/wgpu` - Rust WGSL compiler in wgpu
- Use for verifying template disambiguation, precedence, and lexer behavior matches spec implementations

## Tips for Future Agents

### Understanding the Codebase

1. **Start with test files** - They show expected behavior
2. **Read v2-progress-update-9.md** - Latest progress and current issues
3. **Study TEXT_ELEMENT_RULES.md** - Critical for AST compatibility
4. **Check COMMENT_POSITIONING_AND_VALIDATION.md** - Future enhancement plans

### Making Changes

**CRITICAL: Keep V1 Tests Passing**

⚠️ **EVERY COMMIT MUST MAINTAIN V1 AT 100% PASS RATE** ⚠️

V1 is the production parser. V2 changes must NEVER break V1. Before committing:

```bash
# REQUIRED before every commit
V1_ONLY=true bb test --dangerouslyDisableSandbox

# Must see: Tests 409 passed | 2 skipped (411)
# Any failures = DO NOT COMMIT
```

**Why V1 can break:**
- Changes to shared code (LowerAndEmit, BindIdents, etc.)
- AST structure differences between V1 and V2
- Example: Commit b7e0c1b2 broke 68 V1 tests by adding `emitAttributes()` for V2

**If you break V1:**
1. Add detection logic to handle both V1 and V2 AST formats
2. See LowerAndEmit.ts lines 113-120 and 169-177 for detection pattern
3. Pattern: `const attrsInContents = e.contents[0]?.kind === "attribute"`
4. See v2-progress-update-10.md "Architectural Decision" section for full explanation

**Development workflow:**

1. **Run V2 tests frequently** - Use `V2_ONLY=true bb test` to validate V2 changes
2. **Run V1 tests before commit** - Use `V1_ONLY=true bb test --dangerouslyDisableSandbox` (REQUIRED)
3. **Always run parity tests** - They catch AST divergence immediately (`bb test ParserV2Parity`)
4. **Use openElem/closeElem** - Unless it's FnElem (see TEXT_ELEMENT_RULES.md)
5. **Follow commit point pattern** - Return null before commit, throw after
6. **Add tests for each construct** - Parity test + position verification + stress test

**Why `--dangerouslyDisableSandbox` for V1 tests?**

V1 tests must run outside the sandbox because:
- BulkTests clones git repositories and needs filesystem write access beyond sandbox restrictions
- The sandbox blocks git operations on `.git/index.lock` files
- V1 baseline is 409/411 passing with BulkTests included
- Running in sandbox will show failures due to git permission errors, not code issues

**Test Commands Reference**:
```bash
# V2 tests (can run in sandbox)
V2_ONLY=true bb test

# V1 tests (MUST run outside sandbox)
V1_ONLY=true bb test --dangerouslyDisableSandbox

# Expected V1 baseline: 409 passed | 2 skipped (411)
# Expected V2 baseline: See latest v2-progress-update-*.md
```

### Testing with Lygia

The [lygia](https://lygia.xyz) shader library provides real-world validation of the V2 parser. It's located at `~/wesl/lygia` (sibling to the wesl-js repo).

**Setup**: Lygia's `package.json` uses pnpm overrides to link directly to our wesl-js sources:
```json
"pnpm": {
  "overrides": {
    "wesl-link": "link:../worktrees/custom-parser/tools/packages/wesl-link",
    "wesl-packager": "link:../worktrees/custom-parser/tools/packages/wesl-packager",
    "wesl-test": "link:../worktrees/custom-parser/tools/packages/wesl-test"
  }
}
```

**No build needed**: Changes to wesl source files are picked up immediately - no `pnpm install` or build step required.

**Running tests**:
```bash
cd ~/wesl/lygia

# Run all lygia tests (must run outside sandbox)
pnpm test --run

# Run specific test pattern
pnpm test -- -t "random" --run

# Expected: 630/630 passing (100%)
```

**Note**: Must run with `--dangerouslyDisableSandbox` or outside Claude Code sandbox due to vite temp file permissions.

**Current status**: 630/630 tests passing (100%). All lygia tests pass with V2!

### Debugging Parity Failures

1. **Check TextElems first** - Filter them out, compare semantic only
2. **Compare element by element** - Use `.toMatchInlineSnapshot()` to see structure
3. **Check spans (start/end)** - Incorrect spans create wrong TextElems
4. **Verify scope parent links** - Scope tree must match v1

### Common Pitfalls

- ❌ Forgetting to call `openElem()` before parsing children
- ❌ Using `openElem()` for FnElem (special case - see rules)
- ❌ Not checking for commit point (throw too early or return null too late)
- ❌ Comparing ASTs with TextElems included (filter them first)
- ❌ Incorrect span boundaries (creates wrong text coverage)

## Success Metrics

### Current Achievement ✅

- [x] V2 parser compiles and runs
- [x] All declaration parsing works (const, var, alias, struct, fn)
- [x] All statement types implemented (for, while, loop, if, switch, break, continue, discard, continuing)
- [x] Full expression parsing with scoping
- [x] V1 tests: 100% passing (409/411) - **NO REGRESSIONS**
- [x] V2 tests: 524/526 passing (2 skipped - const_assert edge case)
- [x] ConditionalTranslationCases: 100% passing (49/49) 🎉
- [x] Lygia shader library: 100% passing (630/630) 🎉
- [x] Performance benchmarking: 2.8x faster (exceeds 2-3x target) ✅
- [x] Bundle size validation: +7% overhead (17.7KB vs 16.5KB) ✅
- [x] Function parameter attributes working
- [x] V1/V2 AST divergence handled cleanly in emit layer

### Remaining Work

- [ ] 1 skipped test: "const_asserts in used modules are included" (both V1 and V2)
- [ ] See **Future Work** section above for comprehensive list

## Getting Help

If stuck or need context:

1. **Run tests to understand current state** - `bb test:v2` shows what's working
2. Read the latest progress update (v2-progress-update-34.md)
3. Check the parity tests for examples (`bb test ParserV2Parity`)
4. Study v1 grammar files to understand expected AST
5. Look at Phase 2 custom parsers for patterns
6. Consult TEXT_ELEMENT_RULES.md for contents array rules
7. Review COMMENT_POSITIONING_AND_VALIDATION.md for future enhancements

## License

Dual-licensed under MIT or Apache-2.0 (see project root)

---

**Last Updated**: 2025-11-19
**Current Status**: V2 production-ready - all major test suites at 100%
**Test Results**: V2 524/526 | ConditionalTranslation 49/49 | Lygia 630/630
**Performance**: 2.8x faster than V1 | Bundle: +7% overhead (17.7KB vs 16.5KB)
**Next**: Grammar audit, CTS testing, bevy_wgsl testing, code review, then merge (see Future Work section)
**See**: v2-progress-update-34.md for latest progress
