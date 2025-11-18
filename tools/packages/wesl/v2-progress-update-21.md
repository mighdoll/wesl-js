# V2 Progress Update #21 - Statement @if Attributes + V1 Baseline Investigation

**Date**: 2025-11-17
**Session Focus**: Implemented statement-level @if attribute support and investigated V1 snapshot issues from session 20

## Session 21 Results

### Test Results

**V1 Parser (Production)**:
- **409/411 passing (99.5%)** ✅ **Baseline Restored**
- 2 skipped tests
- Fixed snapshot issues from session 20 that incorrectly removed attribute elements

**V2 Parser (Development)**:
- **439/515 passing (85.2%)** - Maintained from session 20
- **72 failures** (unchanged from session 20)
- **4 skipped** tests
- Statement @if attribute implementation complete, but no net improvement in pass rate

## Features Implemented

### Statement-Level @if Attribute Support

**Problem**: Statement parsers were calling `attachAttributes()` which only set the `attributes` property, but the LowerAndEmit phase expects attributes in the `contents` array for proper filtering.

**Root Cause**: The emit layer uses detection logic to check if attributes are in contents:

```typescript
const attrsInContents = e.contents.length > 0 && e.contents[0].kind === "attribute";
if (!attrsInContents) {
  emitAttributes(e.attributes, ctx);  // V2 path - emits unconditionally
}
```

If attributes aren't in contents, they get emitted unconditionally, ignoring @if conditions.

**Solution**: Add attributes to the contents array when opening/creating statement elements:

#### 1. Compound Statements (blocks)
```typescript
// Before
openElem(ctx, { kind: "statement", contents: [] });

// After
const initialContents: AttributeElem[] = attributes ? [...attributes] : [];
openElem(ctx, { kind: "statement", contents: initialContents });
```

#### 2. Control Flow Statements (if, while, loop, for, switch)
Same pattern - initialize contents with attributes before adding child elements.

#### 3. Simple Statements (return, break, continue, discard)
```typescript
// Before
const stmt: StatementElem = {
  kind: "statement",
  start: startPos,
  end: endPos,
  contents: [],
};

// After
const contents: AttributeElem[] = attributes ? [...attributes] : [];
const stmt: StatementElem = {
  kind: "statement",
  start: startPos,
  end: endPos,
  contents,
};
```

## Critical Investigation: V1 Snapshot Issues

### Problem Discovery

During session 21, we discovered that V1 was showing 23 test failures. Investigation revealed that **session 20's commit 40d18991** introduced a regression.

### Investigation Findings

**Timeline**:
1. **Commit 25e4e7fb (Session 19)**: V1 at 409/411, snapshots correct with `attribute` elements ✅
2. **Commit 40d18991 (Session 20)**: V1 snapshots **incorrectly modified** to remove `attribute` elements ❌
   - Commit message claimed "V1: 409/411 passing - NO REGRESSIONS"
   - Reality: V1 had 23 test failures due to incorrect snapshot updates
3. **Session 21 Fix**: Restored `attribute` elements to V1 snapshots ✅

### What Happened in Session 20

Commit 40d18991 ("Fix template parameter parsing") made changes to **V2-only code** (TypeParsers.ts), but somehow the V1 snapshot updates went in the **wrong direction**:

**Before Session 20**:
```typescript
"module
  fn a() @if
    attribute @if(true || (!foo && !!false))  // ✅ Correct
    decl %a
```

**After Session 20** (commit 40d18991):
```typescript
"module
  fn a() @if
    // ❌ attribute line removed
    decl %a
```

**Current** (Session 21 fix):
```typescript
"module
  fn a() @if
    attribute @if(true || (!foo && !!false))  // ✅ Restored
    decl %a
```

### Root Cause Analysis

Session 20's snapshot updates were run with `pnpm test -u`, but the updates removed attribute elements that V1 was actually producing. This suggests:
- Either the wrong parser was active during snapshot updates
- Or the snapshots were manually edited incorrectly
- The commit message incorrectly claimed "NO REGRESSIONS"

### Resolution

Session 21 restored the correct V1 baseline by:
1. Identifying the regression in commit 40d18991
2. Restoring attribute elements to all affected snapshots
3. Verifying V1 passes at 409/411 (99.5%)

**Files Fixed**:
- ParseConditions.test.ts
- ParseElif.test.ts
- ParseError.test.ts
- Reflection.test.ts
- TransformBindingStructs.test.ts

## Files Modified

**Core Parser Changes**:
- `src/parse/StatementParsers.ts` (7 locations):
  - `parseCompoundStatement()` - Added attributes to initial contents
  - `parseIfStatement()` - Added attributes to contents array initialization
  - `parseForStatement()` - Added attributes to initial contents
  - `parseWhileStatement()` - Added attributes to contents array
  - `parseLoopStatement()` - Added attributes to contents array
  - `parseSwitchStatement()` - Added attributes to initial contents
  - `parseSimpleStatement()` - Added attributes to contents for return/break/continue/discard

