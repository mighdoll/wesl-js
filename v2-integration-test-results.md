# V2 Integration Test Results - Initial Baseline

**Date:** November 12, 2025
**Test Files:** ImportCasesV2.test.ts, LinkerV2.test.ts
**Parser:** V2 custom parser (weslParserConfig.useV2Parser = true)

---

## Summary

| Test Suite | Tests | Passed | Failed | Pass Rate |
|------------|-------|--------|--------|-----------|
| LinkerV2.test.ts | 12 | 3 | 9 | **25%** |
| ImportCasesV2.test.ts | ~40 | ~0 | ~40 | **~0%** |
| **Total** | **~52** | **~3** | **~49** | **~6%** |

**Good news:** Tests run! V2 infrastructure works.
**Bad news:** Most tests fail due to core parsing issues.

---

## Critical Blocking Issues

### Issue 1: Type References Not Resolved ❌ (CRITICAL)
**Symptom:** `Error: unresolved identifer: i32`

**Affects:**
- All type references (i32, f32, u32, ptr, texture_storage_2d, etc.)
- User-defined types in type positions
- Template type arguments

**Example failing test:**
```wgsl
var x: i32 = 1;  // ❌ Error: unresolved identifer: i32
```

**Root cause:** Type references (RefIdent) not being created or bound during V2 parsing.

**Impact:** CRITICAL - blocks ~50% of tests

---

### Issue 2: Function Bodies Empty ❌ (CRITICAL)
**Symptom:** Function bodies emit as `{ }` even when they contain statements

**Affects:**
- All function calls
- All statements in function bodies
- All expressions

**Example failing test:**
```wgsl
// Expected:
fn foo() {
  bar();
}

// Actual V2 output:
fn foo() {
}
```

**Root cause:** Statement contents not being parsed or added to function body StatementElem.

**Impact:** CRITICAL - blocks ~80% of ImportCases tests

---

### Issue 3: Missing Whitespace/Newlines ⚠️ (MEDIUM)
**Symptom:** Declarations run together without newlines

**Example:**
```wgsl
// Expected:
alias Num = f32;
fn main() { }

// Actual V2:
alias Num = f32;fn main() { }
```

**Root cause:** Emission not adding proper whitespace between elements.

**Impact:** MEDIUM - tests fail but code might be valid WGSL

---

## Passing Tests ✅

**LinkerV2.test.ts:**
1. ✅ link a const_assert
2. ✅ link a struct
3. ✅ struct self reference

**Common characteristics of passing tests:**
- No type references in type positions
- No function bodies with statements
- Simple declarations only

**Example passing test:**
```wgsl
struct Point {
  x: i32,   // i32 works in struct member
  y: i32,
}
```

---

## Failing Test Patterns

### Pattern A: Type References (50% of failures)
```wgsl
var x: i32 = 1;           // ❌ i32 unresolved
fn foo(x: i32) -> f32 {}  // ❌ i32, f32 unresolved
var t: texture_storage_2d<rgba8unorm, write>;  // ❌ texture_storage_2d unresolved
```

**Why:** V2 not creating RefIdent elements for type names in type positions.

---

### Pattern B: Empty Function Bodies (30% of failures)
```wgsl
fn foo() {
  bar();   // ❌ Call missing
  let x = 1;  // ❌ Statement missing
}
```

**Why:** V2 not populating StatementElem contents array.

---

### Pattern C: Expression Parsing (10% of failures)
```wgsl
fn main() {
  let a = c.p.x;  // ❌ Member access missing
  Num(1.0);       // ❌ Constructor call missing
}
```

**Why:** V2 not parsing expressions in statements.

---

### Pattern D: Import Resolution (10% of failures)
```wgsl
import package::foo;
fn main() { foo(); }  // ❌ foo() call missing from body
```

**Why:** Combination of Issues 1 & 2 - imports work but function bodies empty.

---

## Analysis

