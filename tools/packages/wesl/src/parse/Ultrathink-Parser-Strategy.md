# Ultra-think: Path to mini-parse-free Parser

## The Wall We Hit

**Phase 2 (Imports/Attributes)**: ✅ Worked perfectly with adapters
- Isolated, self-contained parsers
- Easy to wrap with adapters

**Phase 3 (Declarations/Statements)**: ❌ Hit a wall
- Deeply integrated with collection system
- before/after lifecycle hooks
- Tag system for inter-parser communication
- Bidirectional link creation
- Cannot isolate into adapters

## The Root Problem

The collection system is the **foundation** of AST building:
```typescript
// Example: Everything depends on this
const const_decl = seq(
  "const",
  word.collect(globalDeclCollect),      // Registers identifier
  "=",
  expression.collect(scopeCollect),     // Creates scope, registers refs
  ";"
).collect(collectVarLike("const"))      // before: push elem, after: finalize
 .collect(partialScopeCollect);          // More lifecycle management
```

You can't replace one construct at a time - they all share the infrastructure.

## Two Proposed Approaches

### Option A: Ground-Up Rebuild
Start fresh, parse subset, incrementally expand

### Option B: New Incremental Approach
Find a way to proceed incrementally that works

Let me analyze both deeply...

---

## Option A: Ground-Up Rebuild

### Strategy: New Parser from Scratch

Start completely fresh:

**Phase 1: Minimal Parser (Week 1-2)**
```typescript
// src/parse/WeslParserV2.ts
class WeslParser {
  private stream: WeslStream;
  private scopeStack: Scope[];
  private elementStack: ContainerElem[];

  parse(): WeslAST {
    // Direct recursive descent
    // No mini-parse at all
  }
}
```

Parse only:
- Imports (reuse existing custom parser!)
- Const declarations
- Simple types

**Phase 2: Expand Grammar (Week 3-6)**
Add incrementally:
- Alias, var, override
- Struct declarations
- Function signatures
- Function bodies
- Statements
- Expressions

**Phase 3: Full Coverage (Week 7-8)**
- All 440 tests passing
- All grammar constructs

**Phase 4: Cleanup (Week 9-10)**
- Remove old parser
- Remove mini-parse
- Optimize

### Advantages
- ✅ Clean slate, optimal design
- ✅ No mini-parse baggage
- ✅ Can reuse Phase 2 custom parsers (imports/attributes)
- ✅ Clear progress (subset → full)

### Challenges
- ⚠️ Need complete AST building from start
- ⚠️ Can't validate until minimal subset works
- ⚠️ Risk of AST divergence
- ⚠️ All or nothing - can't ship partial

### Timeline: 8-10 weeks

---

## Option B: Parallel Parser (RECOMMENDED)

### Strategy: Build v2 Alongside v1, Tests as Oracle

Run both parsers, ensure ASTs match:

**Phase 1: Parser Foundation (Week 1)**
```typescript
// New parser (no mini-parse)
export function parseWESL_v2(srcModule: SrcModule): WeslAST {
  const parser = new WeslParserV2(srcModule);
  return parser.parse();
}

// Old parser (mini-parse) - keep working
export function parseWESL_v1(srcModule: SrcModule): WeslAST {
  // Current implementation
}
```

**Phase 2: Parity Testing Framework (Week 1)**
```typescript
describe("Parser V2 Parity", () => {
  testCases.forEach(src => {
    test(`${src}`, () => {
      const ast1 = parseWESL_v1(src);
      const ast2 = parseWESL_v2(src);

      // Tests are the oracle - ASTs must match!
      expect(normalizeAST(ast2)).toEqual(normalizeAST(ast1));
    });
  });
});
```

**Phase 3: Start with What We Have (Week 1)**
- ✅ Import parsing (already have custom parser!)
- ✅ Attribute parsing (already have custom parser!)
- Just integrate into v2

**Phase 4: Add Constructs Incrementally (Week 2-8)**
- Week 2: Const declarations (simplest)
- Week 3: Alias, var, override
- Week 4: Struct declarations
- Week 5: Function declarations
- Week 6: Statements (if, for, while, etc.)
- Week 7-8: Expressions (most complex)

**Phase 5: Switch to V2 (Week 9)**
- All 440 tests passing with v2
- Replace v1 calls with v2
- Remove v1 code
- Remove mini-parse dependency

### Advantages
- ✅ **Continuous validation** (tests as oracle)
- ✅ **Incremental progress** (can ship at any point)
- ✅ **Lower risk** (old parser keeps working)
- ✅ **Reuse existing work** (import/attribute parsers)
- ✅ **Clear feedback** (AST mismatch shows immediately)
- ✅ **Can pause/resume** (both parsers work)

