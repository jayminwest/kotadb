# Chore Plan: Overhaul Epic 70 Issues to Match Current Codebase State

## Context

Epic 70 and its related issues (#72, #73, #74, #75, #76, #116) have become outdated and no longer reflect the current codebase state. Multiple attempts to work on issue #75 (reference extraction) have led to confusion and wasted effort because:

- Issue descriptions reference old code paths, outdated architecture, and completed work as if pending
- Database schema exists (`symbols` and `references` tables) but implementation status is unclear
- AST infrastructure (`ast-parser.ts`, `symbol-extractor.ts`) exists but relationship to issues is undocumented
- 88 out of 317 tests are failing (28% failure rate), primarily in MCP and validation suites
- Issues #72, #73, #74 are marked CLOSED but implementation completeness is unclear
- PR #182 was closed without merging, but subsequent commits merged reference extraction work

This overhaul will audit current implementation state, update all Epic 70 issue descriptions to reflect reality, and create an accurate roadmap for remaining work. This unblocks downstream issues #76 (dependency graphs) and #116 (search_dependencies MCP tool).

**Constraints:**
- Must preserve existing implementations while clarifying status
- Must not introduce new technical debt or break existing tests
- Must complete audit within 2-3 days to unblock downstream work
- Must maintain issue history and relationship metadata

## Relevant Files

- `app/src/indexer/ast-parser.ts` — AST parsing wrapper (exists, appears complete)
- `app/src/indexer/ast-types.ts` — AST type definitions (exists)
- `app/src/indexer/symbol-extractor.ts` — Symbol extraction logic (exists, appears complete)
- `app/src/db/migrations/001_initial_schema.sql:338-456` — Database schema for symbols, references, dependencies tables
- `app/tests/indexer/ast-parser.test.ts` — Test coverage for AST parsing
- GitHub Issues: #70, #72, #73, #74, #75, #76, #116 — Epic and child issues
- Git commit history: commits `9214de9`, `f6f599b`, `066eb8c` (recent #75 work merged)

### New Files

- `docs/audits/epic-70-audit-2025-10-18.md` — Implementation status audit report
- `docs/specs/chore-189-overhaul-epic-70.md` — This maintenance plan

## Work Items

### Preparation
- Create git branch `chore/189-overhaul-epic-70` from `develop`
- Review git history for Epic 70 commits (since 2025-10-12)
- Review closed PRs #128, #182 for failure context
- Document current working directory baseline (file structure, test results)

### Execution

#### Phase 1: Code Audit (Day 1)
- **Task 1.1: AST Infrastructure Audit**
  - Read `ast-parser.ts`, `symbol-extractor.ts`, `ast-types.ts` in detail
  - Check for `reference-extractor.ts` or similar reference extraction modules
  - Verify database schema matches implementation (`symbols`, `references`, `dependencies` tables)
  - Document what's implemented vs what Epic 70 issues claim is implemented

- **Task 1.2: Test Coverage Analysis**
  - Run full test suite and categorize 88 failing tests by subsystem:
    - MCP tests (tools/call, authentication, rate limiting, workflows, lifecycle)
    - Validation endpoint tests
    - Authenticated routes tests
  - Identify failures related to Epic 70 work vs unrelated infrastructure issues
  - Check for AST/symbol/reference test coverage in `app/tests/indexer/`

- **Task 1.3: Git History Analysis**
  - Analyze commits related to Epic 70 (grep for "AST", "symbol", "reference", "#70-#76")
  - Review PR #182 (closed without merge) and subsequent commits that merged similar work
  - Document what was completed, what was abandoned, what was partially implemented
  - Note commit `9214de9` (merged #75 work) and related migration fixes

#### Phase 2: Issue Status Documentation (Day 2)
- **Task 2.1: Create Audit Report**
  - Write `docs/audits/epic-70-audit-2025-10-18.md` with findings:
    - Implementation status table (issue, status, what's done, what's missing)
    - Code evidence for each claim (file paths, database schema excerpts, test results)
    - Test failure categorization and root cause analysis
    - Recommendations for issue updates

- **Task 2.2: Update Epic 70 (#70)**
  - Add "Implementation Status" section with table showing current state of each sub-issue
  - Document which phases are complete vs pending
  - Clarify relationship between closed issues (#72, #73, #74) and actual code
  - Update acceptance criteria to reflect current state

- **Task 2.3: Update Child Issues (#72, #73, #74, #75)**
  - For closed issues (#72, #73, #74):
    - Add "Implementation Status" closing comment with evidence of completion
    - Link to actual implementation files and tests
    - Clarify what was delivered vs what was deferred
  - For open issue #75:
    - Update description with current codebase context
    - Document existing partial implementation (if any)
    - Reference PR #182 closure reasons and subsequent merged work
    - Clarify exact gaps remaining (if issue should stay open)
    - OR close if work is complete and update with completion evidence

- **Task 2.4: Update Blocked Issues (#76, #116)**
  - Update #76 (dependency graphs) with accurate prerequisites
  - Update #116 (search_dependencies MCP tool) with current blocking status
  - Add "Related To" links to audit report for context
  - Remove stale "Depends On" relationships if prerequisites are actually complete

#### Phase 3: Test Failure Investigation (Day 2-3)
- **Task 3.1: Categorize Test Failures**
  - Create separate tracking issues for test failures unrelated to Epic 70:
    - MCP test failures (if infrastructure-related)
    - Validation endpoint failures (if unrelated to AST work)
    - Authentication/rate limiting failures (if unrelated to Epic 70)

- **Task 3.2: Fix Epic 70-Related Test Failures**
  - If AST/symbol/reference tests are failing, fix them as part of this chore
  - If tests are passing but missing coverage, document gaps in audit report
  - Update test fixtures if needed to reflect current implementation

- **Task 3.3: Document Test Health**
  - Add test failure summary to Epic 70 description
  - Document baseline test health (88/317 failures, 28% failure rate)
  - Create follow-up issues for fixing unrelated test failures

### Follow-up
- Review audit report for accuracy and completeness
- Validate all issue descriptions are now current and accurate
- Ensure developers can read issues and understand exact current state without code inspection
- Verify relationship metadata (Depends On, Blocks, Related To) is accurate
- Run full test suite to confirm no regressions introduced

## Step by Step Tasks

### Day 1: Code and History Audit
1. Create branch `chore/189-overhaul-epic-70` from `develop`
2. Read and analyze AST infrastructure files (`ast-parser.ts`, `symbol-extractor.ts`, `ast-types.ts`)
3. Search for reference extraction implementation in codebase
4. Review database schema for `symbols`, `references`, `dependencies` tables
5. Run full test suite and capture failure output
6. Categorize 88 failing tests by subsystem (MCP, validation, auth, Epic 70)
7. Analyze git history for Epic 70 commits (since 2025-10-12)
8. Review PR #182 and PR #128 for closure context
9. Document findings in structured notes

### Day 2: Audit Report and Issue Updates
10. Write `docs/audits/epic-70-audit-2025-10-18.md` with implementation status
11. Include code evidence, schema excerpts, test results in audit report
12. Update Epic 70 (#70) with "Implementation Status" section
13. Update closed issues (#72, #73, #74) with completion evidence in closing comments
14. Update or close issue #75 based on audit findings
15. Update blocked issues (#76, #116) with accurate prerequisites
16. Add relationship metadata links to audit report
17. Create tracking issues for non-Epic-70 test failures

### Day 3: Validation and Cleanup
18. Review all updated issue descriptions for accuracy
19. Verify relationship metadata (Depends On, Blocks, Related To) is correct
20. Run full test suite to confirm no regressions
21. Fix any Epic 70-related test failures discovered during audit
22. Run linting and type-checking (`bun run lint`, `bunx tsc --noEmit`)
23. Commit changes with descriptive message following Conventional Commits format
24. Push branch to origin (`git push -u origin chore/189-overhaul-epic-70`)
25. Create PR with summary of audit findings and issue updates

## Risks

**Risk: Test failures may be environment-specific** → Mitigation: Run tests in clean environment, check CI logs for similar failures
**Risk: Issue updates may lose important historical context** → Mitigation: Add new sections rather than replacing existing content, preserve issue history
**Risk: Audit may reveal more incomplete work than expected** → Mitigation: Document honestly, create follow-up issues for discovered gaps
**Risk: Downstream issues may have outdated dependencies** → Mitigation: Systematically check all "Depends On" and "Blocks" relationships
**Risk: 28% test failure rate may indicate systemic issues** → Mitigation: Categorize failures, create separate tracking issues for non-Epic-70 problems

## Validation Commands

- `bun run lint` — Lint TypeScript code
- `bunx tsc --noEmit` — Type-check without emitting files
- `bun test` — Run full test suite (317 tests)
- `bun test tests/indexer/` — Run AST-specific tests only
- `bun run test:validate-migrations` — Validate migration sync
- `gh issue view <number> --json labels,state,body` — Verify issue updates
- `git log --oneline --grep="Epic 70\|AST\|symbol\|reference" --since="2025-10-12"` — Verify commit history coverage

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: audit Epic 70 implementation status` not `Based on the audit, the commit documents Epic 70 status`

**Example commit messages:**
- `docs: add Epic 70 implementation status audit report`
- `chore: update Epic 70 issue descriptions with current state`
- `docs: document AST infrastructure completion status`
- `test: categorize MCP test failures for investigation`

## Deliverables

- `docs/audits/epic-70-audit-2025-10-18.md` — Comprehensive audit report with implementation status
- Updated GitHub issue descriptions for #70, #72, #73, #74, #75, #76, #116
- Tracking issues for non-Epic-70 test failures (if needed)
- Pull request with audit report and issue updates
- Branch `chore/189-overhaul-epic-70` pushed to origin
