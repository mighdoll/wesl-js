# WESL-JS Development Guide

- You are an expert programmer, a fan of concise, clear code. Small modular functions.
- You eschew ornamentation and boilerplate.

## Overview

**WESL-JS** is a TypeScript toolchain for WESL (WebGPU Extensible Shading Language), which extends WGSL with imports, conditional compilation, and package management.

## Directory Structure & Commands

**Repository Layout**:
```
wesl/                      # Repository root
├── tools/                 # Main development directory
│   ├── packages/          # Individual packages
│   │   ├── wesl/         # Core linker
│   │   ├── wesl-plugin/  # Bundler plugins
│   │   └── mini-parse/   # PEG parser
│   └── package.json      # Workspace root (defines :all scripts)
└── worktrees/            # Git worktrees for feature branches
```

**bb Script**: Use `bb` from any directory for all commands:
- `bb fix:all` - Auto-format code across all packages
- `bb test:all` - Run tests across all packages
- `bb prepush` - Full validation before committing
- `bb typecheck` - Type check current package
- `bb test` - Test current package
- bb automatically determines the correct directory context

## Core Architecture

**Pipeline**: `WESL → Parse → AST → bindIdents → lowerAndEmit → WGSL`

**Key Packages**:
- `tools/packages/wesl/` - Core linker library
- `tools/packages/wesl-plugin/` - Bundler plugins (Vite, Webpack, etc.)
- `tools/packages/mini-parse/` - PEG parser combinator

**WESL Features**:
```wgsl
import package::foo::utils::helper;      // import from the root of this package
import super::utils::helper;             // relative imports (like ../)

// Conditional compilation
@if(RED) /* conditional */
@elif(GREEN) /* alt conditional */
@else /* alternative */
```

# Coding Standards

## TypeScript Best Practices
- usually extend tools/tsconfig.base.json. strict mode, ES2024 target.

### Prefer Plain Objects over Classes
- Easier prop/state propagation in React
- Less boilerplate, more concise
- Enhanced readability and predictability
- Simplified immutability

### Use ES Module Encapsulation
- Export = public API
- No export = private
- Test public APIs, not internals
- Reduces coupling

### Type Safety
- Avoid `any` - use `unknown` when type is truly unknown
- Use type narrowing with `unknown`
- Minimize type assertions (`as Type`)
- Type assertions in tests = code smell

### Embrace Array Operators
- Use `.map()`, `.filter()`, `.reduce()`, etc.
- Promotes immutability, readability

### API Design Patterns
- Group related parameters into typed objects when functions take 3+ arguments
- Throw errors in utilities, let top-level decide handling (avoid multiple exit points)
- Extract reusable patterns into small utility functions
- Provide separate test-friendly entry points when beneficial

## Local Code Style
**important rules to match project conventions**
### constants
- no ALL_CAPS_CONSTANTS. `const maxSize` > `const MAX_SIZE`
- keep constants with implementation files (no separate constants.ts)

### types
- Generally, don't make a separate types file
- Keep types with their primary implementation file
- Exceptions for separate type files:
  - Types that are voluminous and very widely used (like AbstractElems)
  - Very generic type constructors (like TypeUtils)
- Worker message types should be in the worker implementation file

### functions
- module level functions use function declaration: `function foo() {}` not `const foo = () => {};`

### function ordering within the file
- `export function`? towards the top of the file, most important export goes first.
- `function` not exported? **always** place below exports. sort in order referenced by functions above.

### tests
- tests are flat at the module level of the file, no describe(), no mocks
- tests go in a tests/ directory, usually inside src

### File Names
- .ts files start with capital letter.
  - exceptions:
    - lower case first letter for bin scripts - only for entry points file that starts with e.g. `#!/usr/sbin/env node`
    - main.ts - only for the main entry point for web project (e.g. referenced from index.html)
    - index.ts - only for npm packages entry points
### index.ts
- index.ts files are only for npm package boundaries
  - (no barrel file imports for internal directories)
### Imports
- Imports use `.ts` extensions, `node:` prefix for Node

## Comment style
- Remove redundant comments (what code says)
- Keep WHY comments, complex logic explained
- non-obvious behaviors / expectations documented
- JSDoc concise and minimal (avoid obvious repetition)
- brief function docs, JSDoc for public APIs
- Use ASCII characters only - avoid hard-to-type unicode (←, →, ⟺, etc.)
  - Use `==>`, `<==`, `<=>` instead
- Non-trivial functions have a function comment.
  short function comments fit on one line:
      ```ts
      /** @return a copy of an object, rewriting the keys using a provided function.  */
        export function mapKeys(
        ): typeof o {
          const newEntries = Object.entries(o).map(([k, v]) => [fn(k), v]);
          return Object.fromEntries(newEntries);
        }
        ```
## Naming - functions, variables, files:
- Related functions use consistent prefixes?
- Same concept = same name everywhere?
- Boolean names clear (`isValid` > `notInvalid`)r
- Avoid generic prefixes (`check*`, `do*`, `handle*`, etc.) when specific terms exist.
- Make variable names clear and concise.
- Prefer shorter names: usually prefer `WorkerOptions` to `PureGenericWorkerOptions`,
  - unless needed for clarity, shorter names are easier to read
  - Names usually < 15 characters long (except in grammar).
- For concision, usually avoid repeating the module name as part
  of a function or variable name:
  - module `util.ts`:
      `function sort() {}` > `function utilSort() {}`

## Concision, and Vertical Lines
- Reduce vertical space without sacrificing readability
    - 25 lines preferred, < 40 lines almost always.
    - Combine variable declarations
    - Use shorter but clear names
    - Inline simple operations
    - prefer fn({ foo, bar, baz})  // all on one line < 80 chars

### Destructuring
- Split destructuring into multiple statements when it saves vertical space
- Keep each destructuring statement on one line when possible
- Example:
  ```ts
  // Good - saves vertical space
  const { textureFormat = "rgba32float", size = [1, 1] } = params;
  const { inputTextures, uniforms = {} } = params;

  // Bad - takes up more vertical space unnecessarily
  const {
    textureFormat = "rgba32float",
    size = [1, 1],
    inputTextures,
    uniforms = {},
  } = params;
  ```

- Avoid unnecessary intermediate variables
- Use ternary for simple conditionals
- Remove redundant type narrowing
- Inline simple operations
- Can we reduce vertical space without sacrificing readability?
- **Avoid unnecessary intermediate variables**:
  - Inline simple expressions that don't aid readability
  - Keep intermediates only when they clarify complex logic
