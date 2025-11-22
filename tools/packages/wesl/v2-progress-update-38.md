# V2 Progress Update 38: CTS Parse Validation Fixes

## Summary

Fixed multiple CTS parse validation failures by improving the custom parser's WGSL compliance. Reduced CTS issues from ~153 to 23 (85% improvement).

## CTS Results

**Total tests: 3310**
- **Both pass: 3287** (99.3%)
- **Parse errors: 1** (empty source - needs investigation)
- **Mistranslations: 22** (semantic validation issues)
- **Too permissive: 0**

## Fixes Implemented

### 1. @diagnostic on Statements (~140 CTS failures fixed)
- **Issue**: Parser rejected `@diagnostic` as attribute name because it's a keyword
- **Fix**: Allow keywords as attribute names in `AttributeParsers.ts:95`
- **Also**: Added attribute parsing before all compound statement bodies (if_then, if_else, while_body, for_body, continuing_body, switch_body, case bodies)

### 2. binding_array as Identifier (10 CTS failures fixed)
- **Issue**: `binding_array` incorrectly in reserved words list
- **Fix**: Removed from `Keywords.ts:12`

### 3. @must_use() Validation (1 CTS failure fixed)
- **Issue**: Parser accepted `@must_use()` with empty parens
- **Fix**: Added validation in `AttributeParsers.ts:125-128`

### 4. Semicolon After Continuing (1 CTS failure fixed)
- **Issue**: Parser accepted `continuing{};` inside loops
- **Fix**: Parameterized `parseCompoundStatement` with `loopBody?: boolean`
- When `loopBody=true`, expects `}` immediately after continuing block

## Code Quality

- **DRY implementation**: Loop body handling adds ~10 lines to `parseCompoundStatement` instead of duplicating the entire function
- **Removed test duplication**: Deleted `CTSFailures.test.ts`, added minimal tests to existing files

## Tests Added

- `ParseErrorV2.test.ts`: `@must_use with empty parens`, `semicolon after continuing`
- `Linker.test.ts`: `global diagnostic directive`

## Remaining Issues (23)

### Parse Error (1)
- `source:empty` - Empty source handling issue

### Mistranslations (22) - Semantic Validation
All are validation issues, not parsing:
- 15x `duplicate_attribute_same_location` - duplicate @diagnostic validation
- 2x `invalid_locations` - @diagnostic on struct validation
- 5x `invalid_severity` - severity value validation

## Known Bug: @diagnostic on Statement Duplication

When `@diagnostic` is used as an attribute on statements (not as a global directive), the output duplicates the attribute. Example:
- Input: `@diagnostic(info, derivative_uniformity) if true { }`
- Output: `@diagnostic(info, derivative_uniformity)@diagnostic(info, derivative_uniformity) if true { }`

This is likely an issue with how `attachAttributes` interacts with text coverage on statements. Global `diagnostic(...)` directives work correctly.

## Next Steps

1. **Investigate @diagnostic duplication** - Debug emitter to find where attributes on statements get emitted twice
2. **Empty source handling** - Investigate why CTS empty source test fails
3. **Semantic validation** - Consider adding validation for duplicate @diagnostic attributes and invalid severities (lower priority - these are not parsing issues)

## Files Changed

- `src/parse/AttributeParsers.ts` - Accept keywords as attribute names, @must_use validation
- `src/parse/Keywords.ts` - Remove binding_array from reserved words
- `src/parse/StatementParsers.ts` - Add attribute parsing for compound statement bodies, loopBody parameter
- `src/test/ParseErrorV2.test.ts` - Added error tests
- `src/test/Linker.test.ts` - Added diagnostic directive test
- Deleted `src/test/CTSFailures.test.ts`
