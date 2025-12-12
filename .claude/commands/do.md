# /do - Universal Issue Resolution

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

End-to-end autonomous workflow for resolving GitHub issues. Routes through scout → plan → build → review → validate phases with full autonomy and auto-fix loops.

## Variables

- `$ARGUMENTS`: Issue reference (multiple formats supported)

## Input Formats

Parse `$ARGUMENTS` to extract issue context:

| Format | Example | Action |
|--------|---------|--------|
| Issue number | `#123` or `123` | Fetch via `gh issue view 123 --json title,body,labels` |
| GitHub URL | `https://github.com/.../issues/123` | Extract number, fetch via gh |
| Free-form text | `"Add user authentication"` | Use as requirement directly |

## Issue Classification

Determine issue type from labels or content:

| Type | Indicators | Spec Required |
|------|------------|---------------|
| `feature` | `enhancement`, `feature`, "add", "implement", "create" | Yes |
| `bug` | `bug`, "fix", "broken", "error", "failing" | Yes |
| `chore` | `chore`, `maintenance`, "update deps", "refactor" | No |

## Execution Flow

### Phase 1: Scout (if spec required)

```
Task tool:
  subagent_type: "branch-plan-coordinator"
  prompt: |
    PHASE: Scout
    REQUIREMENT: {parsed_requirement}
    ISSUE_TYPE: {feature|bug|chore}

    Explore codebase to understand:
    1. Relevant files and modules
    2. Existing patterns to follow
    3. Dependencies and impacts
    4. Test file locations

    Return findings as structured report.
```

### Phase 2: Plan (if spec required)

```
Task tool:
  subagent_type: "branch-plan-coordinator"
  prompt: |
    PHASE: Plan
    REQUIREMENT: {parsed_requirement}
    ISSUE_TYPE: {feature|bug}
    SCOUT_FINDINGS: {scout_output}

    Create spec file at docs/specs/{type}-{issue_number}-{slug}.md

    Return: spec file path only
```

### Phase 3: Build

```
Task tool:
  subagent_type: "branch-build-coordinator"
  prompt: |
    PHASE: Build
    SPEC_FILE: {spec_path} (or inline requirement for chores)

    Implement all changes per spec.
    Run validation after implementation.
    Auto-fix any failures.
    Commit when validation passes.

    Return: build completion report
```

### Phase 4: Review

```
Task tool:
  subagent_type: "branch-review-coordinator"
  prompt: |
    PHASE: Review
    SPEC_FILE: {spec_path}
    BUILD_OUTPUT: {build_report}

    Verify implementation matches requirements.
    Check convention compliance.

    Return: review report with APPROVE or issues
```

### Phase 5: Validate (Final)

Run validation commands based on change scope:

| Level | Commands | Use When |
|-------|----------|----------|
| 1 | `bun run lint && bunx tsc --noEmit` | Docs, config only |
| 2 | Level 1 + `bun test --filter integration` | Features, bugs |
| 3 | Level 2 + `bun test && bun run build` | Schema, auth, migrations |

## Auto-Fix Loop

If validation fails:

```
WHILE validation_fails:
  1. Parse error output
  2. Spawn build agent with fix task:
     Task tool:
       subagent_type: "branch-build-coordinator"
       prompt: |
         FIX_MODE: true
         ERRORS: {validation_errors}

         Fix the identified issues.
  3. Re-run validation
  4. Continue until pass
```

## KotaDB Conventions (MUST ENFORCE)

All agents must follow these conventions:

### Path Aliases
Use TypeScript path aliases for all imports:
- `@api/*` → `src/api/*`
- `@auth/*` → `src/auth/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@mcp/*` → `src/mcp/*`
- `@shared/*` → `src/shared/*`
- `@validation/*` → `src/validation/*`
- `@queue/*` → `src/queue/*`
- `@logging/*` → `src/logging/*`

### Logging Standards
- Use `process.stdout.write()` or `process.stderr.write()`
- NEVER use `console.log`, `console.error`, etc.
- Use `@logging/logger` factory for structured logging

### Testing (Antimocking)
- Real Supabase Local connections only
- NO mocks, stubs, or fakes for database operations
- Use failure injection utilities for error testing

### Commit Format
```
{type}({scope}): {description}

{body}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Output Format

After completion, report:

```markdown
## /do Complete

**Issue**: {#number or description}
**Type**: {feature|bug|chore}
**Phases**: scout ✓ → plan ✓ → build ✓ → review ✓ → validate ✓

### Artifacts
- Spec: {path or "N/A for chore"}
- Commit: {commit hash}

### Files Modified
- {file}: {change summary}

### Validation
- Level: {1|2|3}
- Lint: ✓
- Typecheck: ✓
- Tests: {X/Y passed}

### Next Steps
{Any manual steps needed, or "Ready for PR"}
```

## Error Handling

If any phase fails unrecoverably:

```markdown
## /do Failed

**Failed Phase**: {phase_name}
**Error**: {description}

**Attempted Fixes**: {N} iterations

**Manual Resolution Required**:
1. {specific fix instruction}

**Resume**: Re-run `/do {original_input}` after fixing
```

## Constraints

1. **No user checkpoints** - Run fully autonomously
2. **Use current branch** - Do not create new branches
3. **Commit only** - Do not push or create PR
4. **Unlimited fix attempts** - Keep fixing until validation passes
5. **Convention enforcement** - Fail review if conventions violated
