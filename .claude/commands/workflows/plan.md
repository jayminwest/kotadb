# /plan

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
2. **Research the codebase**: Use Glob and Grep to explore relevant files
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
- Level 1: `bun run lint`, `bunx tsc --noEmit`
- Level 2: Add `bun test --filter integration`
- Level 3: Add full `bun test`, `bun run build`
```

## Expected Output

Return ONLY the file path to the created plan document, nothing else:
```
docs/specs/plan-abc123.md
```

Do NOT include any explanatory text or markdown formatting in the output.

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
