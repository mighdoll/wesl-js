# Phase 3: Stepwise mini-parse Removal (Revised)

## Decision

**Proceeding with Phase 3** based on these architectural goals:
1. **Reduce bundle size** by removing mini-parse dependency
2. **Avoid dependency** on mini-parse's future evolution
3. **Flexibility** for future error handling and language features
4. **Performance** improvements already demonstrated in Phase 2

## Approach: Incremental Replacement

Working stepwise to replace mini-parse while maintaining all tests passing at each step.

---

## Phase 3.1: ParseContext Foundation ✅ IN PROGRESS

### Goal
Create ParseContext infrastructure to replace mini-parse CollectContext.

### Step 1: Create ParseContext.ts ✅ COMPLETE

Created `ParseContext.ts` with interface that mirrors CollectContext functionality:

```typescript
export interface ParseContext {
  stream: WeslStream;
  src: string;
  srcModule: SrcModule;
  state: WeslParseState;

  // Convenience methods
  position(): number;
  currentScope(): Scope;
  addElem(elem: AbstractElem): void;
  pushScope(kind?: Scope["kind"]): void;
  popScope(): Scope;
  createRefIdent(name: string, span: Span): RefIdent;
  createDeclIdent(name: string, span: Span, isGlobal?: boolean): DeclIdent;
  saveIdent(ident: Ident): void;
}
```

**Key Design Decisions:**
- Wraps existing `WeslParseState` rather than replacing it
- Provides convenient methods for custom parsers
- Compatible with existing scope management
- Can coexist with mini-parse collection system during transition

### Step 2: Add Tests for ParseContext ⏳ NEXT

Create unit tests to verify:
- Scope stack management works correctly
- Element addition to open containers
- Identifier creation and registration
- Span tracking

### Step 3: Migrate One Simple Collector

Pick the simplest collector function and rewrite using ParseContext:

**Candidate**: `refIdent()` - creates reference identifiers

**Before** (using mini-parse CollectContext):
```typescript
export function refIdent(cc: CollectContext): RefIdentElem {
  const { src, start, end } = cc;
  const app = cc.app as WeslParseState;
  const { srcModule } = app.stable;
  const originalName = src.slice(start, end);

  const kind = "ref";
  const ident: RefIdent = {
    kind,
    originalName,
    ast: cc.app.stable,
    id: nextIdentId(),
    refIdentElem: null as any,
  };
  const identElem: RefIdentElem = { kind, start, end, srcModule, ident };
  ident.refIdentElem = identElem;

  saveIdent(cc, identElem);
  addToOpenElem(cc, identElem);
  return identElem;
}
```

**After** (using ParseContext):
```typescript
export function createRefIdentElem(
  ctx: ParseContext,
  name: string,
  start: number,
  end: number
): RefIdentElem {
  const ident = ctx.createRefIdent(name, [start, end]);
  const identElem: RefIdentElem = {
    kind: "ref",
    start,
    end,
    srcModule: ctx.srcModule,
    ident,
  };
  ident.refIdentElem = identElem;

  ctx.saveIdent(ident);
  ctx.addElem(identElem);
  return identElem;
}
```

### Step 4: Validation

After each change:
```bash
pnpm run typecheck  # No TypeScript errors
pnpm test          # All 431 tests pass
```

---

## Phase 3.2: Migrate Simple Declarations

### Target
Simple declaration parsers that don't have complex control flow:
- `alias` declarations
- `const` declarations
- Simple `var` declarations

### Approach
1. Create custom parser using ParseContext
2. Wrap with adapter for compatibility
3. Test thoroughly
4. Commit incrementally

### Example: Alias Declaration

**Current** (mini-parse):
```typescript
const alias_decl = seq(
  "alias",
  globalTypeNameDecl,
  "=",
  type_specifier,
  ";",
).collect(collectAlias);
```

**Target** (custom parser):
```typescript
function parseAliasDecl(ctx: ParseContext): AliasElem | null {
  const start = ctx.position();

  if (!consume(ctx.stream, "alias")) return null;

  const name = expectKind(ctx.stream, "word", "Expected alias name");
  const nameDecl = ctx.createDeclIdent(name.text, name.span, true);

  expect(ctx.stream, "=", "Expected '=' after alias name");

  const typeSpec = parseTypeSpecifier(ctx);
  if (!typeSpec) throw new ParseError("Expected type specifier");

  expect(ctx.stream, ";", "Expected ';' after alias");

  const aliasElem: AliasElem = {
    kind: "alias",
    name: nameDecl,
    typeSpec,
    start,
    end: ctx.position(),
  };

  ctx.addElem(aliasElem);
  return aliasElem;
}
```

