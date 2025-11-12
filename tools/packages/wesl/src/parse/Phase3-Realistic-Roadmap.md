# Phase 3 Realistic Assessment: Phased Approach

## Current Understanding (After Deep Analysis)

After implementing ParseContext and examining actual grammar code, we now understand:

**The collection system is the foundation of AST building** - it cannot be replaced piecemeal for individual grammar constructs. Everything is interconnected.

## Why Grammar Migration Is Different From Imports/Attributes

### Imports/Attributes (Phase 2) ✅ - Worked with Adapters
```typescript
// These are ISOLATED - self-contained parsers
export function parseImportStatement(context): ImportStatement | null {
  // ... direct token parsing
  return importStmt;
}

// Adapter wraps them for mini-parse
const import_statement = createAdapter(parseImportStatement, "import");
```

**Why it worked**: Imports and attributes are standalone - they don't deeply integrate with scope/element lifecycle.

### Declarations/Statements/Expressions ❌ - Cannot Use Adapters
```typescript
// These are INTEGRATED - wired into collection system
const global_const = seq(
  opt_attributes,
  "const",
  global_ident,             // Uses globalDeclCollect
  "=",
  expression.collect(scopeCollectNoIf, "decl_scope"),  // Creates scope
  ";",
).collect(collectVarLike("const"))  // before/after lifecycle
 .collect(partialScopeCollect);      // more lifecycle
```

**Why adapters won't work**:
- Needs `before` phase to push open element
- Nested parsers collect into tags
- `after` phase wires up bidirectional links
- Scope lifecycle management during parsing
- Cannot isolate into single function

## The Only Path Forward: Replace Collection System First

To remove mini-parse from grammar constructs, we must:

### Step 1: Build New AST Construction System
Create replacement for entire collection infrastructure:

```typescript
// New AST builder (NOT ParseContext - that's just helpers)
class ASTBuilder {
  private elementStack: ContainerElem[] = [];
  private scopeStack: Scope[] = [];

  // Lifecycle methods
  beginElement(kind: string): void;
  endElement(): ContainerElem;

  // Scope methods
  beginScope(): void;
  endScope(): Scope;

  // Registration
  registerDecl(ident: DeclIdent): void;
  registerRef(ident: RefIdent): void;

  // Wiring
  linkDeclToElem(decl: DeclIdent, elem: DeclarationElem): void;
  linkDeclToScope(decl: DeclIdent, scope: Scope): void;
}
```

**Effort**: 2-3 weeks to build and test

### Step 2: Migrate ONE Grammar Construct End-to-End

Pick simplest: const declaration

```typescript
function parseConstDecl(ctx: ParseContext, builder: ASTBuilder): ConstElem | null {
  builder.beginElement("const");
  builder.beginScope();

  // Parse attributes
  const attrs = parseAttributes(ctx, builder);

  if (!consume(ctx.stream, "const")) {
    builder.endScope();
    builder.endElement();
    return null;
  }

  // Parse identifier
  const name = expectKind(ctx.stream, "word");
  const declIdent = builder.registerDecl(name.text, true);

  expect(ctx.stream, "=");

  // Parse expression
  const expr = parseExpression(ctx, builder);

  expect(ctx.stream, ";");

  const scope = builder.endScope();
  const constElem = builder.endElement() as ConstElem;

  // Wire up
  builder.linkDeclToElem(declIdent, constElem);
  builder.linkDeclToScope(declIdent, scope);

  return constElem;
}
```

**Challenges**:
- Expression parsing still uses mini-parse
- Attributes still use mini-parse
- Need to integrate with existing code
- Test for AST compatibility

**Effort**: 1-2 weeks

### Step 3: Migrate All Declarations

- alias
- const
- var/let
- override
- struct
- fn

**Effort**: 3-4 weeks

### Step 4: Migrate Statements

- if/else
- for/while
- switch
- return/break/continue
- assignments

**Effort**: 3-4 weeks

### Step 5: Migrate Expressions

Most complex - operator precedence, nested expressions

**Effort**: 2-3 weeks

### Step 6: Remove mini-parse

Finally remove dependency

**Effort**: 1 week

## Total Timeline: 12-19 weeks (3-5 months)

Revised from original 10-17 weeks because we now understand Step 1 (AST Builder) is required first.

## Incremental Checkpoints

**Month 1**: ASTBuilder + const declarations
- ✅ Milestone: One grammar construct working with new system
- ⚠️ Risk: AST compatibility issues

**Month 2**: All declarations
- ✅ Milestone: No mini-parse for declarations
- ⚠️ Risk: Integration issues with statements/expressions still using mini-parse

**Month 3**: Statements
- ✅ Milestone: Control flow working
- ⚠️ Risk: Expression integration

**Month 4**: Expressions
- ✅ Milestone: No mini-parse in grammar
- ⚠️ Risk: Operator precedence bugs

**Month 5**: Cleanup and optimize
- ✅ Milestone: mini-parse removed, bundle ~110KB
- ✅ Final validation

## Decision Point: Week 3

After building ASTBuilder and migrating const declarations:

**If successful**:
- AST matches exactly
- All tests pass
- Integration clean
→ Continue with full migration

**If struggling**:
- AST compatibility issues
- Tests failing
- Integration complex
→ Reassess: Maybe hybrid is better

## Recommendation

Given the 3-5 month commitment required:

**Before proceeding, answer honestly**:

1. ✅ Do we have 3-5 months of dedicated engineering time?
2. ✅ Is 30KB bundle savings worth this effort?
3. ✅ Can we afford the risk of AST bugs?
4. ✅ Is this more important than new features?

**If all YES**: Proceed with Step 1 (ASTBuilder)
**If any NO**: Stop at hybrid approach

## What Phase 3.1 Gave Us

Even if we stop:
- ✅ ParseContext ready for new features
- ✅ Deep understanding of what's required
- ✅ Can make informed decision
- ✅ 9 tests validating ParseContext works

## Proposed Next Steps

**Option A: Full Commitment**
1. Build ASTBuilder (2-3 weeks)
2. Migrate const declarations (1-2 weeks)
3. Decision point: Continue or stop?

**Option B: Pause Here**
1. Document Phase 3.1 as complete
2. Use hybrid approach
3. Revisit in 6 months if priorities change

**Option C: Hybrid Enhancement**
1. Add more custom parsers for hot paths (profiling first)
2. Use ParseContext for new WESL features
3. Never fully remove mini-parse

## My Strong Recommendation

Based on:
- ✅ 440 tests passing
- ✅ Performance already improved (Phase 2)
- ✅ 140KB bundle acceptable for most cases
- ⚠️ 3-5 months is very expensive
- ⚠️ High risk of AST bugs
- ⚠️ Opportunity cost: What features could we build instead?

**Choose Option B: Pause Here**

The hybrid approach has achieved the goals. The effort to remove the final 27% likely exceeds its value unless you have hard requirements.

---

**User Decision Required**: Which option?
- **A**: Full commitment (build ASTBuilder next)
- **B**: Stop at hybrid (current state is excellent)
- **C**: Hybrid enhancement (add more custom parsers as needed)
