# Implementation Guide: Comments-Only Text Elements

## Quick Start for V2 Parser

### Step 1: Add CommentElem Type

**File:** `/tools/packages/wesl/src/AbstractElems.ts`

```typescript
// Add to TerminalElem union
export type TerminalElem =
  | DirectiveElem
  | DeclIdentElem
  | NameElem
  | RefIdentElem
  | TextElem
  | CommentElem  // ⬅️ NEW
  | ImportElem;

// Add new interface
export interface CommentElem extends AbstractElemBase {
  kind: "comment";
  text: string;  // Full comment text including "//" or "/* */"
  variant: "line" | "block";
  position: "leading" | "trailing" | "inline";
}
```

### Step 2: Modify WeslStream to Track Comments

**File:** `/tools/packages/wesl/src/parse/WeslStream.ts`

```typescript
export class WeslStream implements Stream<WeslToken> {
  private comments: Array<{ text: string; start: number; end: number }> = [];
  
  // Add method to capture comments instead of skipping
  private captureComment(token: TypedToken<InternalTokenKind>): void {
    const kind = token.token.kind;
    const start = token.span[0];
    
    if (token.text === "//") {
      const end = this.skipToEol(token.span[1]);
      const text = this.src.slice(start, end);
      this.comments.push({ text, start, end });
      this.stream.reset(end);
    } else {
      const end = this.skipBlockComment(token.span[1]);
      const text = this.src.slice(start, end);
      this.comments.push({ text, start, end });
      this.stream.reset(end);
    }
  }
  
  // Add method to retrieve comments in range
  public getCommentsInRange(start: number, end: number): Array<{ text: string; start: number; end: number }> {
    return this.comments.filter(c => c.start >= start && c.end <= end);
  }
  
  // Clear comments after processing
  public clearComments(): void {
    this.comments = [];
  }
}
```

### Step 3: Update ContentsHelpers to Handle Comments

**File:** `/tools/packages/wesl/src/parse/v2/ContentsHelpers.ts`

```typescript
/**
 * Close an element, filling ONLY with CommentElems (no text elements).
 */
export function closeElem(
  ctx: ParseContext,
  start: number,
  end: number,
): GrammarElem[] {
  const openElem = ctx.state.context.openElems.pop();
  if (!openElem) {
    throw new Error("No open element to close");
  }

  // Add comments found in this range
  return addComments(ctx, openElem.contents, start, end);
}

/**
 * Add CommentElems for any comments in the source range.
 * Does NOT add text elements for keywords/punctuation.
 */
function addComments(
  ctx: ParseContext,
  contents: GrammarElem[],
  start: number,
  end: number,
): GrammarElem[] {
  const ast: WeslAST = ctx.state.stable;
  const comments = ctx.stream.getCommentsInRange(start, end);
  
  if (comments.length === 0) {
    // No comments - return contents as-is (no text elements needed)
    return contents.slice().sort((a, b) => a.start - b.start);
  }
  
  // Merge comments with existing contents
  const allElems: GrammarElem[] = [...contents];
  
  for (const comment of comments) {
    const commentElem: CommentElem = {
      kind: "comment",
      text: comment.text,
      variant: comment.text.startsWith("//") ? "line" : "block",
      position: determinePosition(comment, contents, start, end),
      start: comment.start,
      end: comment.end,
    };
    allElems.push(commentElem);
  }
  
  return allElems.sort((a, b) => a.start - b.start);
}

/**
 * Determine if comment is leading, trailing, or inline
 */
function determinePosition(
  comment: { start: number; end: number; text: string },
  contents: GrammarElem[],
  elemStart: number,
  elemEnd: number,
): "leading" | "trailing" | "inline" {
  // Check if comment is before first child
  if (contents.length > 0 && comment.end < contents[0].start) {
    return "leading";
  }
  
  // Check if comment is after last child
  if (contents.length > 0 && comment.start > contents[contents.length - 1].end) {
    return "trailing";
  }
  
  // Otherwise it's inline (between children)
  return "inline";
}
```

### Step 4: Update Emission to Regenerate Non-Comments

**File:** `/tools/packages/wesl/src/LowerAndEmit.ts`

