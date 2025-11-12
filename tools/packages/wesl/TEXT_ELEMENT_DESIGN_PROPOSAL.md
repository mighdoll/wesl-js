# Forward-Looking Text Element Format for WESL AST

## Executive Summary

**Recommendation: "Comments Only" with Optional Formatting Mode**

Store only non-regeneratable information (comments) in the AST, with two emission modes:
1. **Preserve mode** (default): Emit source exactly as written
2. **Format mode** (future): Emit pretty-printed WGSL

This approach minimizes AST size, simplifies parsers, and provides flexibility for future tooling.

---

## Current State Analysis

### How Text Elements Work Today

**V1 Parser:**
```
const %x
  text 'const '    // Keyword + trailing space
  typeDecl %x
    decl %x
  text ' = 1;'     // Expression + semicolon
```

**V2 Parser:**
```
const %x
  text 'const'     // Keyword only
  typeDecl %x
    text ' '       // Space separately
    decl %x
  text ' = 1;'     // Expression + semicolon
```

**Key Characteristics:**
- Comments ARE preserved in text elements
- Emission copies ranges verbatim: `ctx.srcBuilder.addCopy(e.start, e.end)`
- Goal: "trivial WESL link produces identical WGSL" (Internals.md)
- RefIdentElem extracted for binding (must not change)

### The Fundamental Question

What information is truly necessary to preserve?

| Content Type | Regeneratable? | Semantic Value | Current Storage |
|-------------|----------------|----------------|-----------------|
| Keywords (`const`, `fn`) | ✅ Yes | Structure in AST | Text element |
| Punctuation (`;`, `{`, `)`) | ✅ Yes | Structure in AST | Text element |
| Whitespace (spaces, newlines) | ✅ Yes | Optional formatting | Text element |
| **Comments** (`//`, `/* */`) | ❌ **NO** | User documentation | Text element |
| Identifiers (refs) | ✅ Yes (mangled) | RefIdentElem | Separate elem |

**Critical Insight:** Only comments contain information not captured elsewhere in the AST.

---

## Design Options

### Option 1: "Preserve Everything" (Current V2)

**What:** Store all source text in text elements

**Pros:**
- Simple emission: copy ranges verbatim
- Guaranteed identical output
- Parser doesn't need to track what's regeneratable

**Cons:**
- Large AST (stores redundant information)
- Parser must create text elements for every gap
- Can't pretty-print without re-parsing
- Tight coupling to source formatting

**AST Example:**
```typescript
{
  kind: "const",
  start: 0, end: 15,
  contents: [
    { kind: "text", start: 0, end: 6 },      // "const "
    { kind: "typeDecl", ... },
    { kind: "text", start: 7, end: 15 }      // " = 1;"
  ]
}
```

---

### Option 2: "Comments Only" (RECOMMENDED)

**What:** Store only comments in AST; regenerate everything else during emission

**Pros:**
- Minimal AST size (only non-regeneratable info)
- Parser is simpler (fewer text elements)
- Easy to add formatting/pretty-printing later
- Clear separation: AST = structure, text = documentation
- Forward compatible with language evolution

**Cons:**
- Can't guarantee identical whitespace (but who cares?)
- Need two emission modes (preserve vs format)
- Initial migration effort

**AST Example:**
```typescript
{
  kind: "const",
  start: 0, end: 15,
  name: { ... },
  comments: [
    { kind: "comment", text: "// trailing comment", position: "after" }
  ]
}
```

**Implementation:**
```typescript
interface CommentElem extends AbstractElemBase {
  kind: "comment";
  text: string;
  variant: "line" | "block";
  attachment: "before" | "after" | "inline" | "trailing";
}
```

---

### Option 3: "Comments + Significant Whitespace"

**What:** Store comments and blank lines (vertical spacing)

**Pros:**
- Preserves code organization
- Minimal storage (only meaningful whitespace)
- Can recreate readable output

