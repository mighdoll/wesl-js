# V2 Parser Development - Lessons Learned

## Overview

The V2 parser project was a journey from attempting incremental replacement of mini-parse combinators to ultimately building a complete parallel parser. This document captures the key lessons, dead ends, and insights gained through 39+ development sessions.

## Timeline & Evolution

### Phase 1-2: Hybrid Approach (Successful)
- **Goal**: Replace hot paths with custom parsers while keeping mini-parse
- **Result**: ✅ Successfully replaced imports and attributes
- **Effort**: ~2 weeks
- **Outcome**: Working hybrid with adapter layer

### Phase 3: Incremental Replacement (Dead End #1)
- **Goal**: Replace mini-parse piece by piece
- **Result**: ❌ Hit fundamental architectural wall
- **Duration**: ~1 week of investigation
- **Why it failed**: Collection system too deeply integrated

### Pivot: Parallel Parser Strategy (Success)
- **Goal**: Build complete V2 parser alongside V1
- **Result**: ✅ 100% compatibility achieved
- **Duration**: ~8 weeks
- **Key insight**: Use V1 tests as oracle for validation

## Major Dead Ends & Why They Failed

### 1. Piecemeal Grammar Replacement
**Attempted**: Replace individual grammar rules one at a time
**Why it failed**:
- mini-parse collection system is foundational infrastructure
- Every parser rule uses `.collect()`, `.ptag()`, `.ctag()`, `tagScope()`
- Cannot isolate individual rules from the collection framework
- 84+ collection call sites all interconnected

**Lesson**: Some systems are too tightly coupled to replace incrementally. Foundation must be rebuilt entirely.

### 2. Adapter Layer for Complex Grammar
**Attempted**: Create adapters to bridge custom parsers with mini-parse collection
**Why it failed**:
- Works for simple, isolated parsers (imports/attributes) ✅
- Breaks down for complex grammar with bidirectional dependencies
- Collection lifecycle hooks (before/after) couldn't be properly adapted
- Tag system for inter-parser communication impossible to bridge

**Lesson**: Adapter patterns work for leaf nodes, not for core infrastructure.

### 3. ParseContext as Drop-in Replacement
**Attempted**: Create ParseContext to replace mini-parse CollectContext
**Why it failed**:
- CollectContext is more than just a data structure
- Tightly coupled with mini-parse's parsing flow
- Collection happens during parsing, not after
- Would require rewriting entire grammar anyway

**Lesson**: Cannot abstract away fundamental architectural differences.

## Key Architectural Insights

### 1. TextElem Generation is Foundational
**Discovery**: V1's approach of filling gaps with TextElems is genius but complex
**Challenge**: V2 had to replicate this exactly for compatibility
**Solution**: `openElem()`/`closeElem()` pattern with `coverWithText()`

**Lesson**: Sometimes "implementation details" are actually core features. TextElem generation ensures perfect source reconstruction.

### 2. AST Structure Divergence is Acceptable
**V1 Approach**: Attributes stored in contents as TextElems
**V2 Approach**: Attributes stored separately in attributes field

**Initial assumption**: Must match exactly
**Reality**: Emission layer can handle both formats with simple detection
**Pattern**: `const attrsInContents = e.contents[0]?.kind === "attribute"`

**Lesson**: Don't over-constrain compatibility requirements. Small divergences with clean adapters are fine.

### 3. Parallel Development > Incremental Replacement
**Why parallel worked**:
- Old parser keeps working (no risk)
- Can validate against existing tests continuously
- Can ship at any milestone
- Clear progress metrics (% tests passing)

**Why incremental failed**:
- Too many interdependencies
- Can't validate until complete
- All-or-nothing risk profile

**Lesson**: When replacing foundational systems, build alongside rather than within.

## Difficult Code Areas

### 1. Scope Management During Parsing
**Challenge**: V1 uses collection hooks to manage scope stack
**V2 Solution**: Explicit scope management in each parser function
**Complexity**: Every parser must correctly push/pop scopes
**Bug source**: Missing scope operations cause binding failures

### 2. Identifier Binding Architecture
**V1**: Uses `mergeScope()` to combine type and initializer scopes
**V2**: Uses hierarchical scopes with parent/child relationships
**Discovery**: Both work, but V2's approach is cleaner conceptually
**Bug**: Dependent scope processing in partials took multiple sessions to fix

