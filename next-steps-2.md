# V2 Parser: Testing Strategy & Comment Elements

**Date:** November 12, 2025
**Status:** Planning document

---

## Overview

This document outlines the comprehensive testing strategy for V2 parser validation during development and after V1 removal, plus the plan for implementing comment elements.

---

## Current State

### V2 Parser Progress
- ✅ Core parsing complete (imports, declarations, functions, statements)
- ✅ Contents arrays populated for all elements
- ✅ Basic parity tests (80 tests, shallow validation)
- ✅ stripWesl round-trip validation exists
- ⚠️ Comments embedded in text elements (V1 style)
- ⚠️ Limited semantic validation (bindings, scopes not validated)

### Testing Gaps
From analysis of V1 Parse* tests vs ParserV2Parity:
- **Missing features**: Conditional compilation (@if/@elif/@else), switch statements, member access chains, package references (::)
- **Missing validation**: Binding relationships, scope hierarchy, deep structural comparison
- **Coverage**: V1 has ~173 tests, parity has ~80 tests, missing ~42 high-priority tests

---

## Three-Layer Testing Strategy

### Layer 1: stripWesl Round-Trip Validation ✅
**Status:** Already implemented in BulkTests.test.ts

**What it validates:**
- Parse → Link → Emit produces correct WGSL output
- Expression evaluation correctness
- Control flow correctness
- Conditional compilation evaluation
- Module resolution

**What it DOESN'T catch:**
- ❌ AST structure bugs (wrong node types but correct output)
- ❌ Binding bugs (references to wrong declarations)
- ❌ Scope hierarchy bugs
- ❌ Source position bugs
- ❌ Missing semantic fields

**Effort:** 0 hours (already working)

---

### Layer 2: Deep Semantic Comparison ⚠️
**Status:** Needs significant enhancement

**Current:** Shallow validation (counts + kinds only)
**Required:** Deep validation of semantic equivalence

#### 2.1 Binding Validation (CRITICAL)
**Priority:** P0 - Highest
**Risk:** Binding bugs cause subtle correctness issues that stripWesl won't catch

**What to validate:**
```typescript
function validateBindings(v1AST: WeslAST, v2AST: WeslAST): void {
  // For every RefIdent in V2:
  // 1. Find corresponding RefIdent in V1
  // 2. Check refersTo points to semantically equivalent DeclIdent
  // 3. Verify originalName matches
  // 4. Verify scope relationships match
  // 5. Check std flag matches (for WGSL builtins)
}
```

**Example bugs this catches:**
```wgsl
const x = 1;
const y = 2;
fn main() {
  let z = x;  // V2 might bind to wrong 'x' in nested scope
}
```

**Implementation steps:**
1. Create `tools/packages/wesl/src/test/SemanticComparison.ts`
2. Implement binding walker/validator
3. Add to ParserV2Parity.test.ts in existing test cases
4. Validate all RefIdent → DeclIdent bindings match

**Effort:** 8-12 hours

---

#### 2.2 Scope Validation (CRITICAL)
**Priority:** P0 - Highest
**Risk:** Scope bugs break variable shadowing, nested scoping

**What to validate:**
```typescript
function validateScopes(v1Scope: Scope, v2Scope: Scope): void {
  // 1. Check scope hierarchy (parent/child relationships)
  // 2. Verify declarations in each scope match
  // 3. Check scope IDs are consistent
  // 4. Validate scope nesting depth matches
  // 5. Check decl lookup results match
}
```

**Example bugs this catches:**
```typescript
// V1: rootScope -> fnScope -> blockScope
// V2: rootScope -> blockScope  ← Missing fnScope
```

**Implementation steps:**
1. Add scope comparison to SemanticComparison.ts
2. Walk scope tree for both V1 and V2
3. Compare structure and contents
4. Add to parity tests

**Effort:** 4-6 hours

---