```typescript
// Add comment emission
export function emitComment(e: CommentElem, ctx: EmitContext): void {
  // In preserve mode, copy the comment
  ctx.srcBuilder.add(e.text, e.start, e.end);
  
  // Add newline after line comments
  if (e.variant === "line") {
    ctx.srcBuilder.addNl();
  }
}

// Update lowerAndEmitElem switch
export function lowerAndEmitElem(e: AbstractElem, ctx: EmitContext): void {
  switch (e.kind) {
    // ... existing cases ...
    
    case "comment":
      emitComment(e, ctx);
      return;
      
    // Remove or simplify text case - now rarely used
    case "text":
      // This case might not be needed anymore
      emitText(e, ctx);
      return;
  }
}

// Update container emission to regenerate structure
export function emitConst(e: ConstElem, ctx: EmitContext): void {
  // Emit leading comments first
  const leadingComments = e.contents.filter(
    c => c.kind === "comment" && (c as CommentElem).position === "leading"
  );
  leadingComments.forEach(c => lowerAndEmitElem(c, ctx));
  
  // Regenerate the declaration
  ctx.srcBuilder.add("const ");
  
  // Emit the name
  lowerAndEmitElem(e.name.decl, ctx);
  
  // Emit type if present
  if (e.name.typeRef) {
    ctx.srcBuilder.add(": ");
    lowerAndEmitElem(e.name.typeRef, ctx);
  }
  
  // Emit initializer if present
  if (hasInitializer(e)) {
    ctx.srcBuilder.add(" = ");
    emitInitializer(e, ctx);
  }
  
  // Emit trailing comments
  const trailingComments = e.contents.filter(
    c => c.kind === "comment" && (c as CommentElem).position === "trailing"
  );
  
  ctx.srcBuilder.add(";");
  
  // Trailing comments go after semicolon
  trailingComments.forEach(c => {
    ctx.srcBuilder.add(" ");
    lowerAndEmitElem(c, ctx);
  });
}
```

### Step 5: Parser Usage Example

**File:** `/tools/packages/wesl/src/parse/ConstParsers.ts`

```typescript
export function parseConstDecl(ctx: ParseContext): ConstElem | null {
  const startPos = ctx.position();
  
  // Match "const" keyword
  if (!ctx.stream.match("const")) return null;
  
  // Open element for content collection
  openElem(ctx, { kind: "const", contents: [] });
  
  // Parse the name (TypedDeclElem)
  const name = parseTypedDecl(ctx);
  if (!name) {
    throw new Error("Expected identifier after 'const'");
  }
  
  // Add name to contents
  ctx.addElem(name);
  
  // Parse initializer if present
  if (ctx.stream.match("=")) {
    const init = parseExpression(ctx);
    if (init) {
      ctx.addElem(init);
    }
  }
  
  // Match semicolon
  if (!ctx.stream.match(";")) {
    throw new Error("Expected ';' after const declaration");
  }
  
  const endPos = ctx.position();
  
  // Close element - will add comments but NOT text elements
  const contents = closeElem(ctx, startPos, endPos);
  
  return {
    kind: "const",
    start: startPos,
    end: endPos,
    name,
    contents,
  };
}
```

## Example: Before and After

### Input Code
```wesl
// Configuration constant
const MAX_ITEMS = 100;  // item limit
```

### V1/V2 Current AST (with text elements)
```typescript
{
  kind: "const",
  start: 0,
  end: 58,
  contents: [
    { kind: "text", start: 0, end: 33 },     // "// Configuration constant\nconst "
    { kind: "typeDecl", ... },
    { kind: "text", start: 43, end: 58 }     // " = 100;  // item limit"
  ]
}
```

### Proposed AST (comments only)
```typescript
{
  kind: "const",
  start: 0,
  end: 58,
  name: {
    kind: "typeDecl",
    decl: { kind: "decl", ident: { originalName: "MAX_ITEMS", ... } }
  },
  contents: [
    {
      kind: "comment",
      text: "// Configuration constant",
      variant: "line",
      position: "leading",
      start: 0,
      end: 26
    },
    {
      kind: "comment",
      text: "// item limit",
      variant: "line",
      position: "trailing",
      start: 45,
      end: 58
    }
  ]
}
```

