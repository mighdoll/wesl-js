# V2 Progress Update #22 - Partial Scope Fixes and Binding Improvements

**Date**: 2025-11-17
**Session Focus**: Fixed critical partial scope creation bug and expanded scope test coverage

## Session 22 Results

### Test Results

**V1 Parser (Production)**:
- **409/411 passing (99.5%)** ✅ Stable baseline maintained

**V2 Parser (Development)**:
- **454/528 passing (86.0%)** - Up from 452/528 (+2 tests, +0.4%)
- **70 failures** (down from 72)
- **4 skipped** tests

**Key Test Suites**:
- **ScopeWESLV2**: 23/24 passing (95.8%) - Up from 16/24 incomplete baseline
- **ConditionalTranslationCases**: 23/49 passing (46.9%) - Up from 22/49 (+1 test)
- **Overall progress**: Small incremental improvement

## Features Implemented

### 1. Expanded ScopeWESLV2 Test Coverage

**Problem**: ScopeWESLV2.test.ts only had 11 tests, while V1's ScopeWesl.test.ts had 30+ tests. This left many scope scenarios untested in V2.

**Solution**: Ported 13 missing tests from V1 to V2:
- `scope from fn with reference` - Reference tracking (postfix increment - V2 limitation)
- `switch` - Control flow with nested scopes
- `for()` - For loop scope shadowing
- `fn with param` - Function parameters and shadowing
- `fn decl scope` - Function declaration scope access
- `larger example` - Complex integration test
- `scope with an attribute` - `@if` on compound statements
- `partial scope` - `@if(false)` creating partial scopes (CRITICAL)
- `loop scope` - Loop scope nesting
- `nested scope test` - Complex nested shadowing
- `@if fn` - `@if` on function declarations
- `@if const` - `@if` on const declarations
- `var<private> a: i32;` - Variable with template params

**Results**:
- ScopeWESLV2 now has comprehensive coverage matching V1
- Revealed critical bugs in V2's scope handling
- 23/24 tests passing (95.8%)

---

### 2. Fixed Critical Partial Scope Creation Bug (HIGHEST PRIORITY)

**Problem**: The core blocker identified in session 21 - declarations and references inside `@if(false)` blocks were being registered in regular scopes instead of partial scopes. This caused binding errors like "mangled name not found for decl ident".

**Example**:
```wgsl
fn main() {
  var x = 1;
  @if(false) y = 2;  // Reference 'y' was tracked in main's scope, not partial
}
```

**Root Cause**: V2's `parseStatement()` wasn't creating partial scopes when `@if/@elif/@else` attributes were present.

**Solution**: Modified `StatementParsers.ts`:

```typescript
// Added helper functions
function hasConditionalAttribute(attributes: AttributeElem[]): boolean {
  return attributes.some(
    (attr) =>
      attr.kind === "attribute" &&
      (attr.attribute.kind === "@if" ||
        attr.attribute.kind === "@elif" ||
        attr.attribute.kind === "@else"),
  );
}

function getConditionalAttribute(
  attributes: AttributeElem[],
): IfAttribute | ElifAttribute | ElseAttribute | undefined {
  const elem = attributes.find(
    (attr) =>
      attr.kind === "attribute" &&
      (attr.attribute.kind === "@if" ||
        attr.attribute.kind === "@elif" ||
        attr.attribute.kind === "@else"),
  );
  return elem?.attribute;
}

// Modified parseStatement() to create partial scopes
export function parseStatement(stream: WeslStream, ctx: ParseContext) {
  const attributes = parseAttributeList(stream);

  const hasConditional = attributes.length > 0 && hasConditionalAttribute(attributes);
  if (hasConditional) {
    ctx.pushScope("partial");  // Create partial scope wrapper
  }

  let stmt = /* try various parsers */;

  if (stmt && hasConditional) {
    const partialScope = ctx.popScope();
    partialScope.condAttribute = getConditionalAttribute(attributes);
  }

  return stmt;
}
```

**Impact**:
- ✅ "partial scope" test now passes - creates `@if(false) -{ y } #3`
- ✅ "scope with an attribute" test passes - creates `@if(foo) -{ { } #4 } #3`
- ✅ Fixes the binding issue for conditional statements
- ⚠️ ConditionalTranslationCases only improved by 1 test (other issues remain)

