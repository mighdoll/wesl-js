# V2 Parser Progress - Session 34

## Issue Investigated
Lygia tests failing with "unresolved identifier: vec4f" errors when using V2 parser.

## Root Causes Identified

### Issue 1: Missing Dependent Scope Processing in Partials
The V2 parser stores type RefIdents in dependent scopes. When `bindIdentsRecursive` processes root-level declarations, it was not processing their dependent scopes for declarations inside partial scopes.

### Issue 2: Const Initializer Expressions Not Bound
The V2 parser in `ConstParsers.ts` was setting `dependentScope` to `typeScope` (type annotation only) instead of `constScope` (which contains both type annotation AND initializer expression).

Example: `const SCALE: vec4f = vec4f(.1031, .1030, .0973, .1099);`
- The type annotation `vec4f` was in `typeScope` ✓
- The constructor call `vec4f` was in initializer expression scope (child of `constScope`)
- Using `typeScope` meant the constructor call was never bound!

## Fixes Applied

### Fix 1: BindIdents.ts
Modified `processScope` function to:
1. Process dependent scopes for root declarations that are direct children of root scope
2. Process dependent scopes for root declarations inside partial scopes
3. Added `processDependentScopesInPartial` helper to recursively handle nested partials

### Fix 2: ConstParsers.ts (THE KEY FIX)
Changed line 235 from:
```typescript
typedDecl.decl.ident.dependentScope = typedDecl.typeScope || constScope;
```
to:
```typescript
typedDecl.decl.ident.dependentScope = constScope;
```

This ensures all RefIdents (both type annotation AND initializer) get processed.

## Current Status - RESOLVED ✓
- wesl package: 524 passed ✓
- lygia: 629/630 passed (was 569/630) - **60 tests fixed!** ✓

The remaining lygia failure (`lygia::space::bracketing::bracketing` module not found) is a **V2 import resolution bug** - this test passes with V1.

## Files Modified
- `tools/packages/wesl/src/BindIdents.ts` - Recursive partial scope processing
- `tools/packages/wesl/src/parse/ConstParsers.ts` - Use constScope for dependentScope
- `tools/packages/wesl/src/test/BindStdTypes.test.ts` - Added 5 test cases

## Commits
1. `6bd2e91c` - fix: recursively process dependent scopes in nested partials
2. `3d985b04` - fix: use constScope for const declarations to bind all RefIdents

## Key Insight
The BindIdents fix was necessary but not sufficient. The real issue was in the V2 parser itself - it was preferring `typeScope` over `constScope`, which meant RefIdents in initializer expressions were never attached to any scope that would be processed during binding.

## V1 vs V2 Architecture Note

V1 uses `mergeScope(typeScope, decl_scope)` to combine type and initializer into ONE scope.
V2 uses a parent scope (constScope) with two children (typeScope, initializerScope).

Both approaches work because binding traverses recursively. No need to match V1's mergeScope approach unless issues arise.

## Next Steps

1. **Verify override/var declarations** - FIXED ✓
   - Cross-module tests revealed the bug (single-module tests pass because scope tree traversal processes all scopes)
   - Applied same fix as const: use full scope instead of typeScope
   - V2 tests: 526 passed (+2 from this fix)
   - Commit: `4b68e4ff`

2. **Investigate bracketing V2 bug** - `lygia::space::bracketing::bracketing` module not found
   - This is a V2 import resolution bug (passes with V1)
   - Import path: `lygia::space::bracketing::bracketing` (function from module)
   - Module file: `space/bracketing.wesl`
   - **Investigation findings**:
     - Import parsing and flattening are IDENTICAL for V1 and V2 ✓
     - The issue is NOT in parsing or FlattenTreeImport
     - Bug occurs when resolver tries to find module `lygia::space::bracketing`
     - Involves FileModuleResolver and package name configuration in wesl-test
     - The pattern `import package::space::bracketing::bracketing` works (tested)
     - The pattern `import lygia::space::bracketing::bracketing` fails when lygia is the package name
   - **Next step**: Debug FileModuleResolver in wesl-test to see why it can't find the module with explicit package name

3. **Documentation updated** - Lygia testing instructions in v2/CLAUDE.md ✓
