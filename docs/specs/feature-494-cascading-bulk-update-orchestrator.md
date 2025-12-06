# Feature Plan: Cascading Bulk-Update Orchestrator for .claude Directory

## Issue Reference

- **Issue**: #494
- **Title**: feat(tools): implement cascading bulk-update orchestrator for .claude directory
- **Labels**: component:documentation, priority:medium, effort:medium, status:needs-investigation
- **Related Issues**: #490 (UX, CC Hook, Claude Config experts), #491 (overhaul .claude directory)

## Overview

### Problem

Currently, updating `.claude/` content requires manually running multiple commands or relying on individual expert `_improve` commands. There is no unified way to systematically refresh all `.claude/` contents when the codebase changes significantly.

### Desired Outcome

A three-tier cascading orchestrator that bulk-updates the entire `.claude/` directory by spawning a hierarchy of sub-agents:
- **Tier 1**: Master orchestrator coordinates directory-level orchestrators
- **Tier 2**: Directory orchestrators handle specific `.claude/` subdirectories
- **Tier 3**: Individual file/command update workers

### Non-Goals

- Modifying the core application code (`app/`, `automation/`, `web/`)
- Creating new expert domains (use existing expert system)
- Automated scheduling or cron-based updates
- Direct modification of `docs/` root unless explicitly requested via argument

## Technical Approach

### Architecture: Three-Tier Cascading Model

```
/tools:all-proj-bulk-update [docs]
          │
          ├── [Tier 2] agents-updater
          ├── [Tier 2] commands-updater ──┬── [Tier 3] app/ worker
          │                               ├── [Tier 3] automation/ worker
          │                               ├── [Tier 3] ci/ worker
          │                               ├── [Tier 3] docs/ worker
          │                               ├── [Tier 3] experts/ worker (delegates to bulk-update.md)
          │                               ├── [Tier 3] git/ worker
          │                               ├── [Tier 3] issues/ worker
          │                               ├── [Tier 3] testing/ worker
          │                               ├── [Tier 3] tools/ worker
          │                               ├── [Tier 3] validation/ worker
          │                               ├── [Tier 3] workflows/ worker
          │                               └── [Tier 3] worktree/ worker
          ├── [Tier 2] hooks-updater
          ├── [Tier 2] docs-updater (`.claude/docs/`)
          └── [Tier 2] root-docs-updater (optional, `docs/`)
```

### Key Design Decisions

1. **Parallel Tier 2 Spawning**: All Tier 2 orchestrators spawn in a SINGLE message for true parallelism
2. **Haiku Model for Delegation**: Use `haiku` model for Tier 2/3 tasks (cost-effective)
3. **Failure Isolation**: One failed sub-agent doesn't affect others
4. **Structured Reports**: Each agent returns structured report for aggregation
5. **Existing Pattern Reuse**: Leverage `/experts:bulk-update` for experts directory

### Update Strategies Per Directory

| Directory | Update Strategy |
|-----------|-----------------|
| `.claude/agents/` | Validate agent definitions match registered types in CLAUDE.md |
| `.claude/commands/app/` | Sync with `app/` codebase changes (paths, scripts) |
| `.claude/commands/automation/` | Sync with `automation/` directory changes |
| `.claude/commands/ci/` | Match CI workflow file changes (`.github/workflows/`) |
| `.claude/commands/docs/` | Verify referenced documentation exists |
| `.claude/commands/experts/` | Delegate to existing `/experts:bulk-update` |
| `.claude/commands/git/` | Validate commit/PR templates match conventions |
| `.claude/commands/issues/` | Sync issue templates with label conventions |
| `.claude/commands/testing/` | Sync with test infrastructure changes |
| `.claude/commands/tools/` | Verify tool references are accurate |
| `.claude/commands/validation/` | Sync with validation patterns |
| `.claude/commands/workflows/` | Validate against SDLC patterns |
| `.claude/commands/worktree/` | Sync with worktree scripts |
| `.claude/hooks/` | Validate Python syntax, check registration in settings.json |
| `.claude/docs/` | Verify prompt-levels.md and other docs are current |
| `docs/` (optional) | Sync project documentation with codebase |

## Relevant Files

### Existing Patterns to Follow

- `.claude/commands/experts/bulk-update.md` — Template for parallel sub-agent spawning
- `.claude/commands/docs/load-ai-docs.md` — Pattern for category-based parallel Task spawning
- `.claude/agents/orchestrator-agent.md` — Agent definition for orchestration patterns
- `.claude/docs/prompt-levels.md` — Prompt level classification (this is Level 7: Meta-Cognitive)

### Files to Reference

- `.claude/settings.json` — Hook registration validation
- `CLAUDE.md` — Agent type validation, command navigation
- `.github/workflows/*.yml` — CI workflow validation source

### New Files

- `.claude/commands/tools/all-proj-bulk-update.md` — Master orchestrator (Tier 1)

## Task Breakdown

### Phase 1: Foundation

1. Create master orchestrator command file structure
2. Define Tier 2 orchestrator prompt templates
3. Define structured report format for aggregation

### Phase 2: Implementation

