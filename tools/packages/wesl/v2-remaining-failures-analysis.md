# ImportCasesV2 Remaining Failures Analysis

**Status:** 17/40 passing (42.5%), 22 failing, 1 skipped
**LinkerV2:** 12/12 passing (100%) ✅

## Failure Categories

### Category 1: Import/Binding Resolution (13 tests - 59%)

**Pattern:** `unresolved identifier: <name>` errors during emission

These are NOT parsing errors - the parser succeeds but binding fails to resolve cross-module identifiers.

| Test Name | Unresolved Identifier | Issue Type |
|-----------|----------------------|------------|
| import twice doesn't get two copies | foo | Duplicate import handling |
| imported fn calls support fn with root conflict | conflicted | Name conflict resolution |
| import transitive conflicts with main | grand | Transitive dependency |
| import and resolve conflicting support function | support | Support function binding |
| import support fn that references another import | support | Chained imports |
| import support fn from two exports | support | Multi-export binding |
| struct referenced by a fn param | AStruct | Type reference binding |
| import fn with support struct constructor | Elem | Constructor binding |
| const referenced by imported fn | conA | Const binding |
| fn f32() | f32 | Function name = type name |
| circular import | bar | Circular dependency |
| uninitialized global var | rngState | Global var binding |

**Root Cause Investigation Needed:**
- Is this V2-specific or pre-existing?
- Are imported identifiers being saved to correct scopes?
- Is binding traversing imports properly?

**Priority:** Medium (architectural issue, affects many tests)

### Category 2: Expression Parsing (4 tests - 18%)

**Pattern:** Parser errors related to expressions

| Test Name | Error | Likely Cause |
|-----------|-------|--------------|
| uninitialized override | Expected expression after '=' | Type constructor with templates? |
| import var with struct type | Expected expression after '=' | Complex initializer |
| import var<private> with struct type | Expected expression after '=' | Template + initializer |
| fn call with a separator | Expected ';' after expression | Unknown expression syntax |

**Investigation:**
- What expressions are in these test cases?
- Do they use type constructors like `vec4<f32>(...)`?
- Do they use struct constructors like `MyStruct(...)`?

**Priority:** High (may be quick fixes once we understand the syntax)

### Category 3: Statement Parsing (2 tests - 9%)

**Pattern:** Parser errors in statement position

| Test Name | Error | Issue |
|-----------|-------|-------|
| inline package reference | Expected statement or '}' | `package::foo()` syntax not supported |
| inline super:: reference | Expected statement or '}' | `super::bar()` syntax not supported |

**Note:** These are qualified name expressions (`package::`, `super::`) used in statement position.

**Priority:** Medium (special syntax, may require expression parser changes)

### Category 4: Output/Linking Issues (3 tests - 14%)

**Pattern:** Parse and bind succeed, but output is wrong

| Test Name | Issue | Details |
|-----------|-------|---------|
| import a transitive struct | Missing struct | BStruct not included in output |
| import a struct with name conflicting support struct | Name mangling | Expected Base0, got Base |
| alias f32 | Missing declarations | alias and struct not in output |

**Root Cause:**
- Transitive dependency tracking issue?
- Name conflict detection/mangling issue?
- Declaration filtering issue?

**Priority:** Medium (linking/emission issues, not parsing)

## Recommended Investigation Order

### Phase 1: Quick Wins (Expression Parsing - 4 tests)

**Goal:** Understand what syntax is failing, fix if simple

**Steps:**
1. Add debug logging to see actual source for "uninitialized override"
2. Identify if it's type constructors, struct constructors, or other
3. Add support for missing expression types
4. Re-test

**Expected Time:** 2-3 hours
**Potential Impact:** +10% (4 tests)

### Phase 2: Import Resolution Investigation (13 tests)

**Goal:** Understand why cross-module identifiers aren't resolving

**Steps:**
1. Create minimal test case for "import twice doesn't get two copies"
2. Add debug logging to binding/import system
3. Check if V1 passes these tests (regression check)
4. Identify if issue is in:
   - ParseContext scope handling
   - Import declaration handling
   - Binding traversal
   - Module resolution

**Expected Time:** 4-6 hours
**Potential Impact:** +32% (13 tests)

### Phase 3: Statement Parsing (2 tests) + Output Issues (3 tests)

**Goal:** Fix remaining edge cases

**Steps:**
1. Add `package::` and `super::` qualified name support
2. Investigate transitive dependency tracking
3. Fix name conflict detection/mangling
4. Re-test

**Expected Time:** 3-4 hours
**Potential Impact:** +12% (5 tests)

## Impact vs Effort Analysis

| Fix | Effort | Impact | Priority |
|-----|--------|--------|----------|
| Expression parsing | Medium | 4 tests (+10%) | **High** |
| Import resolution | High | 13 tests (+32%) | Medium |
| Statement + Output | Medium | 5 tests (+12%) | Low |

## Success Metrics

**Target for Next Session:**
- Minimum: +4 tests (expression parsing) → 52.5% pass rate
- Stretch: +10 tests (expr + some imports) → 67.5% pass rate
- Ambitious: +17 tests (all but hardest cases) → 85% pass rate

**Long-Term Goal:**
- 100% ImportCasesV2 (same as LinkerV2 achievement)

## Notes

- **LinkerV2 at 100%** proves V2 core is solid
- Most failures are import/binding, not core parsing
- Expression parsing likely just needs more syntax support
- Import resolution is the big unknown - needs investigation

## Test Environment

All tests run with:
- `weslParserConfig.useV2Parser = true` (set in beforeAll)
- V2 parser: WeslParserV2.ts
- V2 binding: Same binding system as V1
- Integration tests: Full parse → bind → emit → compare flow

**Key Question:** Do any of these tests pass with V1?
- If yes: V2 regression
- If no: Pre-existing limitation