#### 2.3 Structural Validation (IMPORTANT)
**Priority:** P1 - High
**Risk:** Wrong AST structure breaks downstream consumers (IDE, formatters)

**What to validate:**
```typescript
function validateStructure(v1Elem: AbstractElem, v2Elem: AbstractElem): void {
  // Deep equality for key semantic fields:
  // 1. kind matches
  // 2. names/identifiers match
  // 3. type references match (deep comparison)
  // 4. contents arrays match (recursively, excluding text/comment)
  // 5. attributes match
  // 6. for FnElem: params, returnType match
  // 7. for StructElem: members match
}
```

**Example bugs this catches:**
```typescript
// V1 creates: ConstElem
// V2 creates: OverrideElem  ← WRONG but emits correctly
```

**Implementation steps:**
1. Implement recursive structural comparison
2. Add semantic field comparison for each element type
3. Skip TextElem in V1, CommentElem in both (format differences)
4. Apply to all parity tests

**Effort:** 6-10 hours

---

#### 2.4 Position Validation (NICE TO HAVE)
**Priority:** P2 - Medium
**Risk:** Breaks IDE features (go-to-definition, hover)

**What to validate:**
```typescript
function validatePositions(v1Elem: AbstractElem, v2Elem: AbstractElem): void {
  // Check start/end positions match (within reason)
  // Some difference acceptable due to whitespace handling
}
```

**Implementation steps:**
1. Add position comparison (with tolerance)
2. Apply to spot checks in parity tests

**Effort:** 2-4 hours

---

### Layer 3: V2-Native Test Suite 📝
**Status:** Needs creation

**Purpose:**
- Test V2-specific features (comment elements, new AST format)
- Achieve independence from V1 (for when V1 is removed)
- Cover edge cases not in V1

**What to test:**

#### 3.1 Missing V1 Features (HIGH PRIORITY)
Add ~42 tests for features tested in V1 but missing from parity:

**Conditional Compilation** (~25 tests)
- @if/@elif/@else on all element types
- Complex boolean conditions
- Nested conditionals
- Conditional statements

**Package References** (~8 tests)
- `pkg::foo()` in function calls
- `pkg::Type` in type references
- `pkg::value` in expressions
- Keywords after `::` (like `foo::else()`)

**Member Access Chains** (~7 tests)
- Component access: `v.x`, `v.xyz`
- Chained access: `a.b.c`, `c.p0.t0.x`
- With array indexing: `a.b[0]`

**Switch Statements** (~2 tests)
- switch/case/default
- Multiple case clauses

**Template Edge Cases** (~3 tests)
- Space before `<`: `array <T, 4>`
- Nested `>>`: `vec2<array<T, 4>>`
- Bit shift in array size: `array<i32, 1 << 1>`

**Other Edge Cases** (~5 tests)
- Unicode identifiers (Δέλτα, 朝焼け, etc.)
- `_` assignment (discard)
- Struct constructors
- Return type attributes

**Effort:** 15-20 hours

---

#### 3.2 Comment Element Tests (NEW FEATURE)
Once comment elements are implemented:

**Basic Comment Extraction** (~10 tests)
```typescript
test("V2: line comments extracted as elements", () => {
  const src = "// Comment\nconst x = 1;";
  const ast = parseV2(src);
  expect(ast.moduleElem.contents[0].kind).toBe("comment");
  expect(ast.moduleElem.contents[0].text).toBe("// Comment");
});

test("V2: block comments extracted", () => {
  const src = "/* Block */\nconst x = 1;";
  const ast = parseV2(src);
  expect(ast.moduleElem.contents[0].style).toBe("block");
});
```

