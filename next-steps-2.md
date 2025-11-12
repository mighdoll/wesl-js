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

## End-to-End Integration Tests (PRIORITY 0)

### Critical Discovery: Integration Tests Already Work with V2! 🎉

**Key Finding:** There's a global flag `weslParserConfig.useV2Parser` that switches between parsers.

**Location:** `tools/packages/wesl/src/ParseWESL.ts:43-44`
```typescript
export const weslParserConfig: WeslParserConfig = {
  useV2Parser: false,  // Default to V1, set to true for V2 testing
};
```

**How it works:**
```typescript
export function parseSrcModule(srcModule: SrcModule): WeslAST {
  if (weslParserConfig.useV2Parser) {
    return parseWeslV2(srcModule);  // Use V2
  }
  // Use V1 parser (default)
  // ...
}
```

### Existing Integration Test Suites

All these tests work through `parseSrcModule()` → automatically test V2 when flag is set!

#### 1. ImportCases.test.ts (~40 tests)
**What it tests:** Complex import scenarios from wesl-testsuite
- Package imports: `import pkg::bar::foo;`
- Import with as: `import foo as bar`
- Import collections: `import pkg::{Foo, Bar}`
- Transitive imports
- Circular imports
- Inline package references: `pkg::foo()`
- Super references: `import super::file1`
- Struct/const/alias imports
- Name conflicts and resolution

**How it works:**
```typescript
test("import package::bar::foo;", ctx => {
  // Calls link() → parseSrcModule() → Uses flag to pick parser
  return testFromCase(ctx.task.name, examplesByName);
});
```

**Why it matters:** Tests the FULL stack (parse → link → emit → compare)

#### 2. Linker.test.ts (~20+ tests)
**What it tests:** Basic linking scenarios
- Global var, alias, const_assert, struct, function
- Complex types (ptr, templates)
- Cross-references between elements
- Member access chains: `c.p.x`
- Struct self-references

**How it works:**
```typescript
test("link global var", async () => {
  const src = `var x: i32 = 1;`;
  const result = await linkTest(src);  // → parseSrcModule()
  expectTrimmedMatch(result, src);
});
```

#### 3. LinkPackage.test.ts (~3 tests)
**What it tests:** External package imports
- Import from npm packages (random_wgsl, multi_pkg)
- Transitive dependencies
- Tree shaking (unused code not included)

**Why it matters:** Tests real-world library usage

#### 4. BulkTests.test.ts (100+ tests)
**What it tests:** Large-scale real WESL files using stripWesl
```typescript
async function runBulkTest(baseDir: string, filePath: string): Promise<void> {
  const orig = await fs.readFile(filePath);
  const result = await link({ weslSrc: { "main.wgsl": orig } });
  expect(stripWesl(result.dest)).toBe(stripWesl(orig));  // Round-trip
}
```

**Why it matters:** Tests on real production WESL code

### Strategy: Progressive Integration Test Enablement

**Phase 0: Baseline (IMMEDIATE)** ⚡
1. Create `ImportCasesV2.test.ts` that sets the flag:
   ```typescript
   import { beforeAll, afterAll } from "vitest";
   import { weslParserConfig } from "../ParseWESL.ts";

   beforeAll(() => {
     weslParserConfig.useV2Parser = true;
   });

   afterAll(() => {
     weslParserConfig.useV2Parser = false;
   });

   // Copy all tests from ImportCases.test.ts
   test("import package::bar::foo;", ctx => caseTest(ctx));
   // ... etc
   ```

2. Run and document which tests pass/fail
3. Use failures to guide V2 feature prioritization

**Benefits:**
- ✅ End-to-end validation from day 1
- ✅ Tests full stack (parse → link → emit)
- ✅ Reveals missing features immediately
- ✅ Tests real-world scenarios, not just unit tests
- ✅ Prevents regressions as features are added

**Effort:** 2-4 hours to create V2 versions of test files

---

### Integration Test Files to Create

| Original Test | V2 Version | Tests | Status |
|---------------|------------|-------|--------|
| ImportCases.test.ts | ImportCasesV2.test.ts | ~40 | Create immediately |
| Linker.test.ts | LinkerV2.test.ts | ~20 | Create immediately |
| LinkPackage.test.ts | LinkPackageV2.test.ts | ~3 | Create when ready |
| BulkTests.test.ts | BulkTestsV2.test.ts | 100+ | Create when stable |

**Progressive enablement approach:**
1. **Week 1**: Run ImportCasesV2, expect ~50% to pass (basic features)
2. **Week 2**: Add missing features based on failures
3. **Week 3**: Run LinkerV2, fix new failures
4. **Week 4**: Run BulkTestsV2, validate at scale
5. **Week 5**: All integration tests pass with V2

---

## Three-Layer Testing Strategy

### Layer 0: End-to-End Integration Tests (NEW!) ⚡
**Status:** Infrastructure exists, V2 versions need creation

**What it validates:**
- Full pipeline: Parse → Link → Emit
- Real-world WESL code behavior
- Cross-module imports and dependencies
- Package system integration
- Complex feature interactions

**Why it's Layer 0:**
- **Most important** - Catches bugs that unit tests miss
- Tests actual user workflows
- Reveals missing features early
- Validates the entire system together

**Effort:** 2-4 hours to create V2 test files

