# V1 vs V2 Text Element Granularity Analysis

**Question:** Should we change V1's text element format to match V2's more granular approach, or vice versa?

## Current Differences

### V1 (Combinator Parser)
```
const %x
  text 'const '    // Keyword + trailing space
  typeDecl %x
    decl %x
  text ' = 1;'     // Expression + semicolon
```

### V2 (Recursive Descent)
```
const %x
  text 'const'     // Keyword only
  typeDecl %x
    text ' '       // Space separately
    decl %x
  text ' = 1;'     // Expression + semicolon
```

**Difference:** V2 creates text elements for every gap between parsed children, while V1 groups tokens (keyword+space, punctuation+space).

## Impact Assessment

### 1. Test Snapshots (⚠️ High Impact)

**Files Affected:** 10 test files
**Total Occurrences:** 208 uses of `astToString()` / `toMatchInlineSnapshot()`

**Breakdown:**
- `ParseWESL.test.ts`: 124 snapshots (⚠️ largest)
- `ParseConditions.test.ts`: 34 snapshots
- `ScopeWESL.test.ts`: 25 snapshots
- `TransformBindingStructs.test.ts`: 8 snapshots
- `ParseElif.test.ts`: 5 snapshots
- `Reflection.test.ts`: 5 snapshots
- Others: <5 each

**If we change V1 → match V2:**
- Update 208 snapshot assertions
- Run tests, let vitest update snapshots automatically
- Review diffs to ensure changes are cosmetic

**If we change V2 → match V1:**
- No snapshot changes needed
- But requires complex V2 refactoring (see below)

### 2. stripWesl Round-Trip Testing (✅ No Impact)

**Finding:** `stripWesl()` operates at the **token level**, not AST level.

**How it works:**
```typescript
// BulkTests.test.ts
expect(stripWesl(result.dest)).toBe(stripWesl(orig));
```

- Tokenizes source text
- Normalizes whitespace
- Removes trailing commas
- Compares normalized token streams

**Conclusion:** Text element granularity doesn't affect stripWesl at all. It re-tokenizes from source, ignoring AST structure.

### 3. Semantic Analysis (✅ No Impact)

**Finding:** Text elements are only used for:

1. **Emission** (`LowerAndEmit.ts`):
   ```typescript
   function emitText(e: TextElem, ctx: EmitContext): void {
     ctx.srcBuilder.addCopy(e.start, e.end);  // Copies source range
   }
   ```

2. **Whitespace Filtering** (`LowerAndEmit.ts`):
   ```typescript
   if (e.kind === "text") {
     const text = srcModule.src.slice(start, end);
     if (text.trim() === "") return;  // Skip whitespace-only
   }
   ```

3. **Display** (`ASTtoString.ts`):
   ```typescript
   if (kind === "text") {
     str.add(` '${srcModule.src.slice(start, end)}'`);
   }
   ```

**Conclusion:** No semantic analysis depends on text element boundaries. They just check:
- Is it text? → Copy the source range
- Is it whitespace? → Skip it

### 4. Expression Structure Differences

**Separate Issue:** V1 breaks expressions into `RefIdentElem`:

**V1:**
```
const_assert
  text 'const_assert '
  ref x              // RefIdentElem extracted
  text ' < '
  ref y              // RefIdentElem extracted
  text ';'
```

**V2:**
```
const_assert
  text 'const_assert x < y;'  // Entire expression as text
```

**This is INDEPENDENT of text element granularity.** V2's expression parser doesn't populate contents at all.

## Effort Estimates

### Option A: Change V1 to Match V2 (More Granular)

