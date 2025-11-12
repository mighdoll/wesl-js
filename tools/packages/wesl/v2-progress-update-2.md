# V2 Parser Progress Update #2

## Summary

Successfully resolved P0 Issue #2 (Statement Parsing) by implementing flat text+ref structure in statements to match V1's output format.

## Test Results

### LinkerV2.test.ts: 3/12 passing (25%)

**Passing Tests:**
- ✓ link a const_assert
- ✓ link a struct
- ✓ struct self reference

**Failing Tests (9):** All failures are whitespace/formatting issues, not semantic errors:

1. **Missing space after colon** (6 tests):
   - Emitting `x:i32` instead of `x: i32`
   - Affects: link global var, handle a ptr type, parse texture_storage_2d, struct member ref, and others

2. **Missing newline between declarations** (5 tests):
   - Emitting `}fn bar()` instead of `}\nfn bar()`
   - Affects: link an alias, struct after var, type inside fn, call cross reference, link a fn

## Key Fixes Implemented

### 1. Type Reference Binding (P0 Issue #1) ✅
**File:** `src/parse/TypeParsers.ts`
- Added `refIdent.refIdentElem = refIdentElem;` to link RefIdent to RefIdentElem
- Added `ctx.saveIdent(refIdent);` to save RefIdent to scope for binding

### 2. Expression Identifier Binding ✅
**File:** `src/parse/ExpressionParsers.ts`
- Added `ctx.saveIdent(ident);` in parseSimpleIdentifier()
- **Added `ctx.addElem(refIdentElem);`** to populate statement contents with ref elements

### 3. Statement Content Generation ✅
**Files:** `src/parse/StatementParsers.ts`

Changed approach from creating hierarchical expression AST to V1's flat text+ref structure:

- `parseSimpleStatement()`: Added openElem/closeElem to generate text elements
- Key insight: Expression elements (call-expression, binary-expression, etc.) don't have start/end positions, so can't be used in contents arrays
- Solution: Parse expressions for validation, but let `coverWithText()` generate text elements with ref elements interspersed

### 4. Expression Emitter Support ✅
**File:** `src/LowerAndEmit.ts`
- Added cases for expression element kinds: literal, binary-expression, unary-expression, call-expression, etc.
- Created `emitExpression()` function to handle expression AST nodes
- Note: These are currently not used in statement contents, but available for future use

### 5. Debug Tool Support ✅
**File:** `src/debug/ASTtoString.ts`
- Added cases for expression element kinds for debugging

## Architecture Insights

### V1 vs V2 AST Structure

**V1 (mini-parse combinator parser):**
```
statement
  text '{ '
  ref bar
  text '(); }'
```

**V2 (custom recursive descent parser):**
```
statement
  text '{'
  statement
    text ' '
    ref bar
    text '();'
  text ' }'
```

### Key Learning: Flat Text+Ref Structure Required

The emitter expects a flat structure with:
- **TextElem** for keywords, punctuation, whitespace
- **RefIdentElem** for identifier references (with start/end positions)

Expression elements like `call-expression` and `binary-expression` are **pure AST nodes without positions**, so they can't be used in contents arrays for text generation.

### Solution Pattern

1. Use `openElem()` to start collecting contents
2. Parse expressions (which internally calls `parseSimpleIdentifier()`)
3. `parseSimpleIdentifier()` calls `ctx.addElem(refIdentElem)` to add ref to contents
4. Use `closeElem()` to fill gaps with text elements via `coverWithText()`

This creates the flat text+ref structure the emitter expects.

## Remaining Work

### P1: Whitespace Formatting Issues

**Issue:** Missing space after colon in type annotations
- Source: Unknown - likely in how TypeParsers.ts or ConstParsers.ts generate text
- Impact: 6/12 tests failing
- Fix: Need to investigate where `:` token is consumed and ensure proper text generation

**Issue:** Missing newlines between declarations
- Source: Likely missing newlines in module-level text generation
- Impact: 5/12 tests failing
- Fix: Need to check how top-level declarations are spaced in ParseWESL.ts

### Next Steps

1. Fix colon spacing issue
2. Fix newline spacing between declarations
3. Run ImportCasesV2.test.ts to measure broader progress
4. Continue through Phase 0 priorities (see next-steps-2.md)

## Files Modified

- src/parse/TypeParsers.ts
- src/parse/ExpressionParsers.ts
- src/parse/StatementParsers.ts
- src/LowerAndEmit.ts
- src/debug/ASTtoString.ts

## Time Investment

Approximately 3-4 hours on P0 Issue #2, including:
- Debugging and analysis
- Multiple attempted approaches
- Final solution implementation
- Testing and verification
