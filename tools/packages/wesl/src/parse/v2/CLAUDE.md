# WESL Parser V2 - Custom Recursive Descent Parser

## Overview

**Parser V2** is a ground-up rewrite of the WESL parser using **custom recursive descent parsing** instead of mini-parse combinators. This directory contains the v2 implementation and related documentation.

**Current Status**: V2 actively in use, 87.5%+ of ImportCasesV2 passing, LinkerV2 and ScopeWESLV2 at 100%

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

- **v2-progress-update-9.md** - Latest: struct member type ref binding investigation
- **v2-progress-update-8.md** - ImportCasesV2 at 87.5% (35/40 passing)
- **v2-progress-update-7.md** - Scope structure matching
- **v2-progress-update-6.md** - Qualified names and 55% achieved
- **v2-progress-update-5.md** - LinkerV2 100% achievement!
- Earlier updates: 2, 3, 4

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
- ✅ LinkerV2: 12/12 tests passing (100%)
- ✅ ImportCasesV2: 35+/40 tests passing (87.5%+)
- ✅ ScopeWESLV2: 11/11 tests passing (100%)

**See**: Latest progress in [v2-progress-update-9.md](../../v2-progress-update-9.md)

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

## Roadmap

### Current Implementation (V2 in Progress)

Based on recent progress updates, V2 is **much further along** than the original 9-week plan suggested:

**Completed**:
- ✅ Foundation (imports, attributes, directives)
- ✅ Declaration parsing (const, var, alias, struct, fn)
- ✅ Scope management
- ✅ Type references
- ✅ LinkerV2: 100% passing
- ✅ ScopeWESLV2: 100% passing
- ✅ ImportCasesV2: 87.5%+ passing

**Status**: V2 is actively being used and tested. The focus has shifted from "building V2" to "fixing remaining edge cases" in the existing V2 implementation.

**See**: Latest status in [v2-progress-update-9.md](../../v2-progress-update-9.md)

### Original Roadmap (Obsolete - Historical Reference)

The original plan was a 9-week incremental build:

| Week | Work | Coverage | Status |
|------|------|----------|--------|
| 1 | Foundation + imports | 20% | ✅ Complete |
| 2-9 | ... | ... | 🔄 Overtaken by actual progress |

**Note**: The actual implementation progressed much faster than planned. See progress updates for real timeline.

**Historical Plan**: [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md)

## Historical Context

### Phase History

The custom parser effort has evolved through multiple phases:

**Phase 1-2** (Complete ✅):
- Custom parsers for imports and attributes
- Adapter layer to integrate with mini-parse
- Hybrid approach working well
- See: [Custom-Parser.md](../Custom-Parser.md)

**Phase 3 Analysis** (Multiple attempts):
- [Phase3-Realistic-Roadmap.md](../Phase3-Realistic-Roadmap.md) - Initial phased approach (obsolete)
- [Custom-Parser-Phase3.md](../Custom-Parser-Phase3.md) - Stepwise replacement attempt (obsolete)
- [Custom-Parser-Phase3-Revised.md](../Custom-Parser-Phase3-Revised.md) - ParseContext foundation (obsolete)
- [Custom-Parser-Recommendation.md](../Custom-Parser-Recommendation.md) - Reality check (obsolete)

**Key Insight from Phase 3**: Cannot replace grammar piecemeal - the collection system is foundational. Must build new parser from scratch.

**Current Approach** (V2 Parallel Parser):
- Build complete v2 parser alongside v1
- Use tests as oracle for correctness
- Incremental grammar coverage (20% → 100%)
- See: [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md)

### Bundle Analysis

From [Bundle-Analysis.md](../Bundle-Analysis.md):
- WESL total: ~140KB
- mini-parse: ~38KB (27% of bundle)
- Expected savings from removal: ~25-30KB

**Decision**: 27% is significant, but requires 4-6 months effort. Parallel parser approach (9 weeks) is more realistic.

## Future Work: Text → Comment Element Conversion

There is ongoing discussion about replacing TextElem nodes with CommentElem nodes to reduce bundle size and improve AST semantic clarity.

**Current State (V1 & V2)**:
- Comments are embedded in TextElem nodes
- TextElems cover all unparsed source (keywords, punctuation, whitespace, comments)
- Comments have no semantic meaning in the AST