1. Implement Tier 1 master orchestrator logic
2. Implement Tier 2 directory orchestrator prompts
3. Implement Tier 3 worker prompts for each command subdirectory
4. Add optional `docs` scope handling

### Phase 3: Integration & Validation

1. Test parallel Task spawning behavior
2. Validate report aggregation from multiple sub-agents
3. Ensure failure isolation works correctly
4. Document usage in CLAUDE.md command navigation

## Step by Step Tasks

### 1. Create Master Orchestrator File

- Create `.claude/commands/tools/all-proj-bulk-update.md`
- Add frontmatter with description and argument-hint for optional `docs` scope
- Set Template Category: Action, Prompt Level: 7 (Meta-Cognitive)
- Reference existing patterns from `bulk-update.md` and `load-ai-docs.md`

### 2. Implement Tier 1 Logic

- Parse `$ARGUMENTS` for optional `docs` scope flag
- Define Tier 2 orchestrator configurations (agents, commands, hooks, docs)
- Implement parallel Task spawning for ALL Tier 2 orchestrators in single message
- Define structured report format for sub-agent responses

### 3. Implement Tier 2 Orchestrator Prompts

- **agents-updater**: Validate `.claude/agents/*.md` against CLAUDE.md agent types
- **commands-updater**: Spawn Tier 3 workers for each command subdirectory
- **hooks-updater**: Validate Python syntax and settings.json registration
- **docs-updater**: Verify `.claude/docs/` files are current
- **root-docs-updater** (optional): Sync `docs/` with codebase when `docs` argument provided

### 4. Implement Tier 3 Worker Prompts

For each command subdirectory, create worker prompts that:
- Identify files in the subdirectory
- Determine update strategy based on directory purpose
- For `experts/`: Delegate to existing `/experts:bulk-update`
- Return structured report (status, files checked, updates needed, errors)

### 5. Implement Report Aggregation

- Collect results from all Tier 2 orchestrators
- Aggregate Tier 3 results within each Tier 2 report
- Generate consolidated report matching bulk-update.md format
- Handle partial failures gracefully

### 6. Add Documentation

- Update CLAUDE.md command navigation table with new command
- Add entry to `.claude/commands/docs/conditional_docs/app.md` for orchestrator usage
- Document usage examples in command file

### 7. Validation and Push

- Run Level 1 validation (docs-only change): lint passes
- Manual test orchestrator invocation
- Verify parallel Task spawning in output
- Confirm report aggregation from multiple sub-agents
- Commit with conventional format: `feat(tools): add cascading bulk-update orchestrator (#494)`
- Push branch: `git push -u origin feat/494-cascading-bulk-update-orchestrator`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Context overflow from large aggregated reports | Use structured, concise report format; summarize at each tier |
| Sub-agent timeout on complex directories | Use haiku model for fast execution; set reasonable task scopes |
| Cascade failure if master orchestrator fails | Master is simple coordinator; most logic in Tier 2/3 |
| Inconsistent update strategies across directories | Document clear update strategy per directory type |
| Breaking existing bulk-update.md behavior | Reuse existing command for experts; don't modify it |

## Validation Strategy

### Automated Tests

- **Level 1**: Documentation-only change, no code tests required
- Lint and typecheck will pass (no TypeScript changes)

### Manual Checks

1. Invoke `/tools:all-proj-bulk-update` and verify:
   - All Tier 2 orchestrators spawn in parallel (single message)
   - Each directory's update strategy executes correctly
   - Report aggregates results from all sub-agents
   - Failures in one sub-agent don't affect others

2. Invoke `/tools:all-proj-bulk-update docs` and verify:
   - Root `docs/` directory is included in scope
   - Additional orchestrator spawns for docs sync

### Release Guardrails

- Command is documentation-only; no production code changes
- Rollback is simple file deletion if issues discovered
- Pattern follows proven bulk-update.md approach

## Validation Commands

```bash
# Level 1 validation (docs-only)
cd app && bun run lint
cd app && bunx tsc --noEmit

# Manual validation
# Invoke the command and review output for:
# - Parallel spawning confirmation
# - Report aggregation
# - Failure isolation
```

## Output Format Reference

The master orchestrator should produce output matching this format:

```markdown
# All-Project Bulk Update Report

## Summary

- **Directories Processed**: 5
- **Command Subdirectories**: 12
- **Updates Made**: <count>
- **No Updates Needed**: <count>
- **Failures**: <count>
- **Timestamp**: <ISO 8601>

## Tier 2 Status

| Directory | Status | Updates | Details |
|-----------|--------|---------|---------|
| agents/ | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| commands/ | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| hooks/ | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| docs/ | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| root-docs/ | ✅ / ❌ / ⏭️ | Yes/No | <summary> (if requested) |

## Command Subdirectory Details

### app/
<update summary or "No updates needed">

### automation/
<update summary or "No updates needed">

[... for each subdirectory ...]

## Failures (if any)

<list of failed orchestrators/workers with error messages>

## Files Modified

<aggregated list of all files modified>

## Recommendations

<suggestions for follow-up actions>
```
