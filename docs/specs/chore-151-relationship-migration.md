# Chore #151: Spec File Relationship Migration Tracking

## Overview

This document tracks the progress of adding relationship metadata to existing spec files in `docs/specs/`. The goal is to gradually migrate spec files to include `## Issue Relationships` sections following the standards defined in `.claude/commands/docs/issue-relationships.md`.

## Migration Strategy

**Approach**: Prioritize recent and active spec files for manual relationship annotation. Defer historical or inactive spec files for gradual migration during normal development.

**Migration Process**:
1. Identify spec file and corresponding GitHub issue
2. Review issue comments, PR descriptions, and git history for relationship context
3. Search for related issues using keywords: `gh issue list --search "<keywords>"`
4. Add `## Issue Relationships` section to spec file following formatting standards
5. Verify relationships are accurate and meaningful (not trivial)
6. Mark spec file as migrated in this tracking document

**Validation**:
- All relationships use valid types: Depends On, Related To, Blocks, Supersedes, Child Of, Follow-Up
- Formatting follows standards: `- **{Type}**: #{number} ({title}) - {rationale}`
- Relationships are meaningful and provide value for context discovery
- "Depends On" issues are actually merged/closed (verify with `gh issue view`)

## Migration Status

### Phase 1: Recent/Active Spec Files (Priority)

**Target**: 10 most recent or active spec files

| Spec File | Issue | Status | Relationships Added | Notes |
|-----------|-------|--------|---------------------|-------|
| `chore-151-issue-relationship-standards.md` | #151 | ✅ Migrated | Self-documenting (this spec) | N/A |
| `feature-148-hybrid-adw-resilience-retry-mcp.md` | #148 | ⏳ Pending | - | Depends On #145, Related To #136 |
| `chore-135-simplify-adw-flow.md` | #135 | ⏳ Pending | - | Supersedes old 5-phase flow |
| `feature-145-adw-mcp-server-orchestration.md` | #145 | ⏳ Pending | - | Blocks #148 |
| `chore-132-integrate-resolution-retry.md` | #132 | ⏳ Pending | - | Related To #130 |
| `chore-130-agent-friendly-resilience-patterns.md` | #130 | ⏳ Pending | - | Related To #132 |
| `chore-127-reduce-test-verbosity.md` | #127 | ⏳ Pending | - | Related To #33 (test fixes) |
| `chore-119-pydantic-v2-config.md` | #119 | ⏳ Pending | - | Bug fix for pydantic v2 |
| `feature-110-kota-tasks-mcp-integration.md` | #110 | ⏳ Pending | - | Depends On #25, Related To #145 |
| `feature-105-automated-log-analysis-reports.md` | #105 | ⏳ Pending | - | Observability for ADW |

### Phase 2: Mid-Priority Spec Files

**Target**: Spec files for features/chores still referenced in codebase

| Spec File | Issue | Status | Relationships Added | Notes |
|-----------|-------|--------|---------------------|-------|
| `chore-81-adw-agent-worktree-branch-isolation.md` | #81 | ⏳ Pending | - | Related To #65 |
| `chore-79-automation-ci-integration.md` | #79 | ⏳ Pending | - | CI/CD work |
| `feature-74-symbol-extraction-ast.md` | #74 | ⏳ Pending | - | Depends On #72, Child Of #70 |
| `feature-73-typescript-eslint-parser-migration.md` | #73 | ⏳ Pending | - | Related To #72 |
| `feature-72-test-infra-ast-parsing.md` | #72 | ⏳ Pending | - | Blocks #74 |
| `feature-65-worktree-isolation-cleanup.md` | #65 | ⏳ Pending | - | Related To #81 |
| `chore-63-consolidate-adws-directory.md` | #63 | ⏳ Pending | - | Refactor work |
| `chore-62-add-commands-readme.md` | #62 | ⏳ Pending | - | Documentation |
| `chore-58-organize-commands-subdirectories.md` | #58 | ⏳ Pending | - | Command structure |
| `chore-57-fix-ci-after-restructure.md` | #57 | ⏳ Pending | - | Depends On #54 |

