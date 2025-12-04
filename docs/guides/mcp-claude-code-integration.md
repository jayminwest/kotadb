# MCP Claude Code Integration Guide

This guide explains how to integrate KotaDB with Claude Code using the Model Context Protocol (MCP).

## Overview

KotaDB provides an MCP server endpoint that allows Claude Code to search indexed code, trigger repository indexing, and list recently indexed files. The integration uses HTTP transport with JSON-RPC 2.0 protocol.

## Prerequisites

- Claude Code CLI installed (`claude` command available)
- KotaDB server running (local or remote)
- Valid KotaDB API key (free, solo, or team tier)

## Registering KotaDB with Claude Code

Use the `claude mcp add` command to register KotaDB as an MCP server:

### Local Development

```bash
claude mcp add kotadb http://localhost:3000/mcp \
  -t http \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

### Production

```bash
claude mcp add kotadb https://your-kotadb-instance.com/mcp \
  -t http \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
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
    "kotadb-staging": {
      "type": "http",
      "url": "https://kotadb-staging.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer kota_solo_YOUR_API_KEY_HERE",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18"
      }
    },
    "kotadb-production": {
      "type": "http",
      "url": "https://kotadb.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer ${KOTADB_PRODUCTION_API_KEY}",
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

3. **Authorization**: Your KotaDB API key
   - Format: `"Bearer kota_{tier}_{random}_{hash}"`
   - Can use environment variables: `"Bearer ${KOTADB_API_KEY}"`

### Environment Variables

You can use environment variables in headers with the `${VAR}` syntax:

```json
{
  "headers": {
    "Authorization": "Bearer ${KOTADB_API_KEY}",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18"
  }
}
```

Optionally specify defaults: `${VAR:-default_value}`

## Available Tools

KotaDB exposes three MCP tools:

### 1. search_code

Search for code across indexed repositories.

**Parameters:**
- `term` (required): Search term or pattern
- `repository` (optional): Filter by repository ID
- `limit` (optional): Maximum results (default: 10, max: 100)

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

## Authentication & Rate Limiting

All MCP requests require authentication via Bearer token in the `Authorization` header.

### Rate Limits by Tier

- **Free tier**: 100 requests/hour
- **Solo tier**: 1,000 requests/hour
- **Team tier**: 10,000 requests/hour

Rate limit headers are included in all responses:
- `X-RateLimit-Limit`: Total requests allowed per hour
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

### Handling Rate Limit Errors

When rate limit is exceeded, the server returns HTTP 429 with `Retry-After` header:

```json
{
  "error": "Rate limit exceeded. Try again in 1234 seconds."
}
```

## Testing MCP Tools from Claude Code

### Test Connection

```
Open a Claude Code session and ask:
"List the available MCP tools from kotadb"
```

Expected response:
- search_code
- index_repository
- list_recent_files

### Test search_code

```
"Use the search_code tool to find 'function' in the codebase"
```

### Test index_repository

```
"Use the index_repository tool to index the repository at /path/to/repo"
```

### Test list_recent_files

```
"Use the list_recent_files tool to show the 10 most recently indexed files"
```

## Troubleshooting

### Connection Failed

**Error**: `Failed to connect to MCP server`

**Solutions**:
1. Verify server is running: `curl http://localhost:3000/health`
2. Check API key is valid
3. Verify MCP endpoint is accessible: `curl http://localhost:3000/mcp`

### 406 Not Acceptable

**Error**: `Not Acceptable: Client must accept both application/json and text/event-stream`

**Solution**: Ensure your `.mcp.json` includes the required `Accept` header:

```json
{
  "headers": {
    "Authorization": "Bearer YOUR_API_KEY",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18"
  }
}
```

This is a common issue when upgrading or first configuring Claude Code integration. The MCP SDK requires both content types in the Accept header even when using JSON-only mode.

### 401 Unauthorized

**Error**: `Authentication failed`

**Solutions**:
1. Verify API key format: `kota_{tier}_{random}_{hash}`
2. Check API key is enabled (not disabled in database)
3. Regenerate API key if compromised

### 429 Too Many Requests

**Error**: `Rate limit exceeded`

**Solutions**:
1. Wait for rate limit window to reset (check `Retry-After` header)
2. Upgrade to higher tier (solo or team)
3. Reduce request frequency

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
claude mcp add kotadb-local http://localhost:3000/mcp \
  -t http \
  -H "Authorization: Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"
```

3. Test integration in Claude Code session

### Production Deployment

1. Deploy KotaDB to production server
2. Generate production API key
3. Register production server with Claude Code:
```bash
claude mcp add kotadb-prod https://api.kotadb.com/mcp \
  -t http \
  -H "Authorization: Bearer YOUR_PROD_API_KEY"
```

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

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Missing required parameter: term"
  }
}
```

## References

- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Claude Code MCP Documentation](https://docs.claude.com/en/docs/claude-code/mcp)
- [KotaDB API Documentation](../api/README.md)

---

**Last Verified**: 2025-10-18
**KotaDB Version**: 0.1.0
**MCP Protocol Version**: 2025-06-18
