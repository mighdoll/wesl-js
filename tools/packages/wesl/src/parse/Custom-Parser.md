# Custom Parser Migration Plan

## Overview

The `feat/custom-parser` branch contains work to **replace mini-parse combinators with custom direct token parsers**. This is a migration toward removing the mini-parse dependency entirely, improving performance and reducing external dependencies.

## Goal

**Replace mini-parse combinator library with custom recursive descent parsers**

### Why Remove mini-parse?

1. **Performance**: Direct token parsing is faster than combinator overhead
2. **Control**: Full control over parsing behavior and error messages
3. **Dependencies**: Reduce external dependencies
4. **Optimization**: Can optimize hot paths in the parser
5. **Simplicity**: Traditional recursive descent is well-understood

### Migration Path

1. **Current (main)**: Pure mini-parse combinators → 7 files
2. **Phase 1 (feat/custom-parser)**: Hybrid approach → 16 files
   - Add custom direct token parsers
   - Use adapter layer to bridge with existing mini-parse infrastructure
   - Maintain full compatibility
3. **Phase 2 (future)**: Remove mini-parse entirely
   - Remove adapter layer
   - Remove mini-parse dependency
   - Pure custom parsers

## Current State Analysis

### Main Branch (Current)
Pure **mini-parse combinators** throughout:

**Parse directory files (7)**:
- `AttributeGrammar.ts` - Attribute parsers using combinators
- `ImportGrammar.ts` - Import parsers using combinators
- `Keywords.ts` - Keyword list
- `WeslBaseGrammar.ts` - Basic combinators (word, keyword, etc.)
- `WeslExpression.ts` - Expression parsing
- `WeslGrammar.ts` - Main grammar
- `WeslStream.ts` - Token stream

**Example (current mini-parse approach)**:
```typescript
// ImportGrammar.ts - Pure combinators
const segment_blacklist = or("super", "package", "import", "as");
const packageWord = preceded(not(segment_blacklist), or(word, keyword));

const import_path_or_item = seq(
  packageWord,
  or(
    preceded("::", req(or(fn(() => import_collection), fn(() => import_path_or_item)))),
    preceded("as", req(word)).map(v => makeItem("", v)),
    yes().map(() => makeItem("")),
  ),
).map(/* ... */);
```

### feat/custom-parser Branch (Target)
**Hybrid approach** with custom parsers + adapters:

**New files being added (9)**:
1. **ParseUtil.ts** (~246 lines) - Core parsing utilities
   - `consume(stream, text)` - Try to match token by text
   - `consumeKind(stream, kind, text?)` - Try to match token by kind
   - `expect(stream, text)` - Match or throw error
   - `expectKind(stream, kind, text?)` - Match kind or throw error
   - `checkpoint(stream)` - Save position for backtracking
   - `reset(stream, pos)` - Restore position

2. **ImportParsers.ts** (~450 lines) - Direct import parsing
   - `parsePackageWord()` - Parse import segment word
   - `parseImportRelative()` - Parse package::/super:: prefix
   - `parseImportCollection()` - Parse { ... } collections
   - `parseImportPathOrItem()` - Parse foo::bar or foo as bar
   - `parseImportStatementBase()` - Parse import ... ;
   - `parseImportStatement()` - Parse full import with attributes
   - `parseWeslImports()` - Parse all imports in file

3. **AttributeParsers.ts** (~307 lines) - Direct attribute parsing
   - `parseLiteral()` - Parse true/false literals
   - `parseTranslateTimeFeature()` - Parse feature identifiers
   - `parseAttributeIfPrimaryExpression()` - Parse primary expressions
   - `parseAttributeIfUnaryExpression()` - Parse unary expressions (!)
   - `parseAttributeIfExpression()` - Parse full expressions (&&, ||)
   - `parseIfAttribute()` - Parse @if(...)
   - `parseElifAttribute()` - Parse @elif(...)
   - `parseElseAttribute()` - Parse @else

