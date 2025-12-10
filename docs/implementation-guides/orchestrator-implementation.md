# Orchestrator Implementation Details

**Reference**: `.claude/commands/experts/orchestrators/orchestrator.md`

This document contains detailed implementation patterns for the orchestrator workflow, including state schemas, build templates, git operations, and error handling patterns.

## Table of Contents

- [Build Agent Prompt Template](#build-agent-prompt-template)
- [Spec File Template](#spec-file-template)
- [Review File Template](#review-file-template)
- [Git Operations](#git-operations)
- [Error Handling Patterns](#error-handling-patterns)
- [Validation Commands](#validation-commands)

---

## Build Agent Prompt Template

When delegating to build agents, construct prompts using this template:

```markdown
## Implementation Task

**Spec File Reference:** {spec_file_path}
**Target File:** {absolute_path_to_target_file}
**Task Type:** {new_file | modification}

## Context

**User Story:**
{extracted_from_spec}

**This File's Role:**
{extracted_from_spec_implementation_plan}

## Implementation Requirements

{relevant_section_from_spec}

## Codebase Patterns to Follow

{from_scout_phase_or_spec_architecture_section}

Example patterns in this codebase:
- File naming: {pattern}
- Import style: {pattern}
- Error handling: {pattern}
- Testing: {pattern}

## Related Files

**Files to Reference (use Read tool):**
- {path_1} - {why_relevant}
- {path_2} - {why_relevant}

**Files This Depends On:**
- {dependency_1}
- {dependency_2}

## Validation

After implementation, run:
```bash
cd app && bunx tsc --noEmit
cd app && bun run lint
```

## Constraints

1. Follow existing patterns in the codebase
2. Ensure full type safety (no `any` unless justified)
3. Include JSDoc comments for public APIs
4. Handle error cases appropriately
5. DO NOT modify files outside the target scope
```

---

## Spec File Template

Spec files are created during the plan phase at `docs/specs/{type}-{identifier}-{slug}.md`:

```markdown
# {Type}: {Title} (Issue #{number})

## User Story / Problem Statement

{Description from task or issue}

## Expert Analysis Summary

### Architecture Perspective
{From planning-council architecture expert}

### Testing Strategy
{From planning-council testing expert}

### Security Considerations
{From planning-council security expert}

### Integration Requirements
{From planning-council integration expert}

### UX & Accessibility
{From planning-council ux expert}

### Hook & Automation Considerations
{From planning-council cc_hook expert}

### Claude Configuration
{From planning-council claude-config expert}

## Synthesized Recommendations

### Priority Actions
1. {Highest priority}
2. {Second priority}
3. {Additional actions}

### Risk Assessment
- **High Risk Areas:** {Areas requiring attention}
- **Mitigation Strategies:** {Approaches}

## Implementation Plan

### Phase 1: {Name}
- [ ] Task 1
- [ ] Task 2

### Phase 2: {Name}
- [ ] Task 1
- [ ] Task 2

## Validation Requirements

- [ ] Core gates: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- [ ] Tests: `cd app && bun test`
- [ ] Build: `cd app && bun run build`
- [ ] Integration (if applicable): `cd app && bun test:setup && bun test --filter integration && bun test:teardown`

## Notes

{Additional context, references, open questions}
```

### Spec File Naming Convention

- **With issue number**: `docs/specs/{type}-{N}-{slug}.md`
  - Example: `docs/specs/feature-123-user-authentication.md`
  - Example: `docs/specs/bug-456-login-timeout.md`
- **Without issue number**: `docs/specs/task-{YYYY-MM-DD}-{slug}.md`
  - Example: `docs/specs/task-2024-11-06-caching-strategy.md`

Types: `feature`, `bug`, `chore`, `task`

---

## Review File Template

Review files are created during the review phase at `docs/reviews/{spec-name}-review.md`:

```markdown
---
spec_file: {spec_file_path}
pr_number: {number if available}
pr_url: https://github.com/{owner}/{repo}/pull/{number}
reviewer: claude-code
reviewed_at: {ISO 8601 timestamp}
decision: approved | changes_requested | commented
validation_level: 1 | 2 | 3
---

# Review: {Task Title}

## Summary

{One paragraph overview of review outcome}

## Expert Review Findings

### Architecture Alignment
{From review-panel architecture expert}
- Pattern compliance: {status}
- Pit of Success adherence: {status}

### Testing Standards
{From review-panel testing expert}
- Anti-mock compliance: {status}
- Coverage assessment: {metrics}

### Security Assessment
{From review-panel security expert}
- Vulnerability scan: {status}
- Auth patterns: {status}

### Integration Compliance
{From review-panel integration expert}
- API contracts: {status}
- Error handling: {assessment}

### UX & Accessibility
{From review-panel ux expert}
- Accessibility: {status}
- Component usage: {status}

### Hook & Automation Compliance
{From review-panel cc_hook expert}
- Hook configuration: {status}
- Pre-commit integration: {status}

### Claude Configuration
{From review-panel claude-config expert}
- CLAUDE.md accuracy: {status}
- Settings.json validity: {status}

## Meta-Review Checks

### GitHub Hygiene
- Commit messages: {pass/fail}
- PR description: {quality}
- Labels: {list}

### Spec Alignment
- Requirements met: {count}/{total}
- Deviations: {list or "None"}

## Validation Evidence

### Commands Executed
```bash
{Commands run with timestamps}
```

### Results
| Check | Status | Details |
|-------|--------|---------|
| Lint | {status} | {details} |
| Types | {status} | {details} |
| Tests | {status} | {details} |
| Build | {status} | {details} |

## Decision

**Status:** {APPROVED | CHANGES REQUESTED | COMMENT}

**Rationale:** {Explanation}

## Follow-up Items

- [ ] {Post-merge tasks}
```

---

## Git Operations

### After Build Phase Completion

```bash
git status --short
git add -A
git commit -m "$(cat <<'EOF'
{commit_message_from_spec}

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push -u origin {branch_name}
```

### Build Summary Report

```markdown
## Phase: build - Complete

**Files Implemented:**
- `{file_path_1}` (new, N lines)
- `{file_path_2}` (modified, +M lines)

**Build Agents Used:** N ({parallel|sequential})
**Quality Gates:** {status}

**Git Status:**
- Commit: `{hash}` {commit_message}
- Pushed to: `{branch_name}`

**Next Phase:** review
```

---

## Error Handling Patterns

### Workflow Halt Template

When a phase fails, use this template:

```markdown
## Workflow Halted

**Failed Phase:** {phase_name}
**Error:** {error_description}

**Remediation:**
1. {suggested fix}
2. {alternative approach}

**Resume Command:**
/experts:orchestrators:orchestrator "{task}" phases={remaining_phases}
```

### Build Phase Partial Success

When some build agents succeed and others fail:

```markdown
## Build Phase - Partial Failure

**Successful Implementations:**
- `{file_path_1}`
- `{file_path_2}`

**Failed Implementations:**
- `{file_path_3}`
  - Error: {error_description}
  - Suggestion: {remediation}

**Recovery Command:**
/experts:orchestrators:orchestrator "{task}" phases=build
```

### Build Agent Failure Handling

If a build-agent fails:
1. Record failure in workflow status
2. Include error details in summary
3. Skip dependent files if sequential
4. Continue with independent files if parallel
5. Report all failures at phase completion
6. Commit successful changes before reporting failures
7. Provide clear remediation steps
8. Allow selective retry via phases parameter

### Missing Spec File Error

```markdown
## Workflow Halted

**Failed Phase:** build
**Error:** Spec file not found at {spec_file_path}

**Remediation:**
1. Re-run plan phase: `/experts:orchestrators:orchestrator "{task}" phases=plan`
2. Manually create spec file if needed

**Resume Command:**
/experts:orchestrators:orchestrator "{task}" phases=build,review,validate
```

---

## Validation Commands

### Environment Detection

```bash
# Check parity environment status
if [ -f .parity-status.json ] && bun parity:status 2>/dev/null | jq -e '.overall == "ready"' >/dev/null; then
  echo "Parity environment detected - using bun parity:validate"
  VALIDATION_CMD="bun parity:validate"
else
  echo "Native environment - using bun validate:full"
  VALIDATION_CMD="cd app && bun run lint && bunx tsc --noEmit && bun test"
fi
```

### Validation Levels

| Level | Scope | Commands |
|-------|-------|----------|
| 1 | Docs, minor changes | `cd app && bun run lint` |
| 2 | Features, bugs | `cd app && bun run lint && bunx tsc --noEmit && bun test` |
| 3 | API/DB/auth changes | Level 2 + `cd app && bun test:setup && bun test --filter integration && bun test:teardown` |

---

## Context Passing Best Practices

### Scout to Plan
Provide structured exploration findings:
- File locations
- Existing patterns
- Dependencies between components

### Plan to Build
- Store spec file path for reference
- Include architecture patterns in build prompts
- Document file dependencies for parallel/sequential strategy

### Build to Review
- Collect commit hashes from build phase
- List all file paths changed
- Include any build-time issues encountered

### Review to Validate
- Use review findings to determine validation scope
- Level 1, 2, or 3 based on change scope
- Include specific validation requirements from spec

---

## Documentation Artifact Quality

### Spec Files
- Include clear implementation phases
- Document file dependencies
- Enable parallel vs sequential build strategy determination

### Review Files
- Attach `spec_file` reference in frontmatter
- Include validation evidence in results tables
- Document all expert findings

### Timestamps
- Use ISO 8601 format for all timestamps
- Enables traceability across workflow phases
