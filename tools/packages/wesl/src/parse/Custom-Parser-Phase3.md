# Phase 3: Complete mini-parse Removal Plan

## Executive Summary

**Goal**: Remove mini-parse dependency entirely from wesl-js

**Status**: Phase 1 (Hybrid Approach) ✅ Complete - 355 tests passing

**Challenge**: The collection system (`collect`, `ptag`, `tagScope`) is deeply integrated with mini-parse and used extensively throughout the main grammar (84+ uses)

**Recommendation**: **Incremental migration IS feasible** but requires careful planning. A "big bang" rewrite would be higher risk.

## Current Status After Phase 1

### ✅ Completed (Using Custom Parsers)
- **Import parsing** - ImportParsers.ts (~450 lines)
- **Attribute parsing** - AttributeParsers.ts (~307 lines)
- **Base utilities** - ParseUtil.ts (consume, expect, checkpoint, reset)
- **Adapter layer** - Bridges custom parsers with mini-parse infrastructure

### ⏳ Still Using mini-parse Combinators
- **WeslGrammar.ts** (~739 lines) - Main WGSL grammar
  - Directives (@diagnostic, @enable, @requires)
  - Attributes (@location, @builtin, @interpolate, etc.)
  - Declarations (fn, struct, var, const, let, alias, override)
  - Statements (if, for, while, switch, return, etc.)
  - 84+ uses of collection system

- **WeslExpression.ts** (~231 lines) - Expression parsing
  - Binary/unary operators
  - Function calls
  - Array indexing
  - Member access
  - Template arguments

- **WeslStream.ts** - Token stream (mini-parse dependency)
- **WESLCollect.ts** - Collection system (mini-parse dependency)

## The Collection System Challenge

### What Is It?

The collection system is mini-parse's mechanism for building ASTs and managing scopes during parsing:

```typescript
// Current approach using mini-parse
const fn_declaration = tagScope(
  seq(
    // Parse function signature
    fn_signature,
    // Parse function body
    delimited("{", repeat(statement), "}"),
  )
    .map(buildFnElem)
    .ptag("fn")      // Tag for collection
    .collect(fnCollect),  // Collector function
);
```

### How It Works

1. **`.ptag("fn")`** - Tags parsed values for collection
2. **`.collect(fnCollect)`** - Registers collector function
3. **`tagScope()`** - Creates collection scope
4. **`CollectContext`** - Provides context during collection:
   - `cc.tags` - Tagged values from this scope
   - `cc.app` - Application state (WeslParseState)
   - `cc.src` - Source text
   - `cc.start`, `cc.end` - Span information

### Collector Functions (WESLCollect.ts)

84+ collection points in WeslGrammar.ts:
- `importElem()` - Collect imports
- `fnCollect()` - Collect function declarations
- `structCollect()` - Collect struct definitions
- `declCollect()` - Collect declarations
- `refIdent()` - Collect identifier references
- `scopeCollect()` - Manage nested scopes
- `statementCollect()` - Collect statements
- etc.

### Why It's Complex

1. **Deeply Integrated**: Collection happens during parsing, not after
2. **Scope Management**: Collectors build and manage nested scopes
3. **Context Passing**: Collectors need access to parse state, source positions, etc.
4. **Cross-references**: Building identifier references and declarations simultaneously

## Migration Strategies Compared

### Strategy A: Big Bang Rewrite ❌

**Approach**: Rewrite WeslGrammar.ts and WeslExpression.ts all at once

**Pros**:
- Clean slate design
- No adapter layer needed
- Optimized from scratch

**Cons**:
- ⚠️ **High risk** - 970 lines of complex grammar
- ⚠️ **Long development time** - Months of work
- ⚠️ **Hard to test incrementally** - All-or-nothing
- ⚠️ **Difficult to debug** - Many changes at once
- ⚠️ **Merge conflicts** - Long-lived branch

**Verdict**: ❌ **Too risky** for production codebase

### Strategy B: Incremental Migration ✅ (RECOMMENDED)