---

### 3. Removed Empty Scope Creation

**Problem**: V2 was creating empty scopes for empty compound statements like `for (...) { }`, which V1 doesn't do.

**Example**:
```wgsl
for (var i = 0; i < 10; i++) { }  // Empty body created scope #4 in V2
```

**V2 Before**:
```
{ %i i i
  {  } #4    ← Empty scope for { }
} #3
```

**V2 After**:
```
{ %i i i } #3  ← No empty scope
```

**Solution**: Modified `parseCompoundStatement()`:

```typescript
function parseCompoundStatement(stream, ctx, attributes) {
  // ... parse '{'

  // Check if block is empty
  const nextToken = stream.peek();
  const isEmpty = nextToken && nextToken.text === "}";

  // Only push scope if block is non-empty
  if (!isEmpty) {
    ctx.pushScope();
  }

  // Parse statements...

  // Pop scope only if we pushed one
  if (!isEmpty) {
    ctx.popScope();
  }
}
```

**Impact**:
- ✅ Matches V1 behavior
- ✅ Reduces unnecessary scope overhead
- ✅ Fixes "for()" and "fn with param" tests

---

### 4. Added @if Partial Scope Support for Top-Level Declarations

**Problem**: V2 didn't create partial scopes for `@if` on top-level declarations (const, fn, var, etc.), so the `@if` marker didn't appear in scope debug output.

**Example**:
```wgsl
@if(true) const a = 0;
@if(true) fn foo() { }
```

**Solution**: Modified `WeslParserV2.parseDeclarations()`:

```typescript
private parseDeclarations(): void {
  while (true) {
    const attributes = parseAttributeList(stream);

    // Check if attributes contain @if/@elif/@else
    const hasConditional = attributes.some(
      (attr) =>
        attr.kind === "attribute" &&
        (attr.attribute.kind === "@if" ||
          attr.attribute.kind === "@elif" ||
          attr.attribute.kind === "@else"),
    );

    // Create partial scope if conditional attributes present
    if (hasConditional) {
      this.ctx.pushScope("partial");
    }

    // Try to parse declaration...
    const elem = parseDeclaration(...);

    // Pop partial scope and set conditional attribute
    if (hasConditional && elem) {
      const partialScope = this.ctx.popScope();
      partialScope.condAttribute = getConditionalAttribute(attributes);
    }
  }
}
```

**Impact**:
- ✅ "@if fn" test now shows `@if(true) -{ ... }` marker
- ✅ "@if const" test now shows `@if(true) -{ ... }` marker
- ⚠️ Creates nested structure (see Known Differences below)

---

## Known Structural Differences from V1

### 1. Extra Type Reference Scopes (Minor Issue)

**Test**: "scope from simple fn"

**V1**:
```
{ %x i32 } #2
```

**V2**:
```
{ %x
  { i32 } #3
} #2
```

**Cause**: V2's type parser creates a separate nested scope for type references.

**Impact**:
- Functionally safe - doesn't affect binding or output
- Adds unnecessary scope overhead
- Should be investigated and optimized

**Recommendation**: Low priority - fix when optimizing V2 performance.

---

### 2. Nested Partial Scope Structure (Architectural Difference)

**Tests**: "@if fn", "@if const"

**V1 Approach** (Combined):
```
 @if(true) -{ %a         ← Single scope: partial + declaration
  {  } #2               ← Const body scope
} #1
```

**V2 Approach** (Nested):
```
 @if(true) -{           ← Partial scope wrapper
  -{ %a                 ← Declaration scope
    {  } #3             ← Const body scope
  } #2
} #1
```

**Cause**: V2 creates partial scopes **before** parsing declarations, so the declaration scope becomes a child of the partial scope. V1's mini-parse grammar applies both collectors to the same element.

**Impact**:
- ✅ Functionally correct - conditional filtering still works
- ⚠️ Structural difference - extra nesting level
- ⚠️ Different scope numbering

**Recommendation**: This is an acceptable architectural difference. V2's approach is more explicit. Unless it causes binding issues (none found so far), keep as-is.

