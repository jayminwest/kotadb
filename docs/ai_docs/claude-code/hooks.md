# Claude Code Hooks Reference

**Source:** https://code.claude.com/docs/en/hooks.md
**Date:** 2025-12-05

## Overview

Claude Code hooks are automated triggers that execute bash commands or LLM-based evaluations in response to specific events. They're configured through JSON settings files and enable custom workflows like validation, formatting, and permission management.

## Configuration Files

Hooks are organized hierarchically in these settings files:
- `~/.claude/settings.json` (user-level)
- `.claude/settings.json` (project-level)
- `.claude/settings.local.json` (local, uncommitted)
- Enterprise managed policies

## Hook Structure

Hooks are organized by matchers with the following pattern:

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here"
          }
        ]
      }
    ]
  }
}
```

**Key configuration elements:**

- **Matcher**: Pattern for tool names (case-sensitive), supporting exact strings, regex patterns, or `*` for all tools
- **Type**: Either `"command"` for bash or `"prompt"` for LLM evaluation
- **Command**: The bash command to execute (supports `$CLAUDE_PROJECT_DIR`)
- **Prompt**: For LLM hooks, the prompt text with `$ARGUMENTS` placeholder
- **Timeout**: Optional execution limit in seconds (60-second default)

## Hook Events

### PreToolUse
Executes after Claude creates tool parameters but before processing. Supports matchers like `Task`, `Bash`, `Read`, `Write`, `Edit`, `WebFetch`, and others.

**Common use cases:**
- Input validation
- Parameter modification
- Permission pre-approval
- Path sanitization

### PermissionRequest
Runs when permission dialogs appear, enabling approval/denial decisions.

**Common use cases:**
- Auto-approve safe operations
- Auto-deny dangerous operations
- Custom validation logic

### PostToolUse
Executes immediately after successful tool completion.

**Common use cases:**
- Formatting output
- Running linters
- Triggering builds
- Logging operations

### Notification
Triggers on system notifications. Matchers include `permission_prompt`, `idle_prompt`, `auth_success`, and `elicitation_dialog`.

### UserPromptSubmit
Fires when users submit prompts, before Claude processes them.

**Common use cases:**
- Adding project context
- Enriching prompts
- Validating requests
- Injecting guidelines

### Stop
Runs when the main agent finishes responding (not on user interruption).

**Common use cases:**
- Cleanup operations
- Saving state
- Triggering next steps

### SubagentStop
Executes when a subagent completes its task.

### PreCompact
Triggers before context compaction, with matchers `manual` or `auto`.

### SessionStart
Runs at session initialization. Matchers: `startup`, `resume`, `clear`, or `compact`. Supports `CLAUDE_ENV_FILE` for persisting environment variables.

**Common use cases:**
- Environment setup
- Loading project config
- Initializing tools
- Setting variables

### SessionEnd
Runs when sessions terminate for cleanup tasks.

**Common use cases:**
- Cleanup operations
- Saving session data
- Teardown processes

## Hook Input/Output

### Input Format
Hooks receive JSON via stdin containing:
- `session_id`: Session identifier
- `transcript_path`: Path to conversation JSON
- `cwd`: Current working directory
- `permission_mode`: Current permission setting
- `hook_event_name`: Event type
- Event-specific fields (tool_name, tool_input, etc.)

**Example input for PreToolUse:**
```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.json",
  "cwd": "/project/dir",
  "permission_mode": "ask",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "console.log('hello');"
  }
}
```

### Output Methods

**Exit Codes:**
- **0**: Success; stdout shown in verbose mode (except UserPromptSubmit/SessionStart where it adds context)
- **2**: Blocking error; stderr shown as feedback
- **Other**: Non-blocking error; stderr shown only in verbose mode

**JSON Output:**
Can include structured responses with fields like:
- `continue`: Boolean to halt Claude execution
- `stopReason`: Message when stopping
- `suppressOutput`: Hide from transcript
- `systemMessage`: Warning for user
- Hook-specific outputs for decision control

**Example JSON response:**
```json
{
  "permissionDecision": "allow",
  "updatedInput": {
    "file_path": "/sanitized/path/file.ts",
    "content": "console.log('hello');"
  }
}
```

## Prompt-Based Hooks

For `Stop` and `SubagentStop` events, you can use LLM evaluation:

```json
{
  "type": "prompt",
  "prompt": "Evaluate if Claude should stop: $ARGUMENTS",
  "timeout": 30
}
```

The LLM must respond with JSON containing:
- `decision`: "approve" or "block"
- `reason`: Explanation
- Optional: `continue`, `stopReason`, `systemMessage`

**Example prompt hook:**
```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review the following task completion and determine if all requirements are met: $ARGUMENTS. Respond with JSON containing 'decision' (approve/block) and 'reason'.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## Advanced Features

