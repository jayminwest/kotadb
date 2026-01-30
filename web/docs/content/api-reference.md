---
title: API Reference
description: KotaDB MCP tools and HTTP endpoints
order: 3
last_updated: 2026-01-30
version: 2.0.0
reviewed_by: documentation-build-agent
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
- `repository` (required): Repository identifier (owner/repo)
- `ref` (optional): Git reference (branch, tag, commit SHA) (default: "main")
- `localPath` (optional): Local path to the repository

**Example:**
```json
{
  "repository": "owner/repo",
  "ref": "main",
  "localPath": "/Users/dev/my-project"
}
```

**Returns:** Summary of indexed files and any errors encountered.

---

### list_recent_files

List recently modified files across indexed repositories.

**Parameters:**
- `limit` (optional): Number of files to return (default: 20)
- `repository` (optional): Repository ID to filter results

**Example:**
```json
{
  "limit": 10,
  "repository": "repo-id"
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

### validate_implementation_spec

Validate an implementation specification against KotaDB conventions and repository state.

**Parameters:**
- `feature_name` (required): Name of the feature or change
- `files_to_create` (optional): Array of files to create with path, purpose, estimated_lines
- `files_to_modify` (optional): Array of files to modify with path, purpose, estimated_lines
- `migrations` (optional): Array of database migrations with filename, description, tables_affected
- `dependencies_to_add` (optional): Array of npm dependencies with name, version, dev
- `breaking_changes` (optional): Whether this includes breaking changes (default: false)
- `repository` (optional): Repository ID to validate against

**Example:**
```json
{
  "feature_name": "user-authentication",
  "files_to_create": [
    {
      "path": "src/auth/middleware.ts",
      "purpose": "JWT authentication middleware",
      "estimated_lines": 50
    }
  ],
  "breaking_changes": false
}
```

**Returns:** Validation errors, warnings, and approval conditions checklist.

---

### kota_sync_export

Export local SQLite database to JSONL files for git sync.

**Parameters:**
- `force` (optional): Force export even if tables unchanged (default: false)
- `export_dir` (optional): Custom export directory path

**Example:**
```json
{
  "force": false,
  "export_dir": ".kotadb/custom-export"
}
```

**Returns:** Export summary with tables exported, skipped, total rows, and duration.

---

### kota_sync_import

Import JSONL files into local SQLite database.

**Parameters:**
- `import_dir` (optional): Custom import directory path (default: .kotadb/export)

**Example:**
```json
{
  "import_dir": ".kotadb/custom-export"
}
```

**Returns:** Import summary with tables imported, rows imported, errors, and duration.

---

## HTTP Endpoints

When running `kotadb serve`, these HTTP endpoints are available:

### Health Check
```
GET /health
```
Returns server status, version, mode (local/cloud), and queue status.

### Search Code
```
GET /search?term=query&limit=20&repository=repo-id
```
Search indexed code files with optional repository and limit filters.

### List Recent Files
```
GET /files/recent?limit=10
```
List recently indexed files with optional limit parameter.

### Validate Output
```
POST /validate-output
Content-Type: application/json

{
  "schema": "schema-definition",
  "output": "output-to-validate"
}
```
Validate command output against a schema definition.

### MCP Endpoint
```
POST /mcp
Content-Type: application/json
Accept: application/json, text/event-stream
```
MCP (Model Context Protocol) endpoint for AI assistant integration.

### MCP Health Check
```
GET /mcp
```
Simple health check for MCP endpoint availability.

### OpenAPI Specification
```
GET /openapi.json
```
Returns OpenAPI 3.1 specification for all endpoints.

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