---

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
| 0 | **Integration test setup** | **P0** | **2-4** |
| 1 | stripWesl validation | ✅ Done | 0 |
| 2.1 | Binding validation | P0 | 8-12 |
| 2.2 | Scope validation | P0 | 4-6 |
| 2.3 | Structural validation | P1 | 6-10 |
| 2.4 | Position validation | P2 | 2-4 |
| 3.1 | Missing V1 features | P1 | 15-20 |
| 3.2 | Comment element tests | P1 | 10-15 |
| 3.3 | Format independence | P2 | 3-5 |
| **Total** | | | **50-76 hours** |

**Note:** Integration tests reduce overall effort by guiding priorities - less time on low-value features!

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

### Phase 0: Integration Test Baseline (Week 1) ⚡ NEW!
**Goal:** Get end-to-end tests running with V2 immediately

**Tasks:**
1. ✅ Create ImportCasesV2.test.ts (1 hour)
2. ✅ Create LinkerV2.test.ts (1 hour)
3. ✅ Run tests, document pass/fail results (1 hour)
4. ✅ Analyze failures, create priority list (1 hour)
5. ✅ Fix critical blocking issues (variable)

**Exit criteria:**
- Integration test framework running
- Clear list of missing features/bugs
- At least 30% of ImportCases passing

**Effort:** 2-4 hours + fixes

**Why Phase 0:**
- **Immediate feedback** on real-world code
- **Guides priorities** - fix what breaks integration tests first
- **Prevents wasted effort** - no spending time on features that already work
- **Catches interactions** - unit tests miss cross-feature bugs

---

### Phase 1: Deep Semantic Validation (Week 1-2)
**Goal:** Ensure V2 AST is semantically equivalent to V1

**Tasks:**
1. ✅ Implement binding validation (8-12 hours)
2. ✅ Implement scope validation (4-6 hours)
3. ✅ Implement structural validation (6-10 hours)
4. ✅ Add to existing ParserV2Parity tests
5. ✅ Run and fix any issues found
6. ✅ Monitor ImportCasesV2 pass rate (target: 60%)

**Exit criteria:**
- All existing parity tests pass with deep validation
- ImportCasesV2 pass rate ≥ 60%

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
7. ✅ Monitor ImportCasesV2 pass rate (target: 80%)
8. ✅ Run LinkerV2 tests (target: 70% passing)

**Exit criteria:**
- V2 parses all V1 test cases correctly
- ImportCasesV2 pass rate ≥ 80%
- LinkerV2 pass rate ≥ 70%

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
7. ✅ Monitor ImportCasesV2 pass rate (target: 95%)
8. ✅ Run LinkPackageV2 tests

**Exit criteria:**
- Comments are separate elements, all tests pass
- ImportCasesV2 pass rate ≥ 95%
- LinkPackageV2 tests running

---

### Phase 4: V2 Independence (Week 4-5)
**Goal:** V2 can stand alone without V1

**Tasks:**
1. ✅ Add format independence tests (3-5 hours)
2. ✅ Add position validation (2-4 hours)
3. ✅ Run BulkTestsV2 (100+ tests)
4. ✅ Document V2 AST format
5. ✅ Prepare V1 removal plan

**Exit criteria:**
- V2 test suite is comprehensive and independent
- **ALL integration tests pass: ImportCasesV2, LinkerV2, LinkPackageV2, BulkTestsV2**
- 100% pass rate on integration tests

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

**Four-layer testing approach (Priority Order):**
0. **🎯 End-to-End Integration Tests** (HIGHEST PRIORITY) - Real-world workflows (ImportCases, Linker, LinkPackage, BulkTests)
1. **stripWesl** - Round-trip validation (output correctness)
2. **Deep semantic** - Binding, scope, structure validation (AST correctness)
3. **V2-native** - Feature-specific, comment, edge case tests (comprehensive coverage)

**Key Insight: Integration tests already work with V2!**
- Set `weslParserConfig.useV2Parser = true` in test setup
- All existing integration tests (160+ tests) can run with V2 immediately
- Provides immediate feedback on real-world code
- Guides feature prioritization based on actual breakage

**Comment elements:**
- Hybrid attachment model (leading/trailing attached, structural in contents)
- ~17-26 hours implementation
- ~28 new tests

**Timeline:**
- **Week 1: Phase 0 - Integration test baseline (2-4h)**
- Week 1-2: Phase 1 - Deep semantic validation (18-28h)
- Week 2-3: Phase 2 - Feature parity tests (15-20h)
- Week 3-4: Phase 3 - Comment elements (17-26h)
- Week 4-5: Phase 4 - V2 independence (5-9h)
- Week 5-6: Phase 5 - V1 removal

**Total effort:** 57-87 hours spread over 5-6 weeks (reduced from 64-98h due to better prioritization)

**Post-V1 Testing:**
- **Integration tests** (~160 tests) - ImportCases, Linker, LinkPackage, BulkTests
- V2-native test suite (~85 tests) - Features, comments, edge cases
- stripWesl validation - Round-trip correctness
- Semantic unit tests - Binding, scope validation

---

**Next Actions (Priority Order):**
1. **START PHASE 0 FIRST**: Create ImportCasesV2.test.ts and LinkerV2.test.ts (2-4 hours)
2. Run integration tests, document failures, prioritize fixes
3. Start Phase 1: Implement binding validation
4. Create SemanticComparison.ts utility
5. Enhance ParserV2Parity tests with deep validation

**Why integration tests first:**
- Immediate feedback on what's broken in real code
- Prevents wasting time on low-priority features
- Validates the whole system works together
- Catches bugs that unit tests miss
- Shows progress with every feature added
