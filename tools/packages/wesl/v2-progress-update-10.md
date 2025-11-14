# V2 Progress Update #10 - Test Analysis & Remaining Work

**Date**: 2025-11-13
**Session Focus**: Comprehensive V2 test analysis and roadmap for completion

## Executive Summary

Ran full V2 test suite analysis to identify remaining work. **Major milestone**: ImportCasesV2 now at **100%** (39/39 passing, up from 87.5%). However, overall V2 completion is ~30% due to missing parser features.

**Key Finding**: V2 parser handles imports and basic declarations well, but **does not yet parse**:
- Struct bodies
- Function bodies
- Global directives (enable, requires, diagnostic)
- Statements (if, for, while, return, etc.)
- Expressions (binary ops, calls, member access, etc.)
- Conditional attributes (@if, @elif, @else) on non-import elements

## Test Results Summary

```
Test File                        Pass/Total  Rate    Status
================================================================
ImportCasesV2                    39/39      100%    ✅ COMPLETE
LinkerV2                         (included in ImportCasesV2)
ParserV2Parity                   18/65       27%    🔄 Partial
ConditionalTranslationCases      16/49       32%    🔄 Partial
BulkTests (real-world shaders)   22/76       28%    🔄 Partial
ScopeWESLV2                       3/11       27%    🔄 Partial
ParseWESL (V1 tests on V2)       10/64       15%    ❌ Low
ScopeWESL (V1 tests on V2)        4/24       16%    ❌ Low

OVERALL: 249/462 passing (53.9%)
```

### Test Category Analysis

#### ImportCasesV2: 39/39 (100%) ✅

**Status**: **COMPLETE!** All import-related tests passing.

**What works**:
- Package imports (`import package::foo::bar`)
- Relative imports (`import super::foo`)
- Import with alias (`import foo as bar`)
- Import collections (`import {a, b, c}`)
- Nested collections
- Transitive imports
- Circular import detection
- Import binding and name resolution
- Support function/struct imports

**Why this matters**: The linker can now correctly process all WESL import patterns with V2 parser.

#### ParserV2Parity: 18/65 (27%) 🔄

**Status**: Only basic elements working.

**Passing** (18 tests):
- Empty files
- Simple imports (6 patterns)
- Simple const declarations (3 patterns)
- Simple var declarations (3 patterns)
- Simple override declarations (2 patterns)
- Simple alias declarations (1 pattern)

**Failing** (47 tests) - Reason: **Not yet implemented**:

1. **Comments/Whitespace** (3 tests):
   - `whitespace only` - TextElem handling
   - `comments only` - TextElem handling
   - `import with line/block comments` - Comment placement

2. **Multiple Declarations** (7 tests):
   - `multiple imports` - TextElem gaps between elements
   - `multiple const/override/alias declarations`
   - `imports and const declarations`
   - `mix of all declaration types`

3. **Structs** (3 tests):
   - `simple struct` - **Struct body not parsed**
   - `struct with trailing comma`
   - `struct with attributes`

4. **Functions** (5 tests):
   - `simple function with empty body` - **Function body not parsed**
   - `function with return type`
   - `function with parameters`
   - `function with attributes`
   - `function with parameter attributes`

5. **Directives** (5 tests):
   - `enable directive` - **Directives not parsed**
   - `requires directive`
   - `diagnostic directive`
   - `multiple directives`

6. **Statements** (9 tests):
   - `return statement` - **Statements not parsed**
   - `if/if-else statement`
   - `for/while loop`
   - `loop with break/continue`
   - `variable declarations in function`

7. **Expressions** (7 tests):
   - `binary expressions` - **Expressions not parsed**
   - `unary expressions`
   - `member access`
   - `array indexing`
   - `function calls`
   - `parenthesized expressions`
   - `complex nested expressions`

8. **Type References** (3 tests):
   - `simple type references` - **Template params not parsed**
   - `template type references`
   - `nested template types`

9. **Const Assert** (2 tests):
   - `const_assert` - **Not parsed**

10. **Complex Examples** (2 tests):
    - `compute shader with workgroups`
    - `vertex and fragment shader pair`

#### ConditionalTranslationCases: 16/49 (32%) 🔄

**Status**: @if works on declarations, fails on statements/directives.

**Passing** (16 tests):
- @if on global const/override/var/alias declarations (4)
- @if on function declarations (1)
- @if on function parameters (1)
- @if on structure declarations (1)
- @if short-circuiting AND (1)

