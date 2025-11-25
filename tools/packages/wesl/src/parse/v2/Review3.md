# V2 Parser Implementation - Code Review Document #3

## Focus: Final Pre-Merge Checklist

This document tracks remaining work before merging V2 to main.

---

## Completed (from Review2)

- [x] P1: Remove redundant `// consume "X"` comments
- [x] P1: Simplify null checks to optional chaining
- [x] P1: Remove stale "Week N" comments
- [x] P1: Remove stale TODO comments
- [x] P1: Remove ASCII-art section headers in ParseUtil.ts
- [x] P2: Create `tryConsumeKeyword()` utility
- [x] P2: Export `hasConditionalAttribute()` from shared location
- [x] Grammar audit against WGSL spec
- [x] CTS validation (3310/3310 passing)
- [x] Update v2/CLAUDE.md

---

## Pre-Merge TODO

### 1. Fix Lint and Formatting

Run and fix all lint/formatting errors:

```bash
bb fix:all
bb lint:all
bb typecheck:all
```

### 2. Consolidate Planning Documents

Find planning documents with post-merge notes to preserve:
- COMMENT_POSITIONING_AND_VALIDATION.md (text->comment conversion plan)
- TEXT_ELEMENT_DESIGN_PROPOSAL.md (if exists)
- Any other docs with future architectural plans

Move to `v2/postmerge/` directory.

### 3. Clean Up Historical Documents

Delete or archive before merge:
- `v2-progress-update-*.md` (39 files)
- Custom-Parser.md
- Custom-Parser-Phase3.md
- Custom-Parser-Phase3-Revised.md
- Custom-Parser-Recommendation.md
- Bundle-Analysis.md
- Phase3-Realistic-Roadmap.md
- Ultrathink-Parser-Strategy.md
- Review1.md, Review2.md (this becomes the final record)

### 4. Plan Rebase Strategy

Prepare to squash/rebase into clean commit history:

**Suggested final commits:**
1. `feat(parser): add V2 recursive descent parser`
   - Core parser files (WeslParserV2.ts, ContentsHelpers.ts)
   - All parser modules (*Parsers.ts)
   - ParseContext.ts, ParseUtil.ts additions

2. `feat(parser): V2 test infrastructure`
   - Test setup files
   - Parity tests
   - V2-specific test files

3. `feat(parser): V2 compatibility layer`
   - LowerAndEmit.ts V1/V2 detection
   - BindIdents.ts changes
   - ParseWESL.ts parser switching

4. `docs: V2 parser documentation`
   - v2/CLAUDE.md
   - TEXT_ELEMENT_RULES.md
   - postmerge/README.md

### 5. Final Validation

Before merge:
```bash
# All tests
bb test:all

# CTS validation
bb test:cts

# V1 compatibility (outside sandbox)
V1_ONLY=true bb test --dangerouslyDisableSandbox
```

---

## Post-Merge Work

See `v2/postmerge/README.md` for:
- Bundle size optimization (error string compression)
- V1 code removal
- Documentation consolidation
- Text->Comment element conversion (long-term)
- New Reflection API design

---

## Remaining Minor Issues

### Unused Exports (Low Priority)

- `parseSimpleExpression` - alias for `parseExpression`
- `_parseOptionalExpressionStatement` - underscore prefix

These can be cleaned up post-merge with V1 removal.

### Error Handling Consistency (Post-Merge)

Mixed `throw new Error()` vs `throwParseError()`.
Standardize after merge when we can remove V1 constraints.

---

## Action Items

- [ ] Run `bb fix:all && bb lint:all && bb typecheck:all`
- [ ] Move COMMENT_POSITIONING_AND_VALIDATION.md to postmerge/
- [ ] Delete v2-progress-update-*.md files
- [ ] Delete historical planning docs
- [ ] Plan rebase commits
- [ ] Final test validation
- [ ] Merge to main
