# ADW MCP Server Testing Guide

This guide explains how to test the kotadb-adw MCP server locally.

## Quick Start

### 1. Start the MCP Server

```bash
cd automation/adws/mcp_server
bun run dev
```

Expected output:
```
ADW MCP server listening on port 4000
Health check: http://localhost:4000/health
MCP endpoint: http://localhost:4000/mcp
```

### 2. Verify Health Check

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{"status":"ok","server":"kotadb-adw"}
```

### 3. List Available Tools

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer adw_orchestrator_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq
```

Expected response (truncated):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "adw_get_state",
        "description": "Retrieve ADW workflow state by ID",
        ...
      },
      {
        "name": "git_commit",
        "description": "Create a git commit in the ADW worktree",
        ...
      },
      ...
    ]
  }
}
```

### 4. Test Tool Execution

#### Example: Get ADW State

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer adw_orchestrator_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "adw_get_state",
      "arguments": {
        "adw_id": "test_adw_123"
      }
    }
  }' | jq
```

Expected response (if state doesn't exist):
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"error\":\"State not found: No state file found for ADW ID: test_adw_123\",\"success\":false}"
      }
    ]
  }
}
```

#### Example: List Workflows

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer adw_orchestrator_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "adw_list_workflows",
      "arguments": {}
    }
  }' | jq
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"workflows\":[],\"total\":0}"
      }
    ]
  }
}
```

#### Example: Execute Command (Stub)

```bash
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer adw_orchestrator_key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "adw_execute_command",
      "arguments": {
        "command": "/classify_issue",
        "args": ["145"]
      }
    }
  }' | jq
```

Expected response (stub implementation):
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\":false,\"output\":\"\",\"error\":\"Command execution not yet implemented\"}"
      }
    ]
  }
}
```

## MCP Configuration

The server is already configured in `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "kotadb-adw": {
      "type": "http",
      "url": "http://localhost:4000/mcp",
      "headers": {
        "Authorization": "Bearer adw_orchestrator_key"
      }
    }
  }
}
```

## Testing with Claude Code

Once the server is running, you can test tool invocations from Claude Code:

1. Start the MCP server: `cd automation/adws/mcp_server && bun run dev`
2. In Claude Code, the `kotadb-adw` MCP server will be available
3. Try asking Claude to list ADW workflows or check workflow state

Example prompts:
- "Use the adw_list_workflows tool to show me all active workflows"
- "Get the state for ADW ID abc123 using the adw_get_state tool"
- "Create a git commit in the worktree using git_commit"

## Available Tools

### Workflow Orchestration
- `adw_get_state`: Retrieve workflow state by ADW ID
- `adw_list_workflows`: List all workflows or filter by ID
- `adw_run_phase`: Execute a workflow phase (plan/build/test/review)

### Git Operations
- `git_commit`: Create commit in ADW worktree
- `git_create_worktree`: Create isolated git worktree
- `git_cleanup_worktree`: Remove worktree and branch

### Validation
- `bun_validate`: Run lint + typecheck
- `bun_validate_migrations`: Detect migration drift

### Command Execution
- `adw_execute_command`: Execute slash commands (stub)

## Troubleshooting

### Server won't start
- Check port 4000 is not already in use: `lsof -i :4000`
- Verify dependencies are installed: `bun install`

### Tool execution fails
- Check the Python bridge is accessible: `which uv`
- Verify automation modules are importable: `uv run python3 -c "from adws.adw_modules import state"`

### State not found errors
- Ensure ADW workflows have been executed first (creates state files in `automation/agents/`)
- Check state directory exists: `ls automation/agents/`

## Development Notes

### Authentication
Currently, the server accepts any request with the Bearer token `adw_orchestrator_key`. In production, implement proper API key validation via middleware.

### Stateless Mode
The server creates a new MCP Server instance per request (no session management). This ensures user context isolation and simplifies concurrent request handling.

### Python Bridge Integration
All tool implementations delegate to Python modules via subprocess calls to `automation/adws/adw_modules/mcp_bridge.py`. This maintains compatibility with existing ADW infrastructure.

### Error Handling
MCP SDK maps errors to standard JSON-RPC error codes:
- `-32700`: Parse error (invalid JSON)
- `-32601`: Method not found (unknown JSON-RPC method)
- `-32603`: Internal error (tool execution failures, validation errors)

## Next Steps

After verifying the server works:

1. Test with real ADW state (run `automation/adws/adw_plan.py` first)
2. Verify git operations in isolated worktrees
3. Test validation tools with migration drift scenarios
4. Integrate command execution with slash command registry
5. Add authentication middleware for production use
