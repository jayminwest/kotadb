# API Reference

Complete reference for KotaDB MCP tools and CLI commands.

## Table of Contents

- [MCP Tools](#mcp-tools)
  - [search_code](#search_code)
  - [index_repository](#index_repository)
  - [list_recent_files](#list_recent_files)
  - [search_dependencies](#search_dependencies)
  - [analyze_change_impact](#analyze_change_impact)
  - [validate_implementation_spec](#validate_implementation_spec)
  - [kota_sync_export](#kota_sync_export)
  - [kota_sync_import](#kota_sync_import)
- [CLI Commands](#cli-commands)
  - [Development Server](#development-server)
  - [Testing](#testing)
  - [Type Checking](#type-checking)
  - [Linting](#linting)

---

## MCP Tools

KotaDB exposes its functionality through the Model Context Protocol (MCP). These tools can be invoked by any MCP-compatible client.

### search_code

**Purpose:** Search indexed code files for a specific term. Returns matching files with context snippets.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| term | string | Yes | The search term to find in code files |
| repository | string | No | Filter results to a specific repository ID |
| limit | number | No | Maximum number of results (default: 20, max: 100) |

**Returns:** Object containing `results` array with matching files:

```json
{
  "results": [
    {
      "projectRoot": "owner/repo",
      "path": "src/components/Button.tsx",
      "snippet": "...context around the match...",
      "dependencies": ["react", "./styles"],
      "indexedAt": "2026-01-30T12:00:00.000Z"
    }
  ]
}
```

**Example:**

```json
{
  "tool": "search_code",
  "params": {
    "term": "createLogger",
    "repository": "jayminwest/kotadb",
    "limit": 10
  }
}
```

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required parameter: term | `term` parameter not provided | Include the `term` parameter in your request |
| Parameter 'term' must be a string | Invalid type for `term` | Ensure `term` is a string value |
| Parameter 'limit' must be a number | Invalid type for `limit` | Ensure `limit` is a numeric value |

---

### index_repository

**Purpose:** Index a git repository by cloning/updating it and extracting code files. Performs synchronous indexing and returns immediately with status 'completed' and full indexing stats.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| repository | string | Yes | Repository identifier (e.g., 'owner/repo' or full git URL) |
| ref | string | No | Git ref/branch to checkout (default: main/master) |
| localPath | string | No | Use a local directory instead of cloning from git |

**Returns:** Object containing indexing results:

```json
{
  "runId": "repo-uuid",
  "repositoryId": "repo-uuid",
  "status": "completed",
  "message": "Indexing completed successfully",
  "stats": {
    "files_indexed": 150,
    "symbols_extracted": 2500,
    "references_extracted": 8000
  }
}
```

**Example - Remote Repository:**

```json
{
  "tool": "index_repository",
  "params": {
    "repository": "jayminwest/kotadb",
    "ref": "develop"
  }
}
```

**Example - Local Directory:**

```json
{
  "tool": "index_repository",
  "params": {
    "repository": "my-local-project",
    "localPath": "/Users/dev/projects/my-app"
  }
}
```

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required parameter: repository | `repository` parameter not provided | Include a repository identifier |
| Repository not found | Git URL is invalid or inaccessible | Verify the repository URL and your access permissions |
| Local path does not exist | `localPath` points to nonexistent directory | Check the path exists and is accessible |

---

### list_recent_files

**Purpose:** List recently indexed files, ordered by indexing timestamp. Useful for seeing what code is available in the index.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| limit | number | No | Maximum number of files to return (default: 10) |
| repository | string | No | Filter results to a specific repository ID |

**Returns:** Object containing `results` array with recent files:

```json
{
  "results": [
    {
      "projectRoot": "owner/repo",
      "path": "src/index.ts",
      "dependencies": ["express", "./routes"],
      "indexedAt": "2026-01-30T12:00:00.000Z"
    }
  ]
}
```

**Example:**

```json
{
  "tool": "list_recent_files",
  "params": {
    "limit": 20,
    "repository": "jayminwest/kotadb"
  }
}
```

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Invalid parameters | Wrong parameter types | Ensure `limit` is a number and `repository` is a string |

---

### search_dependencies

**Purpose:** Search the dependency graph to find files that depend on (dependents) or are depended on by (dependencies) a target file. Useful for impact analysis before refactoring, test scope discovery, and circular dependency detection.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| file_path | string | Yes | Relative file path within the repository (e.g., 'src/auth/context.ts') |
| direction | string | No | Search direction: 'dependents', 'dependencies', or 'both' (default: 'both') |
| depth | number | No | Recursion depth for traversal (1-5, default: 1). Higher values find indirect relationships |
| include_tests | boolean | No | Include test files in results (default: true). Set to false to filter out test/spec files |
| repository | string | No | Repository ID to search within. Required for multi-repository workspaces |

**Returns:** Object containing dependency analysis:

```json
{
  "file_path": "src/auth/context.ts",
  "direction": "both",
  "depth": 2,
  "dependents": {
    "direct": ["src/routes/auth.ts", "src/middleware/auth.ts"],
    "indirect": {
      "src/routes/auth.ts": ["src/index.ts"]
    },
    "cycles": [],
    "count": 3
  },
  "dependencies": {
    "direct": ["src/db/users.ts", "src/utils/crypto.ts"],
    "indirect": {
      "src/db/users.ts": ["src/db/connection.ts"]
    },
    "cycles": [],
    "count": 3
  }
}
```

**Example - Find All Dependents:**

```json
{
  "tool": "search_dependencies",
  "params": {
    "file_path": "src/db/sqlite/index.ts",
    "direction": "dependents",
    "depth": 2,
    "include_tests": false
  }
}
```

**Example - Find Direct Dependencies:**

```json
{
  "tool": "search_dependencies",
  "params": {
    "file_path": "src/mcp/tools.ts",
    "direction": "dependencies",
    "depth": 1
  }
}
```

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required parameter: file_path | `file_path` not provided | Include the file path to analyze |
| Parameter 'depth' must be between 1 and 5 | Depth value out of range | Use a depth value between 1 and 5 |
| File not found | File not in index | Ensure the repository is indexed and the path is correct |
| No repositories found | No indexed repositories | Run `index_repository` first |

---

### analyze_change_impact

**Purpose:** Analyze the impact of proposed code changes by examining dependency graphs, test scope, and potential conflicts. Returns comprehensive analysis including affected files, test recommendations, architectural warnings, and risk assessment.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| change_type | string | Yes | Type of change: 'feature', 'refactor', 'fix', or 'chore' |
| description | string | Yes | Brief description of the proposed change |
| files_to_modify | string[] | No | List of files to be modified (relative paths) |
| files_to_create | string[] | No | List of files to be created (relative paths) |
| files_to_delete | string[] | No | List of files to be deleted (relative paths) |
| breaking_changes | boolean | No | Whether this change includes breaking changes (default: false) |
| repository | string | No | Repository ID to analyze (uses first repository if not specified) |

**Returns:** Comprehensive impact analysis:

```json
{
  "affected_files": [
    {
      "path": "src/api/routes.ts",
      "reason": "Direct modification",
      "change_requirement": "update",
      "direct_dependents_count": 5,
      "indirect_dependents_count": 12
    },
    {
      "path": "src/index.ts",
      "reason": "Directly depends on src/api/routes.ts",
      "change_requirement": "review",
      "direct_dependents_count": 0,
      "indirect_dependents_count": 0
    }
  ],
  "test_scope": {
    "test_files": ["src/api/routes.test.ts"],
    "recommended_test_files": ["src/api/routes.spec.ts"],
    "coverage_impact": "Moderate test coverage - some affected files lack tests"
  },
  "architectural_warnings": [
    "API changes detected - update API documentation and consider versioning if breaking"
  ],
  "conflicts": [],
  "risk_level": "medium",
  "deployment_impact": "Medium-scale changes affecting 10+ files. MEDIUM RISK - recommend testing in staging before production",
  "last_indexed_at": "2026-01-30T12:00:00.000Z",
  "summary": "Change type: feature. 15 files affected (including dependents). Test scope: 1 test files identified. Risk level: MEDIUM."
}
```

**Example - Feature Analysis:**

```json
{
  "tool": "analyze_change_impact",
  "params": {
    "change_type": "feature",
    "description": "Add OAuth2 authentication support",
    "files_to_modify": [
      "src/auth/middleware.ts",
      "src/routes/auth.ts"
    ],
    "files_to_create": [
      "src/auth/oauth.ts",
      "src/auth/oauth.test.ts"
    ],
    "breaking_changes": false
  }
}
```

**Example - Breaking Refactor:**

```json
{
  "tool": "analyze_change_impact",
  "params": {
    "change_type": "refactor",
    "description": "Migrate from REST to GraphQL",
    "files_to_modify": ["src/api/index.ts"],
    "files_to_delete": ["src/api/rest-routes.ts"],
    "files_to_create": ["src/api/graphql-schema.ts"],
    "breaking_changes": true
  }
}
```

**Risk Levels:**

| Level | Criteria |
|-------|----------|
| low | <10 affected files, test coverage >60%, no breaking changes |
| medium | 10-50 affected files, test coverage 30-60% |
| high | >50 affected files, test coverage <30%, or breaking changes |

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required parameter: change_type | `change_type` not provided | Include a valid change type |
| Missing required parameter: description | `description` not provided | Include a description of the change |
| Parameter 'change_type' must be one of: feature, refactor, fix, chore | Invalid change type | Use one of the allowed values |

---

### validate_implementation_spec

**Purpose:** Validate an implementation specification against KotaDB conventions and repository state. Checks for file conflicts, naming conventions, path alias usage, test coverage, and dependency compatibility.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| feature_name | string | Yes | Name of the feature or change |
| files_to_create | object[] | No | Files to create with their purposes |
| files_to_modify | object[] | No | Files to modify with their purposes |
| migrations | object[] | No | Database migrations to add |
| dependencies_to_add | object[] | No | npm dependencies to add |
| breaking_changes | boolean | No | Whether this includes breaking changes (default: false) |
| repository | string | No | Repository ID (uses first repository if not specified) |

**File Specification Schema:**

```json
{
  "path": "src/feature/index.ts",
  "purpose": "Main feature entry point",
  "estimated_lines": 150
}
```

**Migration Schema:**

```json
{
  "filename": "20260130120000_add_oauth_table.sql",
  "description": "Add OAuth providers table",
  "tables_affected": ["oauth_providers"]
}
```

**Dependency Schema:**

```json
{
  "name": "zod",
  "version": "^3.22.0",
  "dev": false
}
```

**Returns:** Validation results:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "type": "test_coverage",
      "message": "No test files specified for 3 implementation file(s)",
      "suggested_fix": "Add test files for new implementation files to maintain test coverage"
    }
  ],
  "approval_conditions": [
    "Add test files before merging to maintain coverage",
    "Run full test suite before creating PR",
    "Update documentation if APIs or schemas change"
  ],
  "risk_assessment": "LOW RISK - Spec follows conventions and has no blocking issues",
  "summary": "Validation for feature: OAuth Support. PASSED - No blocking errors. 1 warning(s) for review. 4 files planned."
}
```

**Example:**

```json
{
  "tool": "validate_implementation_spec",
  "params": {
    "feature_name": "OAuth Authentication",
    "files_to_create": [
      {
        "path": "app/src/auth/oauth.ts",
        "purpose": "OAuth provider integration",
        "estimated_lines": 200
      },
      {
        "path": "app/src/auth/oauth.test.ts",
        "purpose": "OAuth integration tests",
        "estimated_lines": 150
      }
    ],
    "files_to_modify": [
      {
        "path": "app/src/auth/middleware.ts",
        "purpose": "Add OAuth middleware support"
      }
    ],
    "migrations": [
      {
        "filename": "20260130120000_add_oauth_providers.sql",
        "description": "Add OAuth providers table",
        "tables_affected": ["oauth_providers"]
      }
    ],
    "dependencies_to_add": [
      {
        "name": "arctic",
        "version": "^1.0.0",
        "dev": false
      }
    ]
  }
}
```

**Validation Checks:**

| Check | Type | Description |
|-------|------|-------------|
| File conflicts | error | Files to create already exist in index |
| Migration naming | error | Migrations must follow `YYYYMMDDHHMMSS_description.sql` format |
| Test file naming | warning | Test files should use `.test.ts` or `.spec.ts` extension |
| Path aliases | warning | Files in `app/src/` should use appropriate path aliases |
| Test coverage | warning | Implementation files should have corresponding tests |
| Mocking libraries | warning | KotaDB follows antimocking philosophy |

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Missing required parameter: feature_name | `feature_name` not provided | Include a feature name |
| No repository found | No indexed repositories | Run `index_repository` first |

---

### kota_sync_export

**Purpose:** Export local SQLite database to JSONL files for git sync. Uses hash-based change detection to skip unchanged tables.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| force | boolean | No | Force export even if tables unchanged (default: false) |
| export_dir | string | No | Custom export directory path (default: `.kotadb/export/`) |

**Returns:** Export results:

```json
{
  "success": true,
  "tables_exported": 4,
  "tables_skipped": 2,
  "total_rows": 1250,
  "duration_ms": 150,
  "export_dir": ".kotadb/export (project-local)"
}
```

**Example - Normal Export:**

```json
{
  "tool": "kota_sync_export",
  "params": {}
}
```

**Example - Force Full Export:**

```json
{
  "tool": "kota_sync_export",
  "params": {
    "force": true,
    "export_dir": "/backup/kotadb-export"
  }
}
```

**Exported Tables:**

| Table | Description |
|-------|-------------|
| repositories | Repository metadata |
| indexed_files | File paths and content hashes |
| indexed_symbols | Extracted symbols (functions, classes, etc.) |
| indexed_references | Import/export references |
| projects | Project configurations |
| project_repositories | Project-repository associations |

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Unable to determine project root | Not running in a project directory | Run from a directory containing `.git` or set `KOTADB_EXPORT_PATH` env var |

---

### kota_sync_import

**Purpose:** Import JSONL files into local SQLite database. Applies deletion manifest first, then imports all tables transactionally. Typically run after git pull to sync remote changes.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| import_dir | string | No | Custom import directory path (default: `.kotadb/export`) |

**Returns:** Import results:

```json
{
  "success": true,
  "tables_imported": 6,
  "rows_imported": 1250,
  "duration_ms": 200,
  "import_dir": ".kotadb/export"
}
```

**Error Response:**

```json
{
  "success": false,
  "tables_imported": 3,
  "rows_imported": 500,
  "errors": [
    "indexed_symbols: Row 45: Missing required fields: file_id"
  ],
  "duration_ms": 150
}
```

**Example:**

```json
{
  "tool": "kota_sync_import",
  "params": {
    "import_dir": "/backup/kotadb-export"
  }
}
```

**Import Behavior:**

- Uses `INSERT OR REPLACE` for conflict handling (upsert semantics)
- Processes tables in order to respect foreign key constraints
- Applies `.deletions.jsonl` manifest before importing
- Validates required fields per table

**Error Handling:**

| Error | Cause | Resolution |
|-------|-------|------------|
| Import directory not found | Specified path doesn't exist | Check the path and ensure JSONL files exist |
| Missing required fields | JSONL row missing required data | Fix the JSONL file or exclude malformed rows |
| Invalid JSON | Malformed JSONL line | Validate JSONL format before import |

---

## CLI Commands

### Development Server

Start the KotaDB development server:

```bash
cd app && bun run src/index.ts
```

The server starts on the default port and exposes:
- MCP protocol over stdio
- HTTP API endpoints (if configured)

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `KOTADB_EXPORT_PATH` | Override export directory location | `.kotadb/export` |
| `LOG_LEVEL` | Logging verbosity: debug, info, warn, error | `info` |

---

### Testing

Run the full test suite:

```bash
cd app && bun test
```

Run specific test files:

```bash
cd app && bun test src/mcp/tools.test.ts
```

Run tests with coverage:

```bash
cd app && bun test --coverage
```

Run tests matching a pattern:

```bash
cd app && bun test --grep "search_code"
```

**Test Conventions:**
- Test files use `.test.ts` suffix
- Tests use real SQLite instances (antimocking philosophy)
- Integration tests may require indexed repositories

---

### Type Checking

Run TypeScript type checking without emitting files:

```bash
cd app && bunx tsc --noEmit
```

This validates:
- Type safety across the codebase
- Path alias resolution (`@api/*`, `@db/*`, etc.)
- Import/export compatibility

---

### Linting

Run ESLint on the codebase:

```bash
cd app && bun run lint
```

Fix auto-fixable issues:

```bash
cd app && bun run lint --fix
```

**Lint Rules:**
- TypeScript strict mode
- No unused variables
- Consistent import ordering
- No console.* (use `process.stdout.write` instead)

---

## Path Aliases

KotaDB uses TypeScript path aliases for cleaner imports:

| Alias | Maps To | Purpose |
|-------|---------|---------|
| `@api/*` | `app/src/api/*` | HTTP and query layer |
| `@db/*` | `app/src/db/*` | Database clients and schema |
| `@indexer/*` | `app/src/indexer/*` | Code parsing and extraction |
| `@mcp/*` | `app/src/mcp/*` | MCP protocol handling |
| `@validation/*` | `app/src/validation/*` | Input validation |
| `@shared/*` | `app/src/shared/*` | Shared types and utilities |

**Usage:**

```typescript
import { getGlobalDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";
import type { ChangeImpactRequest } from "@shared/types";
```

---

## Logging

KotaDB uses structured logging via the `createLogger` function:

```typescript
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "my-module" });

logger.info("Operation completed", { duration_ms: 150 });
logger.error("Operation failed", error, { context: "value" });
```

**Log Levels:**
- `debug`: Detailed debugging information
- `info`: General operational messages
- `warn`: Warning conditions
- `error`: Error conditions

**Output:** Logs are written to `process.stdout`/`process.stderr` (never use `console.*`).
