# ImportGrammar Collection Replacement Plan

## Overview
This document outlines the plan to replace the mini-parse collection mechanism in ImportGrammar while maintaining compatibility with the existing WESL parser infrastructure.

## Current State Analysis

### Collection Mechanism
1. **mini-parse collection system**:
   - Uses `CollectPair` with `before/after` callbacks
   - Maintains `openElems` stack for nested elements
   - Tags results with `.ptag()` for collection access
   - Uses `.collect()` to integrate with AST building

2. **ImportGrammar integration**:
   ```typescript
   export const weslImports = tagScope(
     repeat(import_statement).ptag("owo").collect(importElem),
   );
   ```
   - `repeat(import_statement)` parses multiple imports
   - `.ptag("owo")` tags results for collection
   - `.collect(importElem)` invokes WESLCollect.ts logic

3. **WESLCollect.importElem**:
   - Retrieves imports from `cc.tags.owo`
   - Adds to `stable.imports` array
   - Integrates with element hierarchy via `addToOpenElem`

## Design Challenges

1. **Dual Parser Support**: Need to support both mini-parse and direct parsers simultaneously
2. **Collection Context**: Direct parsers don't have access to CollectContext
3. **Element Hierarchy**: Must maintain proper parent-child relationships
4. **Text Coverage**: Need to preserve complete source coverage with TextElems
5. **Tag System**: Direct parsers don't use the tag system
6. **Scope Management**: Import elements may have attributes that affect scope

## Proposed Solution

### Phase 1: Create Collection Adapter Infrastructure
Create a bridge between direct parsers and the collection system:

1. **CollectionBridge**: Interface to abstract collection operations
2. **DirectParserCollector**: Implementation for direct parsers
3. **MiniParseCollector**: Wrapper for existing mini-parse collection
4. **Context Passing**: Thread collection context through direct parsers

### Phase 2: Extend ImportParsers with Collection Support
Add collection capabilities to direct parsers:

1. **parseWeslImportsWithCollection**: New function that:
   - Parses imports using direct parsers
   - Builds proper AST structure
   - Integrates with existing collection system
   - Maintains compatibility with `stable.imports`

2. **ImportElem Building**: Direct construction of ImportElem with:
   - Proper start/end positions
   - Attribute support
   - Text coverage calculation

### Phase 3: Create Hybrid Parser
Build a parser that can use either system:

1. **HybridImportParser**: Adapter that:
   - Implements mini-parse Parser interface
   - Internally uses direct parsers
   - Handles collection through bridge
   - Maintains tag compatibility

### Phase 4: Incremental Migration
Replace usage gradually:

1. **Replace weslImports**: Update to use HybridImportParser
2. **Test extensively**: Ensure all ImportCases pass
3. **Performance validation**: Verify no regression
4. **Remove old code**: Once stable, remove mini-parse dependencies

## Implementation Strategy

### Step 1: Collection Bridge (No breaking changes)
```typescript
interface CollectionBridge {
  addImport(import: ImportStatement): void;
  addToOpenElem(elem: AbstractElem): void;
  getContext(): WeslParseContext;
}
```

### Step 2: Direct Parser with Collection
```typescript
export function parseWeslImportsWithCollection(
  context: ParserContext,
  bridge: CollectionBridge
): ImportElem[] {
  const imports: ImportElem[] = [];
  
  while (true) {
    const importElem = parseImportStatement(context);
    if (!importElem) break;
    
    // Add to stable.imports via bridge
    bridge.addImport(importElem.imports);
    
    // Add to open element hierarchy
    bridge.addToOpenElem(importElem);
    
    imports.push(importElem);
  }
  
  return imports;
}
```

### Step 3: Hybrid Adapter
```typescript
class HybridImportParser extends Parser<Stream<WeslToken>, ImportElem[]> {
  constructor() {
    super({
      fn: (context: ParserContext): OptParserResult<ImportElem[]> => {
        // Create bridge from mini-parse context
        const bridge = createCollectionBridge(context);
        
        // Use direct parser with collection
        const imports = parseWeslImportsWithCollection(context, bridge);
        
        return imports.length > 0 ? { value: imports } : null;
      },
      traceName: "weslImports",
    });
  }
}
```