4. **AdapterUtil.ts** - Generic adapter creation
5. **ImportAdapters.ts** - Adapters for import parsers
6. **AttributeAdapters.ts** - Adapters for attribute parsers
7. **ImportCollectionAdapter.ts** - Special collection adapter
8. **WeslBaseAdapters.ts** - Base parser adapters
9. **WeslBaseParsers.ts** - Direct base parsers

**Modified files (4)**:
- `ImportGrammar.ts` - Uses adapters instead of combinators
- `AttributeGrammar.ts` - Uses adapters instead of combinators
- `WeslBaseGrammar.ts` - Updates for new approach
- `WeslGrammar.ts` - Compatibility changes

**Example (new custom parser approach)**:
```typescript
// ImportParsers.ts - Direct token parsing
export function parsePackageWord(context: ParserContext): string | null {
  const { stream } = context;

  // Check blacklist first
  if (isSegmentBlacklist(context)) {
    return null;
  }

  // Try to parse a word or keyword
  const token = consumeKind(stream, "word") || consumeKind(stream, "keyword");
  return token ? token.text : null;
}

// ImportAdapters.ts - Wrap in mini-parse Parser
export const packageWordAdapter = createAdapter(
  parsePackageWord,
  "packageWord",
);

// ImportGrammar.ts - Use adapter in grammar
const import_path = packageWordAdapter.map(/* ... */);
```

## Custom Parser API Design

The new custom parsers use a **recursive descent style** with **expect-oriented API**:

### Core Utilities (ParseUtil.ts)

```typescript
// Try to consume a token - returns null on failure
function consume(stream, text: string): WeslToken | null

// Consume or throw error - use after commit point
function expect(stream, text: string, errorMsg?: string): WeslToken

// Consume by token kind
function consumeKind(stream, kind: WeslTokenKind, text?: string): WeslToken | null

// Expect by token kind
function expectKind(stream, kind: WeslTokenKind, errorMsg?: string, text?: string): WeslToken

// Manual backtracking
function checkpoint(stream): number
function reset(stream, pos: number): void
```

### Parser Patterns

#### 1. Simple Token Matching
```typescript
export function parseElseAttribute(context: ParserContext): ElseAttribute | null {
  const { stream } = context;

  // Clean text-based matching
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "else")) return null;

  return makeElseAttribute();
}
```

#### 2. Commit Points
```typescript
export function parseIfAttribute(context: ParserContext): IfAttribute | null {
  const { stream } = context;
  const pos = checkpoint(stream);

  // Not committed yet - return null if no match
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "if")) {
    reset(stream, pos);
    return null;
  }

  // COMMIT POINT: We have "@if", so this must be an if attribute
  expect(stream, "(", "Expected '(' after @if");

  const expr = parseAttributeIfExpression(context);
  if (!expr) throw new ParseError("Expected expression", [pos, checkpoint(stream)]);

  consume(stream, ","); // optional comma
  expect(stream, ")", "Expected ')' after @if expression");

  return makeIfAttribute(expr);
}
```

#### 3. Recursive Expressions
```typescript
export function parseAttributeIfExpression(context: ParserContext): ExpressionElem | null {
  const { stream } = context;

  function parsePrimary(): ExpressionElem | null {
    // Try literal
    const literal = parseLiteral(context);
    if (literal) return literal;

    // Try parenthesized
    if (consume(stream, "(")) {
      const expr = parseExpression();
      expect(stream, ")", "Expected ')' after expression");
      return makeParenthesizedExpression(expr);
    }

    // Try feature identifier
    return parseTranslateTimeFeature(context);
  }

  function parseUnary(): ExpressionElem | null {
    if (consume(stream, "!")) {
      const expr = parseUnary();
      if (!expr) return null;
      return makeUnaryExpression("!", expr);
    }
    return parsePrimary();
  }

  function parseExpression(): ExpressionElem | null {
    let left = parseUnary();
    if (!left) return null;

    while (true) {
      const op = consume(stream, "&&") || consume(stream, "||");
      if (!op) break;

      const right = parseUnary();
      if (!right) throw new ParseError(`Expected expression after ${op.text}`);

      left = makeBinaryExpression(op.text, left, right);
    }

    return left;
  }

  return parseExpression();
}
```

