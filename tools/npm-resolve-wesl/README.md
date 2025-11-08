# npm-resolve-wesl

A Rust implementation of npm package resolution for WESL (WebGPU Shading Language) modules.

This package provides functionality to resolve WESL module paths (e.g., `foo::bar::baz`) to npm packages and parse `weslBundle.js` files to extract shader code and dependencies.

## Features

- **Module Path Resolution**: Resolves WESL module paths to npm packages using Node.js ESM resolution algorithm
- **Bundle Parsing**: Parses `weslBundle.js` files to extract shader modules and metadata
- **OXC-based**: Uses the fast OXC parser and resolver for maximum performance
- **Compatible with TypeScript implementation**: Mirrors the behavior of the TypeScript `parseDependencies` and `dependencyBundles` functions

## Usage

### Resolving Dependencies

```rust
use npm_resolve_wesl::parse_dependencies;

let module_paths = vec!["random_wgsl::pcg".to_string()];
let project_dir = std::path::Path::new("/path/to/project");

let resolved_packages = parse_dependencies(&module_paths, project_dir);
// Returns: ["random_wgsl"]
```

### Parsing Bundle Files

```rust
use npm_resolve_wesl::parse::parse_wesl_bundle;
use std::path::Path;

let bundle_path = Path::new("node_modules/random_wgsl/dist/weslBundle.js");
let bundle = parse_wesl_bundle(bundle_path).unwrap();

println!("Package: {}", bundle.name);
println!("Edition: {}", bundle.edition);
println!("Modules: {} shader files", bundle.modules.len());
```

### Complete Workflow

```rust
use npm_resolve_wesl::dependency_bundles;

let module_paths = vec!["random_wgsl::pcg".to_string()];
let project_dir = std::path::Path::new("/path/to/project");

let bundles = dependency_bundles(&module_paths, project_dir).unwrap();
for bundle in bundles {
    println!("Loaded bundle: {}", bundle.name);
    for (path, code) in bundle.modules {
        println!("  Module: {} ({} bytes)", path, code.len());
    }
}
```

## Implementation Details

### Resolution Algorithm

The resolution process follows these steps:

1. **Split module paths**: `foo::bar::baz` → `["foo", "bar", "baz"]`
2. **Try longest subpath first**: Tests `foo/bar/baz`, then `foo/bar`, then `foo`
3. **Use Node.js resolution**: Leverages `oxc_resolver` with ESM conditions (`["node", "import"]`)
4. **Return first match**: Returns the longest resolvable package path

This mirrors the TypeScript implementation in `ParseDependencies.ts`.

### Bundle Structure

A `WeslBundle` contains:

```rust
pub struct WeslBundle {
    pub name: String,              // Package name
    pub edition: String,           // WESL edition (e.g., "unstable_2025_1")
    pub modules: Vec<(String, String)>,  // (path, source code) pairs
    pub dependencies: Vec<WeslBundle>,   // Transitive dependencies
}
```

### Parser Implementation

The parser uses OXC to:

1. Parse JavaScript/TypeScript code with `oxc_parser`
2. Walk the AST using the visitor pattern
3. Extract the `weslBundle` object literal
4. Build the `WeslBundle` structure

## Testing

```bash
# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_parse_simple_bundle
```

### Test Structure

- **Unit tests**: Basic parsing and resolution logic in `src/`
- **Integration tests**: Tests against real packages in `tests/integration_test.rs`
- **Lygia tests**: Tests against the published lygia package in `tests/lygia_test.rs`

### Test Requirements

Some integration tests require proper node_modules setup:

```bash
# From tools directory
pnpm install

# Tests will gracefully skip if packages aren't available
```

## Dependencies

- **oxc_resolver**: Node.js module resolution
- **oxc_parser**: Fast JavaScript/TypeScript parser
- **oxc_ast**: AST types and visitor pattern

## Comparison with TypeScript Implementation

| Feature | TypeScript (ParseDependencies.ts) | Rust (npm-resolve-wesl) |
|---------|-----------------------------------|-------------------------|
| Resolution algorithm | `import-meta-resolve` | `oxc_resolver` |
| Parsing | Dynamic `import()` | `oxc_parser` |
| Module loading | Node.js built-in | Manual file reading + parsing |
| Performance | Fast | Faster (compiled, no runtime) |
| Type safety | TypeScript | Rust |

## Future Work

- [ ] Support transitive dependency parsing (currently parsed but not loaded recursively)
- [ ] Add caching for resolved packages
- [ ] Support custom resolution options
- [ ] Add benchmarks comparing to TypeScript implementation

## License

Same as the parent wesl-js project (Apache-2.0 OR MIT).

## See Also

- TypeScript implementation: `tools/packages/wesl-tooling/src/ParseDependencies.ts`
- Test cases: `tools/packages/wesl-tooling/test/ParseDependencies.test.ts`
