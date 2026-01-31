---
title: Hooks reference
source: https://code.claude.com/docs/en/hooks
date: 2026-01-30
---

# Hooks Reference

Hooks allow you to run custom commands at specific points in Claude Code's lifecycle. They enable automation, validation, logging, and integration with external tools.

## Overview

Hooks are configured in `.claude/settings.json` or `~/.claude/settings.json` and execute shell commands when triggered by specific events.

## Hook Lifecycle

Hooks execute at defined points during Claude Code's operation:

1. **SessionStart**: When a new session begins
2. **PreToolUse**: Before a tool executes
3. **PostToolUse**: After a tool completes
4. **Stop**: When Claude finishes responding
5. **NotificationSend**: When sending desktop notifications

## Configuration

Hooks are defined in settings files:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "echo 'Session started'",
        "timeout": 5000
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "echo 'Running bash command'",
        "timeout": 10000
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "command": "bun run lint --fix $FILE_PATH",
        "timeout": 30000
      }
    ],
    "Stop": [
      {
        "command": "echo 'Response complete'",
        "timeout": 5000
      }
    ]
  }
}
```

## Hook Events

### SessionStart

Triggered when a new Claude Code session begins.

**Use cases:**
- Initialize environment variables
- Check prerequisites
- Load project configuration
- Display welcome messages

```json
{
  "SessionStart": [
    {
      "command": "./scripts/session-init.sh",
      "timeout": 10000
    }
  ]
}
```

**Input schema:**

```json
{
  "session_id": "string",
  "working_directory": "string",
  "timestamp": "ISO8601 string"
}
```

### PreToolUse

Triggered before a tool executes. Can be used to validate, modify, or block tool execution.

**Use cases:**
- Validate file paths before writes
- Log tool usage
- Block dangerous commands
- Add confirmation prompts

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "command": "./scripts/validate-bash.sh",
      "timeout": 5000
    },
    {
      "matcher": "Write",
      "command": "./scripts/pre-write-check.sh",
      "timeout": 5000
    }
  ]
}
```

**Input schema:**

```json
{
  "tool_name": "string",
  "tool_input": {
    // Tool-specific parameters
  },
  "session_id": "string"
}
```

**Output schema (to block execution):**

```json
{
  "block": true,
  "reason": "Explanation for blocking"
}
```

### PostToolUse

Triggered after a tool completes execution.

**Use cases:**
- Run linters after file changes
- Update indexes after writes
- Log results
- Trigger builds

```json
{
  "PostToolUse": [
    {
      "matcher": "Write",
      "command": "prettier --write $FILE_PATH",
      "timeout": 30000
    },
    {
      "matcher": "Edit",
      "command": "eslint --fix $FILE_PATH",
      "timeout": 30000
    }
  ]
}
```

**Input schema:**

```json
{
  "tool_name": "string",
  "tool_input": {
    // Original tool parameters
  },
  "tool_output": {
    // Tool execution result
  },
  "success": "boolean",
  "error": "string | null",
  "session_id": "string"
}
```

### Stop

Triggered when Claude finishes generating a response.

**Use cases:**
- Run final validations
- Generate summaries
- Send notifications
- Clean up temporary files

```json
{
  "Stop": [
    {
      "command": "./scripts/post-response.sh",
      "timeout": 10000
    }
  ]
}
```

**Input schema:**

```json
{
  "session_id": "string",
  "response_complete": "boolean",
  "timestamp": "ISO8601 string"
}
```

### NotificationSend

Triggered when Claude Code sends a desktop notification.

**Use cases:**
- Custom notification routing
- Slack/Discord integration
- Mobile push notifications
- Logging

```json
{
  "NotificationSend": [
    {
      "command": "./scripts/notify-slack.sh",
      "timeout": 5000
    }
  ]
}
```

**Input schema:**

```json
{
  "title": "string",
  "message": "string",
  "urgency": "low | normal | critical",
  "session_id": "string"
}
```

## Hook Configuration Options

### Basic Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | Shell command to execute |
| `timeout` | number | No | Timeout in milliseconds (default: 60000) |
| `matcher` | string | No | Tool name to match (for Pre/PostToolUse) |