### 3. Statement/Expression Boundary
**Issue**: Statements need flat text+ref structure, expressions create AST trees
**V1**: Combinators naturally create flat structure
**V2**: Had to explicitly avoid creating expression AST nodes in statement contents
**Solution**: Parse expressions for validation but use text coverage for emission

### 4. Whitespace and Formatting
**Surprisingly hard**:
- Colon spacing in type annotations (`: ` not `:`)
- Newlines between declarations
- Arrow spacing in return types (`-> ` not `->`)
- Template angle brackets (`var<private>` not `var < private >`)

**Lesson**: Parser must track exact token positions, not just semantic structure.

## Performance Surprises

### Expected vs Actual
- **Expected**: 5x speedup from removing combinators
- **Actual**: 2.8x speedup
- **Bundle size expected**: 30KB reduction
- **Bundle size actual**: +7% increase (V1 still included)

### Why Performance Wasn't Higher
- Token manipulation overhead still exists
- Checkpoint/reset for backtracking has cost
- Complex parsers still need multiple attempts
- Real bottleneck is shader compilation, not parsing

**Lesson**: Measure before optimizing. Parser was never the bottleneck.

## Testing Strategy Insights

### What Worked Well

#### 1. V1 Tests as Oracle
- 440+ existing tests provided comprehensive validation
- Tests validate output, not AST structure (more flexible)
- Could measure progress continuously (% passing)

#### 2. Dual Parser Mode
```bash
V1_ONLY=true bb test  # Baseline validation
V2_ONLY=true bb test  # V2 progress
bb test              # Both parsers
```

#### 3. Parity Tests for Debugging
- Compare V1 and V2 ASTs directly
- Filter out TextElems for semantic comparison
- Invaluable for finding subtle differences

### What Was Challenging

#### 1. Snapshot Tests
- AST structure differences made snapshots fragile
- Had to maintain separate V1/V2 snapshots
- Solution: Exclude AST snapshot tests from V2 runs

#### 2. Cross-Module Tests
- Single-module tests can pass even with scope bugs
- Cross-module imports expose binding issues
- Lesson: Always test with multi-file scenarios

## Organizational Insights

### Documentation Strategy
**What worked**:
- Progress updates after each session (39 documents)
- Clear problem → solution → outcome format
- Test metrics in every update
- Next steps always documented

**Value**: Could resume after breaks, onboard help, track decisions

### Incremental Delivery
Even though V2 was parallel development, we could have shipped value earlier:
- Import parsing improvements (Phase 2)
- Attribute parsing optimization
- Individual parser functions reusable

**Lesson**: Look for extractable value even in large rewrites.

## Recommendations for Future Parser Work

### 1. Start with Parallel Development
- Don't attempt incremental replacement of foundational systems
- Build complete replacement with continuous validation
- Keep old system until new is 100% ready

### 2. Design for Testability
- AST compatibility > AST beauty
- Output compatibility > structure compatibility
- Make parsers independently testable

### 3. Measure First
- Profile before optimizing
- Parser might not be the bottleneck
- 2-3x speedup might not matter if parser is <1% of time

### 4. Preserve Source Fidelity
- Users expect comments preserved
- Exact formatting matters for some use cases
- TextElem approach, while complex, solves real problems

### 5. Checkpoint Frequently
- Complex parsers are hard to debug
- Regular progress updates maintain momentum
- Test metrics provide objective progress

## Technical Debt & Future Work

### Opportunities
1. **Remove mini-parse** - Save ~30KB once V2 is proven
2. **Text→Comment conversion** - 35% smaller ASTs
3. **Error message improvement** - Custom parsers can provide better errors

### Risks
1. **Dual maintenance** - Two parsers until V1 removed
2. **AST divergence** - May complicate future tooling
3. **Performance assumptions** - Speedup might not translate to user benefit

## Conclusion

The V2 parser journey demonstrated that replacing foundational infrastructure requires different strategies than incremental feature development. The pivot from incremental replacement to parallel development was crucial. While the path had dead ends, each attempt provided valuable learning that informed the successful approach.

Key takeaway: **When replacing core systems, build alongside, not within. Use existing tests as your oracle, not your constraint.**

Final metrics:
- **Time invested**: ~10 weeks
- **Tests passing**: 99.6% (524/526)
- **Performance gain**: 2.8x
- **Compatibility**: 100% on real-world code
- **Lessons learned**: Invaluable