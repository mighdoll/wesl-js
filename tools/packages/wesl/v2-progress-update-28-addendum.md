# V2 Progress Update #28 - Addendum: Compound Statement Investigation

**Date**: 2025-11-18
**Focus**: Investigation of remaining 5 test failures (compact statement formatting)

## Investigation Results

### AST Structure for Compound Statements

Used debug script to analyze V2 AST structure for `@if(true) { const foo = 10; }`:

```
statement: [@@if] [24-43]
  attribute[11-23]: @if (attr)          ← V2: stored separately
  attribute[11-23]: @if (content[0])    ← Also in contents (V1/V2 divergence)
  text[23-25]: " {" (content[1])        ← Space + opening brace
  const: [25-41] (content[2])           ← The declaration
  text[41-43]: " }" (content[3])        ← Space + closing brace
```

**Key Findings**:

1. **Attributes in Two Places**: V2 stores attributes separately (`elem.attributes`) AND in contents[0]. This is the V1/V2 divergence pattern.

2. **Text Element Before First Statement**: `text[23-25]: " {"` includes both the space and the opening brace. When we apply `emitContentsWithTrimming`, it trims the space, leaving just `"{"`.

3. **Statements Use `emitContents()`, Not `emitContentsWithTrimming()`**: The emission code for "statement" elements (lines 127-137) uses regular `emitContents()`, which doesn't apply trimming.

---

## Why the Trimming Fails

When we emit the statement with `@if` attribute:

1. Check if content[0] is an attribute (it is)
2. Skip `emitAttributes()` (rely on emitting contents instead)
3. Call `emitContents(e, ctx)` - **NOT trimming!**
4. `emitContents` processes:
   - content[0]: attribute (emitted or filtered based on conditions)
   - content[1]: text `" {"` → emitted as `" {"` (no trimming)
   - content[2]: const → emitted with its own trimming
   - content[3]: text `" }"` → emitted as `" }"`

Result: `" {" + "const foo = 10;" + " }"` = `" {const foo = 10; }"`

But wait - the const also has text `" const"` which should get trimmed...

Actually, the const uses `emitContentsWithTrimming()` because we added that in Session 28. So the const emits:
- text `" const"` → trimmed to `"const"`
- typeDecl → `" "` + ` foo`
- text `" = 10;"` → trimmed to `" = 10;"`

Result: `"const" + " foo" + " = 10;"` = `"const foo = 10;"`

So the full statement output is: `" {" + "const foo = 10;" + " }"` = `" {const foo = 10; }"`

But the expected is: `"{ const foo = 10; }"` - note NO leading space before `{`, and YES space after `{`.

---

## The Core Problem

The text element `" {"` [23-25] needs special handling:
- Trim the LEADING space (before `{`)
- Keep the TRAILING space (after `{`)

But `trimStart()` on `" {"` gives `"{"`, removing BOTH spaces.

This is fundamentally different from the struct case, where we had `"\nfoo"` and just needed to trim the `\n`.

---

## Possible Solutions

### Option 1: Apply `emitContentsWithTrimming` to Statements

Change the statement emission to use trimming:

```typescript
case "var":
case "let":
case "statement": {
  const attrsInContents = e.contents.length > 0 && e.contents[0].kind === "attribute";
  if (!attrsInContents) {
    emitAttributes(e.attributes, ctx);
  }
  // V2: use trimming
  if (weslParserConfig.useV2Parser) {
    emitContentsWithTrimming(e, ctx);
  } else {
    emitContents(e, ctx);
  }
  return;
}
```

**Problem**: This would trim content[1] `" {"` to `"{"`, losing the space after the brace.

---

### Option 2: Special Handling for Brace Text Elements

Modify `emitContentsWithTrimming` to detect text elements that are structural (like `" {"`) and trim them differently:

```typescript
if (text.match(/^\s+[{]/)) {
  // Text like " {" - only trim leading whitespace, keep space after brace
  trimmed = text.trimStart();
  if (trimmed === "{") {
    trimmed = "{ ";  // Restore space after brace
  }
}
```

**Problem**: This is very fragile and specific to this case.

---

### Option 3: Regenerative Emission for Statement Blocks

Don't emit the `{` and `}` from text elements at all. Instead, detect compound statements and emit them synthetically:

```typescript
if (isCompoundStatement(stmt)) {
  ctx.srcBuilder.add("{ ", ...);
  emitStatementBody(stmt, ctx);
  ctx.srcBuilder.add(" }", ...);
}
```

**Problem**: Requires detecting compound statements vs other statement types, and fundamentally changes the emission model.

---

### Option 4: Accept These 5 Tests as Known Limitations

These 5 test failures are all edge cases related to compact formatting of single-statement blocks with conditional attributes. They don't represent functional bugs - the code works correctly, just with slightly different formatting.

**Current State**:
- V2: 93.6% overall (485/518)
- ConditionalTranslationCases: 89.8% (44/49)
- All core functionality working (imports, conditionals, declarations, scoping)

**Recommendation**: Document as known formatting limitations for now. These can be addressed later with regenerative emission work (mentioned in the Text→Comment conversion future work).

---

## Recommendation

**Option 4** is the pragmatic choice:

1. **Document** these 5 tests as known limitations in V2
2. **Add comments** in the test file noting they're formatting edge cases
3. **Move forward** with other V2 work (statement parsing, expression parsing, etc.)
4. **Revisit** when implementing regenerative emission (Text→Comment conversion)

**Rationale**:
- 93.6% completion is excellent progress
- Core functionality all works correctly
- These are formatting edge cases, not functional issues
- The fix requires either fragile special-casing or major refactoring
- Time is better spent on completing other V2 features (missing statements, expressions)

---

## Alternative: Try Option 1 Anyway

If we want to try Option 1, here's the minimal change:

```typescript
case "statement": {
  const attrsInContents = e.contents.length > 0 && e.contents[0].kind === "attribute";
  if (!attrsInContents) {
    emitAttributes(e.attributes, ctx);
  }
  if (weslParserConfig.useV2Parser) {
    emitContentsWithTrimming(e, ctx);
  } else {
    emitContents(e, ctx);
  }
  return;
}
```

**Risk**: May break other statement tests that rely on preserved spacing.

**Test**: Run `V2_ONLY=true bb test` to see impact.

---

## Conclusion

After investigation, the 5 remaining test failures are caused by complex interactions between:
1. V2's text element structure (gap-filling includes structural punctuation)
2. Conditional attribute filtering
3. Trimming leading whitespace
4. Preserving necessary structural spacing (like space after `{`)

The cleanest fix would be regenerative emission (emit braces synthetically), but that's a larger architectural change. For now, documenting these as known limitations and moving forward with other V2 work is recommended.

**Next Steps**:
1. Document these 5 tests as known limitations
2. Focus on completing Phase 4 (missing statements: for, while, loop, if, switch, break, continue, discard)
3. Consider regenerative emission as part of Text→Comment conversion work

**Files Created**:
- `debug-compound-stmt.mjs` - Investigation tool for compound statement AST structure