### Phase 3: Historical/Completed Spec Files

**Target**: Defer to gradual migration during normal development

| Spec File | Issue | Status | Relationships Added | Notes |
|-----------|-------|--------|---------------------|-------|
| `chore-54-separate-agentic-application-layers.md` | #54 | ⏳ Deferred | - | Blocks #57 |
| `chore-52-fix-ci-env-mismatch.md` | #52 | ⏳ Deferred | - | Related To #51 |
| `chore-51-containerize-test-environment-docker-compose.md` | #51 | ⏳ Deferred | - | Related To #40 |
| `chore-44-mcp-sdk-express-integration.md` | #44 | ⏳ Deferred | - | MCP integration |
| `chore-40-migrate-ci-supabase-local.md` | #40 | ⏳ Deferred | - | Depends On #31, #33 |
| `chore-33-fix-failing-tests-antimocking.md` | #33 | ⏳ Deferred | - | Depends On #31 |
| `chore-31-replace-test-mocks-supabase-local.md` | #31 | ⏳ Deferred | - | Related To #28 |
| `feature-28-supabase-local-env-test.md` | #28 | ⏳ Deferred | - | Test infrastructure |
| `chore-27-standardize-postgres-remove-sqlite.md` | #27 | ⏳ Deferred | - | Supersedes #20, #22, #24 |
| `feature-26-tier-based-rate-limiting.md` | #26 | ⏳ Deferred | - | Depends On #25 |
| `feature-25-api-key-generation.md` | #25 | ⏳ Deferred | - | Blocks #26, #110 |

## Summary

**Total Spec Files**: ~50 (approximate count from `docs/specs/`)
**Phase 1 Target**: 10 files
**Phase 2 Target**: 15 files
**Phase 3 (Deferred)**: ~25 files

**Completion Criteria**:
- Phase 1: All 10 recent/active spec files have relationship metadata
- Phase 2: Mid-priority spec files migrated as they are referenced during development
- Phase 3: Historical spec files migrated opportunistically during related work

**Next Steps**:
1. Complete Phase 1 migration for 10 priority spec files
2. Validate relationship formatting and accuracy
3. Monitor adoption in next 5 PRs
4. Create follow-up issue for automated relationship validation in CI

## Relationship Extraction Examples

### Example 1: Feature with Dependency
```markdown
## Issue Relationships

- **Depends On**: #25 (API key generation) - Required for authentication middleware
- **Related To**: #26 (rate limiting) - Both touch authentication layer
```

### Example 2: Epic with Children
```markdown
## Issue Relationships

- **Child Of**: #70 (AST parsing epic) - Phase 2: Symbol extraction
- **Depends On**: #72 (test infrastructure) - Requires parser foundation
- **Blocks**: #116 (dependency search) - Provides symbol data for search
```

### Example 3: Refactor/Cleanup
```markdown
## Issue Relationships

- **Supersedes**: #20, #22, #24 (SQLite implementations) - Migration to Postgres
- **Related To**: #27 (standardize Postgres) - Part of database consolidation
```

## Validation Checklist

Before marking a spec file as migrated:

- [ ] `## Issue Relationships` section added (or omitted if no relationships)
- [ ] All relationship types are valid (Depends On, Related To, Blocks, Supersedes, Child Of, Follow-Up)
- [ ] Formatting follows standards: `- **{Type}**: #{number} ({title}) - {rationale}`
- [ ] Relationships are meaningful (not trivial)
- [ ] "Depends On" issues are verified as merged/closed (if applicable)
- [ ] Spec file added to migration tracking table above
- [ ] Commit message references this chore: `docs: add relationships to spec #{issue} (#151)`

## References

- `.claude/commands/docs/issue-relationships.md` - Relationship standards documentation
- `docs/specs/_template-with-relationships.md` - Spec template with relationships
- `.claude/commands/workflows/plan.md` - Planning workflow with relationship discovery
- `.claude/commands/workflows/review.md` - Review workflow with relationship validation
