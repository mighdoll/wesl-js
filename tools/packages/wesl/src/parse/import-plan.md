# ImportGrammar Translation Plan

## Overview
This document outlines the incremental approach to translating ImportGrammar from mini-parse combinators to direct token-based parsers.

## Key Challenges

1. **Mutual Recursion**: `import_path_or_item` and `import_collection` reference each other
2. **Complex Transformations**: The `.map()` logic in `import_path_or_item` is intricate
3. **Collection Integration**: Deep integration with mini-parse's collection system
4. **Attribute Support**: Must maintain compatibility with translated attribute parsers

## Translation Phases

### Phase 1: Simple Parsers (No Dependencies) ✅
These parsers have no circular dependencies and can be translated first:

- [x] Helper functions (`makeStatement`, `makeSegment`, etc.)
- [x] `segment_blacklist` - Check for reserved words (`isSegmentBlacklist`)
- [x] `packageWord` - Parse valid import identifiers (`parsePackageWord`)
- [x] `import_relative` - Parse "package::" and "super::" prefixes (`parseImportRelative`)

**Test Cases**: 
- `import package::foo;`
- `import super::bar;`
- `import super::super::baz;`

### Phase 2: Breaking Mutual Recursion ✅
Implement simplified versions to break circular dependency:

- [x] `import_collection` stub - Only parse `{ single_word }`
- [x] `import_path_or_item` simple - No collection support initially

**Test Cases Verified**:
- `import foo;` ✅
- `import foo as bar;` ✅
- `import foo::bar;` ✅
- `import { foo };` (stub collection)

### Phase 3: Full Mutual Recursion ✅
Complete the implementation with full mutual recursion:

- [x] `import_collection` full - Support comma-separated items
- [x] `import_path_or_item` full - Add collection support

**Test Cases Verified**:
- `import foo::{bar, baz};` ✅
- `import pkg::{a, b::c, d::{e, f}};` ✅
- `import {a, b as c, d::{e}};` (collection syntax tested)

### Phase 4: Statement Integration ✅
Add the top-level statement parsers:

- [x] `import_statement_base` - Core import statement logic
- [x] `import_statement` - Add attribute and span support
- [x] `wrapAttributes` helper function
- [x] `parseWeslImports` - Top-level parser for all imports

**Test Cases Verified**:
- `import foo::bar;` ✅
- `import package::foo;` ✅
- Basic ImportElem structure ✅

**Note**: Attribute parsing (@if, @else) deferred - will integrate with existing AttributeParsers

### Phase 5: Final Integration ✅
Create adapters and update ImportGrammar:

- [x] Created ImportAdapters.ts with all necessary adapters
- [x] All parsers have corresponding adapters
- [x] 415 tests passing
- [x] Updated ImportGrammar.ts to use new adapters incrementally
- [x] Replaced packageWord, import_relative, import_collection, import_path_or_item
- [x] All ImportSyntaxCases tests passing
- [x] Full test suite (415 tests) passing

**Completed Successfully!**
- ImportGrammar now uses direct token parsers via adapters
- Only kept necessary helper functions (makeStatement, prependSegments)
- Removed unused imports from mini-parse
- Attribute integration still uses existing AttributeGrammar parsers

## Implementation Strategy

1. **Keep Both Implementations**: Don't modify ImportGrammar.ts until new parsers are complete
2. **Test Incrementally**: Run ImportSyntaxCases.test.ts after each step
3. **Use Stubs**: Temporarily simplify complex parsers to break dependencies
4. **Preserve Behavior**: Match exact AST output of original parsers

## Expected Issues & Solutions

### Issue: Mutual Recursion
**Solution**: Use forward declarations and lazy evaluation:
```typescript
let parseImportCollection: (context: ParserContext) => ImportCollection | null;
let parseImportPathOrItem: (context: ParserContext) => ImportStatement | null;

// Later assign the actual implementations
parseImportCollection = (context) => { /* ... */ };
parseImportPathOrItem = (context) => { /* ... */ };
```

### Issue: Complex Transformations
**Solution**: Extract transformation logic into separate functions that can be tested independently.

### Issue: Collection Integration
**Solution**: Study how AttributeGrammar handled collection integration and apply similar patterns.

## Success Criteria

1. All ImportSyntaxCases tests pass
2. All ImportCases tests pass
3. Full WESL test suite passes
4. No changes to AST output
5. Error messages preserved

## Progress Tracking

Each phase completion will be marked in this document and verified with tests.