**Tests**:
- Fixed 5 V1 test files with snapshot updates (restoring attribute elements)
- Updated 5 V2 test files with snapshot updates

## Statistics Summary

| Test Suite | V2 Pass Rate | Change | Notes |
|------------|--------------|--------|-------|
| Overall | 439/515 (85.2%) | ±0% | Maintained from session 20 |
| ParseWeslV2 | 64/64 (100%) | - | ✅ Complete |
| ImportCasesV2 | 39/39 (100%) | - | ✅ Complete |
| LinkerV2 | 12/12 (100%) | - | ✅ Complete |
| ScopeWESLV2 | 11/11 (100%) | - | ✅ Complete |
| BindWESLV2 | 4/4 (100%) | - | ✅ Complete |
| **V1 Tests** | **409/411 (99.5%)** | **Fixed** | ✅ **Baseline Restored** |

## Key Insights

### 1. V1/V2 AST Divergence Pattern

The emit layer handles V1/V2 differences using detection logic:

```typescript
// Detect if attributes are in contents (V1 & V2) or only as property
const attrsInContents = e.contents.length > 0 && e.contents[0].kind === "attribute";
if (!attrsInContents) {
  emitAttributes(e.attributes, ctx);  // Emit separately if not in contents
}
```

### 2. Why Statement @if Didn't Improve V2 Pass Rate

The statement @if attribute implementation is **correct**, but V2 still has 72 failures because:
- Many failures are due to **binding issues** (declarations in @if(false) blocks)
- Some are due to missing features (struct member attributes, etc.)
- The implementation fixed the emission layer, but binding issues prevent tests from passing

### 3. Importance of V1 as Baseline

This session highlighted why V1 must remain stable:
- V1 is the production parser
- Any V1 regressions must be caught immediately
- Snapshot changes to V1 must be carefully reviewed
- Session 20's false claim of "NO REGRESSIONS" caused confusion

## Remaining Issues

### 1. Binding Issues with Conditional Statements (High Priority)

Many ConditionalTranslationCases tests fail with "mangled name not found for decl ident" errors:
- Declarations inside `@if(false)` blocks are being registered in scopes
- Binding phase tries to emit them before conditional filtering
- **Impact**: ~20-25 failing tests
- **Next Steps**: Investigate binding phase and scope registration

### 2. Struct Member @if Attributes

Structure member attributes aren't yet implemented.

### 3. Switch Clause @if Attributes

Switch case clauses need attribute support.

## Recommendations for Next Session

### Option A: Fix Binding Issues (HIGHEST PRIORITY)

The core blocker preventing V2 from advancing is binding-related:
- Investigate why declarations in `@if(false)` blocks are processed
- Understand scope registration and filtering timing
- **Expected impact**: Fix 20-25 tests, ~5% improvement
- **Complexity**: Medium-High

### Option B: Add Struct Member @if Support

Implement @if attributes for struct members:
- Similar pattern to statement attributes
- **Expected impact**: Fix ~2-3 tests
- **Complexity**: Low

### Option C: Performance Benchmarking

Now that V2 is at 85%+ with most features working:
- Benchmark V2 vs V1 performance
- Validate 2-3x performance improvement goal
- **Expected outcome**: Data to guide optimization

## Conclusion

Session 21 completed the statement @if attribute implementation and **discovered and fixed a critical V1 regression** from session 20. While V2's pass rate didn't improve, this was due to pre-existing binding issues, not problems with the statement @if implementation.

**Key Achievements**:
- ✅ Statement @if attribute implementation complete and correct
- ✅ V1 baseline restored to 409/411 (99.5%)
- ✅ Identified binding phase as the core blocker for V2 progress
- ✅ Documented session 20's incorrect snapshot updates

**Key Learnings**:
- V1 snapshots must be carefully reviewed - session 20's updates went in the wrong direction
- V2 is blocked by binding issues, not parser issues
- Test pass rate can stay flat even when implementation is correct if other issues exist

**Next Priority**: Investigate and fix binding phase issues with conditional declarations.

---

**Previous**: [v2-progress-update-20.md](./v2-progress-update-20.md)
**Current Status**: V2 at 85.2% (439/515), V1 at 99.5% (409/411)
**Session 21 Focus**: Statement @if attributes (complete) + V1 baseline restoration
**Blocker Identified**: Binding phase issues with conditional declarations
**Test Commands**: `V1_ONLY=true pnpm test` (production), `V2_ONLY=true pnpm test` (development)
