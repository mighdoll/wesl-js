# WESL Parser V2 - Custom Recursive Descent Parser

## Overview

**Parser V2** is a ground-up rewrite of the WESL parser using **custom recursive descent parsing** instead of mini-parse combinators.

**Status**: V2 production-ready, all tests passing (unit tests, CTS, lygia)

## Why V2?

The v1 parser uses mini-parse combinators. While elegant, this approach has limitations:

- **Bundle Size**: mini-parse is ~38KB (27% of the 140KB WESL bundle)
- **Performance**: Combinator overhead in hot paths
- **Control**: Limited ability to customize error messages and parsing behavior

**V2 Goals**:
1. Remove mini-parse dependency (~30KB bundle savings)
2. Faster parsing (2-3x expected)
3. Full control over parser behavior
4. Traditional recursive descent approach (easier to understand/maintain)

## Current Status

### Test Results
- **V2 unit tests**: 529/531 passing (2 skipped - const_assert edge case)
- **CTS validation**: 3310/3310 passing (100%)
- **Lygia shader library**: 630/630 passing (100%)
- **V1 compatibility**: No regressions

### Performance & Size
- **2.8x faster** than V1 (exceeds 2-3x target)
- **+7% bundle overhead** (17.7KB vs 16.5KB brotli-compressed)

## Architecture

### Core Files

1. **WeslParserV2.ts** - Main parser class, entry point `parseWeslV2(srcModule)`
2. **ContentsHelpers.ts** - `openElem()`/`closeElem()` for element stack and TextElem generation
3. **TEXT_ELEMENT_RULES.md** - Documents TextElem generation rules

### Parser Modules

- `ImportParsers.ts` - Import statement parsing
- `AttributeParsers.ts` - @if/@else/@elif attribute parsing
- `DirectiveParsers.ts` - enable/diagnostic/requires directives
- `ConstParsers.ts` - const/alias/var/override declarations
- `FnParsers.ts` - Function declarations
- `StatementParsers.ts` - All statement types
- `ExpressionParsers.ts` - Expression parsing with precedence
- `TypeParsers.ts` - Type expression parsing
- `ParseUtil.ts` - Core utilities (consume, expect, checkpoint, tryConsumeKeyword, hasConditionalAttribute)
- `ParseContext.ts` - Scope management, identifier creation

## Key Design Patterns

### 1. Element Contents Pattern

Most elements use `openElem()`/`closeElem()` to automatically fill gaps with TextElems:

```typescript
function parseConstDecl(stream, ctx, attributes): ConstElem | null {
  const start = stream.checkpoint();
  openElem(ctx, { kind: "const", contents: [] });

  const nameDecl = parseTypedDecl(stream, ctx);
  const expr = parseExpression(stream, ctx);

  const contents = closeElem(ctx, start, stream.checkpoint());
  return { kind: "const", name: nameDecl, value: expr, contents, ... };
}
```

### 2. Exception: FnElem

Function elements **don't use openElem/closeElem** - they build contents manually. See TEXT_ELEMENT_RULES.md.

### 3. Commit Points

Parsers use **commit points** to know when to return null vs throw errors:

```typescript
function parseIfAttribute(stream, ctx): IfAttribute | null {
  const pos = stream.checkpoint();

  // NOT committed - can backtrack
  if (!consume(stream, "@")) return null;
  if (!consume(stream, "if")) {
    stream.reset(pos);
    return null;
  }

  // COMMIT POINT: We have "@if", must be valid
  expect(stream, "(", "Expected '(' after @if");  // Throws on failure
  // ...
}
```

## Testing

### Running Tests

```bash
# V2 tests only
V2_ONLY=true bb test

# V1 tests only (MUST run outside sandbox for BulkTests)
V1_ONLY=true bb test --dangerouslyDisableSandbox

# Both parsers
bb test

# CTS tests
bb test:cts
```

### CTS Testing

The WebGPU CTS validates parser against WGSL spec compliance. Located at `~/wesl/cts`.

```bash
# Quick CTS validation
bb test:cts

# Manual CTS run
cd ~/wesl/cts
tools/run_node --gpu-provider $PWD/transpiler/gpu_provider.ts \
  --shader-transpiler $PWD/transpiler/wesl/wesl_transpiler.ts \
  --print-json --quiet 'webgpu:shader,validation,parse,*'
```

**Current status**: 3310/3310 tests passing (100%)

### Lygia Testing

Real-world shader library validation at `~/wesl/lygia`.

```bash
cd ~/wesl/lygia
pnpm test --run
```

**Current status**: 630/630 tests passing (100%)

## Development Workflow

### Before Every Commit

```bash
# V1 tests REQUIRED (must run outside sandbox)
V1_ONLY=true bb test --dangerouslyDisableSandbox

# V2 tests
V2_ONLY=true bb test

# CTS validation
bb test:cts
```

### V1/V2 Compatibility

V1 is the production parser until merge. V2 changes must NEVER break V1.

If shared code changes break V1:
1. Add detection logic to handle both AST formats
2. Pattern: `const attrsInContents = e.contents[0]?.kind === "attribute"`
3. See LowerAndEmit.ts for examples

## Future Work

### Before Merge
- [x] Grammar audit against WGSL spec
- [x] CTS validation (3310/3310 passing)
- [x] Code review (P1, P2 cleanup done - see Review2.md)

### After Merge
- Remove mini-parse dependency and V1 code
- Delete WeslGrammar.ts and V1-specific files
- Target bundle: ~16.5KB (match V1 size)

### Long-Term
- **Text -> Comment Conversion**: Replace TextElems with CommentElems for ~35% smaller AST
- **New Reflection API**: Clean-slate design based on V2 architecture

## ParseUtil Functions

```typescript
// Peek and consume keyword, returning token with position
tryConsumeKeyword(stream, "fn")  // Returns token or null

// Try to consume - returns null on failure
consume(stream, "const")

// Consume or throw - use after commit point
expect(stream, "=", "Expected '=' after name")

// Check for conditional attributes
hasConditionalAttribute(attributes)

// Backtracking
const pos = checkpoint(stream)
reset(stream, pos)
```

## ParseContext Methods

```typescript
ctx.currentScope()           // Get current scope
ctx.pushScope("block")       // Create new scope
ctx.popScope()               // Exit scope

ctx.createDeclIdent(name, span, isGlobal)
ctx.createRefIdent(name, span)
ctx.saveIdent(ident)
ctx.addElem(elem)            // Add to open element's contents
```

## Common Pitfalls

- Forgetting to call `openElem()` before parsing children
- Using `openElem()` for FnElem (special case)
- Throwing too early or returning null too late (commit point confusion)
- Incorrect span boundaries (creates wrong text coverage)

---

**Last Updated**: 2025-11-24
**Status**: V2 production-ready - all tests passing
**Test Results**: Unit 529/531 | CTS 3310/3310 | Lygia 630/630
**Performance**: 2.8x faster | Bundle: +7% overhead
