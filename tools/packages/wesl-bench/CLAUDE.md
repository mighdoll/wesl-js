# WESL-Bench Package Development Guide

## Overview
**wesl-bench** is a performance benchmarking suite for the WESL parser and linker. It measures compilation speed, memory usage, and parser performance across different WESL shader examples.

## Architecture

### Core Components
- `WorkerBenchmarks.ts` - Worker-based benchmark execution for isolated measurements
- `ParserVariations.ts` - Different parser implementation variants for comparison
- `BaselineVariations.ts` - Baseline comparison utilities
- `LoadExamples.ts` - Loads WESL shader examples for benchmarking

### Reporting
- `ReorganizeReportGroups.ts` - Reorganizes benchmark results by variant
- `LocSection.ts` - Lines of code analysis section
- `MeanTimeSection.ts` - Mean execution time reporting
- `BenchUtils.ts` - Shared benchmarking utilities

## Running Benchmarks

```bash
# Basic benchmark run
cd tools/packages/wesl-bench
pnpm bench

# Run with specific variant
pnpm bench --variant wesl

# Run with worker isolation
pnpm bench --worker

# Profile mode (single iteration for debugging)
pnpm bench:profile

# Validate benchmarks (quick test run)
pnpm bench:validate

# Run with Bun runtime
pnpm bench:bun

# Detailed CPU profiling (requires sudo)
pnpm bench:details
```

## Parser Variants

The benchmarks test multiple parser implementations:
- `wesl` - Standard WESL parser
- `wesl-reflect` - Parser with reflection capabilities
- `baseline` - Baseline implementation for comparison

## CLI Options

```bash
# Select specific variants
bin/bench.ts --variant wesl --variant baseline

# Run in worker mode (isolated execution)
bin/bench.ts --worker

# Profile mode (single iteration)
bin/bench.ts --profile

# Set time limit
bin/bench.ts --time 5

# Filter benchmarks by name
bin/bench.ts --filter "particle"
```

## Benchmark Examples

The suite tests against real-world WESL shaders:
- `bevy/` - Bevy game engine shaders
- `particle.wgsl` - Particle system shader
- `rasterize_05_fine.wgsl` - Fine rasterization shader
- `reduceBuffer.wgsl` - GPU buffer reduction
- `unity_webgpu_*.wgsl` - Unity WebGPU shaders

## Performance Metrics

### Measured Data
- **Execution Time** - Parser/linker execution speed
- **Memory Usage** - Heap allocation and GC pressure (with `--expose-gc`)
- **Lines of Code** - Shader complexity metrics
- **Throughput** - Operations per second

### Statistical Analysis
- Mean, median, standard deviation
- Percentiles (p75, p99, p999)
- Coefficient of variation
- Sample size and warmup iterations

## Testing

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test BenchCLI.test.ts

# Integration tests
pnpm test WorkerMode.integration.ts
```

## Key Patterns

### Adding a New Benchmark Example
1. Add WESL shader file to `wesl-examples/`
2. Update `LoadExamples.ts` if needed
3. Test with `pnpm bench --filter <name>`

### Creating a New Parser Variant
1. Add variant to `ParserVariations.ts`
2. Implement parser function
3. Register in `makeVariation()`
4. Test with `pnpm bench --variant <name>`

### Modifying Report Sections
1. Create new section in `src/`
2. Implement section interface
3. Add to sections array in `bin/bench.ts`

## Performance Considerations

- Use `--expose-gc --allow-natives-syntax` flags for accurate memory measurements
- Worker mode (`--worker`) provides better isolation but adds overhead
- Profile mode runs single iteration for debugging
- Baseline comparisons help identify regressions

## Dependencies
- `bencher` - Core benchmarking framework (workspace package)
- `wesl` - WESL parser and linker (workspace package)
- `wgsl_reflect` - WGSL reflection library

## Common Issues

| Issue | Solution |
|-------|----------|
| GC data not available | Ensure `--expose-gc` flag is used |
| Worker mode fails | Check Node.js worker thread support |
| Benchmarks too slow | Use `--time` to reduce duration |
| Memory issues | Run with `--worker` for isolation |

## Development Workflow

```bash
# Quick validation during development
pnpm bench:validate

# Full benchmark run before commits
pnpm bench --time 2

# Detailed profiling for optimization
pnpm bench:profile
`

- Store test output HTML files in the reports directory where the user can see them, but they'll be git ignored.
