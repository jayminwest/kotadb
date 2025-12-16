---
description: Review code changes from architecture perspective
argument-hint: <pr-number-or-diff-context>
---

# Architecture Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- Breaking API contracts without version bump
- Circular dependencies between path alias domains
- Missing path alias usage (relative imports in new code)
- Direct Supabase client creation outside `@db/client.ts`
- Bypassing auth middleware for authenticated endpoints
- Missing RLS consideration for new database tables
- Unbounded database queries without .range() pagination for >1000 rows (added after #473)
- Missing Sentry.captureException() in try-catch blocks (added after ed4c4f9)
- Using console.* instead of @logging/logger (added after #436)
- Missing idempotency in relationship operations (add/remove should succeed if already in desired state) (added after #470)
- MCP tool handlers missing setUserContext() call for RLS enforcement (added after #508)
- Hardcoded magic numbers (rates, cache TTL, batch sizes) instead of using @config/* constants (added after #438)

**Important Concerns (COMMENT level):**
- Large files (>300 lines) that should be split
- Mixed concerns in single module
- Undocumented public API changes
- Missing error handling at component boundaries
- Inconsistent naming conventions

**Pattern Violations to Flag:**
- `console.log` / `console.error` (use `process.stdout.write` / `process.stderr.write`)
- Hardcoded URLs or ports
- Missing type annotations on exports
- Test files with production code imports via relative paths

### Boundary Rules

**@api/* can import:**
- `@auth/*`, `@config/*`, `@db/*`, `@indexer/*`, `@mcp/*`, `@validation/*`, `@queue/*`, `@shared/*`, `@logging/*`, `@github/*`

**@auth/* can import:**
- `@config/*`, `@db/*`, `@shared/*`, `@logging/*`

**@config/* can import:**
- Nothing (leaf module, configuration constants only, no dependencies)

**@db/* can import:**
- `@config/*`, `@shared/*`, `@logging/*` only

**@indexer/* can import:**
- `@config/*`, `@db/*`, `@shared/*`, `@logging/*`

**@mcp/* can import:**
- `@config/*`, `@db/*`, `@indexer/*`, `@validation/*`, `@shared/*`, `@logging/*`, `@api/*` (added after #470 for project CRUD)

**@validation/* can import:**
- `@config/*`, `@shared/*`, `@logging/*` only

**@queue/* can import:**
- `@config/*`, `@db/*`, `@shared/*`, `@logging/*`, `@indexer/*`

**@github/* can import:**
- `@config/*`, `@db/*`, `@shared/*`, `@logging/*`, `@queue/*` (added after #472)

**@logging/* can import:**
- Nothing (leaf module, no dependencies)

**@sync/* can import:**
- `@config/*`, `@db/*`, `@logging/*` only (added after #541)

## Workflow

1. **Parse Diff**: Identify files changed in REVIEW_CONTEXT
2. **Check Boundaries**: Verify import patterns respect domain boundaries
3. **Check Patterns**: Scan for anti-pattern violations
4. **Check Critical**: Identify any automatic CHANGES_REQUESTED triggers
5. **Synthesize**: Produce consolidated review with findings

## Output

### Architecture Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Boundary Violations:**
- [Import pattern violations]

**Pattern Violations:**
- [Anti-patterns found]

**Suggestions:**
- [Improvement suggestions for non-blocking items]

**Compliant Patterns:**
- [Positive observations about good patterns used]