**Approach**: Migrate one grammar section at a time, maintaining tests throughout

**Pros**:
- ✅ **Lower risk** - Small, testable changes
- ✅ **Continuous testing** - All tests pass at each step
- ✅ **Easy to debug** - One change at a time
- ✅ **Can merge frequently** - Short-lived branches
- ✅ **Easy to rollback** - Each step is independent

**Cons**:
- More planning required
- Adapter layer needed during transition
- May require temporary scaffolding

**Verdict**: ✅ **Best approach** for wesl-js

## Phase 3: Incremental Migration Plan

### Phase 3.1: Replace Collection System ⭐ Critical First Step

The collection system must be replaced first, as it's used by all other parsers.

**Approach**: Create custom AST builder that mimics mini-parse's CollectContext

#### Step 1: Custom Context
```typescript
// New: ParseContext.ts
export interface ParseContext {
  stream: WeslStream;
  stable: StableState;    // AST being built
  openElems: ContainerElem[];  // Stack of open elements
  src: string;            // Source text

  // Helper methods
  addElem(elem: AbstractElem): void;
  pushScope(): void;
  popScope(): void;
  markSpan(start: number, end: number): [number, number];
}
```

#### Step 2: Custom AST Builders
Replace collector functions with direct AST builders:

```typescript
// Before (mini-parse collection)
const fn_declaration = tagScope(
  seq(fn_signature, fn_body)
    .map(buildFnElem)
    .ptag("fn")
    .collect(fnCollect)
);

// After (custom AST builder)
function parseFnDeclaration(ctx: ParseContext): FnElem | null {
  const start = checkpoint(ctx.stream);

  const signature = parseFnSignature(ctx);
  if (!signature) return null;

  ctx.pushScope();  // Enter function scope
  const body = parseFnBody(ctx);
  const scope = ctx.popScope();  // Exit function scope

  const fnElem: FnElem = {
    kind: "fn",
    ...signature,
    body,
    scope,
    start,
    end: checkpoint(ctx.stream),
  };

  ctx.addElem(fnElem);  // Add to AST
  return fnElem;
}
```

#### Step 3: Migrate WESLCollect.ts
Transform collector functions into AST builder methods:

```typescript
// Before: Collector function
export function fnCollect(cc: CollectContext) {
  const fnElem = cc.tags.fn?.[0] as FnElem;
  // ... collection logic
}

// After: AST builder method
export function buildFnElem(ctx: ParseContext, parts: ParsedFnParts): FnElem {
  const fnElem: FnElem = {
    kind: "fn",
    ...parts,
    scope: ctx.currentScope(),
  };
  return fnElem;
}
```

**Testing Strategy**:
- Run tests after each function migration
- Compare AST structure before/after
- Ensure scope building works correctly

**Estimated Effort**: 2-3 weeks
**Risk**: Medium - Core infrastructure change

---

### Phase 3.2: Migrate Expression Parsing

**Target**: WeslExpression.ts (~231 lines)

**Why Second**: Expressions are used by grammar but relatively self-contained

#### Expressions to Migrate

1. **Primary expressions**: Literals, identifiers, parenthesized
2. **Unary expressions**: `-x`, `!x`, `~x`, `&x`, `*x`
3. **Binary expressions**: `x + y`, `x && y`, `x || y`, etc.
4. **Postfix expressions**: `x()`, `x[i]`, `x.y`
5. **Template arguments**: `vec3<f32>`

#### Migration Approach

Use precedence climbing for binary operators:

```typescript
// Custom expression parser
function parseExpression(ctx: ParseContext, minPrec: number = 0): ExpressionElem | null {
  let left = parseUnaryExpression(ctx);
  if (!left) return null;

  while (true) {
    const op = peekBinaryOp(ctx.stream);
    if (!op || precedence(op) < minPrec) break;

    consume(ctx.stream, op);
    const right = parseExpression(ctx, precedence(op) + 1);
    if (!right) throw new ParseError(`Expected expression after ${op}`);

    left = makeBinaryExpression(op, left, right);
  }

  return left;
}
```