**Failing** (33 tests) - Reason: **@if on unparsed elements**:
- @if on diagnostic/enable/requires directives (3) - directives not parsed
- @if on structure members (1) - struct bodies not parsed
- @if on statements (26):
  - compound, if, switch, loop, for, while statements
  - break, break-if, continue, continuing, return, discard, call
  - function-scope const_assert
- @if short-circuiting OR (1)

#### BulkTests: 22/76 (28%) 🔄

**Real-world Unity/WebGPU shaders**

**Failing** (54 tests) - Reason: **Functions/statements/expressions not parsed**

Sample failures:
- `basic.vert.wgsl` - vertex shader with function bodies
- `fullscreenTexturedQuad.wgsl` - texture sampling expressions
- `shadowMapping/*.wgsl` - complex lighting calculations
- `deferredRendering/*.wgsl` - G-buffer operations
- `particles/*.wgsl` - compute shaders

These all require full WGSL parsing (functions, statements, expressions).

#### ScopeWESLV2: 3/11 (27%) 🔄

**Status**: Basic scope structure works, complex cases fail.

**Passing** (3 tests):
- `two fns` - function declaration scopes
- `fn ref` - identifier references
- `alias` - type alias scopes

**Failing** (8 tests):
- `scope from simple fn` - function body scope
- `two fns, one with a decl` - nested scopes
- `struct` - struct member scopes
- `builtin scope` - builtin type references
- `builtin enums` - enum value scopes
- `texture_storage_2d` - template param scopes
- `ptr 2/3 params` - pointer template scopes

## Root Cause Analysis

### Why V2 Pass Rate is Low

V2 currently implements **Phase 1** of parsing (from original roadmap):
- ✅ Imports (100% complete)
- ✅ Attributes (@if, @elif, @else)
- ✅ Basic declarations (const, var, alias, override)
- ❌ **NOT IMPLEMENTED**: Everything else

### What's Missing

**Critical missing features** (blocking 70% of tests):

1. **Struct parsing** (~5% of failures)
   - Struct body parsing (`struct Foo { x: u32, y: f32 }`)
   - Member declarations
   - Member attributes

2. **Function parsing** (~40% of failures)
   - Function signatures (mostly working)
   - **Function bodies** (not implemented)
   - Statement parsing
   - Expression parsing

3. **Directive parsing** (~10% of failures)
   - `enable` directives
   - `requires` directives
   - `diagnostic` directives

4. **Statement parsing** (~30% of failures)
   - Control flow (if, for, while, loop, switch)
   - Returns, breaks, continues
   - Variable declarations in function scope
   - Assignments
   - Function calls

5. **Expression parsing** (~30% of failures)
   - Binary operations (+, -, *, /, etc.)
   - Unary operations (-, !, ~)
   - Member access (foo.bar)
   - Array indexing (arr[i])
   - Function calls (foo(a, b))
   - Type constructors (vec3f(1, 2, 3))
   - Parenthesized expressions

6. **Type reference parsing** (~15% of failures)
   - Template parameters (`texture_2d<f32>`)
   - Nested templates (`ptr<storage, array<vec4f>>`)

7. **Const assert** (~5% of failures)
   - `const_assert` statement parsing

## Recommendations

### Option 1: Continue with Custom Parser (Recommended)

**Rationale**: ImportCasesV2 at 100% proves the V2 architecture works. The remaining work is **implementing more grammar rules**, not fixing design issues.

**Estimated effort**: 3-4 weeks

**Phased approach**:

**Phase 3: Directives & Structs** (1 week)
- Implement directive parsing (enable, requires, diagnostic)
- Implement struct body parsing
- Target: ConditionalTranslationCases to 60%+, ParserV2Parity to 40%+

**Phase 4: Function Bodies & Statements** (1-2 weeks)
- Implement statement parsing (if, for, while, return, etc.)
- Implement basic expression parsing
- Target: ParserV2Parity to 70%+, BulkTests to 50%+

**Phase 5: Full Expressions & Polish** (1 week)
- Complete expression parsing (all operators, calls, member access)
- Template parameter parsing
- Const assert
- Target: All tests to 95%+

**Phase 6: Optimization & Cleanup** (1 week)
- Performance testing
- Bundle size validation
- Remove V1 code
- Documentation

### Option 2: Hybrid Approach

**Rationale**: Use V2 for imports (proven), fallback to V1 for everything else.

**Pros**:
- Can ship now
- Gets some V2 benefits (import parsing)