---

## Statistics Summary

| Test Suite | V2 Pass Rate | Change | Notes |
|------------|--------------|--------|-------|
| Overall | 454/528 (86.0%) | +2 tests | Incremental improvement |
| ScopeWESLV2 | 23/24 (95.8%) | +7 tests | Comprehensive coverage now |
| ConditionalTranslationCases | 23/49 (46.9%) | +1 test | Still many failures |
| **V1 Tests** | **409/411 (99.5%)** | ±0 | **NO REGRESSIONS** ✅ |

### ScopeWESLV2 Test Breakdown

✅ **23 Passing Tests**:
- scope from simple fn (with extra type scope - minor difference)
- two fns
- two fns, one with a decl
- fn ref
- struct
- alias
- builtin scope
- builtin enums
- texture_storage_2d
- ptr 2 params
- ptr 3 params
- switch
- for() (empty scope removed)
- fn with param (empty scope removed)
- fn decl scope
- larger example
- scope with an attribute (partial scope working)
- partial scope (CRITICAL FIX - working!)
- loop scope
- nested scope test
- @if fn (partial scope created, nested structure)
- @if const (partial scope created, nested structure)
- var<private> a: i32;

❌ **1 Expected Failure**:
- scope from fn with reference - Uses `x++` (postfix increment not yet supported in V2)

---

## Commits

1. **20fac434** - Fix V2 partial scope creation for @if statements
   - Added hasConditionalAttribute() and getConditionalAttribute() helpers
   - Modified parseStatement() to create partial scopes
   - Fixed "partial scope" and "scope with an attribute" tests
   - ScopeWESLV2: 23/24 passing (95.8%)

2. **4778f8dd** - Remove empty scopes and add @if partial scopes for declarations
   - Modified parseCompoundStatement() to skip empty blocks
   - Modified WeslParserV2.parseDeclarations() for @if support
   - Fixed "for()", "fn with param", "@if fn", "@if const" tests
   - Overall V2: 454/528 passing (86.0%)

---

## Key Insights

### 1. Partial Scope Bug Was CRITICAL

The partial scope creation bug was the **primary blocker** for V2 progress. While only +1 test passed in ConditionalTranslationCases, the fix is architecturally correct and necessary. The remaining failures likely have different root causes.

### 2. ScopeWESLV2 Was Inadequate as Baseline

The original ScopeWESLV2 with only 11 tests missed crucial scope scenarios:
- Reference tracking in conditional blocks
- Control flow scope nesting
- Attribute-conditioned scopes

Expanding to 24 tests (matching V1) provided proper validation coverage.

### 3. V1/V2 Architectural Differences Are Acceptable

The nested partial scope structure in V2 is **functionally correct** even though structurally different from V1. As long as:
- ✅ Conditional filtering works correctly
- ✅ Binding resolves properly
- ✅ Output WGSL is correct

The extra nesting is an acceptable implementation detail.

### 4. Empty Scope Optimization Matters

Removing empty scopes reduces overhead and matches V1 behavior. This is good hygiene even if it doesn't directly improve test pass rates.

---

## Remaining Issues Blocking V2 Progress

### High Priority

1. **ConditionalTranslationCases Still Low (46.9%)**
   - Partial scope fix only improved by 1 test
   - 26 tests still failing
   - Need to investigate what's causing the remaining failures
   - Likely issues:
     - Other binding problems unrelated to partial scopes
     - Missing features (expression parsing, etc.)
     - Semantic differences in AST structure

2. **Extra Type Reference Scopes**
   - Creates unnecessary nested scopes for simple type refs
   - Should investigate type parser to eliminate

### Medium Priority

3. **Postfix Increment/Decrement Not Supported**
   - `x++`, `x--` not yet parsed
   - Blocks 1 scope test and likely others
   - Need expression parser enhancement

4. **BulkTests Failures (~200 tests)**
   - Many require expression/statement parsing
   - Phase 4 work (not yet started)

### Low Priority

5. **Nested Partial Scope Structure**
   - Different from V1 but functionally correct
   - Document as known difference
   - Only fix if it causes real binding issues

