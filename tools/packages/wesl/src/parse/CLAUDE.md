# WESL Parser Architecture Guide

## Overview

The WESL parser uses mini-parse combinators to build a grammar that extends WGSL with modules, imports, and conditional compilation. Understanding the architecture is crucial for making modifications.

## Key Architecture Decisions

### 1. Grammar Separation

The parser is split across multiple files to manage complexity and avoid circular dependencies:

- **WeslGrammar.ts** - Main WESL grammar (functions, statements, expressions)
- **ImportGrammar.ts** - Import statement parsing
- **AttributeGrammar.ts** - Attribute parsers (@if, @else, etc.)
- **WeslBaseGrammar.ts** - Base parsers (tokens, identifiers, literals)

### 2. Circular Dependency Management

**Problem**: WeslGrammar imports ImportGrammar (for parsing imports), but ImportGrammar needs attribute parsers from WeslGrammar (for @if on imports).

**Solution**: Extract shared parsers into separate files (e.g., AttributeGrammar.ts).

### 3. Collection vs Non-Collection Parsers

Parsers can be "collected" or "non-collected":

```typescript
// Collected - adds element to AST as a separate node
const if_attribute = tagScope(
  if_attribute_base.collect(specialAttribute)
);

// Non-collected - returns raw parse result
const if_attribute_base = preceded(
  seq("@", weslExtension("if")),
  // ... parser details
);
```

**Important**: When composing parsers with `seq()`, use non-collected versions to avoid type mismatches.

### 4. Span Management

Elements must correctly set their span (start/end positions) to prevent text gaps:

```typescript
// GOOD: span() wraps entire element including attributes
const import_statement = span(
  seq(
    repeat(or(if_attribute_base, else_attribute_base)),
    import_statement_base,
  ),
).map(({ value: [attributes, imports], span }) => ({
  kind: "import",
  imports,
  start: span[0],
  end: span[1],
  attributes,
}));

// BAD: Would create text nodes for attribute text
const import_statement = seq(
  repeat(or(if_attribute_base, else_attribute_base)),
  span(import_statement_base), // span only on base!
);
```

### 5. AST Collection Flow

1. Parsers create partial elements during parsing
2. Collectors (before/after functions) build the final AST
3. `coverWithText()` fills gaps between elements with TextElems
4. Elements not covered by parent spans become separate text nodes

## Common Patterns

### Adding Attributes to New Elements

1. Extend the element interface with `HasAttributes`
2. Parse attributes before the main element
3. Use `span()` to include attributes in element bounds
4. Map parsed attributes to AttributeElem if needed

### Creating Shared Parsers

When multiple files need the same parser:

1. Create a new file for the shared parsers
2. Export both collected and base versions
3. Use base versions in `seq()` compositions
4. Use collected versions for standalone parsing

### Debugging Parse Issues

1. Check if text appears where it shouldn't → span issue
2. Type errors in seq() → using collected instead of base parser
3. Circular import errors → need to extract shared parser
4. Elements not filtered by @if → check filterValidElements usage

## Import-Specific Notes

- Import parsing happens early in the pipeline
- `flatImports()` is called during binding, not parsing
- Conditional filtering happens in `flatImports()` with optional conditions
- Import elements support attributes just like other declarations

## Testing Considerations

- `expectedWgsl` - Expected output with readable identifiers
- `underscoreWgsl` - Expected output with mangled identifiers (e.g., `package_b_val`)
- Use `toMatchInlineSnapshot` for AST structure tests
- ParseConditions tests verify AST structure, not final output

## WESL Import Syntax

WESL extends WGSL with a module import system using `::` as the path separator.

### Basic Import Forms

1. **Simple import**: `import foo;`
2. **Package path import**: `import package::bar::foo;`
3. **Nested path import**: `import foo::bar::baz;`
4. **Super import**: `import super::foo;` (can chain: `import super::super::foo;`)
5. **Import with alias**: `import package::file1::foo as bar;`

### Destructured Imports

1. **Basic destructuring**: `import { foo };`
2. **Multiple items**: `import {a, b, c};`
3. **Nested destructuring**: `import {a::b as c, d::{ e }, f};`
4. **From module**: `import foo::{a, b};` or `import foo::bar::{a, b};`
5. **With aliases**: `import a::b::{c as foo};`

### Complex Example
```wgsl
import bevy_pbr::{
  mesh_view_bindings,
  utils::{PI, noise},
  lighting
};
```

### Conditional Imports

Imports can be conditionally included using attributes:
- `@if(DEBUG) import package::debug;`
- `@if(false) import a::val; @else import b::val;`
- `@if(false) import a::val; @elif(true) import b::val;`

### Invalid Syntax (Parser Rejects)
- `import` or `import;` - Missing target
- `import foo` - Missing semicolon
- `import super;` - Can't import super directly
- `import {};` - Empty destructuring
- `import foo::as::b;` - 'as' can't be in path
- `import foo::super::bar;` - 'super' only at start

### Test File Locations
- `./wesl-testsuite/src/test-cases/ImportSyntaxCases.ts` - Parsing tests
- `./wesl-testsuite/src/test-cases/ImportCases.ts` - Behavior tests
- `./tools/packages/wesl/src/test/ImportCases.test.ts` - Test runner
- `./tools/packages/wesl/src/test/ImportSyntaxCases.test.ts` - Syntax test runner

## Import Grammar Structure

The import grammar is built from these key productions:

1. **import_statement** = attributes? + import_statement_base
2. **import_statement_base** = "import" + (relative_prefix? + (collection | path_or_item)) + ";"
3. **relative_prefix** = "package::" | ("super::")+
4. **path_or_item** = word + ("::" + (collection | path_or_item) | "as" word | ε)
5. **collection** = "{" + (path_or_item + ("," + path_or_item)*) + "}"

The grammar uses mutual recursion between `path_or_item` and `collection` to handle nested imports.

## Sample Custom Parser Function

Here's an example of a custom parser for `else_attribute` that could work with mini-parse combinators:

```typescript
// Custom parser function that matches mini-parse Parser interface
function parseElseAttribute(context: ParserContext): OptParserResult<ElseAttribute> {
  const { stream } = context;
  const startPos = stream.checkpoint();

  // Match @ symbol
  const atToken = stream.next();
  if (!atToken || atToken.kind !== "symbol" || atToken.text !== "@") {
    stream.reset(startPos);
    return null;
  }

  // Match "else" keyword
  const elseToken = stream.next();
  if (!elseToken || elseToken.kind !== "word" || elseToken.text !== "else") {
    stream.reset(startPos);
    return null;
  }

  // Success - return ElseAttribute AST node
  return {
    value: { kind: "@else" }
  };
}

// Wrap in Parser class to integrate with combinators
const else_attribute_custom = new Parser({
  fn: parseElseAttribute,
  traceName: "else_attribute",
  terminal: true
});

// Can now use in seq() and other combinators:
const conditional_import = seq(
  or(if_attribute_base, else_attribute_custom),
  import_statement_base
);
```

This demonstrates:
- Direct stream manipulation with checkpoint/reset
- Token matching without combinators
- Returning null for backtracking
- Wrapping in Parser class for integration
