# wesl-plugin Package

Bundler plugin ecosystem for importing and processing WESL/WGSL shader files in JavaScript build pipelines.

## Purpose

Enables importing WebGPU shaders directly into JavaScript/TypeScript code with different processing modes:
- Dynamic linking with runtime conditions
- Static compilation at build time
- Type generation for GPU bindings
- Modular shader development

## Supported Bundlers

```typescript
// Vite
import weslPlugin from "wesl-plugin/vite";

// Also supports: webpack, rollup, esbuild, rspack, nuxt, farm, astro
```

## Configuration

```typescript
// vite.config.ts
export default {
  plugins: [
    weslPlugin({
      weslToml: './wesl.toml',  // Optional config file
      extensions: [customExt]    // Optional custom extensions
    })
  ]
}
```

### wesl.toml
```toml
weslFiles = ["shaders/**/*.w[eg]sl"]  # Shader file patterns
weslRoot = "shaders"                   # Base directory
dependencies = ["auto"]                # Auto-detect npm packages
```

## Import Suffixes

### ?link (Dynamic Linking)
```typescript
import linkParams from "./shader.wesl?link";
const result = await link({
  ...linkParams,
  conditions: { MOBILE: true }
});
```

### ?static (Build-Time Compilation)
```typescript
import wgsl from "./shader.wesl?static";
const module = device.createShaderModule({ code: wgsl });
```

### With Conditions
```typescript
import shader from "./app.wesl MOBILE=true DEBUG=false ?static";
```

## Extension System

### Creating Custom Extensions
```typescript
const myExtension: PluginExtension = {
  extensionName: "custom",
  emitFn: (api, suffix) => {
    const source = api.weslSrc()["main.wesl"];
    return `export default ${JSON.stringify(source)};`;
  }
};
```

### Extension API
- `weslToml()` - Access configuration
- `weslSrc()` - Get all shader sources
- `weslRegistry()` - Access parsed ASTs
- `weslMain()` - Resolve main module
- `weslDependencies()` - List dependencies

## Architecture Highlights

### Modular Design
- Extensions handle different processing modes
- Clean separation between parsing and code generation
- Reusable across multiple bundlers via unplugin

### Developer Experience
- TypeScript definitions for imports
- File watching and hot reloading
- Clear error messages
- Automatic dependency resolution

### Performance
- Build-time compilation option
- Internal caching
- Efficient file watching

## Development Notes

- Uses unplugin for bundler abstraction
- Extensions emit JavaScript/TypeScript code
- Supports both WESL and vanilla WGSL files
- Path handling works across platforms
