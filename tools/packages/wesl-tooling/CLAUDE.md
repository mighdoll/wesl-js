# wesl-tooling Package

Shared tooling for WESL workflows: loading modules, parsing dependencies, and file system utilities.

## Package Name Flows

Understanding how npm package names flow through the WESL system:

### 1. Publishing Flow (wesl-packager → WeslBundle)
```
package.json { name: "lygia" }
  ↓
wesl-packager creates WeslBundle
  ↓
WeslBundle { name: "lygia", modules: {...} }
  ↓
Published to npm as weslBundle.js
```
**Direction**: npm name → bundle creation
**No reverse lookup needed**

### 2. Explicit Dependencies Flow (wesl.toml → linker)
```
wesl.toml: dependencies = ["lygia"]
  ↓
Plugin/CLI reads config
  ↓
Node.js resolve("lygia") → node_modules/lygia/dist/weslBundle.js
  ↓
Bundle loaded and passed to linker
```
**Direction**: npm name → bundle loading
**No reverse lookup needed** - starts with npm name

### 3. Auto-Discovery Flow (WESL imports → npm resolution)
```
WESL code: import lygia::sdf::circleSDF
  ↓
Parser finds unbound: ['lygia', 'sdf', 'circleSDF']
  ↓
Generate npm-style paths: 'lygia/sdf', 'lygia'
  ↓
Node.js resolve each → loads matching bundle
  ↓
Pass to linker
```
**Direction**: WESL identifier → npm package
**⚠️ Reverse lookup needed for sanitized names** (e.g., `lygia_shader_utils` → `@lygia/shader-utils`)

**Implementation**: `ParseDependencies.ts:unboundToDependency()`

### 4. Programmatic API Flow (imports → linker)
```typescript
import lygia from "lygia";
const result = await link({ libs: [lygia] });
```
**Direction**: npm import → bundle already loaded
**No reverse lookup needed**

### 5. CLI Flow (command args → linker)
```bash
wesl-link lygia::sdf::circleSDF
```
**Direction**: WESL identifier → npm package (via auto-discovery)
**Uses auto-discovery flow** - same reverse lookup as #3

## Key Files

- `LoadModules.ts`: Load WESL source files from filesystem
- `ParseDependencies.ts`: Extract dependencies from WESL imports, resolve to npm packages
- `TomlConfig.ts`: Parse wesl.toml configuration

## Publishing Modes

### Single Bundle
One WeslBundle containing all modules:
```js
{ name: "random_wgsl", modules: { "lib.wgsl": "..." } }
```

### Multi-Bundle (e.g., Lygia)
Separate WeslBundle per module, all with same `name`:
```js
// dist/sdf/circleSDF/weslBundle.js
{ name: "lygia", modules: { "sdf/circleSDF.wesl": "..." } }

// dist/color/rgb2hsv/weslBundle.js
{ name: "lygia", modules: { "color/rgb2hsv.wesl": "..." } }
```

**package.json exports**: `./*` maps to `./dist/*/weslBundle.js`
**Node resolution**: `import from "lygia/sdf/circleSDF"` → `dist/sdf/circleSDF/weslBundle.js`
