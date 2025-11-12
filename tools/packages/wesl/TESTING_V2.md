# Testing WESL V2 Parser

This document explains how to test the V2 custom parser against the V1 combinator parser.

---

## Quick Start

### Run tests with V1 (default)
```bash
pnpm --filter wesl test
```

### Run tests with V2
```bash
# Method 1: Set config flag in code
import { weslParserConfig } from "./ParseWESL.ts";
weslParserConfig.useV2Parser = true;

# Method 2: Run BOTH parsers in parallel
DUAL_PARSER=true pnpm --filter wesl test
```

---

## Dual Parser Mode: Running Both Parsers in Parallel

The dual parser mode (via `test.projects` in vitest.config.ts) runs the entire test suite **twice** - once with V1 and once with V2.

### Usage

```bash
# Run all tests with both parsers in parallel
DUAL_PARSER=true pnpm --filter wesl test

# Run specific test file with both parsers
DUAL_PARSER=true pnpm --filter wesl test ParseWESL

# Watch mode with both parsers
DUAL_PARSER=true pnpm --filter wesl test --watch
```

### Output Format

Tests are tagged with parser version:

```
✓ [v1] parse fn foo() { }
✓ [v2] parse fn foo() { }
✓ [v1] parse const x = 1
× [v2] parse const x = 1  <-- V2 failure
```

### What Gets Tested

**V1 Project:**
- All tests in `src/test/**/*.test.ts`
- Uses `TestSetupV1.ts` to configure V1 parser
- Tag: `[v1]`

**V2 Project:**
- All tests in `src/test/**/*.test.ts`
- **Excludes:** `ParserV2Parity.test.ts` (already tests both)
- Uses `TestSetupV2.ts` to configure V2 parser
- Tag: `[v2]`

---

## Test Setup Files

### TestSetupV1.ts
```typescript
import { weslParserConfig } from "../ParseWESL.ts";
weslParserConfig.useV2Parser = false;
```

### TestSetupV2.ts
```typescript
import { weslParserConfig } from "../ParseWESL.ts";
weslParserConfig.useV2Parser = true;
```

---

## Configuration Options

### Option 1: Default (V1 only)

**File:** `vitest.config.ts`

```bash
pnpm --filter wesl test  # Uses V1
```

### Option 2: Dual Parser Mode (V1 + V2 parallel)

**File:** `vitest.config.ts` with `DUAL_PARSER=true`

```bash
DUAL_PARSER=true pnpm --filter wesl test  # Both parsers
```

### Option 3: Programmatic

```typescript
import { weslParserConfig } from "./ParseWESL.ts";

// Enable V2
weslParserConfig.useV2Parser = true;

// Disable V2 (back to V1)
weslParserConfig.useV2Parser = false;
```

---

## Current Test Results

### ParserV2Parity Tests (V2-specific)
- **65 passing** | 3 skipped (68 total)
- **Pass rate:** 95.6%
- **Skipped:** V1 parser limitations

### Full Test Suite with V1
- **448 passing** | 2 skipped (450 total)
- **Pass rate:** 99.6%

### Full Test Suite with V2 (via workspace)
- **245 passing** | 335 failing (580 total)
- **Pass rate:** 42.2%
- **Main issues:**
  - Conditional compilation not evaluated
  - Template parameters not stored
  - AST structure differences

---

## Comparing Results

### Side-by-Side Comparison

```bash
# Run with dual parser mode and filter output
DUAL_PARSER=true pnpm --filter wesl test --reporter=verbose > results.txt

# Count V1 failures
grep "× \[v1\]" results.txt | wc -l

# Count V2 failures
grep "× \[v2\]" results.txt | wc -l

# Find tests that pass in V1 but fail in V2
grep "× \[v2\]" results.txt | while read line; do
  test=$(echo $line | sed 's/× \[v2\] //')
  if grep "✓ \[v1\] $test" results.txt > /dev/null; then
    echo "Regression: $test"
  fi
done
```

