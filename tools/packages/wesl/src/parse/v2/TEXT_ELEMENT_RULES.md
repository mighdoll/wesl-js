# V1 Text Element Rules

Based on inspection of V1's AST output, here are the rules for when text elements are added to contents arrays:

## Elements WITH contents arrays

Elements that extend `ElemWithContentsBase` have a `contents: AbstractElem[]` array.

### Standard Pattern (Most Elements)

Text elements cover **all unparsed source ranges** - keywords, punctuation, whitespace, expressions.

Examples:
- **ConstElem**: `['text const ', typeDecl, 'text  = 1;']`
- **GlobalVarElem**: `['text var ', typeDecl, 'text ;']`
- **AliasElem**: `['text alias ', decl, 'text  = ', type, 'text ;']`
- **StructElem**: `['text struct ', decl, 'text  { ', member, 'text  }']`
- **StructMemberElem**: `[name, 'text : ', type]`
- **TypeRefElem**: `[ref, 'text <', type, 'text >']` (for templates)
- **TypedDeclElem**: `[decl, 'text : ', type]`
- **StatementElem**: `['text { }']` or nested statements with text
- **ModuleElem**: `['text \n', child, 'text \n', child, ...]` (whitespace between declarations)

**V2 Implementation**: Use `openElem()`/`closeElem()` pattern - automatically fills gaps with text.

### Special Case: FnElem

**FnElem does NOT have text elements** for keywords, parens, or arrows at the fn level.

```
fn foo()
  decl %foo        // Just the name decl
  statement        // Just the body statement
    text '{ }'     // Body has its own text
```

Contents = `[decl, ...params, returnType?, body]` - no text coverage.

**V2 Implementation**: Build contents manually:
```typescript
const contents: any[] = [declIdentElem, body];
// Or with params/return type:
const contents: any[] = [declIdentElem, ...params, returnType, body];
```

### Special Case: FnParamElem

Param elements DO have text for their internal structure:

```
param
  decl %x
  typeDecl %x : i32
    text ': '     // Colon as text
    type i32
      ref i32
```

**V2 Implementation**: Use `openElem()`/`closeElem()` pattern.

## Elements WITHOUT contents arrays

Elements that only extend `AbstractElemBase` have no contents array:

- **ImportElem** - no contents
- **DirectiveElem** - no contents
- **NameElem** - no contents
- **DeclIdentElem** - no contents
- **RefIdentElem** - no contents

**V2 Implementation**: Don't use openElem/closeElem - just create the element.

## Summary for V2 Implementation

1. **Most elements**: Use `openElem()`/`closeElem()` ✅
2. **FnElem**: Manual contents = `[decl, ...params, returnType?, body]` ✅
3. **Elements without contents**: Just create, no openElem ✅
4. **ImportElem, DirectiveElem**: No contents array ✅

Current V2 status: Following these rules correctly!