**Attached Comments** (~8 tests)
```typescript
test("V2: leading comments attach to element", () => {
  const src = "// Leading\nconst x = 1;";
  const ast = parseV2(src);
  const constElem = ast.moduleElem.contents.find(e => e.kind === "const");
  expect(constElem.leadingComments).toHaveLength(1);
  expect(constElem.leadingComments[0].text).toBe("// Leading");
});

test("V2: trailing comments attach to element", () => {
  const src = "const x = 1;  // Trailing";
  const ast = parseV2(src);
  const constElem = ast.moduleElem.contents.find(e => e.kind === "const");
  expect(constElem.trailingComments).toHaveLength(1);
});
```

**Structural Comments** (~6 tests)
```typescript
test("V2: comments between declarations", () => {
  const src = `
    const x = 1;
    // Between declarations
    const y = 2;
  `;
  const ast = parseV2(src);
  // Comment should be in contents array between the two consts
  expect(ast.moduleElem.contents).toEqual([
    expect.objectContaining({ kind: "const" }),
    expect.objectContaining({ kind: "comment", text: "// Between declarations" }),
    expect.objectContaining({ kind: "const" })
  ]);
});
```

**Comment Emission** (~4 tests)
```typescript
test("V2: emit preserves comments", () => {
  const src = "// Comment\nconst x = 1;";
  const ast = parseV2(src);
  const emitted = emit(ast);
  expect(emitted).toContain("// Comment");
});
```

**Effort:** 10-15 hours

---

#### 3.3 Format Independence Tests (~5 tests)
Validate V2 can handle sources that V1 couldn't or handled poorly:
- Very large files (performance)
- Deeply nested structures
- Complex comment patterns
- Edge whitespace cases

**Effort:** 3-5 hours

---

### Total Testing Effort Estimate

| Layer | Component | Priority | Effort (hours) |
|-------|-----------|----------|----------------|
| 1 | stripWesl validation | ✅ Done | 0 |
| 2.1 | Binding validation | P0 | 8-12 |
| 2.2 | Scope validation | P0 | 4-6 |
| 2.3 | Structural validation | P1 | 6-10 |
| 2.4 | Position validation | P2 | 2-4 |
| 3.1 | Missing V1 features | P1 | 15-20 |
| 3.2 | Comment element tests | P1 | 10-15 |
| 3.3 | Format independence | P2 | 3-5 |
| **Total** | | | **48-72 hours** |

---

## Comment Elements Implementation

### Current State
Comments are embedded in TextElem (like V1):
```typescript
// V1/V2 current:
ConstElem {
  contents: [
    TextElem("const "),
    TypedDeclElem(...),
    TextElem(" = 1;  // trailing comment")
  ]
}
```

### Target State
Comments as separate elements with hybrid attachment:
```typescript
// V2 target:
ConstElem {
  leadingComments: [CommentElem("// leading comment")],
  trailingComments: [CommentElem("// trailing comment")],
  contents: [
    DeclIdentElem(...),
    TypeRefElem(...)
  ]
}

ModuleElem {
  contents: [
    ConstElem(...),
    CommentElem("// structural comment between declarations"),
    ConstElem(...)
  ]
}
```

### Design: Hybrid Attachment Model

**Two kinds of comments:**

1. **Associated comments** (belong to specific element)
   - Leading: Block comments before element
   - Trailing: Same-line comments after element
   - **Storage:** Attached to element as `leadingComments` / `trailingComments`
   - **Behavior:** Move when element moves (AST transforms)

2. **Structural comments** (between elements, standalone)
   - Comments between declarations
   - Comments between struct members
   - **Storage:** As CommentElem in contents[] array
   - **Behavior:** Preserve exact source position/order

### Implementation Steps

#### Step 1: Define CommentElem Type
**File:** `tools/packages/wesl/src/AbstractElems.ts`

```typescript
export interface CommentElem extends AbstractElemBase {
  kind: "comment";
  text: string;         // Full comment text including // or /* */
  style: "line" | "block";
}

// Add to AbstractElemBase:
export interface AbstractElemBase {
  kind: string;
  start: number;
  end: number;
  srcModule: SrcModule;

  // Comment attachment (optional - only on elements that can have comments)
  leadingComments?: CommentElem[];
  trailingComments?: CommentElem[];
}
```

