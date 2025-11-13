# mini-parse Package

Lightweight TypeScript parser combinator library for building parsers with regex-based lexing.

## Purpose

A minimal (<4KB compressed) parser combinator library that enables:
- Building complex parsers from simple, composable functions
- PEG-style parsing with automatic backtracking
- Strong TypeScript typing throughout
- Runtime parser generation without code generation

## Core Concepts

### Parser Combinators
Build complex parsers by combining simple ones:
```typescript
const expr = seq(
  number,
  repeat(seq(or("+", "-"), number))
);
```

### Token Streams
Efficient tokenization with backtracking support:
```typescript
const tokens = new RegexMatchers({
  number: /\d+/,
  operator: /[+\-*/]/,
  ws: /\s+/
});
```

## Key Combinators

### Basic Parsers
- `token(kind, value)` - Match exact token
- `kind(kind)` - Match token kind
- `text(value)` - Match text value
- `any()` - Match any token
- `eof()` - End of input

### Sequences
- `seq(...parsers)` - Match sequence
- `seqObj({name: parser})` - Named results
- `preceded(skip, keep)` - Skip first
- `terminated(keep, skip)` - Skip last

### Choices
- `or(...parsers)` - First match wins
- `opt(parser)` - Optional match
- `not(parser)` - Negative lookahead

### Repetition
- `repeat(parser)` - Zero or more
- `repeatPlus(parser)` - One or more
- `withSep(sep, parser)` - Separated list

## Usage Example

```typescript
// Define a simple calculator
const num = kind("number").map(n => parseInt(n));
const factor = or(num, seq("(", () => expr, ")"));
const term = seq(factor, repeat(seq(or("*", "/"), factor)));
const expr = seq(term, repeat(seq(or("+", "-"), term)));

// Parse and evaluate
const result = expr.parse(tokens.parse("2 + 3 * 4")).value;
```

## Architecture Highlights

### Functional Design
- Immutable parsing state
- Pure functions for all combinators
- Side effects isolated to app state

### Performance
- Regex sticky flag for fast lexing
- Efficient checkpointing for backtracking
- Tree-shaking friendly

### Developer Experience
- Hierarchical trace debugging
- Clear error messages
- Modular, testable design
- Rich TypeScript types

## Development Notes

- Used by WESL parser for syntax analysis
- Supports source mapping for error reporting
- Extensible with custom stream implementations
- Production builds remove debug tracing code
