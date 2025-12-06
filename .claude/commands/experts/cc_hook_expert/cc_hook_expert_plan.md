---
description: Provide Claude Code hook analysis for planning
argument-hint: <issue-context>
---

# CC Hook Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### Claude Code Hook Knowledge Areas

**Hook Types:**
- `PreToolUse`: Runs before a tool executes, can block or modify
- `PostToolUse`: Runs after a tool completes, can transform output
- `UserPromptSubmit`: Runs when user submits a prompt, can augment context
- `Stop`: Runs when conversation ends, for cleanup or persistence

**Hook Configuration (settings.json):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python .claude/hooks/auto_linter.py"
          }
        ]
      }
    ]
  }
}
```

**Matcher Patterns:**
- Tool name matching: `Write`, `Edit`, `Bash`
- Pipe-separated alternatives: `Write|Edit`
- Glob patterns for file-based triggers
- All matchers are case-sensitive

**Timeout Configuration:**
- Default timeout: 60 seconds
- Configure via `timeout` field in hook definition
- Long-running hooks should use background execution
- Timeouts cause hook failure, not cancellation

**Hook Script Patterns (.claude/hooks/):**
- JSON stdin: Hook receives context as JSON on stdin
- JSON stdout: Hook returns result as JSON on stdout
- Exit code 0: Success (continue execution)
- Exit code non-zero: Failure (may block operation)
- stderr: Logged but doesn't affect execution

**KotaDB Hook Implementations:**
- `auto_linter.py`: PostToolUse hook for Biome linting after Write/Edit (30s timeout, uses bunx, searches for biome.json)
- `context_builder.py`: UserPromptSubmit hook for contextual documentation (keyword matching with word boundaries, suggests /docs commands)
- `utils/hook_helpers.py`: Shared utilities for JSON I/O and file detection (CLAUDE_PROJECT_DIR aware, always "continue" decision)

**Anti-Patterns Discovered:**
- Hooks that modify files without user awareness
- Timeouts too short for CI environments (use 45s+ for linters) — Note: auto_linter uses 30s which is acceptable for local linting
- Missing error handling for subprocess failures
- Hooks that assume specific working directory — Fixed in hooks by using CLAUDE_PROJECT_DIR
- Blocking hooks for non-critical operations
- Using print() instead of sys.stdout.write() with JSON output (after #485)
- Biome config discovery: must search upward from file directory (pattern from #485)

### Successful Patterns from #485 (Automation Hooks)

**Advisory vs Blocking Decisions:**
- Both auto_linter and context_builder use "continue" decision (advisory)
- This allows hooks to provide feedback without blocking user workflows
- Even when linting finds issues, the decision is "continue" with additionContext message
- Blocking decisions reserved for critical safety issues only (Added after #485)

**Timeout Configurations:**
- PostToolUse hooks (auto_linter): 45000ms (45s) in settings.json
- UserPromptSubmit hooks (context_builder): 10000ms (10s) in settings.json
- Subprocess timeouts inside hook: 30s for Biome (prevents hanging)
- Always nest subprocess timeouts inside overall hook timeout (Added after #485)

**Configuration Pattern (settings.json):**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",  // Pipe-separated tool names
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/auto_linter.py",
            "timeout": 45000
          }
        ]
      }
    ]
  }
}
```

### Integration Patterns

**File Detection:**
```python
def is_typescript_file(path: str) -> bool:
    return path.endswith(('.ts', '.tsx', '.js', '.jsx'))
```

**JSON I/O Pattern (from #485):**
```python
import json
import sys

def read_hook_input() -> dict[str, Any]:
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            return {}
        return json.loads(raw_input)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"Hook input parse error: {e}\n")
        return {}

def output_result(decision: str, message: str = "") -> None:
    result = {"decision": decision}
    if message:
        result["additionalContext"] = message
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()
```
- Always use sys.stdout/sys.stderr (never print())
- Flush stdout after write to ensure immediate delivery
- Include "additionalContext" key for feedback messages
- Return empty dict on parse errors, don't crash (Added after #485)

**Error Handling (from #485):**
```python
try:
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    if result.returncode == 0:
        return True, "Success message"
    else:
        # Parse stderr/stdout for user feedback
        output_result("continue", f"Error: {result.stderr or result.stdout}")
except subprocess.TimeoutExpired:
    output_result("continue", "Operation timed out")
except FileNotFoundError:
    output_result("continue", "Tool not found in PATH")
```
- Always return "continue" decision (advisory)
- Extract meaningful error messages for additionalContext
- Check stderr first, fall back to stdout
- Handle TimeoutExpired, FileNotFoundError, and generic exceptions
- Never call sys.exit() with non-zero code (blocks user workflow) (Added after #485)

## Workflow

1. **Parse Context**: Extract hook-relevant requirements from USER_PROMPT
2. **Identify Hook Type**: Determine which hook type applies (Pre/Post/Submit/Stop)
3. **Check Integration**: Verify hook fits with existing hook infrastructure
4. **Assess Safety**: Evaluate potential for blocking or side effects
5. **Pattern Match**: Compare against known patterns in Expertise
6. **Risk Assessment**: Identify hook-related risks

## Report Format

### CC Hook Perspective

**Hook Type Recommendation:**
- [Recommended hook type with rationale]

**Configuration Impact:**
- [Changes needed to settings.json or hook scripts]

**Recommendations:**
1. [Prioritized hook recommendation with rationale]

**Risks:**
- [Hook-related risk with severity: HIGH/MEDIUM/LOW]

**Pattern Compliance:**
- [Assessment of alignment with established hook patterns]
