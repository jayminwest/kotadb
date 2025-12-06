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
- Hooks that can silently fail without user notification (verified: all hooks must write feedback to stdout)
- Missing timeout configuration for long-running operations (verified: PostToolUse 45000ms, UserPromptSubmit 10000ms)
- Hooks that modify files without explicit user action (verified: auto_linter writes via Biome only on explicit Write/Edit)
- Incorrect matcher patterns that won't trigger (verified: tool names are case-sensitive, pipe syntax must be correct)
- Hooks that block on non-critical operations (verified: all hooks use "continue" decision, never "block")
- Missing error handling in hook scripts (verified: all branches must return "continue" with additionContext message, #485)
- Using print() instead of sys.stdout.write() (verified: all KotaDB hooks use stdout.write() per logging standards, #485)
- Missing sys.stdout.flush() after write (verified: required to ensure immediate delivery, #485)

**Important Concerns (COMMENT level):**
- Timeouts too short for CI environments (<30 seconds) — Note: 45s is safe for linters, subprocess timeouts should nest under hook timeout (pattern from #485)
- Missing logging for debugging hook execution (verified: stderr.write() for errors, additionalContext for user feedback, #485)
- Hooks that assume specific environment variables (verified: use CLAUDE_PROJECT_DIR when available, fall back to cwd, #485)
- Complex matchers that are hard to understand (verified: use word boundaries \b with re.escape() for keyword matching, #485)
- Missing documentation for new hooks (verified: docstring required in all hooks, #485)
- Hardcoded paths instead of dynamic resolution (verified: must search upward for config files like biome.json, #485)

**Pattern Violations to Flag (verified from #485):**
- Using print() instead of sys.stdout.write() (verified anti-pattern, all KotaDB hooks use stdout.write())
- Not reading from stdin when input is expected (verified: always call read_hook_input() with error handling)
- Hardcoded paths instead of dynamic resolution (verified: must search upward for config like biome.json, or use CLAUDE_PROJECT_DIR)
- Missing shebang (verified: all hooks must have #!/usr/bin/env python3)
- Blocking the main thread without timeout (verified: subprocess must have timeout, hook must have timeout in settings.json)
- Not flushing stdout after write (verified: sys.stdout.flush() required for JSON delivery)
- Returning decision other than "continue" for advisory hooks (verified: only use "block" for critical safety issues)

### Safety Rules

**Hook Safety Checklist (verified from #485):**
- [ ] Hook has appropriate timeout configured in settings.json (PostToolUse: 45s, UserPromptSubmit: 10s)
- [ ] Hook decision is "continue" for advisory hooks, only "block" for critical safety issues
- [ ] Error output goes to stderr, user feedback goes to additionalContext in stdout
- [ ] Hook uses CLAUDE_PROJECT_DIR for path resolution when available
- [ ] JSON I/O follows pattern: read_hook_input() with error handling, output_result() with sys.stdout.flush()
- [ ] Subprocess operations have timeout configured and exceptions handled
- [ ] sys.stdout.write() and sys.stdout.flush() used (never print())
- [ ] Shebang is #!/usr/bin/env python3

**Matcher Validation (verified from #485):**
- Tool names are case-sensitive (verified: "Write|Edit" matches these tools exactly)
- Pipe-separated patterns use correct syntax: "Tool1|Tool2" format
- Empty matcher "" in settings.json matches all prompts (used for UserPromptSubmit)
- Matchers don't overlap (verified: KotaDB has non-overlapping hooks)
- Test matchers against actual tool invocations to verify coverage

## Workflow

1. **Parse Diff**: Identify hook-related files in REVIEW_CONTEXT
2. **Check Configuration**: Verify settings.json changes are valid
3. **Check Scripts**: Scan hook scripts for pattern violations
4. **Check Safety**: Verify hooks follow safety checklist
5. **Synthesize**: Produce consolidated review with findings

### Successful Patterns Observed (#485)

**auto_linter.py Excellence:**
- Biome config search upward from file directory (dynamic resolution)
- Subprocess timeout (30s) nested inside hook timeout (45s)
- Error extraction from Biome output with helpful additionalContext messages
- Always returns "continue" decision (advisory, never blocking)
- Graceful handling of missing bunx, missing config, timeouts
- Case-sensitive file extension matching with tuple: (".ts", ".tsx", ".js", ".jsx")

**context_builder.py Excellence:**
- Keyword matching with word boundaries using re.escape() and \b patterns
- Multiple input extraction paths (prompt, content, user_input) for robustness
- Suggestion deduplication with seen set to avoid duplicate context hints
- Limiting results (3 keywords, 4 suggestions) to avoid overwhelming output
- Lightweight execution (<1s) with simple regex matching
- Clear formatting with "[context-hint]" prefix for user feedback

**settings.json Excellence:**
- Clear separation of timeout concerns (hook timeout vs subprocess timeout)
- Matcher patterns tested with actual tool usage (Write|Edit)
- Command uses $CLAUDE_PROJECT_DIR variable for path resolution
- Type specification "command" with python3 shebang in hook scripts

## Output

### CC Hook Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Configuration Issues:**
- [settings.json or hook configuration problems]

**Script Issues:**
- [Hook script pattern violations]

**Successful Patterns Observed:**
- [Good hook patterns noted in the changes, preferably with reference to #485]

**Suggestions:**
- [Improvement suggestions for non-blocking items]