### MCP Tool Integration
MCP tools follow naming pattern `mcp__<server>__<tool>`. Target them with matchers like `mcp__memory__.*` or `mcp__.*__write.*`.

**Example:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'MCP memory tool called' >> /tmp/mcp-log.txt"
          }
        ]
      }
    ]
  }
}
```

### Plugin Hooks
Plugins can define hooks in `hooks/hooks.json` with automatic merging. They use `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` variables.

**Plugin hook example:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh"
          }
        ]
      }
    ]
  }
}
```

### Environment Variable Persistence
SessionStart hooks can write to `CLAUDE_ENV_FILE` to persist variables across bash commands.

**Example:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'PROJECT_NAME=my-app' >> $CLAUDE_ENV_FILE"
          }
        ]
      }
    ]
  }
}
```

## Decision Control by Event

### PreToolUse
- **Output field**: `permissionDecision`
- **Values**: `allow`, `deny`, or `ask`
- **Supports**: `updatedInput` modification

**Example:**
```json
{
  "permissionDecision": "allow",
  "updatedInput": {
    "file_path": "/validated/path.ts"
  }
}
```

### PermissionRequest
- **Output field**: `decision.behavior`
- **Values**: `allow` or `deny`
- **Supports**: `updatedInput`

**Example:**
```json
{
  "decision": {
    "behavior": "allow"
  }
}
```

### PostToolUse
- **Output field**: `decision`
- **Values**: `"block"` with `reason`
- **Supports**: `additionalContext`

**Example:**
```json
{
  "decision": "block",
  "reason": "File validation failed"
}
```

### UserPromptSubmit
- **Output field**: `decision`
- **Values**: `"block"` to reject
- **Supports**: Plain stdout or `additionalContext` to add context

**Example (add context):**
```json
{
  "additionalContext": "Project uses TypeScript strict mode and antimocking test principles."
}
```

**Example (block):**
```json
{
  "decision": "block",
  "reason": "Prompt contains unsafe instructions"
}
```

### Stop/SubagentStop
- **Output field**: `decision`
- **Values**: `"block"` prevents stopping
- **Requires**: populated `reason`

**Example:**
```json
{
  "decision": "block",
  "reason": "Tests have not been run yet"
}
```

## Security Considerations

Hooks execute arbitrary shell commands automatically and users bear full responsibility. Best practices include:

- **Validate and sanitize inputs**: Always validate data before use
- **Quote shell variables**: Prevent injection attacks (`"$VAR"` not `$VAR`)
- **Check for path traversal**: Reject `../` patterns
- **Use absolute paths**: Avoid relative path confusion
- **Skip sensitive files**: Don't process secrets or credentials

**Example secure hook:**
```bash
#!/bin/bash
set -euo pipefail

# Read JSON input
INPUT=$(cat)

# Extract file path safely
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Validate path (no traversal)
if [[ "$FILE_PATH" == *".."* ]]; then
  echo '{"permissionDecision": "deny"}' >&2
  exit 2
fi

# Validate path is within project
if [[ ! "$FILE_PATH" == "$CLAUDE_PROJECT_DIR"* ]]; then
  echo '{"permissionDecision": "deny"}' >&2
  exit 2
fi

# Allow the operation
echo '{"permissionDecision": "allow"}'
exit 0
```

## Execution Details

- Default 60-second timeout per command
- All matching hooks run in parallel
- Identical commands are deduplicated
- `CLAUDE_PROJECT_DIR` variable provides project root
- `CLAUDE_CODE_REMOTE` indicates execution environment

## Debugging

Use `claude --debug` to view detailed hook execution logs. Check `/hooks` menu to verify registration, test commands manually, ensure scripts are executable, and review debug output for troubleshooting.

**Common debugging steps:**

1. **Verify hook registration**: Run `/hooks` command in Claude Code
2. **Check file permissions**: Ensure hook scripts are executable (`chmod +x`)
3. **Test manually**: Run hook commands directly with sample input
4. **Enable debug mode**: Use `claude --debug` for verbose output
5. **Review exit codes**: Verify your hooks return correct codes
6. **Validate JSON output**: Test JSON responses with `jq`

**Example debugging script:**
```bash
# Test a hook manually
echo '{"tool_name":"Write","tool_input":{"file_path":"test.ts"}}' | \
  .claude/hooks/pre-tool-use.sh
```

## Common Hook Patterns

### Auto-format on Write
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"$CLAUDE_PROJECT_DIR/$(echo $INPUT | jq -r '.tool_input.file_path')\""
          }
        ]
      }
    ]
  }
}
```

### Run tests after code changes
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "cd $CLAUDE_PROJECT_DIR && bun test",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### Inject project context on session start
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "cat $CLAUDE_PROJECT_DIR/.claude/context.md"
          }
        ]
      }
    ]
  }
}
```

### Validate commits before allowing
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-git-commit.sh"
          }
        ]
      }
    ]
  }
}
```