### Challenges
- Maintaining two parsers temporarily (acceptable - for validation)
- Need AST comparison (easy - tests already do this)

### Timeline: 9 weeks

---

## Detailed Comparison

| Aspect | Ground-Up (A) | Parallel (B) |
|--------|---------------|--------------|
| **Timeline** | 8-10 weeks | 9 weeks |
| **Validation** | At end | Continuous |
| **Risk** | Higher | Lower |
| **Can pause?** | No | Yes |
| **Can ship partial?** | No | Yes |
| **Reuse Phase 2** | Yes | Yes |
| **Tests as oracle** | No | Yes |
| **Debugging** | Harder | Easier |

---

## Recommendation: Option B (Parallel Parser)

### Why Parallel Parser is Superior

1. **Tests are the Ultimate Oracle**
   - 440 tests define correct behavior
   - Parse with both parsers, ASTs must match
   - Immediate feedback when diverging
   - No guessing about correctness

2. **Leverage Existing Work**
   - ✅ Import parsers (Phase 2)
   - ✅ Attribute parsers (Phase 2)
   - ✅ ParseContext helpers (Phase 3.1)
   - ✅ 440 tests as validation
   - Start at ~20% complete, not 0%

3. **Incremental Risk Management**
   - Old parser keeps working
   - Can ship improvements as we go
   - Can pause if blocked
   - Can resume anytime
   - Decision point every week

4. **Clear Milestones**
   - Week 1: Foundation + imports/attributes (20% grammar)
   - Week 2: + const declarations (30%)
   - Week 3: + alias/var/override (40%)
   - Week 4: + struct (50%)
   - Week 5: + functions (60%)
   - Week 6: + statements (75%)
   - Week 7-8: + expressions (90%)
   - Week 9: Full coverage (100%), remove v1

---

## Concrete Implementation Plan

### Week 1: Foundation + Existing Parsers

**Step 1: Create V2 Directory Structure**
```
src/parse/v2/
  ├── WeslParserV2.ts        # Main parser class
  ├── ASTBuilder.ts          # AST construction helpers
  ├── DeclarationParsers.ts  # Declaration parsing
  ├── StatementParsers.ts    # Statement parsing (TBD)
  ├── ExpressionParsers.ts   # Expression parsing (TBD)
  └── index.ts
```

**Step 2: Integrate Existing Custom Parsers**
```typescript
// WeslParserV2.ts
export class WeslParserV2 {
  private stream: WeslStream;
  private ast: WeslAST;
  private scopeStack: Scope[];
  private elementStack: ContainerElem[];

  constructor(srcModule: SrcModule) {
    this.stream = new WeslStream(srcModule.src);
    this.scopeStack = [emptyScope(null)];
    this.elementStack = [];
    this.ast = this.initializeAST(srcModule);
  }

  parse(): WeslAST {
    // Reuse existing import parser! (Phase 2)
    this.parseImports();

    // Parse declarations
    this.parseDeclarations();

    return this.ast;
  }

  private parseImports(): void {
    // Use existing parseWeslImports from ImportParsers.ts!
    const context = { stream: this.stream, /* ... */ };
    const imports = parseWeslImports(context);
    this.ast.imports = imports;
  }
}
```

**Step 3: Parity Test Framework**
```typescript
// src/test/ParserV2Parity.test.ts
import { parseWESL } from "../ParseWESL.ts";  // v1
import { parseWESL_v2 } from "../parse/v2/index.ts";  // v2
import { normalizeAST } from "./ASTNormalizer.ts";

describe("Parser V2 Parity", () => {
  // Start with simple test cases
  const testCases = [
    "const x = 5;",
    "const y: i32 = 3;",
    "alias F = f32;",
  ];

  testCases.forEach(src => {
    test(`parse: ${src}`, () => {
      const ast1 = parseWESL(src);
      const ast2 = parseWESL_v2(src);
      expect(normalizeAST(ast2)).toEqual(normalizeAST(ast1));
    });
  });
});
```

**Deliverable**:
- ✅ V2 parser parses imports (reusing Phase 2 work)
- ✅ V2 parser parses attributes (reusing Phase 2 work)
- ✅ Parity tests for imports/attributes passing
- ✅ ~20% of grammar covered

---

### Week 2: Const Declarations

