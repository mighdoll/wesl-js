# V2 Parser Progress - Session 34

## Issue Investigated
Lygia tests failing with "unresolved identifier: vec4f" errors when using V2 parser.

## Root Cause Identified
The V2 parser stores type RefIdents (e.g., `vec4f` in function signatures or const type annotations) in dependent scopes. When `bindIdentsRecursive` processes root-level declarations, it was not processing their dependent scopes if those declarations were pre-initialized.

## Fix Applied
Modified `BindIdents.ts` `processScope` function (lines 303-359) to:
1. Process dependent scopes for root declarations that are direct children of root scope
2. Process dependent scopes for root declarations inside partial scopes

Added code at lines 345-358 to handle partials at root level containing declarations with dependent scopes.

## Current Status
- All wesl package tests pass (518 tests)
- Lygia random test still fails with same vec4f error
- The issue is that partial scopes can be NESTED, and the fix only handles one level
- Need to make the partial scope handling recursive or process ALL declarations in the partial tree, not just direct children

## Next Steps
1. Modify the fix to recursively process nested partial scopes
2. Alternatively, refactor to collect ALL root declarations from partial tree before processing dependent scopes
3. Add test coverage for nested partial scopes with type references
4. Clean up debug code and verify all tests pass

## Files Modified
- `tools/packages/wesl/src/BindIdents.ts` - Added dependent scope processing for root declarations
- `tools/packages/wesl/src/test/BindStdTypes.test.ts` - Added test coverage (3 tests, all passing)

## Technical Details
The V2 parser creates RefIdents for type names and saves them to scopes via `ctx.saveIdent()`. Type references in function signatures are stored in the function's dependent scope. When a module's root declarations are pre-initialized via `findValidRootDecls`, they're added to `knownDecls` before scope traversal. During traversal, these known declarations were being skipped, so their dependent scopes (containing type RefIdents) were never visited, leaving those RefIdents unmarked as std types.

The fix ensures that even pre-initialized root declarations have their dependent scopes processed. However, the current implementation doesn't handle deeply nested partial scopes correctly.
