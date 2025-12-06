---
description: Review code changes from Claude Code hook perspective
argument-hint: <pr-number-or-diff-context>
---

# CC Hook Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- Hooks that can silently fail without user notification
- Missing timeout configuration for long-running operations
- Hooks that modify files without explicit user action
- Incorrect matcher patterns that won't trigger
- Hooks that block on non-critical operations
- Missing error handling in hook scripts

**Important Concerns (COMMENT level):**
- Timeouts too short for CI environments (<30 seconds)
- Missing logging for debugging hook execution
- Hooks that assume specific environment variables
- Complex matchers that are hard to understand
- Missing documentation for new hooks

**Pattern Violations to Flag:**
- Using print() instead of proper JSON output
- Not reading from stdin when input is expected
- Hardcoded paths instead of dynamic resolution
- Missing shebang or incorrect interpreter
- Blocking the main thread with synchronous operations

### Safety Rules

**Hook Safety Checklist:**
- [ ] Hook has appropriate timeout configured
- [ ] Failure mode is defined (block vs. warn)
- [ ] Error output goes to stderr, not stdout
- [ ] Hook doesn't assume specific working directory
- [ ] JSON I/O follows established patterns

**Matcher Validation:**
- Tool names are case-sensitive
- Pipe-separated patterns use correct syntax
- Glob patterns are tested against expected files
- Matchers don't overlap in confusing ways

## Workflow

1. **Parse Diff**: Identify hook-related files in REVIEW_CONTEXT
2. **Check Configuration**: Verify settings.json changes are valid
3. **Check Scripts**: Scan hook scripts for pattern violations
4. **Check Safety**: Verify hooks follow safety checklist
5. **Synthesize**: Produce consolidated review with findings

## Output

### CC Hook Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Configuration Issues:**
- [settings.json or hook configuration problems]

**Script Issues:**
- [Hook script pattern violations]

**Suggestions:**
- [Improvement suggestions for non-blocking items]

**Positive Observations:**
- [Good hook patterns noted in the changes]
