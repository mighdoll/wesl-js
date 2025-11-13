# Bencher Package Development Guide

## Overview
**Bencher** is a TypeScript benchmarking framework with multiple runner backends (Mitata, TinyBench) and comprehensive reporting capabilities.

See README.md for usage docs

### Core Components
- `Benchmark.ts` - Core benchmark definitions and types
- `BenchmarkReport.ts` - Result reporting and formatting
- `MeasuredResults.ts` - Performance measurement data structures

### Runners
- `BasicRunner.ts` - Simple timing-based runner
- `MitataBenchRunner.ts` - Mitata backend integration
- `TinyBenchRunner.ts` - TinyBench backend integration
- `RunnerOrchestrator.ts` - Coordinates multiple benchmark runners
- `WorkerScript.ts` - Worker thread support for isolated benchmarks

### CLI
- `RunBenchCLI.ts` - Command-line interface for running benchmarks
- `CliArgs.ts` - CLI argument parsing and validation

## Testing

```bash
# Run all bencher tests
cd tools/packages/bencher
pnpm test

# Run specific test file
pnpm test BenchmarkReport.test.ts --reporter=verbose

# Run with garbage collection exposed (for memory benchmarks)
pnpm test --node-options="--expose-gc --allow-natives-syntax"
```

## Key Patterns

### Benchmark Definition
```typescript
const bench: Benchmark = {
  name: "array operations",
  fn: () => {
    const arr = Array.from({ length: 1000 }, (_, i) => i);
    return arr.reduce((a, b) => a + b, 0);
  }
};
```

### Runner Usage
```typescript
const runner = createRunner({ backend: "mitata" });
const results = await runner.run(benchmarks);
```

## Performance Considerations
- Use `--expose-gc --allow-natives-syntax` flags for accurate memory measurements and V8 native functions
- Isolate benchmarks in workers to avoid interference
- Multiple warmup iterations before timing measurements
- Statistical analysis for result stability

## File Organization
- `/runners/` - Benchmark execution backends
- `/cli/` - Command-line interface
- `/table-util/` - Table formatting utilities
- `/mitata-util/` - Mitata-specific utilities
- `/test/` - Test files and fixtures

## Common Tasks

### Adding a New Runner
1. Extend `BenchRunner` interface
2. Implement timing and measurement logic
3. Register in `CreateRunner.ts`
4. Add tests in `/test/`

### Modifying CLI Options
1. Update `CliArgs.ts` with new options
2. Handle in `RunBenchCLI.ts`
3. Update help text and validation

## Dependencies
- `mitata` - High-performance benchmarking library
- `tinybench` - Lightweight alternative backend
- `picocolors` - Terminal output coloring
- `table` - Result table formatting
- `yargs` - CLI argument parsing

## source code for TinyBench and Mitata
source code for TinyBench: @/Users/lee/lib/tinybench/src/task.ts
source code for mitata: @/Users/lee/wesl/worktrees/bench4/tools/node_modules/.pnpm/mitata@1.0.34/node_modules/mitata/src/lib.mjs

**Library Documentation: README.md**