**Effort:** 0.5 hours

---

#### Step 2: Update Parser to Extract Comments
**File:** `tools/packages/wesl/src/parse/v2/WeslParserV2.ts`

**Current:** Comments are skipped via `skipWhitespace()`

**Change to:**
```typescript
class CommentCollector {
  private pendingLeading: CommentElem[] = [];
  private pendingTrailing: CommentElem[] = [];

  collectCommentsUntil(position: number): CommentElem[] {
    // Collect comments from current position to target position
    // Classify as leading (separate lines) or trailing (same line)
  }

  attachToElement(elem: AbstractElem): void {
    elem.leadingComments = this.pendingLeading;
    elem.trailingComments = this.pendingTrailing;
    this.reset();
  }

  flushAsStructural(contents: AbstractElem[]): void {
    // Comments that weren't attached become structural
    this.pendingLeading.forEach(c => contents.push(c));
    this.reset();
  }
}
```

**Algorithm:**
1. When skipping whitespace, collect comments instead of discarding
2. After parsing element, check if comments are same-line (trailing) or separate (leading)
3. Attach leading/trailing to element
4. Before parsing next element, flush unattached comments as structural

**Example:**
```wgsl
// Leading 1
// Leading 2
const x = 1;  // Trailing

// Structural between

const y = 2;
```

Parse flow:
```typescript
// After skipWhitespace before "const x":
collector.pendingLeading = ["// Leading 1", "// Leading 2"]

// Parse "const x = 1;"
const constX = parseConst();

// After semicolon, check for trailing:
collector.pendingTrailing = ["// Trailing"]

// Attach:
constX.leadingComments = collector.pendingLeading;
constX.trailingComments = collector.pendingTrailing;

// Skip whitespace before next element:
collector.pendingLeading = ["// Structural between"]

// Before parsing "const y", flush:
contents.push(...collector.pendingLeading);
```

**Effort:** 8-12 hours

---

#### Step 3: Update Emitter to Handle CommentElem
**File:** `tools/packages/wesl/src/emit/EmitWGSL.ts`

**Add comment emission:**
```typescript
function emitElement(elem: AbstractElem): string {
  // Emit leading comments
  if (elem.leadingComments) {
    for (const comment of elem.leadingComments) {
      emit(comment.text);
      emit('\n');
    }
  }

  // Emit element itself
  switch (elem.kind) {
    case "comment":
      return emitComment(elem);
    case "const":
      return emitConst(elem);
    // ... etc
  }

  // Emit trailing comments
  if (elem.trailingComments) {
    emit('  ');  // Space before trailing
    for (const comment of elem.trailingComments) {
      emit(comment.text);
    }
  }
}

function emitComment(elem: CommentElem): string {
  return elem.text;  // Already includes // or /* */
}
```