**Cons:**
- More complex parser (what's "significant"?)
- Still can't format horizontally
- Middle ground with unclear benefits

**Not Recommended:** Adds complexity without clear value.

---

### Option 4: "Regenerate Everything"

**What:** No text elements at all; emit from AST structure only

**Pros:**
- Smallest AST
- Built-in formatting
- Language evolution friendly

**Cons:**
- **BREAKS COMMENTS** - user documentation lost!
- Output differs from input (violates design goal)
- Can't preserve author's formatting choices

**Not Viable:** Comments are user-facing documentation.

---

## Recommended Approach: "Comments Only"

### Core Design

**Text Element Content:**
- Store ONLY comments in AST
- Everything else (keywords, punctuation, whitespace) is regenerated

**Emission Modes:**

1. **Preserve Mode** (default, backwards compatible):
   - When comments present: copy source range including surrounding context
   - When no comments: regenerate with minimal formatting
   - Goal: Maintain readability while preserving documentation

2. **Format Mode** (future):
   - Pretty-print entire output
   - Attach comments to appropriate AST nodes
   - Configurable style (indentation, spacing, etc.)

### Comment Attachment Strategy

Comments attach to the "closest meaningful AST node":

```wesl
// Function comment
fn foo(x: i32) {  // Inline comment
  return x;  // Trailing comment
}  // After-block comment
```

**Attachment Rules:**
- Comments on own line → attach to NEXT declaration/statement
- Comments after code → attach to THAT declaration/statement  
- Comments after closing brace → attach to PARENT element
- Comments in expression → store in nearest container

### AST Structure Example

```typescript
interface CommentElem extends AbstractElemBase {
  kind: "comment";
  text: string;  // Including "//" or "/* */"
  variant: "line" | "block";
  position: "leading" | "trailing" | "inner";
  start: number;  // Original position
  end: number;
}

// Comments added to elements:
interface FnElem extends ElemWithContentsBase {
  kind: "fn";
  name: DeclIdentElem;
  params: FnParamElem[];
  body: StatementElem;
  comments?: CommentElem[];  // ⬅️ NEW
  // ... rest unchanged
}
```

### Contents Array Format

**Minimal storage - comments only:**
```typescript
// Input:
const x = 1;  // important value

// AST:
{
  kind: "const",
  name: { ... },
  contents: [
    { kind: "comment", text: "// important value", position: "trailing", ... }
  ]
}
```

**No comments? Empty or undefined:**
```typescript
// Input:
const x = 1;

// AST:
{
  kind: "const",
  name: { ... },
  contents: []  // or omit entirely
}
```

### Emission Strategy

```typescript
function emitConst(elem: ConstElem, ctx: EmitContext): void {
  // Emit leading comments
  emitComments(elem.comments, "leading", ctx);
  
  // Regenerate structure
  ctx.add("const ");
  emitTypedDecl(elem.name, ctx);
  
  if (elem.init) {
    ctx.add(" = ");
    emitExpression(elem.init, ctx);
  }
  
  // Emit trailing comments
  emitComments(elem.comments, "trailing", ctx);
  
  ctx.add(";");
}
```

**With preserve mode:**
```typescript
function emitConstPreserve(elem: ConstElem, ctx: EmitContext): void {
  if (elem.comments?.length) {
    // Has comments - copy entire range to preserve formatting
    ctx.addCopy(elem.start, elem.end);
  } else {
    // No comments - can regenerate
    emitConst(elem, ctx);
  }
}
```

---

## Migration Plan

### Phase 1: Parser Changes (V2 only)

**Week 1: Comment Collection**
- Add `CommentElem` type to AbstractElems.ts
- Modify WeslStream to track comments (don't skip them)
- Add comment collection to openElem/closeElem
- Rule: Comments attach to next sibling or parent

**Week 2: Update Parsers**
- Remove most coverWithText() calls
- Keep comments in contents arrays
- Verify with tests (comment preservation)

**Week 3: Emission Updates**  
- Implement "preserve mode" (copy ranges with comments)
- Implement "regenerate mode" (emit from structure)
- Toggle via config flag

**Week 4: Testing & Validation**
- Verify all tests pass
- Check output matches input (with comments)
- Benchmark AST size reduction

### Phase 2: Format Mode (Future)

**Later: Pretty Printer**
- Add formatting configuration
- Implement indentation engine
- Add comment placement logic
- Support different style guides

### Phase 3: V1 Migration (Optional)

After V2 is complete and stable, optionally migrate V1:
- Use same comment-only approach
- Update 208 test snapshots
- Verify compatibility

---

## Trade-off Analysis

### Bundle Size Impact

**Current (preserve everything):**
- AST stores: keywords, punctuation, whitespace, comments
- Text elements: ~40% of AST size
- Example: `const x = 1;` → 3 text elements

**Proposed (comments only):**
- AST stores: comments only
- Text elements: ~5% of AST size
- Example: `const x = 1;` → 0 text elements (no comments)
- Example: `const x = 1; // doc` → 1 comment element

**Estimated Savings:** 30-35% reduction in AST size

### Parser Complexity

**Current:**
- Must create text element for every gap
- Track precise positions
- Handle whitespace/newlines carefully

**Proposed:**
- Parse comments as elements
- Attach to nearest AST node
- Ignore whitespace (regeneratable)

**Complexity:** Similar (shift from text tracking to comment attachment)

### Emission Flexibility

**Current:**
- Preserve mode only
- Output matches input exactly
- No formatting control

**Proposed:**
- Preserve mode (default)
- Format mode (future)
- Plugin-based formatters possible

**Future-proofing:** Much better for tooling

---

## Alternative: Hybrid Approach

If full migration seems risky, consider **hybrid**:

**Phase A: V2 with comments only (new code)**
- New V2 parser uses comment-only approach
- Proves concept with fresh implementation

**Phase B: V1 stays unchanged**
- V1 keeps current text elements
- Both pass same test suite
- Different internal representations OK

**Phase C: Converge or choose**
- After V2 complete, evaluate
- Either migrate V1 or keep diverged
- Make data-driven decision

---

## Questions & Answers

### Q: Won't output differ from input?

A: Only whitespace formatting differs. With preserve mode + comments, semantic content and documentation are identical. Users care about:
- Comments preserved ✅
- Code works ✅  
- Readable output ✅

Not about:
- Exact spacing (regeneratable)

### Q: What about RefIdentElem?

A: **No changes to RefIdentElem.** This proposal only affects text elements. Reference extraction for binding continues unchanged:

```typescript
// V1/V2 both extract refs:
const_assert
  ref x      // RefIdentElem (for binding)
  ref y      // RefIdentElem (for binding)
  comment "// check x < y"
```

### Q: How to handle inline comments?

A: Attach to containing expression/statement:

```wesl
const x = 1 /* clarify */ + 2;

// AST:
{
  kind: "const",
  name: ...,
  init: {
    kind: "binary",
    left: { kind: "literal", value: 1 },
    right: { kind: "literal", value: 2 },
    comments: [{ text: "/* clarify */", position: "inner" }]
  }
}
```

### Q: What about WGSL debuggers?

A: Preserved comments + generated formatting = readable output. Source maps handle position mapping. Debuggers typically show regenerated code anyway (minified JS, compiled C++, etc.).

---

## Recommendation Summary

**Adopt "Comments Only" approach:**

✅ **DO:**
- Store comments as CommentElem in AST
- Regenerate keywords, punctuation, whitespace
- Implement preserve mode (copy comment regions)
- Add format mode later (pretty printer)

❌ **DON'T:**
- Store redundant text (keywords, punctuation)
- Create text elements for whitespace
- Change RefIdentElem behavior
- Break comment preservation

**Timeline:**
- V2 parser: 4 weeks (comment-only from start)
- V1 parser: Optional (can stay as-is)
- Format mode: Future enhancement (not blocking)

**Expected Benefits:**
- 30-35% smaller AST
- Simpler parser implementation
- Future formatting flexibility
- Better tooling foundation

---

## Appendix: Example AST Comparison

### Input WESL
```wesl
// Initialize state
const x = 1;  // default value

fn foo(y: i32) {
  // Add inputs
  return x + y;  // sum
}
```

### Current AST (preserve everything)
```
module
  text '\n// Initialize state\n'
  const x
    text 'const '
    typeDecl %x
      decl %x
    text ' = 1;  // default value\n\n'
  fn foo
    text 'fn '
    decl %foo
    text '('
    param
      text 'y: i32'
    text ') {\n  // Add inputs\n  '
    statement
      text 'return x + y;  // sum\n}'
```

### Proposed AST (comments only)
```
module
  comment '// Initialize state' (leading)
  const x
    name: %x
    init: literal(1)
    comment '// default value' (trailing)
  fn foo
    name: %foo
    params: [
      param { name: %y, type: i32 }
    ]
    body:
      comment '// Add inputs' (leading)
      statement
        return: binary(add, ref(x), ref(y))
        comment '// sum' (trailing)
```

**Size difference:** ~60% reduction in this example
