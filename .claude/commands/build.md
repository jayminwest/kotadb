# /build

Direct implementation workflow for simple tasks without a planning phase.

## Inputs
- `$1` (adw_id): ADW execution ID for tracking (e.g., "abc123")
- `$2` (task_description): Detailed description of the task to implement

## Context

**Project**: KotaDB - HTTP API service for code indexing (Bun + TypeScript + Supabase)
**Path Aliases**: Use `@api/*`, `@db/*`, `@indexer/*`, `@shared/*` for imports
**Testing**: Run `bun test` for tests, `bunx tsc --noEmit` for type-checking

## Instructions

1. **Understand the task**: Analyze the task description and identify the required changes
2. **Find relevant files**: Use Glob and Grep tools to locate files that need modification
3. **Implement changes**: Use Edit tool to modify existing files, Write tool only for new files
4. **Follow conventions**:
   - Use existing code patterns and style
   - Update tests if modifying functionality
   - Use path aliases (e.g., `@api/routes` instead of `../api/routes`)
   - Follow TypeScript strict mode
5. **Validate changes**:
   - Run `bunx tsc --noEmit` to check for type errors
   - Run `bun test` if tests are affected
6. **Commit changes**: Create a commit with a descriptive message using Conventional Commits format

## Commit Message Format

Use Conventional Commits format:
```
<type>(<scope>): <description>

<optional body>
```

Types: feat, fix, chore, docs, refactor, test, style

Examples:
- `feat(api): add rate limiting middleware`
- `fix(auth): resolve API key validation bug`
- `chore(deps): update TypeScript to 5.3`

## Expected Output

Return a summary of the implementation including:
- List of files modified/created
- Brief description of changes made
- Commit hash (from `git rev-parse HEAD`)
- Validation status (type-check passed/failed, tests passed/failed)

Example:
```
Implementation complete:
- Modified: src/api/routes.ts (added rate limiting)
- Modified: src/auth/middleware.ts (enforceRateLimit function)
- Created: tests/integration/rate-limit.test.ts
- Commit: a1b2c3d4
- Type-check: ✓ Passed
- Tests: ✓ All 133 tests passed
```

## Use Cases

This workflow is suitable for:
- Typo fixes and documentation updates
- Adding logging or debugging statements
- Simple refactors (renaming, extracting functions)
- Minor bug fixes with clear solutions
- Configuration changes

For complex features requiring architecture decisions, use the `/plan` + `/implement` workflow instead.
