# Comment Positioning & V1/V2 Validation Strategy

## Current State: V1 Comment Handling

**Finding:** V1 does NOT extract comments as separate elements. They're embedded in text elements.

**Example:**
```wesl
// Before const
const x = 1;  // After const
```

**V1 AST:**
```
module
  text '\n// Before const\n'
  const %x
    text 'const '
    typeDecl %x
    text ' = 1;'
  text '  // After const\n'
```

**Implications:**
- Comments are just unparsed text (not special)
- Position is implicit (whatever text element they're in)
- No semantic meaning attached
- Emitted by copying source ranges

---

## Question 1: Which Elements Can Have Comments?

### Analysis from V1 AST

Comments can appear in:

**1. Module-level (between declarations)**
```
module
  text '// comment between declarations'
  const %x
```

**2. Inside element text (trailing)**
```
const %x
  text ' = 1;  // after value'
```

**3. Inside containers (struct members)**
```
struct Foo
  text ' {\n  // before first member\n  '
  member x: i32
  text ',  // after member\n  '
  member y: i32
```

**4. Inside statement blocks**
```
statement
  text '{\n  // inside body\n  return '
  ref x
  text ';  // after statement\n}'
```

### Answer: ALL Container Elements

Any element with `contents: AbstractElem[]` can have comments:
- ModuleElem
- StructElem
- FnElem
- StatementElem
- ConstElem, GlobalVarElem, etc. (for trailing comments)

---

## Question 2: Is Before/After/Inner Sufficient?

### Proposed Comment Positioning

**Three positions are NOT sufficient.** We need:

**1. Leading (block comments before element)**
```wesl
// This is a leading comment
// It can span multiple lines
const x = 1;
```
- Attached to: ConstElem
- Position: `leading`
- Rendered: Before element

**2. Trailing (same-line comments)**
```wesl
const x = 1;  // This is trailing
```
- Attached to: ConstElem
- Position: `trailing`
- Rendered: End of same line

**3. Inner (comments between children)**
```wesl
struct Foo {
  x: i32,
  // This is an inner comment between members
  y: i32,
}
```
- Attached to: StructElem
- Position: `inner`
- Index: Between which children?

**4. Inline (mid-expression) - SPECIAL CASE**
```wesl
const x = 1 + /* inline */ 2;
```
- Attached to: ConstElem (or expression?)
- Position: `inline`
- **Problem:** Hard to attach to specific expression node

### Recommended Comment Model

```typescript
interface CommentElem extends AbstractElemBase {
  kind: "comment";
  text: string;         // Comment text including // or /* */
  style: "line" | "block";
  position: CommentPosition;
}

type CommentPosition =
  | { kind: "leading" }                    // Before parent element
  | { kind: "trailing" }                   // Same line as parent
  | { kind: "inner", after: number }       // Between children (after index N)
  | { kind: "detached" };                  // Orphaned (between top-level)

interface CommentAttachment {
  element: ContainerElem;
  comments: CommentElem[];
}
```

### Edge Cases

**Detached comments (module-level):**
```wesl
const x = 1;

// This comment is between declarations
// It's not clearly attached to either

const y = 2;
```
- Solution: Attach as `inner` comment to ModuleElem
- Track position: after which child index

**Multiple trailing comments:**
```wesl
const x = 1;  // Comment 1  // Comment 2 ???
```
- This is invalid WESL/WGSL (only one line comment allowed)
- V1 would capture as one text element
- V2 should capture as one comment

**Block comments mid-line:**
```wesl
const x = /* weird */ 1;
```
- V1: Captured in text element `text ' = /* weird */ 1;'`
- V2 options:
  - Treat as text (not a comment)
  - Extract as inline comment
  - **Recommended:** Leave in text for now (rare case)

---

## Question 3: Should We Migrate V1 to New Format?

### Pros of Migrating V1

✅ **Single AST Format**
- Easier to maintain (one format, not two)
- Easier to validate V2 (direct AST comparison)
- Forces emission/formatting to work correctly

✅ **Get Benefits Now**
- 35% smaller AST in production
- Better memory usage immediately
- Cleaner codebase

✅ **Less Technical Debt**
- Don't carry two formats forward
- V1 and V2 converge to same target

### Cons of Migrating V1

❌ **Risk to Stable Code**
- V1 is working, tested, in production
- Any bugs affect existing users
- Regression risk

❌ **Snapshot Hell**
- 208 snapshots need updating
- Manual review of all diffs
- Easy to miss semantic changes

❌ **Time Investment**
- 1-2 weeks to migrate V1
- Takes focus away from V2
- V1 might be deprecated soon anyway

❌ **Emission Changes**
- Need to implement regenerative emitter for V1
- Could introduce WGSL output bugs
- stripWesl tests might catch, but not all cases

### Recommendation: DON'T Migrate V1

**Reasoning:**
1. V1 is stable and working
2. V2 will replace V1 eventually
3. Risk > Reward for changing working code
4. Better to invest time in V2

**Exception:** Only migrate V1 if:
- V2 will take >6 months to complete
- Bundle size is critical NOW
- You want to validate emission logic with V1 first

---

## Question 4: How to Validate V2 Without V1 Migration?

### Option A: stripWesl Comparison (Recommended)

**Approach:**
```typescript
// For each test case:
const v1AST = parseWithV1(source);
const v1Output = emit(v1AST);

const v2AST = parseWithV2(source);
const v2Output = emit(v2AST);

expect(stripWesl(v2Output)).toBe(stripWesl(v1Output));
```

**Pros:**
- Already implemented
- Validates semantic equivalence
- Catches output bugs

**Cons:**
- Doesn't validate AST structure
- Can't catch AST-only issues

**Use for:** Round-trip validation (source → parse → emit → compare)

### Option B: Semantic AST Comparison

**Approach:**
```typescript
function compareSemantics(v1: AbstractElem, v2: AbstractElem): boolean {
  if (v1.kind !== v2.kind) return false;

  // Compare semantic fields only (ignore text/comments)
  switch (v1.kind) {
    case "const":
      return v1.name.ident.originalName === v2.name.ident.originalName &&
             compareExpr(v1.init, v2.init);
    // ... etc
  }
}
```

**Pros:**
- Validates AST structure
- Ignores text/comment differences
- Can catch structural bugs

**Cons:**
- Need to write comparison logic for each element type
- 20-30 element types to handle
- Maintenance burden

**Use for:** AST structure validation (parse only, no emit)

### Option C: V2-Specific Test Suite

**Approach:**
Create new tests specifically for V2 format:

```typescript
test("V2: const with comments", () => {
  const src = `
    // Leading comment
    const x = 1;  // Trailing
  `;

  const ast = parseV2(src);

  expect(ast.moduleElem.contents).toHaveLength(1);
  const constElem = ast.moduleElem.contents[0];
  expect(constElem.kind).toBe("const");
  expect(constElem.comments).toEqual([
    { text: "// Leading comment", position: "leading" },
    { text: "// Trailing", position: "trailing" }
  ]);
});
```

**Pros:**
- Clean, purpose-built tests
- Can test V2-specific features
- No dependency on V1

**Cons:**
- Need to write many new tests
- Potential coverage gaps
- Duplication of test cases

**Use for:** V2-specific features (comments, new AST structure)

### Option D: AST Format Converter

**Approach:**
Write a converter that transforms V1 AST to expected V2 format:

```typescript
function convertV1SnapshotToV2(v1Snapshot: string): string {
  // Parse V1 AST string
  // Convert to V2 format (remove text elements, add comments)
  // Return V2 expected format
}

// Then use in tests:
test("const declaration", () => {
  const v1Expected = `
    module
      text 'const '
      const %x
  `;
  const v2Expected = convertV1SnapshotToV2(v1Expected);
  expect(astToStringV2(parseV2(src))).toBe(v2Expected);
});
```

**Pros:**
- Reuses V1 test expectations
- Programmatic conversion
- Can validate conversion logic separately

**Cons:**
- Converter could have bugs
- Complex logic for text → comment conversion
- Still need manual review

**Use for:** Bootstrapping V2 tests from V1 tests

### Option E: Hybrid Mode in V2

**Approach:**
V2 supports BOTH formats (via config):

```typescript
interface V2Config {
  astFormat: "legacy" | "comments-only";
}

// Can emit V1-style AST for snapshot comparison
const v2InV1Format = parseV2(src, { astFormat: "legacy" });
expect(v2InV1Format).toEqual(parseV1(src));
```

**Pros:**
- Direct comparison possible
- Gradual migration path
- Can validate against V1 snapshots

**Cons:**
- Defeats purpose of V2 format
- Complex: two AST formats in V2
- Technical debt

**Use for:** Migration period only

---

## Recommended Validation Strategy

### Phase 1: During V2 Development

**Primary:** stripWesl comparison
```bash
# Run all tests with both parsers, compare output
DUAL_PARSER=true pnpm test
```

**Secondary:** Semantic comparison for key elements
```typescript
// Write comparison logic for critical elements only:
- Declarations (const, var, fn, struct)
- References (binding verification)
- Expressions (value correctness)
```

**Tertiary:** V2-specific tests
```typescript
// Focus on V2 features:
- Comment attachment
- AST structure (no text elements)
- Emission correctness
```

### Phase 2: After V2 Complete

**Primary:** Full V2 test suite
- 200+ tests covering all WESL features
- V2-native expectations (not converted from V1)
- Comment handling tests

**Secondary:** Cross-validation
- Run same source through V1 and V2
- Compare emitted WGSL (stripWesl)
- Manual inspection of differences

**Tertiary:** Production testing
- Gradual rollout with V2
- Monitor for issues
- Keep V1 as fallback

---

## Summary Recommendations

### Comment Positioning

**Use 4 positions:**
1. `leading` - Block comments before element
2. `trailing` - Same-line comments after element
3. `inner` - Comments between children (with index)
4. `detached` - Module-level comments between declarations

**Don't worry about:**
- Inline mid-expression comments (rare, treat as text)
- Multiple trailing comments (invalid WGSL)

### V1 Migration

**Don't migrate V1** - Too risky for stable code

**Instead:**
- V2 gets new format
- V1 stays as-is
- Validate via stripWesl + selective semantic comparison

### Validation

**Three-pronged approach:**
1. **stripWesl** - Round-trip output validation
2. **Semantic comparison** - Structure validation for key elements
3. **V2 tests** - Native tests for V2 features

**Effort estimate:**
- stripWesl: Already working (0 hours)
- Semantic comparison: 8-12 hours (selective, not complete)
- V2 tests: 20-30 hours (comprehensive suite)
- **Total: 30-40 hours** over lifetime of V2 development

---

## Open Questions

1. **Comment preservation in minified output?**
   - Should `emit({ minify: true })` keep comments?
   - Probably NO (comments inflate size)

2. **Comment-only directives?**
   - `//@if DEBUG` style comments
   - Probably treat as regular comments, not directives

3. **Source maps for comments?**
   - Should comments have source positions?
   - YES - needed for IDE hover, etc.

4. **JSDoc-style comments?**
   - `/** @param x */` style
   - Probably just treat as block comments for now
   - Future: parse JSDoc structure

---

**Date:** November 12, 2025
**Status:** Analysis complete, awaiting decision
