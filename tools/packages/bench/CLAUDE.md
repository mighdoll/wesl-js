# bench Package

Performance benchmarking tool for the WESL compiler/linker.

## Purpose

Measures and tracks the performance of WESL parsing and linking operations, helping detect performance regressions and optimize compiler speed.

## Key Features

- **Multi-variant benchmarking**: Tests different parsing strategies (link, parse, tokenize)
- **Baseline comparison**: Compares performance against previous versions
- **Detailed metrics**: Tracks timing, memory usage, and CPU counters
- **Real-world tests**: Uses actual shader code from game engines

## Common Commands

```bash
# benchmarking typical use
bb bench --filter import
bb bench --filter import --worker

# benchmarking suite
bb bench                   # Run standard benchmarks
bb bench:details           # Include CPU counters (requires sudo)

# Filtering and options
bb bench --filter import   # Run only tests matching "import"
bb bench --time 5          # Set benchmark duration to 5 seconds
bb bench --variant parse   # Test only the parse variant

# Baseline for benchmark, run this if _baseline/ doesn't exist
bb bench:baseline origin/main  # Set up baseline from git tag/commit

# integration test
bb test:integration        # validate bench code (slower test)
```

## Architecture

### Benchmark Variants
- **link**: Full WESL linking pipeline
- **parse**: Parsing only (no linking)
- **tokenize**: Lexical analysis only
- **wgsl_reflect**: Alternative parser for comparison

### Metrics Collected
- **Lines per second**: Primary throughput metric
- **Timing statistics**: Mean, p50, min/max
- **Memory usage**: Heap size and GC metrics
- **CPU counters**: Cache misses, stalls (with sudo)

### Architecture Direction: Soon we will:
- Split into two projects: bench and wesl-bench.
  - wesl-bench will have the wesl specific setup and call the bench library for benchmarking
- Generalized 'baseline' in bench, so that we can compare N tests against any of them
- Add statistical variance

### Test Organization
```
src/examples/
├── imports_only.wgsl      # Simple import test
├── particle.wgsl          # Real shader example
├── bevy/                  # Bevy engine shaders
└── naga_oil_example/      # Complex shader system
```

## Development Notes

- Uses mitata benchmarking library for high precision
- Supports multiple JavaScript runtimes (Node, Bun)
- Results displayed in formatted tables with color coding
- don't forget to run `bb test:integration` before presenting non-trivial changes to the user.

## Development Commands

- `bb test:integration` to run tests in the bench directory
