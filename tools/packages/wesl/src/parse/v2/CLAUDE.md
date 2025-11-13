# WESL Parser V2 - Custom Recursive Descent Parser

## Overview

**Parser V2** is a ground-up rewrite of the WESL parser using **custom recursive descent parsing** instead of mini-parse combinators. This directory contains the v2 implementation and related documentation.

**Current Status**: Week 1 complete ✅ (Import statements working, parity tests passing)

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

## Strategy: Parallel Parser with Parity Testing

Rather than replacing the parser all at once, we build v2 **alongside v1**, using the existing 440+ tests as an oracle:

```typescript
// Both parsers run, ASTs must match
test("parser parity", () => {
  const astV1 = parseSrcModule(srcModule);  // v1 (mini-parse)
  const astV2 = parseWeslV2(srcModule);     // v2 (custom)

  expect(semanticElems(astV2)).toEqual(semanticElems(astV1));
});
```

**Benefits**:
- ✅ Continuous validation (tests catch divergence immediately)
- ✅ Incremental progress (can ship at any milestone)
- ✅ Lower risk (v1 keeps working throughout)
- ✅ Clear feedback (AST match or doesn't)

## Progress Tracking

### Progress Documents (Convention)

We use `Week{N}-Complete.md` files to track major milestones:

- **Week1-Complete.md** - Foundation + import parsing ✅
- **Week2-Complete.md** - Const declarations (future)
- **Week3-Complete.md** - Alias, var, override (future)
- etc.

Each document includes:
- Summary of work completed
- Test results and coverage
- Key insights and challenges
- Next steps
- Decision points

### Current Progress: Week 1 Complete ✅

**What's Working**:
- ✅ WeslParserV2 class (foundation)
- ✅ Import statement parsing (reusing Phase 2 custom parsers)
- ✅ Parity test framework (16 tests passing)
- ✅ No regressions (all 456 existing tests still pass)
- ✅ ~20% grammar coverage

**See**: [Week1-Complete.md](./Week1-Complete.md) for full details

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

## Roadmap (9 Weeks Total)

| Week | Work | Coverage | Status |
|------|------|----------|--------|
| 1 | Foundation + imports | 20% | ✅ **Complete** |
| 2 | Const declarations | 30% | ⏳ Next |
| 3 | Alias, var, override | 40% | ⏳ Pending |
| 4 | Struct declarations | 50% | ⏳ Pending |
| 5 | Function declarations | 60% | ⏳ Pending |
| 6 | Statements | 75% | ⏳ Pending |
| 7-8 | Expressions | 90% | ⏳ Pending |
| 9 | Complete, remove v1 | 100% | ⏳ Pending |

**See**: [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md) for detailed plan

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

## Testing Strategy

### Parity Tests (Primary Validation)

Compare v1 and v2 ASTs on identical inputs:

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

## Next Steps: Week 2 (Const Declarations)

**Goal**: Add const declaration parsing, achieve 30% coverage

**Implementation Plan**:

1. **Create parseConstDecl()**
   - Parse `const` keyword (commit point)
   - Parse name + optional type annotation
   - Parse `=` and initializer expression
   - Handle scope creation for expression
   - Wire up bidirectional links

2. **Add Parity Tests**
   ```typescript
   test("const x = 5;", ...)
   test("const y: i32 = 3;", ...)
   test("const z = x + y;", ...)
   ```

3. **Challenges**:
   - Need expression parsing (may need stub)
   - Scope lifecycle for const initializer
   - DeclIdent ↔ ConstElem linking

**See Week1-Complete.md "Next Steps" section for details**

## References

### Project Documentation

- [CLAUDE.md](../CLAUDE.md) - Parser architecture guide (v1 combinator approach)
- [Ultrathink-Parser-Strategy.md](../Ultrathink-Parser-Strategy.md) - V2 parallel parser plan ⭐
- [Week1-Complete.md](./Week1-Complete.md) - Current progress report ⭐
- [TEXT_ELEMENT_RULES.md](./TEXT_ELEMENT_RULES.md) - TextElem generation rules ⭐

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
2. **Read Week1-Complete.md** - Current state and achievements
3. **Check Ultrathink-Parser-Strategy.md** - Overall plan
4. **Study TEXT_ELEMENT_RULES.md** - Critical for AST compatibility

### Making Changes

1. **Always run parity tests** - They catch AST divergence immediately
2. **Use openElem/closeElem** - Unless it's FnElem (see TEXT_ELEMENT_RULES.md)
3. **Follow commit point pattern** - Return null before commit, throw after
4. **Add tests for each construct** - Parity test + position verification + stress test

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

### Week 1 Success Criteria ✅

- [x] V2 parser compiles and runs
- [x] Import parsing works
- [x] Parity tests pass (16 tests)
- [x] No test regressions (456 tests passing)
- [x] Code committed and pushed

### Overall Project Success (Week 9)

- [ ] All 456+ tests passing with v2
- [ ] All bulk tests passing (76 Unity shader tests)
- [ ] Bundle size ~110KB (down from 140KB)
- [ ] mini-parse dependency removed
- [ ] Performance 2-3x faster
- [ ] V1 code removed

## Getting Help

If stuck or need context:

1. Read the progress documents (Week{N}-Complete.md)
2. Check the parity tests for examples
3. Study v1 grammar files to understand expected AST
4. Look at Phase 2 custom parsers for patterns
5. Consult TEXT_ELEMENT_RULES.md for contents array rules

## License

Dual-licensed under MIT or Apache-2.0 (see project root)

---

**Last Updated**: 2025-11-12 (Week 1 Complete)
**Next Milestone**: Week 2 - Const declarations
**Status**: ✅ On track, proceeding with confidence
