---
title: API Reference
description: KotaDB MCP tools and HTTP endpoints
order: 3
last_updated: 2026-02-04
version: 2.2.0
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
- `reference_types` (optional): Array of reference types to filter by (default: `["import", "re_export", "export_all"]`)

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
- `repository` (optional): Repository ID to analyze

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

### generate_task_context

Generate structured context for a set of files including dependency counts, impacted files, test files, and recent changes. Designed for hook-based context injection with <100ms performance target.

**Parameters:**
- `files` (required): List of file paths to analyze (relative to repository root)
- `include_tests` (optional): Include test file discovery (default: true)
- `include_symbols` (optional): Include symbol information for each file (default: false)
- `max_impacted_files` (optional): Maximum number of impacted files to return (default: 20)
- `repository` (optional): Repository ID or full_name

**Example:**
```json
{
  "files": ["src/api/routes.ts", "src/db/queries.ts"],
  "include_tests": true,
  "include_symbols": false,
  "max_impacted_files": 15
}
```

**Returns:** Structured context including target files with dependent counts, impacted files, test files, recent changes, and index staleness status.

---

## Memory Layer Tools

Tools for recording and searching architectural decisions, failed approaches, patterns, and session insights to build cross-session intelligence.

### search_decisions

Search past architectural decisions using FTS5 full-text search.

**Parameters:**
- `query` (required): Search query for decisions
- `scope` (optional): Filter by decision scope (`architecture`, `pattern`, `convention`, `workaround`)
- `repository` (optional): Filter to a specific repository ID or full_name
- `limit` (optional): Maximum results (default: 20)

**Example:**
```json
{
  "query": "database migration",
  "scope": "architecture",
  "limit": 10
}
```

**Returns:** Matching decisions with relevance scores, including title, context, decision, rationale, alternatives, and related files.

---

### record_decision

Record a new architectural decision for future reference.

**Parameters:**
- `title` (required): Decision title/summary
- `context` (required): Context and background for the decision
- `decision` (required): The actual decision made
- `scope` (optional): Decision scope/category (default: `pattern`). One of: `architecture`, `pattern`, `convention`, `workaround`
- `rationale` (optional): Why this decision was made
- `alternatives` (optional): Array of alternatives that were considered
- `related_files` (optional): Array of related file paths
- `repository` (optional): Repository ID or full_name

**Example:**
```json
{
  "title": "Use SQLite for local storage",
  "context": "Need persistent storage for indexed code files",
  "decision": "Use SQLite with FTS5 for full-text search capabilities",
  "scope": "architecture",
  "rationale": "SQLite is embedded, requires no setup, and FTS5 provides excellent search",
  "alternatives": ["PostgreSQL", "LevelDB", "File-based JSON"],
  "related_files": ["src/db/sqlite/index.ts"]
}
```

**Returns:** Success status with the created decision ID.

---

### search_failures

Search failed approaches to avoid repeating mistakes.

**Parameters:**
- `query` (required): Search query for failures
- `repository` (optional): Filter to a specific repository ID or full_name
- `limit` (optional): Maximum results (default: 20)

**Example:**
```json
{
  "query": "circular dependency",
  "limit": 5
}
```

**Returns:** Matching failures with relevance scores, including title, problem, approach, failure reason, and related files.

---

### record_failure

Record a failed approach for future reference. Helps agents avoid repeating mistakes.

**Parameters:**
- `title` (required): Failure title/summary
- `problem` (required): The problem being solved
- `approach` (required): The approach that was tried
- `failure_reason` (required): Why the approach failed
- `related_files` (optional): Array of related file paths
- `repository` (optional): Repository ID or full_name

**Example:**
```json
{
  "title": "Recursive import resolution caused stack overflow",
  "problem": "Resolving deeply nested import chains",
  "approach": "Used recursive function without depth limit",
  "failure_reason": "Stack overflow on circular dependencies exceeding 1000 levels",
  "related_files": ["src/indexer/resolver.ts"]
}
```

**Returns:** Success status with the created failure ID.

---

### search_patterns

Find codebase patterns by type or file. Returns discovered patterns for consistency.

**Parameters:**
- `query` (optional): Search query for pattern name/description
- `pattern_type` (optional): Filter by pattern type (e.g., `error-handling`, `api-call`)
- `file` (optional): Filter by file path
- `repository` (optional): Filter to a specific repository ID or full_name
- `limit` (optional): Maximum results (default: 20)

**Example:**
```json
{
  "pattern_type": "error-handling",
  "limit": 10
}
```

**Returns:** Matching patterns including pattern type, file path, description, and example.

---

### record_insight

Store a session insight for future agents. Insights are discoveries, failures, or workarounds.

**Parameters:**
- `content` (required): The insight content
- `insight_type` (required): Type of insight (`discovery`, `failure`, `workaround`)
- `session_id` (optional): Session identifier for grouping
- `related_file` (optional): Related file path
- `repository` (optional): Repository ID or full_name

**Example:**
```json
{
  "content": "The AST parser needs explicit handling for TypeScript decorators",
  "insight_type": "discovery",
  "related_file": "src/indexer/ast-parser.ts"
}
```

**Returns:** Success status with the created insight ID.

---

## Dynamic Expertise Tools

Tools for working with domain expertise definitions and discovering key files in the codebase.

### get_domain_key_files

Get the most-depended-on files for a domain. Key files are core infrastructure that many other files depend on.

**Parameters:**
- `domain` (required): Domain name (e.g., `database`, `api`, `indexer`, `testing`, `claude-config`, `agent-authoring`, `automation`, `github`, `documentation`)
- `limit` (optional): Maximum number of files to return (default: 10)
- `repository` (optional): Filter to a specific repository ID

**Example:**
```json
{
  "domain": "database",
  "limit": 5
}
```

**Returns:** Key files for the domain with their dependent counts and purposes.

---

### validate_expertise

Validate that key_files defined in expertise.yaml exist in the indexed codebase. Checks for stale or missing file references.

**Parameters:**
- `domain` (required): Domain name to validate (e.g., `database`, `api`, `indexer`)

**Example:**
```json
{
  "domain": "api"
}
```

**Returns:** Validation results including valid patterns, stale patterns with reasons, missing key files, and summary statistics.

---

### sync_expertise

Sync patterns from expertise.yaml files to the patterns table. Extracts pattern definitions and stores them for future reference.

**Parameters:**
- `domain` (optional): Specific domain to sync. If not provided, syncs all domains
- `force` (optional): Force sync even if patterns already exist (default: false)

**Example:**
```json
{
  "domain": "database",
  "force": false
}
```

**Returns:** Sync results including patterns synced, patterns skipped, and list of synced pattern names.

---

### get_recent_patterns

Get recently observed patterns from the patterns table. Useful for understanding codebase conventions.

**Parameters:**
- `domain` (optional): Filter patterns by domain
- `days` (optional): Only return patterns from the last N days (default: 30)
- `limit` (optional): Maximum number of patterns to return (default: 20)
- `repository` (optional): Filter to a specific repository ID

**Example:**
```json
{
  "domain": "api",
  "days": 7,
  "limit": 10
}
```

**Returns:** Recent patterns including pattern type, file path, description, example, and creation timestamp.

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