**Adapter** (for compatibility):
```typescript
const alias_decl = createAdapter(parseAliasDecl, "alias_decl");
```

---

## Phase 3.3: Migrate Struct Declarations

### Complexity
Structs are more complex:
- Have members (sub-elements)
- Create scopes for member declarations
- Support attributes

### Approach
1. Migrate struct member parsing first
2. Then struct container
3. Test carefully - structs are heavily used

---

## Phase 3.4: Migrate Function Declarations

### Complexity
Functions are the most complex:
- Parameters with attributes
- Return type
- Body with statements
- Multiple scope levels

### Approach
1. Migrate parameter parsing
2. Migrate function signature
3. Migrate function body (statements)
4. Test extensively

---

## Phase 3.5: Migrate Statements

### Target
All statement types:
- If/else
- For/while loops
- Switch statements
- Return/break/continue
- Variable declarations
- Assignments

### Approach
Each statement type becomes a custom parser function.

---

## Phase 3.6: Migrate Expressions

### Complexity
Expression parsing is complex:
- Operator precedence
- Binary/unary operators
- Function calls
- Array indexing
- Member access

### Approach
Use precedence climbing algorithm for binary operators:

```typescript
function parseExpression(ctx: ParseContext, minPrec = 0): ExpressionElem | null {
  let left = parseUnaryExpression(ctx);
  if (!left) return null;

  while (true) {
    const op = peekBinaryOp(ctx.stream);
    if (!op || precedence(op) < minPrec) break;

    consume(ctx.stream, op);
    const right = parseExpression(ctx, precedence(op) + 1);
    left = makeBinaryExpression(op, left, right);
  }

  return left;
}
```

---

## Phase 3.7: Remove mini-parse Dependency

### Final Steps

1. **Remove all adapters**
   - Delete AdapterUtil.ts
   - Delete *Adapters.ts files
   - Update grammar to use parsers directly

2. **Remove mini-parse imports**
   - Update all grammar files
   - Remove from package.json

3. **Update WeslStream**
   - Make standalone (no mini-parse Stream interface)

4. **Final validation**
   - All 431+ tests passing
   - TypeScript compilation clean
   - Bundle size reduced
   - Performance measured

---

## Success Criteria

Each phase must meet:
- ✅ All tests passing (431+)
- ✅ TypeScript typecheck passing
- ✅ No regressions in error messages
- ✅ AST structure unchanged
- ✅ Performance same or better

## Estimated Timeline

| Phase | Effort | Status |
|-------|--------|--------|
| 3.1: ParseContext | 1 week | ✅ IN PROGRESS |
| 3.2: Simple Declarations | 1-2 weeks | ⏳ PENDING |
| 3.3: Struct Declarations | 1-2 weeks | ⏳ PENDING |
| 3.4: Function Declarations | 2-3 weeks | ⏳ PENDING |
| 3.5: Statements | 2-3 weeks | ⏳ PENDING |
| 3.6: Expressions | 2-3 weeks | ⏳ PENDING |
| 3.7: Cleanup | 1 week | ⏳ PENDING |
| **Total** | **10-17 weeks** | **~3-4 months** |

## Risk Mitigation

1. **Small commits** - Each change is small and testable
2. **Continuous testing** - All tests pass at every step
3. **Incremental approach** - Can pause/resume at any phase
4. **Adapter pattern** - Old and new coexist during transition
5. **Reversible** - Each commit can be reverted if needed

## Benefits Tracking

### Bundle Size
- **Before**: TBD (measure mini-parse contribution)
- **After**: TBD (measure after Phase 3.7)
- **Target**: 20-30% reduction in parser bundle size

### Performance
- **Before**: TBD (benchmark parse time)
- **After**: TBD (benchmark each phase)
- **Target**: 2-3x faster parsing

### Maintainability
- **Control**: Full control over parser implementation
- **Error messages**: Can customize error reporting
- **Features**: Easy to add new language features

---

## Current Status

**Phase 3.1 - ParseContext Foundation**
- ✅ Step 1: Created ParseContext.ts
- ⏳ Step 2: Add tests for ParseContext
- ⏳ Step 3: Migrate one simple collector
- ⏳ Step 4: Validation

**Next Actions:**
1. Add ParseContext unit tests
2. Migrate `refIdent()` collector as proof of concept
3. Ensure all 431 tests still pass
4. Commit Phase 3.1 checkpoint

---

## Notes

- Maintaining **stepwise progress** - each commit is stable
- **Tests as safety net** - 431 tests validate every change
- **Incremental risk** - small changes reduce likelihood of bugs
- **Clear path forward** - each phase builds on previous
