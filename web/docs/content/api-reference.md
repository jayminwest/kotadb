---
title: API Reference
description: KotaDB MCP tools and HTTP endpoints
order: 3
---

# API Reference

KotaDB exposes functionality through MCP tools and HTTP endpoints.

## MCP Tools

When running as an MCP server, KotaDB provides these tools:

### search_code

Search indexed code files for a specific term.

**Parameters:**
- `term` (required): The search term to find in code files
- `repository` (optional): Filter results to a specific repository ID
- `limit` (optional): Maximum number of results (default: 20, max: 100)

**Example:**
```json
{
  "term": "async function",
  "limit": 10
}
```

**Returns:** Matching files with context snippets showing where the term appears.

---

### index_repository

Index a repository for code search and analysis.

**Parameters:**
- `path` (required): Absolute path to the repository
- `incremental` (optional): Only index changed files (default: true)

**Example:**
```json
{
  "path": "/Users/dev/my-project",
  "incremental": true
}
```

**Returns:** Summary of indexed files and any errors encountered.

---

### list_recent_files

List recently modified files across indexed repositories.

**Parameters:**
- `repository` (optional): Filter to a specific repository
- `limit` (optional): Number of files to return (default: 20)
- `since` (optional): ISO timestamp to filter files modified after

**Example:**
```json
{
  "limit": 10,
  "since": "2024-01-01T00:00:00Z"
}
```

**Returns:** List of recently modified files with metadata.

---

### search_dependencies

Search the dependency graph to find related files.

**Parameters:**
- `file_path` (required): Relative file path within the repository
- `repository` (optional): Repository ID (required for multi-repo workspaces)
- `direction` (optional): `dependents`, `dependencies`, or `both` (default: `both`)
- `depth` (optional): Recursion depth 1-5 (default: 1)
- `include_tests` (optional): Include test files (default: true)

**Example:**
```json
{
  "file_path": "src/auth/context.ts",
  "direction": "dependents",
  "depth": 2
}
```

**Returns:** Files that depend on or are depended on by the target file.

---

### analyze_change_impact

Analyze the impact of proposed code changes.

**Parameters:**
- `change_type` (required): `feature`, `refactor`, `fix`, or `chore`
- `description` (required): Brief description of the change
- `files_to_modify` (optional): List of files to be modified
- `files_to_create` (optional): List of files to be created
- `files_to_delete` (optional): List of files to be deleted
- `breaking_changes` (optional): Whether this includes breaking changes

**Example:**
```json
{
  "change_type": "refactor",
  "description": "Extract auth logic into separate module",
  "files_to_modify": ["src/auth.ts", "src/middleware.ts"]
}
```

**Returns:** Comprehensive analysis including affected files, test recommendations, and risk assessment.

---

## HTTP Endpoints

When running `kotadb serve`, these HTTP endpoints are available:

### Health Check

```
GET /health
```

Returns server status and version information.

### Search

```
POST /api/search
Content-Type: application/json

{
  "term": "search query",
  "limit": 20
}
```

Search indexed code files.

### Index

```
POST /api/index
Content-Type: application/json

{
  "path": "/path/to/repository"
}
```

Trigger indexing for a repository.

### Status

```
GET /api/status
```

Returns indexing status and statistics.

## Error Handling

All endpoints return errors in a consistent format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Repository not found",
    "details": {}
  }
}
```

Common error codes:
- `NOT_FOUND` - Resource does not exist
- `INVALID_REQUEST` - Malformed request parameters
- `INDEX_ERROR` - Problem during indexing
- `INTERNAL_ERROR` - Unexpected server error

## Next Steps

- Understand the [Architecture](#architecture) behind these APIs
- Review [Configuration](#configuration) options
