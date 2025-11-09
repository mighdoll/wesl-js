# snip-sync

A custom tool for syncing code snippets from source files into markdown documentation.

## Features

- **Simple syntax**: Just `<!-- snippet: name -->` in markdown
- **Auto-detection**: Language detection from source file extension
- **Duplicate detection**: Errors on duplicate snippet names
- **Watch mode**: Auto-update on file changes during development
- **TypeScript**: Runs directly on Node 20+ without build step
- **Configurable**: Uses cosmiconfig for flexible configuration

## Usage

### In Source Files

Mark snippets with comments:

```typescript
// snippet-start: example-name
const code = "your example code";
// snippet-end
```

### In Markdown Files

Reference snippets:

```markdown
<!-- snippet: example-name -->
```typescript
// content will be replaced
```
<!-- /snippet -->
```

### Commands

```bash
# Sync once
npm run snip-sync

# Watch for changes
npm run snip-sync:watch
```

## Configuration

Create `snip.config.ts` in your project root:

```typescript
export default {
  sources: [
    "tools/**/*.test.ts",
    "**/*.wesl",
  ],
  destinations: [
    "*.md",
    "!node_modules/**",
  ],
};
```

## How It Works

1. **Extract**: Scans source files for `snippet-start`/`snippet-end` markers
2. **Map**: Builds a map of snippet names to extracted code
3. **Replace**: Updates markdown files between `<!-- snippet: name -->` markers
4. **Validate**: Errors on duplicate names or missing snippets

## Integration

Runs automatically in prepush hook to keep docs in sync.