### What V2 Does Well ✅
- Parsing module structure (imports, declarations)
- Creating declaration elements (const, struct, fn, alias)
- Struct member declarations
- Basic const_assert statements
- Import statement parsing

### What V2 Is Missing ❌
1. **Type reference creation** - Not creating RefIdent for type names
2. **Statement parsing** - Not populating function body contents
3. **Expression parsing** - Not parsing expressions in statements
4. **Reference binding** - Type refs not being resolved
5. **Whitespace emission** - Missing newlines between elements

---

## Priority Order for Fixes

### P0: Type References (Fix First)
**Why:** Blocks 50% of tests, fundamental feature
**Where:** V2 parser type reference handling
**Estimate:** 4-8 hours

**Actions:**
- Review V1 type reference creation in type positions
- Add RefIdent creation to V2 when parsing types
- Ensure type refs added to contents arrays
- Test with `var x: i32 = 1;`

---

### P0: Statement/Expression Parsing (Fix Second)
**Why:** Blocks 80% of ImportCases, core functionality
**Where:** V2 statement and expression parsing
**Estimate:** 8-12 hours

**Actions:**
- Review how V1 populates StatementElem contents
- Implement statement parsing in V2
- Parse expressions (calls, member access, literals)
- Test with `fn foo() { bar(); }`

---

### P1: Whitespace Emission (Fix Third)
**Why:** Makes output readable, easier debugging
**Where:** Emitter
**Estimate:** 2-4 hours

**Actions:**
- Add newlines between top-level declarations
- Ensure proper indentation
- Test output formatting

---

## Expected Pass Rates After Fixes

| After Fix | Expected Pass Rate | Tests Passing |
|-----------|-------------------|---------------|
| Current | 6% | 3/52 |
| + Type References | 30% | 16/52 |
| + Statement Parsing | 70% | 36/52 |
| + Whitespace | 80% | 42/52 |
| + Remaining Issues | 95%+ | 50+/52 |

---

## Next Steps

1. **Investigate type reference creation** (IMMEDIATE)
   - Where does V1 create RefIdent for types?
   - How does V2 handle type parsing?
   - Add debugging to understand the gap

2. **Investigate statement parsing** (IMMEDIATE)
   - Where does V1 parse statement contents?
   - Does V2 have statement parsing implemented?
   - Check if contents arrays are being populated

3. **Create minimal reproduction** (TODAY)
   ```wgsl
   var x: i32 = 1;  // Test type refs
   fn foo() { bar(); }  // Test statements
   ```
   Run through V1 and V2, compare ASTs

4. **Fix type references** (THIS WEEK)
   - Implement RefIdent creation in type positions
   - Bind type references
   - Verify with LinkerV2 tests

5. **Fix statement parsing** (THIS WEEK)
   - Implement statement content parsing
   - Parse expressions
   - Verify with ImportCasesV2 tests

---

## Positive Takeaways

1. ✅ **Integration test infrastructure works!**
   - Tests run end-to-end
   - Flag switching works
   - Can iterate quickly

2. ✅ **V2 parser doesn't crash**
   - Handles all test inputs
   - Produces some valid output
   - Error messages are clear

3. ✅ **Clear failure patterns**
   - Not random failures
   - Consistent root causes
   - Fixable issues

4. ✅ **Some tests pass**
   - Basic struct parsing works
   - Const_assert works
   - Import parsing works

5. ✅ **Validates strategy**
   - Integration tests reveal real issues
   - Priorities are clear: fix type refs, then statements
   - Progress will be measurable

---

## Conclusion

**Current state:** V2 parses module structure but missing critical features (type refs, statements).

**Immediate priority:** Fix type reference creation, then statement parsing.

**Estimated time to 80% pass rate:** 2-3 days of focused work (14-24 hours).

**Strategy validated:** Integration tests immediately revealed the blockers. Without these tests, we might have built the wrong features first.

**Recommendation:** Focus on type references first (P0), then statements (P0), then iterate based on test results.