**V1 Changes Required:**
1. Modify `coverWithText()` in `WESLCollect.ts` (already very similar to V2's)
2. No parser changes needed (combinators work the same)

**Test Updates:**
- Run: `pnpm test` with V1 active
- Let vitest update all 208 snapshots
- Review: Ensure diffs show only text element boundaries, no semantic changes
- Commit updated snapshots

**Estimated Effort:** 1-2 hours
- 15 min: Modify `coverWithText()`
- 30 min: Update and review snapshots
- 15 min: Test and verify

**Risk:** Low - changes are cosmetic, easy to verify

### Option B: Change V2 to Match V1 (Grouped Tokens)

**V2 Changes Required:**
1. Modify `coverWithText()` in `ContentsHelpers.ts` to group tokens:
   - Look ahead to see if next gap is a space
   - Combine keyword+space into one text element
   - Detect punctuation+space patterns
2. Track which gaps should be grouped vs separate
3. Handle edge cases (multiple spaces, newlines, etc.)

**No Test Updates:** Snapshots already match V1

**Estimated Effort:** 4-8 hours
- 2-3 hours: Implement token grouping logic
- 1-2 hours: Handle edge cases
- 1-2 hours: Test with all ParseWESL tests
- 1 hour: Debug unexpected differences

**Risk:** Medium - complex heuristics, potential edge cases

### Option C: Separate V2 Expression Parser Changes

**Required for both A and B:**

To match V1's expression breakdown, V2 would need:
1. Expression parser that adds `RefIdentElem` to contents
2. Modify `parseSimpleExpression()` to call `ctx.addElem()` for identifiers
3. Add text elements between expression parts

**Estimated Effort:** 8-12 hours
- 3-4 hours: Modify expression parser
- 2-3 hours: Handle operators and precedence
- 2-3 hours: Test expression-heavy code
- 1-2 hours: Debug expression structure

**Risk:** High - expression parsing is complex, affects many tests

**Recommendation:** Skip this. Expression structure difference doesn't affect semantics.

## Recommendation

### Primary: Option A (Change V1 → Match V2)

**Reasoning:**
1. **Simpler:** 1-2 hours vs 4-8 hours
2. **More Consistent:** V2's approach is clearer - every gap gets a text element
3. **Better Long-term:** More granular AST is easier to work with for tooling
4. **Low Risk:** Changes are cosmetic and easy to verify
5. **Already Proven:** V2's approach works and passes tests

**Process:**
1. Modify V1's `coverWithText()` to create text element per gap
2. Switch TestSetup.ts to V1: `weslParserConfig.useV2Parser = false`
3. Run: `pnpm test -- -u` to update snapshots
4. Review diffs: Check text elements are only granularity changes
5. Commit updated snapshots
6. Switch back to V2
7. V2 should now match snapshots perfectly

### Secondary: Option B (Change V2 → Match V1)

**Only if:** You want to keep historical snapshots unchanged

**Trade-offs:**
- More complex implementation
- V2 code becomes more complicated
- Still need to handle expression differences separately

### Expression Structure: Leave Different

**Recommendation:** Don't try to match V1's expression `ref` extraction in V2.

**Why:**
- High effort (8-12 hours)
- No semantic benefit
- Can update those specific snapshots if needed
- Or modify V1 to not extract refs (simpler)

## Timeline Considerations

### Before Completing V2 Parser (Recommended)

**Pros:**
- Get AST format settled early
- All future V2 work targets final format
- No need to re-update snapshots later

**Cons:**
- Interrupts V2 development flow
- Requires switching context to V1

### After Completing V2 Parser

**Pros:**
- Keep momentum on V2
- Can defer decision
- Might discover more format issues

**Cons:**
- Need to update snapshots twice (once for V2, once for format change)
- Harder to verify V2 correctness if format differs

## Final Recommendation

**Do Option A NOW (before completing V2):**

1. **Week of Nov 12, 2025:** Modify V1's `coverWithText()` to be more granular
2. **Update all snapshots** with V1 active
3. **Commit** new snapshot baseline
4. **Resume V2 work** - it should now match snapshots
5. **Finish V2 parser** against the new format

**Benefits:**
- Clean slate for V2 development
- Single source of truth for AST format
- Easier to verify V2 correctness
- Better AST format long-term

**Total Time:** ~2 hours to change format, then continue V2 work

Would you like me to proceed with Option A?
