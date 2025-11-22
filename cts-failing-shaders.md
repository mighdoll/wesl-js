# Representative Failing Shaders for Custom Parser

Total: 153 issues (1 parse error + 152 mistranslations)

## Category 1: @diagnostic on statements (PARSE ERROR - ~140 tests)

The custom parser fails to parse `@diagnostic` attributes before statement keywords.

### 1a. @diagnostic on for statement
```wgsl
fn foo() { @diagnostic(error, derivative_uniformity) for (var i = 0; i < 10; i++) @diagnostic(info, derivative_uniformity) { } }
```

### 1b. @diagnostic on if statement
```wgsl
fn foo() { @diagnostic(info, derivative_uniformity) if true { } }
```

### 1c. @diagnostic on while statement
```wgsl
fn foo() { @diagnostic(info, derivative_uniformity) while true { } }
```

### 1d. @diagnostic on loop statement
```wgsl
fn foo() { @diagnostic(info, derivative_uniformity) loop { break; } }
```

### 1e. @diagnostic on switch statement
```wgsl
fn foo() { @diagnostic(info, derivative_uniformity) switch 0 { default { } } }
```

## Category 2: binding_array as identifier (10 tests)

WESL treats `binding_array` as a type keyword, not allowing it as an identifier.

```wgsl
var<private> binding_array : i32;
```

```wgsl
fn binding_array() {}
```

```wgsl
alias binding_array = i32;
```

## Category 3: @must_use with empty parentheses (TOO PERMISSIVE - 1 test)

WESL accepts `@must_use()` but it should be rejected (no parameters allowed).

```wgsl
@must_use() fn foo() -> u32 { return 0; }
```

**Expected**: Error (empty parentheses not allowed)
**WESL behavior**: Accepts it

## Category 4: semicolon after continuing (TOO PERMISSIVE - 1 test)

WESL accepts a semicolon after the continuing block which is invalid.

```wgsl
fn f() { loop { break; continuing{}; } }
```

**Expected**: Error (no semicolon after continuing block)
**WESL behavior**: Accepts it

## Category 5: empty source (PARSE ERROR - 1 test)

WESL fails on empty input.

```wgsl

```

(empty string)

---

## Summary by Issue Type

| Category | Count | Type | Description |
|----------|-------|------|-------------|
| @diagnostic on statements | ~140 | Parse Error | Can't parse @diagnostic before if/for/while/loop/switch |
| binding_array identifier | 10 | Keyword Conflict | binding_array treated as reserved |
| @must_use() | 1 | Too Permissive | Accepts empty parentheses |
| semicolon after continuing | 1 | Too Permissive | Accepts trailing semicolon |
| empty source | 1 | Parse Error | Can't handle empty input |