**Proposed Enhancement**:
- Extract comments as separate CommentElem nodes
- TextElems only for keywords/punctuation/whitespace
- ~35% smaller AST (fewer text elements)
- Better tooling support (IDE hover, formatting, etc.)

**Comment Positioning Model**:
1. **Leading** - Block comments before element
2. **Trailing** - Same-line comments after element
3. **Inner** - Comments between children (with index)
4. **Detached** - Module-level comments between declarations

**Status**: Analysis complete, implementation timing TBD

**See**: [COMMENT_POSITIONING_AND_VALIDATION.md](../../COMMENT_POSITIONING_AND_VALIDATION.md) for full discussion and design

**Decision Points**:
- Should V1 be migrated? (Recommendation: No - too risky for stable code)
- When to implement in V2? (After V2 core is complete and stable)
- Validation strategy? (stripWesl comparison + semantic comparison)

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
- LinkerV2: 12/12 passing (100%)
- ImportCasesV2: 35+/40 passing (87.5%+)
- ScopeWESLV2: 11/11 passing (100%)

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

V2 development has progressed well beyond initial milestones. Current work focuses on:

1. **Fixing Remaining Edge Cases** (87.5% → 100% on ImportCasesV2)
   - Struct member type reference binding
   - Alias declaration emission
   - Edge cases in complex imports

2. **Maintaining Test Coverage**
   - LinkerV2: 100% (12/12 passing) ✅
   - ScopeWESLV2: 100% (11/11 passing) ✅
   - ImportCasesV2: 87.5%+ (35+/40 passing) 🔄

**See latest progress**: [v2-progress-update-9.md](../../v2-progress-update-9.md)

## References

### Project Documentation

- [CLAUDE.md](../CLAUDE.md) - Parser architecture guide (v1 combinator approach)
- [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md) - V2 parallel parser plan (historical)
- [v2-progress-update-9.md](../../v2-progress-update-9.md) - Latest progress report ⭐
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

## Tips for Future Agents

### Understanding the Codebase

1. **Start with test files** - They show expected behavior
2. **Read v2-progress-update-9.md** - Latest progress and current issues
3. **Study TEXT_ELEMENT_RULES.md** - Critical for AST compatibility
4. **Check COMMENT_POSITIONING_AND_VALIDATION.md** - Future enhancement plans

### Making Changes

1. **Run V2 tests frequently** - Use `bb test:v2` to validate V2 changes
2. **Always run parity tests** - They catch AST divergence immediately (`bb test ParserV2Parity`)
3. **Use openElem/closeElem** - Unless it's FnElem (see TEXT_ELEMENT_RULES.md)
4. **Follow commit point pattern** - Return null before commit, throw after
5. **Add tests for each construct** - Parity test + position verification + stress test
6. **Keep V1 pristine** - V1 tests (`bb test:v1`) should always match main branch

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
- [x] LinkerV2: 100% passing (12/12)
- [x] ScopeWESLV2: 100% passing (11/11)
- [x] ImportCasesV2: 87.5%+ passing (35+/40)
- [x] No regressions in V1 tests

### Remaining Work (to 100%)

- [ ] Fix remaining 4-5 ImportCasesV2 edge cases
- [ ] Validate all bulk tests (76 Unity shader tests)
- [ ] Performance benchmarking (target: 2-3x faster)
- [ ] Bundle size validation (target: ~110KB, down from 140KB)
- [ ] Eventually: Remove mini-parse dependency and V1 code

## Getting Help

If stuck or need context:

1. **Run tests to understand current state** - `bb test:v2` shows what's working
2. Read the latest progress update (v2-progress-update-9.md)
3. Check the parity tests for examples (`bb test ParserV2Parity`)
4. Study v1 grammar files to understand expected AST
5. Look at Phase 2 custom parsers for patterns
6. Consult TEXT_ELEMENT_RULES.md for contents array rules
7. Review COMMENT_POSITIONING_AND_VALIDATION.md for future enhancements

## License

Dual-licensed under MIT or Apache-2.0 (see project root)

---

**Last Updated**: 2025-11-13
**Current Status**: V2 actively in use, 87.5%+ tests passing
**Next Focus**: Fix remaining edge cases, reach 100% on ImportCasesV2
**See**: [v2-progress-update-9.md](../../v2-progress-update-9.md) for latest details