## Testing Strategy

### Test 1: Comments Preserved
```typescript
test("preserve comments in const", () => {
  const src = `
    // doc comment
    const x = 1;  // trailing
  `;
  
  const ast = parseWESL(src);
  const constElem = ast.moduleElem.contents.find(e => e.kind === "const");
  
  expect(constElem.contents).toHaveLength(2);
  expect(constElem.contents[0].kind).toBe("comment");
  expect(constElem.contents[0].text).toContain("doc comment");
  expect(constElem.contents[1].kind).toBe("comment");
  expect(constElem.contents[1].text).toContain("trailing");
});
```

### Test 2: No Comments = Empty Contents
```typescript
test("no comments means empty contents", () => {
  const src = `const x = 1;`;
  
  const ast = parseWESL(src);
  const constElem = ast.moduleElem.contents.find(e => e.kind === "const");
  
  // Contents should be empty (no text elements, no comments)
  expect(constElem.contents).toHaveLength(0);
});
```

### Test 3: Emission Regenerates Correctly
```typescript
test("emit regenerates structure", () => {
  const src = `const x=1;`;  // No spacing
  
  const ast = parseWESL(src);
  const output = emitWGSL(ast);
  
  // Should regenerate with proper spacing
  expect(output.trim()).toBe("const x = 1;");
});
```

### Test 4: Comments Round-Trip
```typescript
test("comments preserved in output", () => {
  const src = `
    // Important
    const x = 1;  // value
  `;
  
  const ast = parseWESL(src);
  const output = emitWGSL(ast);
  
  expect(output).toContain("// Important");
  expect(output).toContain("// value");
});
```

## Migration Checklist

- [ ] Add CommentElem type to AbstractElems.ts
- [ ] Update TerminalElem union type
- [ ] Modify WeslStream to capture comments
- [ ] Update ContentsHelpers.closeElem()
- [ ] Remove/simplify coverWithText()
- [ ] Update emission for each element type:
  - [ ] ConstElem
  - [ ] FnElem
  - [ ] StructElem
  - [ ] VarElem
  - [ ] AliasElem
  - [ ] StatementElem
- [ ] Add emitComment() function
- [ ] Update lowerAndEmitElem switch
- [ ] Write comment preservation tests
- [ ] Update existing tests (AST snapshots)
- [ ] Verify round-trip (parse + emit = valid WGSL)
- [ ] Benchmark AST size reduction

## Gradual Migration Path

You don't have to change everything at once:

### Phase 1: Dual Mode (safest)
- Keep existing text elements
- ALSO add comment elements
- Test both work together
- Verify output unchanged

### Phase 2: Comment-Only Mode
- Add config flag: `commentOnlyMode: boolean`
- When true, skip text element creation
- Test with subset of files

### Phase 3: Remove Text Elements
- Once confident, remove text element code
- Update all tests
- Clean up unused code

## Performance Considerations

**AST Size:**
- Current: ~1MB for typical shader
- Expected: ~650KB (35% reduction)

**Parse Time:**
- Current: ~10ms
- Expected: ~8ms (comment attachment simpler than text coverage)

**Emit Time:**
- Current: ~5ms (copy ranges)
- Expected: ~7ms (regenerate structure)
- Trade-off: Slightly slower emit for much smaller AST

## Edge Cases to Handle

### 1. Comments in Expressions
```wesl
const x = 1 /* inline */ + 2;
```
Attach to parent expression, emit inline.

### 2. Multiple Trailing Comments
```wesl
const x = 1;  // comment 1
              // comment 2
```
Store all as trailing, emit sequentially.

### 3. Comments Between Parameters
```wesl
fn foo(
  x: i32,  // first param
  y: i32   // second param
) { }
```
Attach to respective parameter elements.

### 4. Block Comments with Structure
```wesl
const x = /* type hint */ 1;
```
Store in init expression, emit inline.

### 5. License Headers
```wesl
/*
 * Copyright 2024
 * License...
 */
 
const x = 1;
```
Attach to module, emit at top.