#### 4. Collections with Separators
```typescript
export function parseImportCollection(context: ParserContext): ImportCollection | null {
  const { stream } = context;

  if (!consume(stream, "{")) return null;

  // Parse first item (required)
  const first = parseImportPathOrItem(context);
  if (!first) {
    throw new ParseError("Expected import path or item");
  }

  const items = [first];

  // Parse remaining items
  while (consume(stream, ",")) {
    // Allow trailing comma
    if (consume(stream, "}")) {
      return makeCollection(items);
    }

    const item = parseImportPathOrItem(context);
    if (!item) {
      throw new ParseError("Expected import path or item after comma");
    }
    items.push(item);
  }

  expect(stream, "}", "Expected '}' after import collection");
  return makeCollection(items);
}
```

## Adapter Layer (Temporary)

The adapter layer bridges custom parsers with mini-parse infrastructure:

### AdapterUtil.ts
```typescript
export function createAdapter<T>(
  parseFn: (context: ParserContext) => T | null,
  traceName: string,
): Parser<Stream<WeslToken>, T> {
  return new Parser<Stream<WeslToken>, T>({
    fn: (context: ParserContext): OptParserResult<T> => {
      const value = parseFn(context);
      return value ? { value } : null;
    },
    traceName,
    terminal: true,
  });
}
```

### Usage
```typescript
// 1. Write direct parser
export function parseElseAttribute(context): ElseAttribute | null {
  // ... parsing logic
}

// 2. Wrap in adapter
export const elseAttributeParser = createAdapter(
  parseElseAttribute,
  "else_attribute",
);

// 3. Use in grammar (still uses mini-parse infrastructure)
export const else_attribute_base = elseAttributeParser.ptag("attr_variant");
export const else_attribute = tagScope(
  else_attribute_base.collect(specialAttribute)
);
```

## Migration Benefits

### Performance Improvements
- **No combinator overhead**: Direct token parsing is faster
- **Optimized hot paths**: Can hand-optimize critical sections
- **Better error recovery**: Custom error handling strategies
- **Reduced allocations**: Fewer intermediate objects

### Code Quality
- **Traditional approach**: Recursive descent is widely understood
- **Explicit control flow**: Easier to debug than combinator chains
- **Better error messages**: Full control over error reporting
- **Clearer intent**: Direct code vs. abstract combinators

### Maintenance
- **No external dependency**: Full control over parser
- **Easier optimization**: Can profile and optimize specific functions
- **Simpler debugging**: Standard function calls, not combinator magic
- **Future-proof**: Not dependent on mini-parse updates

## Test Coverage

The migration maintains comprehensive test coverage:

### Tests on feat/custom-parser
- **351 tests passing** (18 more than main branch)
- Added tests for new custom parser functions
- All existing functionality preserved
- Better test coverage for edge cases

### Test Structure
- `ImportParsers.test.ts` - Unit tests for import parsers
- `ImportDirectComparison.test.ts` - Compares direct vs combinator results
- All existing integration tests pass

## Technical Details

### Error Handling Strategy

**Commit Points**: A critical concept in the custom parser design

1. **Before Commit**: Return `null` to allow backtracking
   ```typescript
   if (!consume(stream, "import")) return null;  // Try other parsers
   ```

2. **After Commit**: Throw `ParseError` for required elements
   ```typescript
   if (!consume(stream, "import")) return null;
   // NOW committed - this is definitely an import statement
   expect(stream, ";", "Expected semicolon after import");
   ```

3. **Commit Points Examples**:
   - After consuming `import` keyword
   - After consuming `@if` attribute markers
   - After consuming opening braces `{`
   - After consuming operators in expressions

### Backtracking vs Combinators

**Mini-parse combinators**: Automatic backtracking
```typescript
const parser = or(parseA, parseB, parseC);  // Tries each, backtracks automatically
```

