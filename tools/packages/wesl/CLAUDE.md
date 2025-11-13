# wesl Package

Core WESL compiler and linker that extends WGSL with modules, imports, and conditional compilation.

## Purpose

Transforms WESL (WebGPU Extended Shading Language) into standard WGSL by:
- Resolving module imports
- Applying conditional compilation
- Merging multiple files into a single shader
- Providing enhanced error messages with source mapping

## Key API

```typescript
import { link } from 'wesl';

// Link WESL modules into WGSL
const result = await link({
  weslSrc: {
    'main.wesl': mainSource,
    'utils.wesl': utilsSource
  },
  rootModuleName: 'main.wesl',
  conditions: { feature_x: true },
  constants: { MAX_LIGHTS: '8' }
});

// Enhanced device for error reporting
const device = await requestWeslDevice(adapter);
```

## Compilation Pipeline

1. **Parse** → AST generation from WESL source
2. **Bind** → Resolve imports and identifiers
3. **Transform** → Apply optional plugins
4. **Emit** → Generate final WGSL with source maps

## Module System

### Import Syntax
```wgsl
import { vec3, normalize } from "./math.wesl";
import * as utils from "package-name/utils.wesl";
```

### Export Syntax
```wgsl
export fn computeLighting() { ... }
export alias Color = vec4f;
export const MAX_ITEMS = 32;
```

## Conditional Compilation

```wgsl
@if (feature_shadows) {
  fn shadowCalculation() { ... }
} @else {
  fn shadowCalculation() { return 1.0; }
}
```

## Architecture Highlights

### Tree Shaking
- Only includes referenced declarations
- Automatic dead code elimination
- Optimizes bundle size

### Source Mapping
- Maps WGSL errors back to WESL source
- Clickable error messages in console
- Preserves original file/line information

### Plugin System
- Transform AST between binding and emission
- Example: `bindingStructsPlugin` for struct transformations
- Extensible for custom transformations

### Virtual Modules
- Generate modules on-demand
- Support for dynamic imports
- Integration with bundlers

## Development Notes

- Uses mini-parse for parsing
- Extensive test coverage in `test/`
- Source maps use VLQ encoding
- Supports both browser and Node.js environments

## References
- [agent-BindIdents.md](./agent-BindIdents.md) for high level descripton of BindIdents algorithm

## Common Issues & Solutions

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| "Unresolved identifier" | Binding phase issue | Check BindIdents.ts |
| Wrong output | Emission phase | Check LowerAndEmit.ts |

## Testing Patterns

- **WGSL comparison**: Use `expectTrimmedMatch()`
- **Test fields in wesl-testsuite/src/test-cases/***:
  - `expectedWgsl`: Expected output
  - `notes`: Known limitations
  - `underscoreWgsl`: Mangled output (for more than one source file)

## Debugging Tips

- **Import resolution**: Check module path in ParsedRegistry
- **Add logging**: Console.log in relevant phase (binding vs emission)
  - limit test run to one unit test with -t "testName" results to one unit test to limit log size