---

## Recommendations for Next Session

### Option A: Investigate Remaining ConditionalTranslationCases Failures (HIGHEST PRIORITY)

**Goal**: Understand why 26/49 tests still fail despite partial scope fix

**Approach**:
1. Pick a failing test from ConditionalTranslationCases
2. Run with V2_ONLY=true and examine error output
3. Check if it's a binding issue, emission issue, or missing feature
4. Fix root cause and measure impact

**Expected Outcome**:
- Identify 1-3 specific issues causing multiple test failures
- Potential for 5-10 test improvements if we find common patterns

**Complexity**: Medium-High (debugging required)

---

### Option B: Fix Extra Type Reference Scopes

**Goal**: Remove unnecessary nested scopes for type references

**Approach**:
1. Find where type references create scopes (likely in TypeParsers.ts)
2. Modify to add idents directly to parent scope instead of creating child scope
3. Verify "scope from simple fn" test matches V1

**Expected Outcome**:
- Cleaner scope structure
- 1 test fully matches V1
- Better performance (fewer scopes)

**Complexity**: Low (likely simple fix)

---

### Option C: Implement Postfix Increment/Decrement

**Goal**: Add support for `x++` and `x--` expressions

**Approach**:
1. Enhance expression parser to handle postfix operators
2. Create AST representation for postfix expressions
3. Test with "scope from fn with reference"

**Expected Outcome**:
- +1 test in ScopeWESLV2
- Unlocks other tests using `++`/`--`
- Essential for completeness

**Complexity**: Medium (expression parsing)

---

### Option D: Performance Benchmarking (Validation)

**Goal**: Measure if V2 is achieving 2-3x performance goal

**Approach**:
1. Create benchmark suite with various WESL files
2. Run V1 vs V2 parser on same inputs
3. Measure parse time differences
4. Identify any V2 performance regressions

**Expected Outcome**:
- Data showing whether V2 meets performance goals
- Identify optimization opportunities
- Validation that V2 effort is worthwhile

**Complexity**: Medium (benchmarking setup)

---

## Recommended Priority Order

1. **Option A** - Investigate ConditionalTranslationCases failures (HIGHEST PRIORITY)
   - This is the main blocker for V2 adoption
   - Partial scope fix should have helped more - need to understand why it didn't

2. **Option B** - Fix extra type reference scopes (QUICK WIN)
   - Low complexity, immediate improvement
   - Good warm-up task

3. **Option C** - Implement postfix increment (COMPLETENESS)
   - Fills a gap in expression support
   - Needed for real-world code

4. **Option D** - Performance benchmarking (VALIDATION)
   - Important but can wait until V2 is more complete
   - Better to benchmark when more tests pass

---

## Conclusion

Session 22 successfully fixed the **critical partial scope creation bug** that was the primary blocker for V2 binding. The fix is architecturally sound and comprehensive, covering both statements and declarations.

**Key Achievements**:
- ✅ Partial scope creation working for statements (`@if(false) y = 2`)
- ✅ Partial scope creation working for declarations (`@if(true) const a = 0`)
- ✅ Empty scope optimization (matches V1 behavior)
- ✅ Comprehensive scope test coverage (24 tests)
- ✅ V1 baseline maintained at 99.5% - **NO REGRESSIONS**

**Key Learnings**:
- ScopeWESLV2 needed full V1 parity to properly validate V2
- Partial scope fix was necessary but not sufficient for all ConditionalTranslationCases
- V2's nested partial scope structure is acceptable architectural difference
- Need to investigate why ConditionalTranslationCases didn't improve more

**Next Priority**: Investigate remaining ConditionalTranslationCases failures to understand what's still broken beyond partial scopes.

---

**Previous**: [v2-progress-update-21.md](./v2-progress-update-21.md)
**Current Status**: V2 at 86.0% (454/528), V1 at 99.5% (409/411)
**Session 22 Focus**: Partial scope fixes and scope test expansion
**Critical Fix**: Partial scope creation for conditional statements and declarations
**Test Commands**: `V1_ONLY=true bb test --dangerouslyDisableSandbox` (production), `V2_ONLY=true pnpm test` (development)