**Testing Strategy**:
- Test each operator precedence level
- Test associativity (left vs right)
- Test complex nested expressions
- Compare with existing expression tests

**Estimated Effort**: 1-2 weeks
**Risk**: Low-Medium - Well-defined grammar

---

### Phase 3.3: Migrate Declarations

**Target**: Declaration parsing in WeslGrammar.ts

**Order of Migration**:

1. **Simple declarations** (lowest risk):
   - `alias` - Type aliases
   - `const` - Constants
   - `override` - Override declarations

2. **Complex declarations** (medium risk):
   - `struct` - Struct definitions with members
   - `var` / `let` - Variables with initializers

3. **Function declarations** (higher risk):
   - `fn` - Functions with parameters, attributes, body

#### Example: Struct Migration

```typescript
// Custom struct parser
function parseStruct(ctx: ParseContext): StructElem | null {
  const start = checkpoint(ctx.stream);

  if (!consume(ctx.stream, "struct")) return null;

  const name = expectKind(ctx.stream, "word", "Expected struct name");

  expect(ctx.stream, "{", "Expected '{' after struct name");

  const members: StructMemberElem[] = [];
  while (!consume(ctx.stream, "}")) {
    const member = parseStructMember(ctx);
    if (!member) throw new ParseError("Expected struct member");
    members.push(member);

    if (!consume(ctx.stream, ",") && !peek(ctx.stream, "}")) {
      throw new ParseError("Expected ',' or '}' after struct member");
    }
  }

  const structElem: StructElem = {
    kind: "struct",
    name: name.text,
    members,
    scope: emptyScope(),
    start,
    end: checkpoint(ctx.stream),
  };

  ctx.addElem(structElem);
  return structElem;
}
```

**Testing Strategy**:
- Test each declaration type individually
- Test with attributes
- Test nested declarations
- Test error cases

**Estimated Effort**: 2-3 weeks
**Risk**: Medium - Many declaration types

---

### Phase 3.4: Migrate Statements

**Target**: Statement parsing in WeslGrammar.ts

**Statements to Migrate**:

1. **Simple statements**:
   - Return statements
   - Break/continue
   - Discard
   - Assignment statements

2. **Compound statements**:
   - If/else
   - For loops
   - While loops
   - Switch statements
   - Blocks `{ ... }`

#### Example: If Statement Migration

```typescript
function parseIfStatement(ctx: ParseContext): StatementElem | null {
  const start = checkpoint(ctx.stream);

  if (!consume(ctx.stream, "if")) return null;

  expect(ctx.stream, "(", "Expected '(' after if");
  const condition = parseExpression(ctx);
  if (!condition) throw new ParseError("Expected condition");
  expect(ctx.stream, ")", "Expected ')' after condition");

  ctx.pushScope();
  const thenBody = parseCompoundStatement(ctx);
  ctx.popScope();

  let elseBody = null;
  if (consume(ctx.stream, "else")) {
    ctx.pushScope();
    elseBody = parseCompoundStatement(ctx);
    ctx.popScope();
  }

  return {
    kind: "if-statement",
    condition,
    thenBody,
    elseBody,
    start,
    end: checkpoint(ctx.stream),
  };
}
```

**Testing Strategy**:
- Test each statement type
- Test nested statements
- Test with attributes (@if, @elif, @else)
- Test error recovery

**Estimated Effort**: 2-3 weeks
**Risk**: Medium - Control flow complexity

---

### Phase 3.5: Migrate Directives & Attributes

**Target**: Directive and standard attribute parsing

**Directives**:
- `@diagnostic` - Diagnostic control
- `@enable` - Feature enablement
- `@requires` - Requirements

**Standard Attributes**:
- `@location`, `@builtin`, `@binding`, `@group`
- `@align`, `@size`, `@interpolate`
- `@workgroup_size`, `@vertex`, `@fragment`, `@compute`