**Custom parsers**: Manual checkpointing
```typescript
const pos = checkpoint(stream);
const result = parseA(context);
if (!result) {
  reset(stream, pos);
  return null;  // Caller can try parseB
}
```

### Performance Characteristics

**Custom parsers are faster because**:
- Fewer function calls (no combinator overhead)
- Direct stream manipulation
- No intermediate combinator objects
- Optimizable by JavaScript JIT compiler
- Hand-optimized hot paths

**Benchmarking needed to quantify**:
- Parse time improvement (expected: 2-5x faster)
- Memory usage reduction
- Real-world impact on build times

## Migration Strategy

### Phase 1: Hybrid Approach (feat/custom-parser) ✓
- [x] Create ParseUtil.ts with core utilities
- [x] Write custom parsers for imports (ImportParsers.ts)
- [x] Write custom parsers for attributes (AttributeParsers.ts)
- [x] Create adapter layer (AdapterUtil.ts, *Adapters.ts)
- [x] Modify grammar files to use adapters
- [x] Maintain full compatibility with existing code
- [x] All tests pass (351 tests)

### Phase 2: Apply to Main Branch (Current Task)
- [ ] Apply changes from feat/custom-parser
- [ ] Resolve any conflicts
- [ ] Verify all tests pass
- [ ] Run performance benchmarks
- [ ] Rebase on main

### Phase 3: Remove mini-parse (Future)
- [ ] Remove adapter layer files
- [ ] Update grammar files to use parsers directly
- [ ] Remove mini-parse dependency from package.json
- [ ] Update collection system (currently uses mini-parse)
- [ ] Rewrite WeslGrammar.ts with custom parsers
- [ ] Comprehensive benchmarking

### Phase 4: Optimization (Future)
- [ ] Profile parser performance
- [ ] Optimize hot paths
- [ ] Implement lookahead optimizations
- [ ] Better error recovery
- [ ] Incremental parsing support

## Risks & Mitigation

### Risk: Breaking Changes
**Mitigation**:
- Adapter layer maintains compatibility
- All existing tests pass
- No API changes to consumers

### Risk: Performance Regression
**Mitigation**:
- Custom parsers should be faster
- Benchmark before/after
- Can optimize specific functions

### Risk: Maintenance Burden
**Mitigation**:
- Recursive descent is well-understood
- Clear documentation in ParseUtil.ts
- Simpler than combinator approach

### Risk: Incomplete Migration
**Mitigation**:
- Phase 1 is complete and working
- Can stop at hybrid if needed
- Incremental path to full migration

## Success Criteria

### Phase 1 (feat/custom-parser) ✓
- [x] Custom parsers for imports working
- [x] Custom parsers for attributes working
- [x] Adapter layer functional
- [x] All 351 tests passing
- [x] No regressions

### Phase 2 (Current)
- [ ] Changes applied to main branch
- [ ] Rebase successful
- [ ] All tests passing
- [ ] Performance benchmarks show improvement

### Phase 3 (Future)
- [ ] mini-parse dependency removed
- [ ] Pure custom parser implementation
- [ ] 2-5x faster parsing
- [ ] All tests passing

## Next Steps

1. **Apply feat/custom-parser changes** to current branch
2. **Run benchmarks** to quantify performance improvement
3. **Rebase on main** to get latest changes
4. **Document results** in Custom-Parser2.md
5. **Plan Phase 3** (removing mini-parse entirely)

## Conclusion

The feat/custom-parser branch represents a **strategic migration** toward removing the mini-parse dependency. The hybrid approach (Phase 1) is complete and working with 351 passing tests. The next steps are to apply these changes to main and eventually complete the migration by removing mini-parse entirely.

This migration will result in:
- ✅ Better performance (2-5x faster parsing expected)
- ✅ No external parser dependency
- ✅ Full control over parsing behavior
- ✅ Traditional recursive descent approach
- ✅ Easier to optimize and maintain