### Matcher Patterns

The `matcher` field supports:

- **Exact match**: `"Bash"` matches only Bash tool
- **Wildcard**: `"*"` matches all tools
- **Multiple**: Use multiple hook entries for different tools

```json
{
  "PreToolUse": [
    { "matcher": "Bash", "command": "./hooks/pre-bash.sh" },
    { "matcher": "Write", "command": "./hooks/pre-write.sh" },
    { "matcher": "Edit", "command": "./hooks/pre-edit.sh" }
  ]
}
```

## Environment Variables

Hooks receive context via environment variables:

| Variable | Description | Available In |
|----------|-------------|--------------|
| `$TOOL_NAME` | Name of the tool | Pre/PostToolUse |
| `$FILE_PATH` | Target file path | Write, Edit, Read |
| `$SESSION_ID` | Current session ID | All hooks |
| `$WORKING_DIR` | Working directory | All hooks |
| `$TOOL_INPUT` | JSON-encoded tool input | Pre/PostToolUse |
| `$TOOL_OUTPUT` | JSON-encoded tool output | PostToolUse |

## Security Considerations

### Command Validation

- Hooks run with your user permissions
- Validate inputs before passing to shell commands
- Avoid using `eval` or dynamic command construction

### Timeout Protection

Always set appropriate timeouts to prevent hangs:

```json
{
  "command": "./potentially-slow-script.sh",
  "timeout": 30000
}
```

### Path Sanitization

When using file paths in commands, ensure proper quoting:

```bash
#!/bin/bash
# hooks/pre-write.sh

FILE_PATH="$1"
# Validate path is within project
if [[ ! "$FILE_PATH" =~ ^/allowed/path ]]; then
  echo '{"block": true, "reason": "Path outside allowed directory"}'
  exit 0
fi
```

### Secrets Protection

Hooks can prevent accidental secret exposure:

```bash
#!/bin/bash
# hooks/pre-write-check.sh

if grep -q "API_KEY\|SECRET\|PASSWORD" "$TOOL_INPUT"; then
  echo '{"block": true, "reason": "Potential secret detected in write operation"}'
  exit 0
fi
```

## Examples

### Auto-Format on Save

```json
{
  "PostToolUse": [
    {
      "matcher": "Write",
      "command": "prettier --write \"$FILE_PATH\"",
      "timeout": 10000
    },
    {
      "matcher": "Edit",
      "command": "prettier --write \"$FILE_PATH\"",
      "timeout": 10000
    }
  ]
}
```

### Lint Validation

```json
{
  "PostToolUse": [
    {
      "matcher": "Write",
      "command": "eslint \"$FILE_PATH\" || true",
      "timeout": 15000
    }
  ]
}
```

### Dangerous Command Protection

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "command": "./scripts/validate-command.sh",
      "timeout": 5000
    }
  ]
}
```

```bash
#!/bin/bash
# scripts/validate-command.sh

DANGEROUS_PATTERNS="rm -rf|drop table|truncate|format"

if echo "$TOOL_INPUT" | grep -iE "$DANGEROUS_PATTERNS"; then
  echo '{"block": true, "reason": "Potentially dangerous command detected"}'
fi
```

### Session Logging

```json
{
  "SessionStart": [
    {
      "command": "echo \"Session started at $(date)\" >> ~/.claude/session.log",
      "timeout": 5000
    }
  ],
  "Stop": [
    {
      "command": "echo \"Session ended at $(date)\" >> ~/.claude/session.log",
      "timeout": 5000
    }
  ]
}
```

## Debugging Hooks

### Enable Verbose Logging

```bash
export CLAUDE_HOOK_DEBUG=1
claude
```

### Test Hook Scripts

Test hook scripts independently:

```bash
# Simulate PreToolUse input
echo '{"tool_name": "Bash", "tool_input": {"command": "ls"}}' | ./hooks/pre-bash.sh
```

### Check Hook Execution

View hook execution in Claude Code's output or logs to verify hooks are running as expected.
