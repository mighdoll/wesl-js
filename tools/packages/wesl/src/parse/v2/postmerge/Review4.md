# V2 Parser - Final Pre-Merge Review

**Date:** 2025-11-27
**Branch:** feat/custom-parser
**Status:** Ready for merge

---

## Summary

The V2 recursive descent parser is complete and production-ready, replacing the mini-parse combinator-based V1 parser.

### Test Results
- **Unit tests:** 529/531 passing (2 skipped - const_assert edge case)
- **CTS validation:** 3310/3310 passing (100%)
- **Lygia shader library:** 630/630 passing (100%)
- **V1 compatibility:** No regressions

### Performance
- **2.8x faster** than V1 parser
- **Bundle:** +7% overhead (17.7KB vs 16.5KB brotli-compressed)

---

## Pre-Merge Checklist

### Completed

- [x] Fix lint and formatting (`bb fix:all`, `bb lint:all`, `bb typecheck:all`)
- [x] DRY improvement: `hasConditionalAttribute()` using array instead of repeated OR checks
- [x] Move planning documents to `v2/postmerge/`
- [x] Delete historical documents:
  - 39 v2-progress-update-*.md files
  - 7 historical planning docs (Bundle-Analysis.md, Custom-Parser*.md, etc.)
  - 4 completed review docs (Review1.md, Review2.md, etc.)
  - 5 TEXT_ELEMENT_* analysis docs (consolidated into COMMENT_POSITIONING_AND_VALIDATION.md)
  - 11 session/progress summary docs

### Remaining

- [ ] Plan rebase strategy (see below)
- [ ] Final test validation before merge
- [ ] Merge to main

---

## Rebase Strategy

Suggested final commits for clean history:

1. **`feat(parser): add V2 recursive descent parser`**
   - Core parser: WeslParserV2.ts, ContentsHelpers.ts
   - Parser modules: *Parsers.ts (Import, Attribute, Directive, Const, Fn, Statement, Expression, Type)
   - Utilities: ParseContext.ts, ParseUtil.ts additions

2. **`feat(parser): V2 test infrastructure`**
   - Test setup: TestSetupV1.ts, TestSetupV2.ts
   - Parity tests: ParserV2Parity.test.ts
   - V2-specific tests: ParseWeslV2.test.ts, ScopeWESLV2.test.ts, etc.

3. **`feat(parser): V2 compatibility layer`**
   - LowerAndEmit.ts V1/V2 detection
   - BindIdents.ts changes
   - ParseWESL.ts parser switching

4. **`docs: V2 parser documentation`**
   - postmerge/CLAUDE.md
   - postmerge/README.md

---

## Post-Merge Work

See `postmerge/README.md` for detailed items:

### High Priority
- Remove V1 parser code (WeslGrammar.ts, mini-parse dependency)
- Remove V1/V2 detection code from LowerAndEmit.ts
- Target bundle: ~16.5KB (match V1 size after removing mini-parse)

### Medium Priority
- Error string compression (~2.8KB savings)
- Clean up unused exports (`parseSimpleExpression`, `_parseOptionalExpressionStatement`)
- Standardize error handling (`throwParseError()` vs `throw new Error()`)

### Long-Term
- Text -> Comment element conversion (see COMMENT_POSITIONING_AND_VALIDATION.md)
- New Reflection API design

---

## Documentation Reference

All V2 documentation preserved in `postmerge/`:

| File | Purpose |
|------|---------|
| `CLAUDE.md` | V2 parser architecture guide |
| `README.md` | Post-merge work items |
| `TEXT_ELEMENT_RULES.md` | TextElem generation rules |
| `WGSL-GRAMMAR-AUDIT.md` | Grammar coverage mapping |
| `COMMENT_POSITIONING_AND_VALIDATION.md` | Future Text->Comment conversion plan |

---

## Key Files Changed

### New Parser Implementation (~4,400 lines)
```
src/parse/v2/WeslParserV2.ts      # Main parser class
src/parse/v2/ContentsHelpers.ts   # openElem/closeElem helpers
src/parse/ParseContext.ts         # Scope management
src/parse/ParseUtil.ts            # Core utilities
src/parse/ImportParsers.ts        # Import parsing
src/parse/AttributeParsers.ts     # @if/@elif/@else parsing
src/parse/DirectiveParsers.ts     # enable/diagnostic/requires
src/parse/ConstParsers.ts         # const/alias/var/override/struct
src/parse/FnParsers.ts            # Function declarations
src/parse/StatementParsers.ts     # All statement types
src/parse/ExpressionParsers.ts    # Expression parsing
src/parse/TypeParsers.ts          # Type expressions
```

### Modified Core Files
```
src/ParseWESL.ts          # V2 parser config, dual parser switching
src/LowerAndEmit.ts       # V1/V2 AST compatibility layer
src/BindIdents.ts         # Dependent scope processing for V2
```

---

## Validation Commands

```bash
# V2 tests
V2_ONLY=true bb test

# V1 tests (verify no regressions)
V1_ONLY=true bb test

# CTS validation
bb test:cts

# Full validation
bb prepush
```

---

**Status:** All pre-merge cleanup complete. Ready for rebase and merge.