**Step 1: Implement parseConstDecl**
```typescript
// DeclarationParsers.ts
export function parseConstDecl(
  stream: WeslStream,
  builder: ASTBuilder
): ConstElem | null {
  const start = stream.checkpoint();

  // Try attributes first
  const attributes = parseAttributes(stream, builder);

  // Must have "const" keyword
  if (!consume(stream, "const")) {
    stream.reset(start);
    return null;
  }

  // Parse identifier
  const nameToken = expectKind(stream, "word", "Expected const name");
  const declIdent = builder.createDeclIdent(nameToken.text, true);

  // Optional type annotation
  let typeRef: TypeRefElem | undefined;
  if (consume(stream, ":")) {
    typeRef = parseTypeSpecifier(stream, builder);
  }

  // Must have initializer
  expect(stream, "=", "Expected '=' after const name");

  // Parse expression (create scope for it)
  builder.pushScope();
  const expr = parseExpression(stream, builder);
  const exprScope = builder.popScope();

  expect(stream, ";", "Expected ';' after const declaration");

  // Build element
  const constElem: ConstElem = {
    kind: "const",
    name: declIdent,
    typeRef,
    value: expr,
    attributes,
    start,
    end: stream.checkpoint(),
    contents: [],
  };

  // Wire up bidirectional links
  declIdent.ident.declElem = constElem;
  declIdent.ident.dependentScope = exprScope;

  builder.addToModule(constElem);
  return constElem;
}
```

**Step 2: ASTBuilder Helper**
```typescript
// ASTBuilder.ts
export class ASTBuilder {
  private scopeStack: Scope[];
  private moduleContents: AbstractElem[];
  private srcModule: SrcModule;

  pushScope(): void {
    const parent = this.currentScope();
    const newScope = emptyScope(parent);
    this.scopeStack.push(newScope);
  }

  popScope(): Scope {
    return this.scopeStack.pop()!;
  }

  currentScope(): Scope {
    return this.scopeStack[this.scopeStack.length - 1];
  }

  createDeclIdent(name: string, isGlobal: boolean): DeclIdentElem {
    const ident: DeclIdent = {
      kind: "decl",
      originalName: name,
      containingScope: this.currentScope(),
      isGlobal,
      id: nextIdentId(),
      srcModule: this.srcModule,
      declElem: null as any,  // set later
    };

    const identElem: DeclIdentElem = {
      kind: "decl",
      ident,
      start: 0,  // Set by caller
      end: 0,
      srcModule: this.srcModule,
    };

    ident.declElem = identElem as any;  // temporary
    this.currentScope().contents.push(ident);

    return identElem;
  }

  addToModule(elem: AbstractElem): void {
    this.moduleContents.push(elem);
  }
}
```

**Step 3: Add to Parity Tests**
```typescript
const constTests = [
  "const x = 5;",
  "const y: i32 = 3;",
  "const z = x + y;",
  "@diagnostic(off, foo) const w = 1;",
];
```

**Deliverable**:
- ✅ V2 parser parses const declarations
- ✅ Parity tests passing for const
- ✅ ~30% of grammar covered

---

### Week 3: Alias, Var, Override

Similar process:
- Implement parseAliasDecl
- Implement parseVarDecl
- Implement parseOverrideDecl
- Add parity tests

**Deliverable**: ~40% grammar covered

---

### Week 4: Struct Declarations

More complex (members, scope):
```typescript
function parseStructDecl(stream, builder): StructElem {
  // Parse struct keyword
  // Parse name
  // Parse {

  builder.pushScope();  // Struct scope

  // Parse members
  while (!peek(stream, "}")) {
    const member = parseStructMember(stream, builder);
    // ...
  }

  const structScope = builder.popScope();
  // Build struct elem
  // ...
}
```

**Deliverable**: ~50% grammar covered

---

### Week 5: Function Declarations

Most complex declaration:
- Parameters with attributes
- Return type
- Body statements

**Deliverable**: ~60% grammar covered

---

### Week 6: Statements

if, for, while, switch, return, break, continue

**Deliverable**: ~75% grammar covered

---

### Week 7-8: Expressions

Most complex - operator precedence:
```typescript
function parseExpression(stream, builder, minPrec = 0): ExpressionElem {
  let left = parseUnaryExpr(stream, builder);

  while (true) {
    const op = peekBinaryOp(stream);
    if (!op || precedence(op) < minPrec) break;

    consume(stream, op);
    const right = parseExpression(stream, builder, precedence(op) + 1);
    left = makeBinaryExpr(op, left, right);
  }

  return left;
}
```

**Deliverable**: ~90% grammar covered

---

### Week 9: Complete & Switch

- All 440 tests passing with v2
- Remove v1 code
- Remove mini-parse dependency
- Bundle size: ~110KB (down from 140KB)

