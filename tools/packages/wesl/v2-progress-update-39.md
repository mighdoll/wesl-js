# V2 Progress Update 39: @diagnostic Duplication Fix

## Summary

Fixed the @diagnostic attribute duplication bug on statements. When `@diagnostic` was used as an attribute on statements (not as a global directive), the output was duplicating the attribute.

## Root Cause

When `@diagnostic` attributes were on statements like `@diagnostic(info, derivative_uniformity) if true { }`, the attribute text was emitted twice because:

1. The statement's span started at the keyword (e.g., "if"), not at the attribute
2. The parent compound statement's text coverage created a TextElem that included the @diagnostic text
3. The statement itself also emitted the attribute from its contents

Example:
- Input: `@diagnostic(info, derivative_uniformity) if true { }`
- Before fix: `@diagnostic(info, derivative_uniformity)@diagnostic(info, derivative_uniformity) if true { }`
- After fix: `@diagnostic(info, derivative_uniformity) if true { }`

## Fix Implemented

### Parser Changes (`StatementParsers.ts`)

Added `getStartWithAttributes(attributes, keywordPos)` helper that extends statement span to include emitted attributes:

```typescript
function getStartWithAttributes(
  attributes: AttributeElem[] | undefined,
  keywordPos: number,
): number {
  const firstEmitted = attributes?.find(
    attr =>
      attr.kind === "attribute" &&
      attr.attribute.kind !== "@if" &&
      attr.attribute.kind !== "@elif" &&
      attr.attribute.kind !== "@else",
  );
  return firstEmitted ? firstEmitted.start : keywordPos;
}
```

Key insight: Only extend span for **emitted** attributes (like `@diagnostic`), not conditional attributes (`@if/@else/@elif`) that get dropped during emission. This preserves whitespace correctly for conditional translation.

Updated 7 parser functions to use this helper:
- `parseCompoundStatement`
- `parseSimpleStatement`
- `parseIfStatement`
- `parseForStatement`
- `parseWhileStatement`
- `parseLoopStatement`
- `parseSwitchStatement`

### Test Utilities (`TestUtil.ts`)

Added `expectTokenMatch(actual, expected)` helper for comparing WGSL/WESL by token sequence, ignoring whitespace differences:

```typescript
export function expectTokenMatch(actual: string, expected: string): void {
  expect(stripWesl(actual)).toBe(stripWesl(expected));
}
```

### Test (`Linker.test.ts`)

Added test for @diagnostic attribute on statement:

```typescript
test("@diagnostic attribute on statement", async () => {
  const src = `fn foo() { @diagnostic(info, derivative_uniformity) if true { } }`;
  const result = await linkTest(src);
  expectTokenMatch(result, src);
});
```

## Test Results

- **V2 tests**: 528 passed, 2 skipped
- **V1 tests**: 420 passed, 1 skipped
- No regressions

## Files Changed

- `src/parse/StatementParsers.ts` - Added `getStartWithAttributes()` helper, updated 7 parsers
- `src/test/TestUtil.ts` - Added `expectTokenMatch()` helper
- `src/test/Linker.test.ts` - Added @diagnostic test, imports

## CTS Status (from update-38)

**Total tests: 3310**
- **Both pass: 3287** (99.3%)
- **Parse errors: 1** (empty source)
- **Mistranslations: 22** (semantic validation)

The @diagnostic duplication was one of the mistranslations. This fix should reduce the mistranslation count.

## Remaining Issues

### From update-38
1. **Empty source handling** (1 parse error) - CTS empty source test fails
2. **Semantic validation** (22 mistranslations):
   - 15x `duplicate_attribute_same_location` - duplicate @diagnostic validation
   - 2x `invalid_locations` - @diagnostic on struct validation
   - 5x `invalid_severity` - severity value validation

### Known V2 Formatting Limitation
When statement span is extended to include attributes, minor whitespace differences occur (e.g., space between `{` and `@` not preserved). This is why `expectTokenMatch()` uses `stripWesl()` for comparison.

## Next Steps

1. **Run CTS tests** to verify @diagnostic duplication fix reduces mistranslations
2. **Investigate empty source handling** - CTS empty source test fails
3. **Consider semantic validation** for duplicate @diagnostic and invalid severities (lower priority)
4. **Grammar audit** against WGSL spec (ongoing)

## Technical Notes

### Why only extend span for emitted attributes?

Conditional attributes (`@if/@else/@elif`) are dropped during emission. If we extended the span to include them, the whitespace before them would become part of the child element's span and wouldn't be properly emitted by the parent's text coverage. This would cause whitespace/newline issues in conditional translation output.

### Why `expectTokenMatch()` instead of `expectTrimmedMatch()`?

V2 has minor whitespace differences in some cases. `expectTokenMatch()` uses `stripWesl()` which tokenizes and reconstructs with normalized whitespace, comparing actual token sequences rather than exact strings.

---

**Last Updated**: 2025-11-22
**Session Focus**: Fix @diagnostic attribute duplication on statements
**Test Results**: V2 528/530 | V1 420/421