**Cons**:
- Maintains two parsers
- No bundle size savings
- Complex integration
- Confusing for maintenance

**Recommendation**: **Not recommended**. The hard part (architecture, imports, binding) is done. Finishing V2 is more valuable.

### Option 3: Pause V2 Development

**Rationale**: V1 works, V2 needs significant work.

**Pros**:
- Can focus on other priorities

**Cons**:
- Loses momentum
- ImportCasesV2 100% achievement wasted
- Bundle size remains large
- Difficult to resume later

**Recommendation**: **Not recommended**. We're 30% done with proven architecture.

## What to Tackle Next?

### Recommended Priority: **Directives & Structs** (Phase 3)

**Why this order**:

1. **Directives are simple** (~100 lines of code)
   - Similar pattern to imports
   - Will unlock ConditionalTranslationCases @if tests
   - High ROI (10% of failures for minimal code)

2. **Structs are well-scoped** (~150 lines of code)
   - Clear grammar rules
   - No complex nesting
   - Will unlock struct-related tests

3. **Defers complex work** (functions/statements/expressions)
   - These are interdependent
   - Best tackled together in Phase 4

**Estimated timeline**: 3-4 days
**Expected impact**:
- ConditionalTranslationCases: 32% → 60%+
- ParserV2Parity: 27% → 40%+
- Overall: 53% → 60%+

### Implementation Checklist (Phase 3)

**Directives** (Day 1-2):
- [ ] Parse `enable` directive with extensions
- [ ] Parse `requires` directive with requirements
- [ ] Parse `diagnostic` directive with severity/rule
- [ ] Add directive tests to ParserV2Parity
- [ ] Test @if on directives

**Structs** (Day 2-3):
- [ ] Parse struct body (`{ members }`)
- [ ] Parse struct members with types
- [ ] Handle struct member attributes
- [ ] Handle trailing commas
- [ ] Add struct tests to ParserV2Parity
- [ ] Test @if on struct members

**Polish** (Day 3-4):
- [ ] Fix multiple declarations (TextElem gaps)
- [ ] Fix comment handling
- [ ] Update progress docs
- [ ] Run full test suite

## Success Metrics

**Phase 3 Goals**:
- [ ] ConditionalTranslationCases ≥ 60% (currently 32%)
- [ ] ParserV2Parity ≥ 40% (currently 27%)
- [ ] BulkTests ≥ 30% (currently 28%)
- [ ] Overall pass rate ≥ 60% (currently 54%)
- [ ] No regressions on ImportCasesV2 (maintain 100%)

**Phase 4 Goals** (future):
- [ ] ParserV2Parity ≥ 80%
- [ ] BulkTests ≥ 60%
- [ ] Overall ≥ 80%

**Phase 5 Goals** (future):
- [ ] All test suites ≥ 95%
- [ ] Ready for production switch

## Notes for Next Session

1. **Start with directives** - quickest win
2. **Use existing patterns** - ImportParsers.ts is good reference
3. **Test incrementally** - Run `bb test:v2 ParseConditions` frequently
4. **Keep V1 pristine** - All changes in V2 code only
5. **Document as you go** - Update CLAUDE.md with new patterns

## Files to Focus On

**For Directives**:
- `src/parse/DirectiveParsers.ts` (already exists, needs V2 integration)
- `src/parse/v2/WeslParserV2.ts` (add directive parsing loop)

**For Structs**:
- `src/parse/v2/StructParsers.ts` (new file)
- `src/parse/v2/WeslParserV2.ts` (integrate struct parsing)

**For Testing**:
- `src/test/ParserV2Parity.test.ts` (add new test cases)
- `bb test:v2` (run full V2 suite)
- `bb test ParserV2Parity` (focused parity testing)

## Conclusion

**ImportCasesV2 at 100%** is a major milestone proving V2 architecture works. The remaining work is **implementing more grammar** using proven patterns.

**Recommended path forward**: Continue with Phase 3 (Directives & Structs) to reach 60% overall pass rate in 3-4 days, then Phase 4 (Functions & Statements) to reach 80%+ in 1-2 weeks.

The V2 parser is **not blocked by design issues**, just needs **more grammar coverage**. With 3-4 weeks of focused effort, V2 can replace V1 entirely.

---

**Previous**: [v2-progress-update-9.md](./v2-progress-update-9.md)
**Test Commands**: `bb test:v1` (V1 only), `bb test:v2` (V2 only), `bb test` (both)
