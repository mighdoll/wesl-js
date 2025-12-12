# wgsl-play

Web component for rendering WESL/WGSL fragment shaders.

## Usage

```html
<script type="module">import "wgsl-play";</script>

<wgsl-play src="./shader.wesl"></wgsl-play>
```

That's it. The component auto-fetches dependencies and starts animating.

### Inline source

```html
<wgsl-play>
  @fragment fn fs_main() -> @location(0) vec4f {
    return vec4f(1.0, 0.0, 0.0, 1.0);
  }
</wgsl-play>
```

### Programmatic control

```typescript
const player = document.querySelector("wgsl-play");
player.source = shaderCode;
player.pause();
player.rewind();
player.play();
```

### Importing shaders (Vite)

```typescript
import shader from './examples/noise.wesl?raw';

const player = document.querySelector("wgsl-play");
player.source = shader;
```

The `?raw` suffix imports the file as a string. This keeps shaders alongside your source files with HMR support.

## API

### Attributes
- `src` - URL to .wesl/.wgsl file
- `shader-root` - Root path for internal imports (default: `/shaders`)

### Properties
- `source: string` - Get/set shader source
- `project: WeslProject` - Set full project config (weslSrc, libs, conditions, constants)
- `isPlaying: boolean` - Playback state (readonly)
- `time: number` - Animation time in seconds (readonly)
- `hasError: boolean` - Compilation error state (readonly)
- `errorMessage: string | null` - Error message (readonly)

### Methods
- `play()` - Start/resume animation
- `pause()` - Pause animation
- `rewind()` - Reset to t=0
- `showError(message)` - Display error (empty string clears)

### Events
- `compile-error` - `{ message: string }`
- `init-error` - `{ message: string }` (WebGPU init failed)
- `playback-change` - `{ isPlaying: boolean }`

## Styling

```css
wgsl-play {
  width: 512px;
  height: 512px;
}

wgsl-play::part(canvas) {
  image-rendering: pixelated;
}
```

## Multi-file Shaders

For apps with multiple shader files, use `shader-root` to enable internal imports:

```
public/
  shaders/
    utils.wesl       # import package::utils
    effects/
      main.wesl      # import super::common
      common.wesl
```

```html
<wgsl-play src="/shaders/effects/main.wesl" shader-root="/shaders"></wgsl-play>
```

**Import types:**
- `package::utils` - Resolves to `{shaderRoot}/utils.wesl`
- `super::common` - Resolves relative to current file
- `lygia::math::mod289` - External package from npm CDN

```wgsl
import package::utils::helper;  // /shaders/utils.wesl
import super::common::tint;     // sibling file
import lygia::math::mod289;     // npm CDN

@fragment fn fs_main() -> @location(0) vec4f {
  // ...
}
```

## Using with wesl-plugin

For HMR during development, library dependencies, or build-time linking, use [wesl-plugin](https://github.com/wgsl-tooling-wg/wesl-js/tree/main/tools/packages/wesl-plugin).

### Build-time linking (?static)

Simplest approach - WGSL is fully resolved at build time:

```typescript
// vite.config.ts
import { staticBuildExtension } from "wesl-plugin";
import viteWesl from "wesl-plugin/vite";

export default {
  plugins: [viteWesl({ extensions: [staticBuildExtension] })]
};

// app.ts
import wgsl from "./shader.wesl?static";
player.source = wgsl;
```

### Runtime linking (?link)

Use when you need to vary conditions or constants at runtime:

```typescript
// vite.config.ts
import { linkBuildExtension } from "wesl-plugin";
import viteWesl from "wesl-plugin/vite";

export default {
  plugins: [viteWesl({ extensions: [linkBuildExtension] })]
};

// app.ts
import shaderConfig from "./shader.wesl?link";

// wgsl-play links internally, allowing runtime conditions/constants
player.project = {
  ...shaderConfig,
  conditions: { MOBILE: isMobileGPU },
  constants: { num_lights: 4 }
};
```

## Exports

```typescript
// Default - auto-registers element
import "wgsl-play";

// Element class only (manual registration)
import { WgslPlay } from "wgsl-play/element";

// Configuration
import { defaults } from "wgsl-play";

defaults({ shaderRoot: "/custom/shaders" });
```