**Edge cases:**
- Minified mode: Skip comments (or keep trailing for #replace directives)
- Indentation: Leading comments match element indentation
- Spacing: One space before trailing comments

**Effort:** 4-6 hours

---

#### Step 4: Update ASTtoString for Debugging
**File:** `tools/packages/wesl/src/debug/ASTtoString.ts`

**Add comment display:**
```typescript
function elemToString(elem: AbstractElem, indent: number): string {
  const lines: string[] = [];

  // Show leading comments
  if (elem.leadingComments) {
    for (const comment of elem.leadingComments) {
      lines.push(`${' '.repeat(indent)}leading: ${comment.text}`);
    }
  }

  // Show element
  lines.push(`${' '.repeat(indent)}${elem.kind} ...`);

  // Show trailing comments
  if (elem.trailingComments) {
    for (const comment of elem.trailingComments) {
      lines.push(`${' '.repeat(indent)}trailing: ${comment.text}`);
    }
  }

  // Show structural comments in contents
  if ('contents' in elem) {
    for (const child of elem.contents) {
      if (child.kind === "comment") {
        lines.push(`${' '.repeat(indent + 2)}comment: ${child.text}`);
      } else {
        lines.push(elemToString(child, indent + 2));
      }
    }
  }

  return lines.join('\n');
}
```

**Effort:** 2-3 hours

---

#### Step 5: Remove TextElem (After Comment Support Complete)
Once comments are extracted:
1. Remove TextElem from AbstractElems.ts
2. Remove text element creation from parser
3. Update all type guards/filters that check for "text"
4. Update snapshots

**Effort:** 2-4 hours

---

### Comment Implementation Total Effort
| Step | Description | Effort (hours) |
|------|-------------|----------------|
| 1 | Define CommentElem type | 0.5 |
| 2 | Update parser to extract comments | 8-12 |
| 3 | Update emitter for comments | 4-6 |
| 4 | Update ASTtoString | 2-3 |
| 5 | Remove TextElem | 2-4 |
| **Total** | | **16.5-25.5 hours** |

---

## Timeline & Phasing

### Phase 1: Deep Semantic Validation (Week 1-2)
**Goal:** Ensure V2 AST is semantically equivalent to V1

**Tasks:**
1. ✅ Implement binding validation (8-12 hours)
2. ✅ Implement scope validation (4-6 hours)
3. ✅ Implement structural validation (6-10 hours)
4. ✅ Add to existing ParserV2Parity tests
5. ✅ Run and fix any issues found

**Exit criteria:** All existing parity tests pass with deep validation

---

### Phase 2: Complete Feature Parity (Week 2-3)
**Goal:** Test all V1 features in V2

**Tasks:**
1. ✅ Add conditional compilation tests (~25 tests)
2. ✅ Add package reference tests (~8 tests)
3. ✅ Add member access tests (~7 tests)
4. ✅ Add switch statement tests (~2 tests)
5. ✅ Add template edge case tests (~3 tests)
6. ✅ Add other edge cases (~5 tests)

**Exit criteria:** V2 parses all V1 test cases correctly

---

### Phase 3: Comment Elements (Week 3-4)
**Goal:** Replace TextElem with CommentElem

**Tasks:**
1. ✅ Define CommentElem type (0.5 hours)
2. ✅ Implement parser comment extraction (8-12 hours)
3. ✅ Update emitter (4-6 hours)
4. ✅ Update ASTtoString (2-3 hours)
5. ✅ Add V2 comment tests (~28 tests, 10-15 hours)
6. ✅ Remove TextElem (2-4 hours)

**Exit criteria:** Comments are separate elements, all tests pass

---

### Phase 4: V2 Independence (Week 4-5)
**Goal:** V2 can stand alone without V1

**Tasks:**
1. ✅ Add format independence tests (3-5 hours)
2. ✅ Add position validation (2-4 hours)
3. ✅ Verify stripWesl passes on all BulkTests
4. ✅ Document V2 AST format
5. ✅ Prepare V1 removal plan

**Exit criteria:** V2 test suite is comprehensive and independent

---

### Phase 5: V1 Removal (Week 5-6)
**Goal:** Remove V1 parser, keep only V2

**Tasks:**
1. ✅ Switch default parser to V2
2. ✅ Remove V1 parser code
3. ✅ Remove Parse* test files (no longer needed)
4. ✅ Remove ParserV2Parity tests (no longer needed)
5. ✅ Keep V2-native tests as main test suite
6. ✅ Keep stripWesl / BulkTests
7. ✅ Update documentation

**Exit criteria:** V1 is removed, all tests still pass

---

## Post-V1 Testing Strategy

Once V1 is removed, testing relies on:

### Primary: V2-Native Test Suite
**Location:** `tools/packages/wesl/src/test/ParserV2.test.ts` (new file)

**Content:**
- All tests from Phase 2 (missing V1 features) ~50 tests
- All tests from Phase 3 (comment elements) ~28 tests
- Format independence tests ~5 tests
- Total: **~85+ comprehensive tests**

**Purpose:** Direct validation of V2 parser correctness

---

### Secondary: stripWesl Round-Trip
**Location:** `tools/packages/wesl/src/test/BulkTests.test.ts` (existing)

**Content:**
- Parse → Link → Emit → Compare with original
- Runs on hundreds of real WESL files

**Purpose:** Integration testing, real-world validation

---

### Tertiary: Semantic Unit Tests
**Location:** Various test files for specific features

**Examples:**
- Binding resolution tests
- Scope management tests
- Type checking tests
- Conditional compilation evaluation tests

**Purpose:** Unit test individual components

---

## Migration of Existing Tests

### Keep (Move to V2-native suite)
- ✅ All functional tests (what WESL features work)
- ✅ Edge case tests (unicode, special syntax)
- ✅ Error handling tests (invalid syntax)
- ✅ Real-world examples

### Remove (No longer needed after V1 removal)
- ❌ ParserV2Parity.test.ts (V1 vs V2 comparison)
- ❌ Parse* tests checking V1 AST format with TextElem

### Transform (Update expectations)
- AST format tests: Update to expect CommentElem not TextElem
- Snapshot tests: Regenerate for new format

---

## Success Metrics

### During Development
- ✅ All ParserV2Parity tests pass with deep validation
- ✅ stripWesl round-trip succeeds on all BulkTests
- ✅ No binding/scope bugs found in manual testing
- ✅ V2 parses all V1 test cases

### After V1 Removal
- ✅ 85+ V2-native tests passing
- ✅ BulkTests continue to pass
- ✅ No regressions reported
- ✅ Performance meets or exceeds V1

---

## Risk Mitigation

### Risk: Binding bugs slip through
**Mitigation:** Deep binding validation (Phase 1, P0)

### Risk: Missing edge cases
**Mitigation:** Comprehensive feature parity tests (Phase 2)

### Risk: Comment extraction breaks formatting
**Mitigation:** Extensive comment tests + emission validation (Phase 3)

### Risk: V1 removal causes regressions
**Mitigation:** Keep stripWesl validation, gradual rollout (Phase 5)

---

## Open Questions

1. **Conditional compilation evaluation:** Does V2 need to evaluate @if conditions during parsing, or is that a linker responsibility?
   - Current: V1 parser creates conditional elements, linker evaluates
   - Recommendation: Keep same approach for V2

2. **Comment minification:** Should minified output preserve comments?
   - Recommendation: Strip all comments except those with directives (like #replace)

3. **JSDoc/doc comments:** Should V2 distinguish documentation comments from regular comments?
   - Recommendation: Not initially - treat all as CommentElem, add JSDoc parsing later if needed

4. **Source maps:** Should comments affect source map generation?
   - Recommendation: Yes - preserve positions for IDE features

---

## Summary

**Three-layer testing approach:**
1. **stripWesl** - Round-trip validation (output correctness)
2. **Deep semantic** - Binding, scope, structure validation (AST correctness)
3. **V2-native** - Feature-specific, comment, edge case tests (comprehensive coverage)

**Comment elements:**
- Hybrid attachment model (leading/trailing attached, structural in contents)
- ~17-26 hours implementation
- ~28 new tests

**Timeline:**
- Week 1-2: Deep semantic validation
- Week 2-3: Feature parity tests
- Week 3-4: Comment elements
- Week 4-5: V2 independence
- Week 5-6: V1 removal

**Total effort:** 64-98 hours spread over 5-6 weeks

**Post-V1:** V2-native test suite (~85 tests) + stripWesl validation + semantic unit tests

---

**Next Actions:**
1. Start Phase 1: Implement binding validation
2. Create SemanticComparison.ts utility
3. Enhance ParserV2Parity tests with deep validation
