## Development Workflow

See [Build-Tools.md](Build-Tools.md) for details on build tools, package.json conventions, and publishing.

### 1. During Development (Fast Iteration)

```bash
# Use bb from any package directory:
cd tools/packages/wesl-debug && bb typecheck      # runs TypeScript type checker for wesl-debug package
cd tools/packages/wesl && bb test                 # runs tests for wesl package

# Example: Testing specific tests (bb determines correct package context based on cwd)
cd tools/packages/wesl && bb test -t "link a const_assert" --hideSkippedTests --reporter=dot
cd tools/packages/bench && bb test BenchmarkReport.test.ts --reporter=verbose
```

### 2. Cross Project Tests (Basic Validation)
```bash
# Use bb from any directory:
bb fix:all        # Auto-format code across ALL packages
bb typecheck:all  # TypeScript checks across ALL packages
bb lint:all       # Run lint checks across ALL packages
bb test:all       # Run unit tests across ALL packages
bb prepush        # full validation
```

### 3. Full Validation (Before Showing the User or Committing)
```bash
# Use bb from any directory:
bb prepush        # Runs build, lint, typecheck, all tests across ALL packages
```

## Common Issues & Solutions

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Type errors | Interface changes | `bb typecheck:all` |
| "command not found: bb" | bb not in PATH | Link bb to PATH or use `pnpm` commands |
| Tests pass individually but fail in :all | Missing dependencies | Check imports and run `bb install` |
| Script not found | Wrong script name | Run `bb --help` to see available scripts |


## Key Reminders

- Use `bb` for all commands - works from any directory
- Always run `bb typecheck:all` after structural changes
- Run focused tests during development, `bb prepush` only when ready
- Use `bb --help` to see available scripts from CWD
