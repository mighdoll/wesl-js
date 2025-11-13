# vitest-image-snapshot

Visual regression testing plugin for Vitest. Compares images pixel-by-pixel and generates HTML diff reports.

## Overview

**vitest-image-snapshot** provides:
- Custom Vitest matcher `toMatchImage()` for image comparison
- HTML reporter with side-by-side expected/actual/diff views
- Support for `ImageData` (WebGPU, Canvas) and PNG `Buffer`
- Pixel-level comparison using pixelmatch library

## Architecture

**Pipeline**: `toMatchImage() → ImageComparison → SnapshotManager → DiffReport`

**Key Components**:
- `ImageSnapshotMatcher.ts` - Custom Vitest matcher implementation
- `ImageComparison.ts` - Pixel comparison logic using pixelmatch
- `SnapshotManager.ts` - File management for reference/actual/diff images
- `ImageSnapshotReporter.ts` - HTML report generation
- `DiffReport.ts` - HTML template generation
- `PNGUtil.ts` - ImageData to PNG buffer conversion

## Directory Structure

```
src/
├── index.ts                    # Main exports
├── reporter.ts                 # Reporter entry point
├── ImageSnapshotMatcher.ts     # toMatchImage() implementation
├── ImageComparison.ts          # Pixel comparison with pixelmatch
├── SnapshotManager.ts          # File I/O for snapshots
├── ImageSnapshotReporter.ts    # HTML report generation
├── DiffReport.ts               # HTML template
├── PNGUtil.ts                  # ImageData conversion
├── vitest.d.ts                 # Type extensions for Vitest
└── test/                       # Tests
    ├── ImageComparison.test.ts
    ├── SnapshotManager.test.ts
    ├── ReporterE2E.test.ts
    └── fixtures/               # Test fixtures
```

## Key Implementation Details

### Vitest Matcher Integration
- Uses `expect.extend()` to add `toMatchImage()` matcher
- Accesses `MatcherContext.snapshotState._updateSnapshot` for `-u` flag
- Uses `getCurrentTest().meta` to pass failure info to reporter
- Matcher context provides `testPath` for snapshot directory resolution

### Snapshot Modes
- `none` - No snapshot updates (CI default)
- `new` - Create missing snapshots (local default)
- `all` - Update all snapshots (vitest -u)

### File Organization
Test files generate three directories:
- `__image_snapshots__/` - Reference images (committed)
- `__image_actual__/` - Current outputs (gitignored, always saved)
- `__image_diffs__/` - Diff visualizations (gitignored, on failure)

HTML report copies all images to preserve portability.

### Reporter Integration
Reporter receives failure metadata via `test.meta.imageSnapshotFailure`:
```ts
{
  actualPath: string,
  expectedPath: string,
  diffPath: string,
  mismatchedPixels: number,
  mismatchedPixelRatio: number
}
```

## Common Development Tasks

### Running Tests
```bash
bb test                    # Run all tests
bb test -t "comparison"    # Run specific test
VITEST_UPDATE_SNAPSHOTS=1 bb test  # Update snapshots
```

### Testing the Reporter
Reporter has E2E test that runs a fixture test with failing snapshots:
```bash
bb test ReporterE2E.test.ts
```

### Debugging Image Comparison
Actual images always saved to `__image_actual__/` for manual inspection.
Diff images highlight mismatched pixels in red.

## API Entry Points

### Main Package (`vitest-image-snapshot`)
```ts
export { imageMatcher } from "./ImageSnapshotMatcher.ts"
export { compareImages } from "./ImageComparison.ts"
export { ImageSnapshotManager } from "./SnapshotManager.ts"
export { pngBuffer } from "./PNGUtil.ts"
```

### Reporter Package (`vitest-image-snapshot/reporter`)
```ts
export default ImageSnapshotReporter
```

## Testing Practices

### Test Structure
- Tests are flat, no `describe()` blocks
- Use fixtures for E2E reporter testing
- Compare against actual PNG files in `__image_snapshots__/`

### Snapshot Updates
When image comparison logic changes:
```bash
VITEST_UPDATE_SNAPSHOTS=1 bb test
# or
bb test -- -u
```

## Type Extensions

`vitest.d.ts` extends Vitest's Assertion interface:
```ts
interface Assertion<T = any> {
  toMatchImage(name?: string): Promise<void>
  toMatchImage(options?: MatchImageOptions): Promise<void>
}
```

## Dependencies

- `pixelmatch` - Pixel-level image comparison
- `pngjs` - PNG encoding/decoding
- `vitest` - Test framework (peer dependency)

## Common Issues

### Reporter Not Generating HTML
Ensure reporter is configured in `vitest.config.ts`:
```ts
reporters: ['default', 'vitest-image-snapshot/reporter']
```

### Snapshots Not Updating with -u
Check `SnapshotManager.shouldUpdate()` logic - only updates in "all" mode.

### Type Errors in Tests
Import `imageMatcher()` and call it at test file top level:
```ts
import { imageMatcher } from "vitest-image-snapshot"
imageMatcher()
```

## Build and Publishing

- `bb build` - Compile with tsdown
- `prepublishOnly` - Auto-builds before npm publish
- Dual exports: `src/*.ts` (dev) and `dist/*.js` (production)