### JSON Reporter

```bash
# Generate JSON report for analysis
DUAL_PARSER=true pnpm --filter wesl test --reporter=json > test-results.json

# Analyze with jq
cat test-results.json | jq '.testResults[] | select(.name | contains("v2")) | select(.status == "failed") | .name'
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test V2 Parser

on: [push, pull_request]

jobs:
  test-v2:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - name: Test with both parsers
        run: DUAL_PARSER=true pnpm --filter wesl test
        env:
          DUAL_PARSER: true
      - name: Compare results
        run: |
          # Fail if V2 pass rate drops below threshold
          PASS_RATE=$(DUAL_PARSER=true pnpm --filter wesl test --reporter=json | jq '...')
          if [ $PASS_RATE -lt 40 ]; then
            echo "V2 pass rate too low: $PASS_RATE%"
            exit 1
          fi
```

---

## Troubleshooting

### Tests fail with "useV2Parser is not defined"

Make sure the test setup files are being loaded:

```typescript
// vitest.config.ts with test.projects
setupFiles: ["./src/test/TestSetupV2.ts"],  // ✅ Correct
setupFiles: ["./TestSetupV2.ts"],           // ❌ Wrong path
```

### Dual parser mode not working

Ensure you're setting the environment variable correctly:

```bash
DUAL_PARSER=true pnpm test  # ✅ Correct
pnpm test --dual-parser     # ❌ Wrong flag
```

### Both parsers show same results

Check that setup files are actually running:

```typescript
// Add to TestSetupV2.ts
console.log("[TestSetup] Using V2 parser");
```

---

## Best Practices

### 1. Use Dual Parser Mode for Regression Testing

```bash
# Before making V2 changes
DUAL_PARSER=true pnpm test > baseline.txt

# After changes
DUAL_PARSER=true pnpm test > current.txt

# Compare
diff baseline.txt current.txt
```

### 2. Focus on V2-specific Tests First

```bash
# Run only ParserV2Parity tests
pnpm test ParserV2Parity

# These are designed to test V2 specifically
```

### 3. Gradually Enable V2

```typescript
// In specific test files
import { weslParserConfig } from "../ParseWESL.ts";

describe("My Feature", () => {
  beforeAll(() => {
    weslParserConfig.useV2Parser = true;  // Test with V2
  });

  afterAll(() => {
    weslParserConfig.useV2Parser = false;  // Reset
  });

  test("...", () => { /* ... */ });
});
```

### 4. Document Known Failures

```typescript
test.skip("complex conditional compilation", () => {
  // Skip: V2 doesn't support @if/@elif/@else yet
  // See: v2-full-test-results.md
});
```

---

## Next Steps

1. **Fix V2 critical issues**
   - Conditional compilation
   - Template parameters
   - AST parity

2. **Use dual parser mode for validation**
   ```bash
   DUAL_PARSER=true pnpm test
   ```

3. **Monitor V2 pass rate**
   - Target: >90% parity with V1
   - Track improvements over time

4. **Switch default when ready**
   ```typescript
   // ParseWESL.ts
   weslParserConfig.useV2Parser = true;  // Switch to V2 by default
   ```

---

## References

- `vitest.config.ts` - Main test configuration with dual parser support
- `TestSetupV1.ts` - V1 parser setup
- `TestSetupV2.ts` - V2 parser setup
- `v2-full-test-results.md` - Comprehensive V2 status
- `ParserV2Parity.test.ts` - V2-specific parity tests

---

## Summary

**Default Behavior:** V1 parser (stable)

**For V2 Testing:**
- Single parser: Set `weslParserConfig.useV2Parser = true`
- Parallel comparison: Use dual parser mode

**Command:**
```bash
DUAL_PARSER=true pnpm --filter wesl test
```

This runs all tests with both parsers in parallel, making it easy to spot regressions and track V2 progress toward production readiness.