These are already partially custom (via AttributeParsers.ts), so migration is simpler.

**Estimated Effort**: 1 week
**Risk**: Low - Mostly done

---

### Phase 3.6: Remove mini-parse Dependency

**Final Steps**:

1. **Remove adapter layer**:
   - Delete AdapterUtil.ts
   - Delete *Adapters.ts files
   - Update grammar files to use parsers directly

2. **Remove mini-parse imports**:
   - Remove from WeslGrammar.ts
   - Remove from WeslExpression.ts
   - Remove from WeslStream.ts
   - Remove from WESLCollect.ts

3. **Update package.json**:
   ```json
   {
     "dependencies": {
       // "mini-parse": "^x.x.x"  ← REMOVE
     }
   }
   ```

4. **Replace mini-parse types**:
   - `Parser<Stream<T>, R>` → Custom parser type
   - `ParserContext` → `ParseContext`
   - `Stream<T>` → `WeslStream`

5. **Update WeslStream.ts**:
   - Remove mini-parse Stream interface
   - Make WeslStream standalone

**Estimated Effort**: 1 week
**Risk**: Low - Cleanup work

---

## Total Effort Estimation

| Phase | Effort | Risk | Cumulative Tests |
|-------|--------|------|------------------|
| 3.1: Collection System | 2-3 weeks | Medium | 355+ |
| 3.2: Expressions | 1-2 weeks | Low-Medium | 360+ |
| 3.3: Declarations | 2-3 weeks | Medium | 370+ |
| 3.4: Statements | 2-3 weeks | Medium | 380+ |
| 3.5: Directives | 1 week | Low | 385+ |
| 3.6: Cleanup | 1 week | Low | 385+ |
| **Total** | **9-15 weeks** | **Medium** | **385+ tests** |

With incremental testing and fixes: **3-4 months** calendar time

## Incremental vs. Rewrite Comparison

| Aspect | Incremental | Big Bang Rewrite |
|--------|-------------|------------------|
| Development time | 3-4 months | 4-6 months |
| Risk level | Low-Medium | High |
| Test coverage | Continuous | All at end |
| Merge frequency | Weekly | Once at end |
| Rollback difficulty | Easy | Hard |
| Debug difficulty | Easy | Hard |
| Team disruption | Low | High |
| **Recommendation** | ✅ **Recommended** | ❌ Not recommended |

## Key Success Factors

### 1. Maintain Test Coverage
- All 355+ tests must pass after each phase
- Add new tests for custom parser edge cases
- Compare ASTs before/after migration

### 2. Preserve Semantics
- AST structure must remain compatible
- Scope building must work identically
- Error messages can improve but mustn't regress

### 3. Performance Monitoring
- Benchmark parser performance at each phase
- Target: 2-5x speedup from mini-parse removal
- Don't sacrifice correctness for speed

### 4. Code Review
- Each phase gets thorough review
- Focus on scope handling correctness
- Verify error handling

### 5. Documentation
- Document custom parser patterns
- Explain scope management
- Provide examples for contributors

## Challenges & Solutions

### Challenge 1: Scope Management

**Problem**: mini-parse's collection system handles scope lifecycle automatically

**Solution**: Explicit scope management in ParseContext:
```typescript
class ParseContext {
  private scopeStack: Scope[] = [emptyScope()];

  pushScope(): void {
    this.scopeStack.push(emptyScope());
  }

  popScope(): Scope {
    return this.scopeStack.pop()!;
  }

  currentScope(): Scope {
    return this.scopeStack[this.scopeStack.length - 1];
  }
}
```

### Challenge 2: Error Recovery

**Problem**: mini-parse's `req()` provides automatic error handling

**Solution**: Custom `expect()` functions with clear error messages:
```typescript
function expect(stream: WeslStream, text: string, errorMsg: string): Token {
  const token = consume(stream, text);
  if (!token) {
    const pos = stream.checkpoint();
    throw new ParseError(errorMsg, [pos, pos]);
  }
  return token;
}
```

