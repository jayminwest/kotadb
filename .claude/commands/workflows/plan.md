# /plan

**Template Category**: Path Resolution

Create a detailed implementation plan for complex tasks before executing changes.

## Inputs
- `$1` (adw_id): ADW execution ID for tracking (e.g., "abc123")
- `$2` (task_description): Detailed description of the task to plan

## Context

**Project**: KotaDB - HTTP API service for code indexing (Bun + TypeScript + Supabase)
**Path Aliases**: Use `@api/*`, `@db/*`, `@indexer/*`, `@shared/*` for imports
**Architecture**: See CLAUDE.md for detailed project structure

## Instructions

1. **Analyze the task**: Understand the requirements and scope
2. **Research the codebase**: Use KotaDB MCP tools for code discovery (see `.claude/commands/docs/kotadb-agent-usage.md` for patterns)
   - **PREFER**: Use `mcp__kotadb-staging__search_code` to find relevant implementations, patterns, and examples
   - **PREFER**: Use `mcp__kotadb-staging__search_dependencies` to understand module relationships and impact radius
   - **PREFER**: Use `mcp__kotadb-staging__analyze_change_impact` to validate approach for large changes
   - **Fallback**: If MCP tools are unavailable, use Glob for pattern matching (`**/*auth*.ts`) and Grep for content search
3. **Discover issue relationships**: Check for dependencies and related work
   - Search for related issues: `gh issue list --search "<keywords>"`
   - Review recent spec files in `docs/specs/` for relationship patterns
   - Consult `.claude/commands/docs/issue-relationships.md` for relationship types
   - Identify prerequisite work (Depends On), related context (Related To), downstream impact (Blocks)
4. **Identify affected components**: Determine which parts of the system need changes
5. **Design the solution**: Consider architecture, patterns, and best practices
6. **Create a plan document** in `docs/specs/plan-{adw_id}.md` with the following structure:

## Plan Document Structure

```markdown
# Implementation Plan: {task_title}

**ADW ID**: {adw_id}
**Created**: {ISO timestamp}
**Worktree**: {worktree_name if available}

## Objective

Brief summary of what needs to be accomplished (2-3 sentences).

## Issue Relationships

- **Depends On**: #{issue_number} ({short_title}) - {brief_rationale}
- **Related To**: #{issue_number} ({short_title}) - {shared_context}
- **Blocks**: #{issue_number} ({short_title}) - {what_this_enables}

(Omit this section if no relationships exist. See `.claude/commands/docs/issue-relationships.md` for all relationship types.)

## Current State

Description of the current codebase state relevant to this task:
- Existing files and their purposes
- Current architecture patterns
- Related functionality that may be affected

## Proposed Changes

### 1. {Component/File Name}
- **Action**: create/modify/delete
- **Location**: src/path/to/file.ts
- **Rationale**: Why this change is needed
- **Details**: Specific implementation notes, functions to add/modify, data structures

### 2. {Next Component}
...

## Testing Strategy

How to validate the changes:
- Unit tests to add/modify
- Integration tests required
- Manual testing steps
- Validation commands (e.g., `bun test`, `bunx tsc --noEmit`)

## Rollback Plan

How to revert if needed:
- Which commits to revert
- Database migrations to rollback (if applicable)
- Configuration changes to undo

## Dependencies

Any external dependencies or blockers:
- New npm packages required
- Environment variables to add
- Infrastructure changes needed
- Related issues or PRs

## Implementation Order

Recommended sequence for executing changes:
1. First set of changes (foundational)
2. Second set of changes (builds on first)
3. Final changes and validation

## Validation Commands

Commands to run after implementation:
- Level 1: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- Level 2: Add `cd app && bun test:setup`, `cd app && bun test --filter integration`, `cd app && bun test:teardown || true`
- Level 3: Add `cd app && bun test:setup`, `cd app && bun test --filter integration`, `cd app && bun test`, `cd app && bun test:teardown || true`, `cd app && bun run build`
```

## CRITICAL: Output Format Requirements

After creating the plan file, return **ONLY** the file path as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The plan file is located at:", "I created:", "Here is:")
- Markdown formatting (no **bold**, no ` ``` blocks`, no # headers)
- Quotes, asterisks, or other punctuation around the path
- Multiple lines or additional commentary
- Git status output or command results

**Correct output:**
```
docs/specs/plan-abc123.md
```

**INCORRECT outputs (do NOT do this):**
```
I created the plan file at:

**docs/specs/plan-abc123.md**
```

```
The plan file is located at: docs/specs/plan-abc123.md
```

```
Based on the task, I created the following plan file:

docs/specs/plan-abc123.md

You can read it with: cat docs/specs/plan-abc123.md
```

**Important**: This command creates the file AND returns its path. The `/find_plan_file` command is used when you need to locate an existing plan file created by a different workflow phase.

## Notes

- This plan will be consumed by the `/implement` command
- Be thorough but concise - the plan should guide implementation without being prescriptive
- Consider edge cases, error handling, and backwards compatibility
- Reference existing patterns and conventions in the codebase
- Use the plan to think through the implementation before writing code

## Use Cases

This workflow is suitable for:
- New features requiring multiple file changes
- Architectural refactors
- Database schema changes
- Complex bug fixes requiring investigation
- Changes affecting multiple system components

For simple tasks, use the `/build` workflow instead.

## Output Schema

This command's output is validated against the following schema:

```json
{
  "type": "string",
  "pattern": "^docs/specs/.*\\.md$"
}
```

The output must be a relative path starting with `docs/specs/` and ending with `.md` extension.