### Step 4: Integration Points
1. **Update ImportGrammar.ts**:
   ```typescript
   export const weslImports = new HybridImportParser();
   ```

2. **Maintain compatibility**:
   - Keep same export name
   - Same return type
   - Same AST structure
   - Same side effects (stable.imports)

## Testing Strategy

1. **Unit Tests**:
   - Test collection bridge in isolation
   - Test direct parser with mock bridge
   - Test hybrid adapter behavior

2. **Integration Tests**:
   - All existing ImportCases must pass
   - ImportSyntaxCases must pass
   - Benchmark performance

3. **Compatibility Tests**:
   - Ensure other parsers using imports work
   - Test attribute integration
   - Verify scope handling

## Risk Mitigation

1. **Incremental Approach**: Each phase is independently testable
2. **Backward Compatibility**: Maintain existing interfaces
3. **Feature Flags**: Could add flag to switch between implementations
4. **Extensive Testing**: Test at each step before proceeding

## Success Criteria

1. All 415+ tests pass
2. No performance regression
3. Clean separation between parser and collection
4. Path clear for removing mini-parse dependency
5. Maintainable code structure

## Future Considerations

1. **Other Parsers**: This pattern can be applied to other grammar elements
2. **Pure Direct Parser**: Eventually remove mini-parse entirely
3. **Performance**: Direct parsers may offer optimization opportunities
4. **Error Messages**: Ensure error quality is maintained

## Current Status

### Completed
1. [x] Implemented CollectionBridge interface
2. [x] Created mini-parse collection bridge implementation  
3. [x] Extended ImportParsers with collection support
4. [x] Built initial HybridImportParser attempts

### Challenges Discovered

1. **Attribute Parsing**: ImportParsers doesn't handle @if/@elif/@else attributes
2. **Position Tracking**: Direct parsers start at 0, not accounting for whitespace
3. **Collection Integration**: Deep integration makes hybrid approach complex
4. **Parser State**: mini-parse maintains complex state that direct parsers lack

### Revised Approach

Given the challenges, we should consider:

1. **Complete ImportParsers First**: 
   - Add attribute parsing support
   - Fix position tracking to match mini-parse
   - Ensure full feature parity

2. **Simpler Integration Path**:
   - Keep using mini-parse collection for now
   - Focus on replacing just the parsing logic
   - Leave collection mechanism for later phase

3. **Alternative Strategy**:
   - Continue using adapters as we have been
   - Replace entire ImportGrammar only when we can replace collection too
   - This might mean waiting until more of the parser is converted

## Revised Approach - Complete ImportGrammar Replacement

### Key Insight
The tag system (`.ptag("owo")`) just labels the parser result - it doesn't affect parsing. Since our `parseWeslImports` already returns `ImportElem[]`, we can replace `repeat(import_statement)` directly without worrying about tags yet.

### Current Structure
```typescript
export const weslImports = tagScope(
  repeat(import_statement).ptag("owo").collect(importElem),
);
```

The only use of the "owo" tag is in the collection function to retrieve the parsed imports. As long as our parser returns `ImportElem[]`, the tag and collection will work.

### Implementation Plan

1. **Create a simple adapter** that wraps `parseWeslImports` as a mini-parse Parser
2. **Replace `repeat(import_statement)`** with this adapter
3. **Verify collection still works** - the tag will label our ImportElem[] result
4. **Remove intermediate adapters** - we can potentially remove the individual adapters once the top-level works

### Benefits
- Much simpler than trying to integrate with collection system
- Tags still work because we return the same type
- Collection function remains unchanged
- 48-52% performance improvement already demonstrated

## Next Steps

1. [x] Create simple adapter for parseWeslImports
2. [ ] Replace repeat(import_statement) in weslImports
3. [ ] Verify all tests pass
4. [ ] Consider removing intermediate adapters
5. [ ] Document lessons learned for other parser conversions