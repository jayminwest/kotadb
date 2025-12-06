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
- `auto_linter.py`: PostToolUse hook for Biome linting after Write/Edit
- `context_builder.py`: UserPromptSubmit hook for contextual documentation
- `utils/hook_helpers.py`: Shared utilities for JSON I/O and file detection

**Anti-Patterns Discovered:**
- Hooks that modify files without user awareness
- Timeouts too short for CI environments (use 45s+ for linters)
- Missing error handling for subprocess failures
- Hooks that assume specific working directory
- Blocking hooks for non-critical operations

### Integration Patterns

**File Detection:**
```python
def is_typescript_file(path: str) -> bool:
    return path.endswith(('.ts', '.tsx', '.js', '.jsx'))
```

**JSON I/O:**
```python
import json
import sys

def read_input() -> dict:
    return json.loads(sys.stdin.read())

def write_output(result: dict) -> None:
    print(json.dumps(result))
```

**Error Handling:**
```python
try:
    result = subprocess.run(cmd, capture_output=True, timeout=30)
except subprocess.TimeoutExpired:
    sys.exit(1)  # Non-zero exit blocks operation
```

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