### Challenge 3: Maintaining Compatibility

**Problem**: External tools may depend on AST structure

**Solution**:
- Keep AST types unchanged (AbstractElems.ts)
- Only change how AST is built, not what it contains
- Run extensive compatibility tests

### Challenge 4: Context Passing

**Problem**: Custom parsers need access to parse state

**Solution**: Pass ParseContext to all parser functions:
```typescript
type CustomParser<T> = (ctx: ParseContext) => T | null;

function parseDeclaration(ctx: ParseContext): DeclarationElem | null {
  return parseStruct(ctx)
    || parseFn(ctx)
    || parseVar(ctx)
    || parseConst(ctx)
    || parseAlias(ctx);
}
```

### Challenge 5: Testing During Migration

**Problem**: Hard to test incomplete migration

**Solution**: Use adapter pattern during transition:
```typescript
// Adapter allows mixing old and new parsers
function adaptNewParser<T>(parser: CustomParser<T>): Parser<Stream<Token>, T> {
  return new Parser({
    fn: (cc: ParserContext) => {
      const ctx = convertContext(cc);
      const result = parser(ctx);
      return result ? { value: result } : null;
    },
  });
}
```

## Decision: Incremental vs. Rewrite

### ✅ Incremental Migration Is Feasible

**Key Insight**: The collection system can be replaced incrementally by:

1. Creating a ParseContext that mimics CollectContext
2. Transforming collector functions into AST builders
3. Migrating grammar sections one at a time
4. Maintaining adapter layer during transition
5. Running full test suite at each step

**This approach**:
- ✅ Maintains test coverage throughout
- ✅ Allows frequent merges to main
- ✅ Easy to debug (one change at a time)
- ✅ Can pause/resume at any phase
- ✅ Lower risk than rewrite

### ❌ Big Bang Rewrite Not Recommended

**Why Not**:
- 970 lines of complex grammar to rewrite at once
- High risk of introducing subtle bugs
- Long development time without merging
- Difficult to test incrementally
- Hard to debug when issues arise
- Blocks other development work

## Next Steps

### Immediate (Next PR)
1. ✅ Complete Phase 1 (Done - 355 tests passing)
2. ✅ Document Phase 3 plan (This document)
3. Review and approve Phase 3 approach

### Phase 3.1 (First Incremental Step)
1. Create ParseContext.ts
2. Migrate 1-2 simple collector functions
3. Run tests to verify approach
4. Merge early to validate incremental strategy

### If Successful
5. Continue with remaining phases (3.2-3.6)
6. Merge frequently (every 1-2 weeks)
7. Monitor performance improvements
8. Complete full migration (3-4 months)

## Conclusion

**Incremental migration is the right approach** for removing mini-parse from wesl-js:

1. **Feasible**: ParseContext can replace CollectContext
2. **Lower Risk**: Small, testable changes
3. **Maintainable**: Tests pass at each step
4. **Flexible**: Can pause/adjust as needed

The key insight is that the collection system isn't magic - it's just a pattern for building ASTs during parsing. We can replicate this pattern with custom code while maintaining the same AST structure and semantics.

**Recommendation**: ✅ Proceed with incremental migration starting with Phase 3.1

## Appendix: Parser Performance Targets

### Current Performance (mini-parse combinators)
- Import parsing: ~5-10ms per file
- Full file parsing: ~20-50ms per file
- Expression parsing: ~1-2ms per expression

### Target Performance (custom parsers)
- Import parsing: ~2-5ms per file (2x faster)
- Full file parsing: ~10-25ms per file (2x faster)
- Expression parsing: ~0.5-1ms per expression (2x faster)

### Measurement Strategy
- Benchmark before each phase
- Benchmark after each phase
- Track performance regression
- Optimize hot paths if needed

### Acceptable Performance
- No slower than current mini-parse version
- Ideally 2-5x faster
- Memory usage should not increase
- Build times should improve overall