---

## Key Advantages of This Approach

### 1. Tests are Oracle
Every change validated immediately:
```typescript
// Write new parser code
function parseConstDecl(...) { ... }

// Run parity tests
pnpm test ParserV2Parity

// If tests pass → Correct!
// If tests fail → AST diverged, fix it
```

### 2. Incremental Shipping
Can ship improvements as we go:
- Week 1: Ship if imports improve
- Week 2: Ship if const parsing improves
- etc.

Not blocked on completion.

### 3. Reuse Phase 2 Work
- Import parsing: Already done! ✅
- Attribute parsing: Already done! ✅
- ParseContext helpers: Already done! ✅
- Start at 20%, not 0%

### 4. Decision Points
Every week: Is v2 working well?
- Yes → Continue
- No → Pause, debug, or reassess

Not all-or-nothing.

### 5. Lower Risk
Old parser keeps working throughout.
Can abandon v2 if it's not working out.

---

## Testing Strategy

### Level 1: Unit Tests (Per Construct)
```typescript
test("parseConstDecl", () => {
  const stream = new WeslStream("const x = 5;");
  const builder = new ASTBuilder(srcModule);
  const elem = parseConstDecl(stream, builder);

  expect(elem.kind).toBe("const");
  expect(elem.name.ident.originalName).toBe("x");
});
```

### Level 2: Parity Tests (V1 vs V2)
```typescript
test("const declaration parity", () => {
  const src = "const x = 5;";
  const ast1 = parseWESL(src);
  const ast2 = parseWESL_v2(src);
  expect(normalizeAST(ast2)).toEqual(normalizeAST(ast1));
});
```

### Level 3: Integration Tests (Existing 440 Tests)
```typescript
// Run all existing tests with v2
// Must all pass before switching
```

### Level 4: Bulk Tests (Real-world WGSL)
```typescript
// 76 bulk tests with Unity shaders
// Must all pass
```

---

## Timeline Summary

| Week | Work | Grammar Coverage |
|------|------|------------------|
| 1 | Foundation + imports/attributes | 20% |
| 2 | Const declarations | 30% |
| 3 | Alias, var, override | 40% |
| 4 | Struct declarations | 50% |
| 5 | Function declarations | 60% |
| 6 | Statements | 75% |
| 7-8 | Expressions | 90% |
| 9 | Complete, switch, cleanup | 100% |

**Total: 9 weeks (2 months)**

---

## Risk Mitigation

### Risk 1: AST Divergence
**Mitigation**: Parity tests catch immediately, fix before proceeding

### Risk 2: Expression Complexity
**Mitigation**: Leave for last (Week 7-8), can use simpler approach if needed

### Risk 3: Scope Management
**Mitigation**: ASTBuilder handles explicitly, tested at each level

### Risk 4: Takes Longer Than Expected
**Mitigation**: Can pause, old parser keeps working

---

## Success Criteria

### Week 1
- ✅ V2 parses imports
- ✅ V2 parses attributes
- ✅ Parity tests passing

### Week 2
- ✅ V2 parses const declarations
- ✅ All const tests passing

### Week 9
- ✅ All 440 tests passing with v2
- ✅ All 76 bulk tests passing
- ✅ Bundle size ~110KB
- ✅ mini-parse removed

---

## Recommendation: Proceed with Parallel Parser

**Why:**
1. ✅ Tests as oracle (continuous validation)
2. ✅ Reuse Phase 2 work (start at 20%)
3. ✅ Lower risk (old parser keeps working)
4. ✅ Incremental shipping (can pause/resume)
5. ✅ Clear feedback (AST match or doesn't)
6. ✅ 9 weeks total (reasonable)

**Next Step:**
1. Create `src/parse/v2/` directory
2. Build WeslParserV2 skeleton
3. Integrate import/attribute parsers
4. Add parity tests
5. Validate Week 1 goals

**Decision Point: End of Week 1**
If foundation is solid and parity tests passing → Continue
If struggling → Reassess

---

## Alternative: If You Want Ground-Up Instead

If you prefer clean-slate rebuild (Option A):
- Same timeline (8-10 weeks)
- Less validation along the way
- Higher risk but cleaner code
- Can also work

**I recommend Parallel (Option B) because:**
- Tests as oracle is huge advantage
- Lower risk
- Can ship partial improvements
- Reuses Phase 2 work

---

**Decision Required**:
- **Option B: Parallel Parser** (recommended - 9 weeks, lower risk, tests as oracle)
- **Option A: Ground-Up Rebuild** (8-10 weeks, higher risk, cleaner slate)

Which approach do you want to take?
