# MCP Claude Code Integration Guide

> **BREAKING CHANGE (v0.1.1)**: The MCP endpoint now requires the Accept header to include both `application/json` AND `text/event-stream`. See [Migration Guide](../migration/v0.1.0-to-v0.1.1.md) if you're upgrading from v0.1.0.

This guide explains how to integrate KotaDB with Claude Code using the Model Context Protocol (MCP).

## Overview

KotaDB provides an MCP server endpoint that allows Claude Code to search indexed code, trigger repository indexing, and list recently indexed files. The integration uses HTTP transport with JSON-RPC 2.0 protocol.

## Prerequisites

- Claude Code CLI installed (`claude` command available)
- KotaDB server running locally

## Quick Start with bunx

The fastest way to use KotaDB with Claude Code:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb"]
    }
  }
}
```

This automatically downloads and runs KotaDB when Claude Code starts.

## Registering KotaDB with Claude Code

Use the `claude mcp add` command to register KotaDB as an MCP server:

```bash
claude mcp add kotadb http://localhost:3000/mcp -t http
```

### Verify Connection

```bash
claude mcp list
```

Expected output:
```
kotadb: ✓ Connected (http://localhost:3000/mcp)
```

## Configuration File (.mcp.json)

Claude Code stores MCP server configurations in `.mcp.json` in your project root. Here's what the KotaDB entry looks like:

```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18"
      }
    }
  }
}
```

### Required Headers

**CRITICAL**: The following headers are required for MCP connections:

1. **Accept**: Must include both `application/json` and `text/event-stream`
   - Format: `"Accept": "application/json, text/event-stream"`
   - Without this, requests will fail with HTTP 406 "Not Acceptable"

2. **MCP-Protocol-Version**: Must match the server's protocol version
   - Current version: `"2025-06-18"`
   - Required for protocol compatibility

## Available Tools

KotaDB exposes the following 8 MCP tools:

### 1. search_code

Search for code across indexed repositories.

**Parameters:**
- `term` (required): Search term or pattern
- `repository` (optional): Filter by repository ID
- `limit` (optional): Maximum results (default: 20, max: 100)

**Example usage in Claude Code:**
```
Use the search_code tool to find "Router" in the codebase
```

### 2. index_repository

Queue a repository for indexing.

**Parameters:**
- `repository` (required): Repository full name (e.g., "owner/repo")
- `ref` (optional): Branch, tag, or commit SHA (default: main/master)
- `localPath` (optional): Local filesystem path to index

**Example usage in Claude Code:**
```
Use the index_repository tool to index the repository at /Users/me/projects/myapp
```

### 3. list_recent_files

List recently indexed files.

**Parameters:**
- `limit` (optional): Maximum files to return (default: 10)
- `repository` (optional): Filter by repository ID

**Example usage in Claude Code:**
```
Use the list_recent_files tool to show the 20 most recently indexed files
```

### 4. search_dependencies

Find files that depend on or are depended on by a target file.

**Parameters:**
- `file_path` (required): Relative file path within repository
- `direction` (optional): `"dependents"`, `"dependencies"`, or `"both"` (default: `"both"`)
- `depth` (optional): Recursion depth 1-5 (default: `1`)
- `include_tests` (optional): Include test files (default: `true`)
- `repository` (optional): Repository ID

### 5. analyze_change_impact

Analyze the impact of proposed code changes.

**Parameters:**
- `change_type` (required): Type of change (`"feature"`, `"refactor"`, `"fix"`, `"chore"`)
- `description` (required): Brief description of the proposed change
- `files_to_modify` (optional): List of files to be modified
- `files_to_create` (optional): List of files to be created
- `files_to_delete` (optional): List of files to be deleted
- `breaking_changes` (optional): Whether this includes breaking changes
- `repository` (optional): Repository ID

### 6. validate_implementation_spec

Validate an implementation specification file.

**Parameters:**
- `spec_path` (required): Path to the specification file
- `repository` (optional): Repository ID for context

### 7. kota_sync_export

Export the SQLite database to JSONL format for backup or transfer.

**Parameters:**
- `output_path` (required): Path for the output JSONL file
- `tables` (optional): Array of table names to export (default: all tables)

### 8. kota_sync_import

Import JSONL data into the SQLite database.

**Parameters:**
- `input_path` (required): Path to the JSONL file to import
- `mode` (optional): Import mode - `"merge"` or `"replace"` (default: `"merge"`)

## Testing MCP Tools from Claude Code

### Test Connection

```
Open a Claude Code session and ask:
"List the available MCP tools from kotadb"
```

Expected response (8 tools):
- search_code
- index_repository
- list_recent_files
- search_dependencies
- analyze_change_impact
- validate_implementation_spec
- kota_sync_export
- kota_sync_import

### Test search_code

```
"Use the search_code tool to find 'function' in the codebase"
```

### Test index_repository

```
"Use the index_repository tool to index the repository at /path/to/repo"
```

## Troubleshooting

### Connection Failed

**Error**: `Failed to connect to MCP server`

**Solutions**:
1. Verify server is running: `curl http://localhost:3000/health`
2. Verify MCP endpoint is accessible: `curl http://localhost:3000/mcp`

### 406 Not Acceptable

**Error**: `Not Acceptable: Client must accept both application/json and text/event-stream`

**Solution**: Ensure your `.mcp.json` includes the required `Accept` header:

```json
{
  "headers": {
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18"
  }
}
```

### Tool Execution Errors

**Error**: `-32603 Internal Error`

**Solutions**:
1. Verify tool parameters match schema (check required fields)
2. Check parameter types (term must be string, limit must be number)
3. Review server logs for detailed error messages

## Development Workflow

### Local Development Setup

1. Start KotaDB server:
```bash
cd app && bun run src/index.ts
```

2. Register local server with Claude Code:
```bash
claude mcp add kotadb-local http://localhost:3000/mcp -t http
```

3. Test integration in Claude Code session

## Protocol Details

### JSON-RPC 2.0 Format

All MCP requests use JSON-RPC 2.0 protocol:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_code",
    "arguments": {
      "term": "Router"
    }
  }
}
```

### Response Format

Tool results are wrapped in SDK content blocks:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"results\": [...], \"total\": 10}"
      }
    ]
  }
}
```

### Error Format

Errors follow JSON-RPC 2.0 error codes:

- `-32700`: Parse Error (invalid JSON)
- `-32601`: Method Not Found (unknown JSON-RPC method)
- `-32603`: Internal Error (tool validation or execution error)

## References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Claude Code MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)

---

**Last Verified**: 2026-01-28
**KotaDB Version**: 2.0.0
**MCP Protocol Version**: 2025-06-18
