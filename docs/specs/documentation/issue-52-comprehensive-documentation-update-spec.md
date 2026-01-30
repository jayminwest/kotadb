# Issue #52: Comprehensive Documentation Update Specification

**Issue:** #52 - Update API reference documentation to include all 8 MCP tools
**Priority:** High
**Effort:** Medium (1-2 days)
**Status:** Ready for Implementation
**Domain:** Documentation

## Overview

### Problem Statement
The current documentation in `web/docs/content/` contains several critical inaccuracies and omissions that affect developer experience and API adoption:

1. **Missing MCP Tools**: API reference documents only 5 tools, missing 3 of the 8 implemented tools
2. **Incorrect Parameters**: `index_repository` tool documentation shows wrong parameter names
3. **Non-existent Parameters**: `list_recent_files` tool documents `since` parameter that doesn't exist
4. **Wrong HTTP Endpoints**: Documentation shows incorrect endpoint paths that don't match implementation
5. **Outdated Architecture Claims**: Documentation incorrectly states tree-sitter usage when TypeScript ESLint parser is used
6. **Wrong Database Location**: Claims `~/.kotadb/` when actual location is project-local `.kotadb/`
7. **Missing Integration Info**: No mention of Sentry integration or authentication middleware
8. **Stale Installation Info**: Incorrect CLI commands and default port information

### Success Criteria
- All 8 MCP tools accurately documented with correct parameters
- HTTP endpoints match actual implementation in `routes.ts`
- Architecture documentation reflects actual TypeScript ESLint parser usage
- Correct database location and integration details
- Updated installation instructions with proper CLI commands
- Documentation includes versioning metadata for freshness tracking

## Technical Analysis

### Current MCP Tools Implementation
Based on analysis of `app/src/mcp/tools.ts` and `app/src/mcp/server.ts`, the system implements **8 MCP tools**:

1. `search_code` - Search indexed code files ✓ (documented correctly)
2. `index_repository` - Index git repository ❌ (incorrect parameters)
3. `list_recent_files` - List recently indexed files ❌ (invalid parameter)
4. `search_dependencies` - Query dependency graph ✓ (documented correctly)
5. `analyze_change_impact` - Analyze change impact ✓ (documented correctly)
6. `validate_implementation_spec` - Validate specs ❌ (missing from docs)
7. `kota_sync_export` - Export to JSONL ❌ (missing from docs)
8. `kota_sync_import` - Import from JSONL ❌ (missing from docs)

### Current HTTP Endpoints Implementation
Based on analysis of `app/src/api/routes.ts`, actual endpoints are:

**Documented (incorrect):**
- `POST /api/search` ❌
- `POST /api/index` ❌
- `GET /api/status` ❌

**Actual Implementation:**
- `GET /search` ✓
- `GET /files/recent` ✓
- `POST /validate-output` ✓
- `POST /mcp` ✓
- `GET /mcp` ✓
- `GET /openapi.json` ✓
- `GET /health` ✓

### Architecture Implementation Details
Based on analysis of `app/src/indexer/ast-parser.ts` and related files:

- **Parser**: Uses `@typescript-eslint/parser`, not tree-sitter
- **Database**: Project-local `.kotadb/kota.db` via `getDefaultDbPath()`
- **Authentication**: JWT middleware in `authenticateRequest()`
- **Error Tracking**: Sentry integration with `@sentry/node`
- **Logging**: Structured logging via custom logger

## Specification Details

### 1. API Reference Updates (`web/docs/content/api-reference.md`)

#### Fix `index_repository` Tool Parameters
**Current (incorrect):**
```json
{
  "path": "/Users/dev/my-project",
  "incremental": true
}
```

**Should be:**
```json
{
  "repository": "owner/repo",
  "ref": "main",
  "localPath": "/Users/dev/my-project"
}
```

#### Remove Invalid `since` Parameter from `list_recent_files`
**Current (incorrect):**
```json
{
  "limit": 10,
  "since": "2024-01-01T00:00:00Z"
}
```

**Should be:**
```json
{
  "limit": 10,
  "repository": "repo-id"
}
```

#### Add Missing MCP Tools

**Tool: `validate_implementation_spec`**
```markdown
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

**Returns:** Validation errors, warnings, and approval conditions checklist.
```

**Tool: `kota_sync_export`**
```markdown
### kota_sync_export

Export local SQLite database to JSONL files for git sync.

**Parameters:**
- `force` (optional): Force export even if tables unchanged (default: false)
- `export_dir` (optional): Custom export directory path

**Returns:** Export summary with tables exported, skipped, total rows, and duration.
```

**Tool: `kota_sync_import`**
```markdown
### kota_sync_import

Import JSONL files into local SQLite database.

**Parameters:**
- `import_dir` (optional): Custom import directory path (default: .kotadb/export)

**Returns:** Import summary with tables imported, rows imported, errors, and duration.
```

#### Replace HTTP Endpoints Section
**Replace entire HTTP Endpoints section with:**

```markdown
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
```

### 2. Architecture Updates (`web/docs/content/architecture.md`)

#### Fix Parser Information
**Replace line 70-73:**
```markdown
The indexer uses tree-sitter for parsing, providing:
- Fast, parallel parsing
- Error recovery (partial parses for invalid code)
- Consistent AST structure across languages
```

**With:**
```markdown
The indexer uses @typescript-eslint/parser for AST parsing, providing:
- Full TypeScript and JavaScript syntax support
- Precise source location information (line, column, range)
- Comment and token preservation for JSDoc extraction
- Graceful error handling with structured logging
```

#### Update Database Location
**Replace line 152-154:**
```markdown
└── ~/.kotadb/
    └── kotadb.db       # SQLite database
```

**With:**
```markdown
└── .kotadb/           # Project-local directory
    ├── kota.db        # SQLite database
    └── export/        # JSONL export files for git sync
```

#### Add Missing Components

**Add Sentry Integration section after line 89:**
```markdown
### Error Tracking

Sentry integration provides comprehensive error monitoring:

- **Exception capture** - Automatic error collection with context
- **Structured logging** - Correlation with request IDs
- **Privacy compliance** - Sensitive headers automatically scrubbed
- **Environment-aware** - Different sampling rates for dev/prod
- **Request correlation** - Links errors to specific API requests

### Authentication Middleware

JWT-based authentication protects all endpoints (except health checks):

- **Token validation** - Verifies JWT signature and expiration
- **Rate limiting** - Per-user request limits with headers
- **Context injection** - Attaches user context to requests
- **Header sanitization** - Removes sensitive data from logs
- **CORS support** - Configurable origin policies
```

### 3. Installation Updates (`web/docs/content/installation.md`)

#### Update Port Information
**Replace line 58:**
```bash
curl http://localhost:3000/health
```

**With:**
```bash
curl http://localhost:8080/health
# Default port is 8080, configurable via PORT environment variable
```

#### Fix CLI Command Format
**Replace line 46-47:**
```bash
kotadb index /path/to/your/repo
```

**With:**
```bash
kotadb index --repository owner/repo --ref main
# Or for local path:
kotadb index --local-path /path/to/your/repo
```

### 4. Add Versioning Metadata

#### Add to Front Matter of All Documentation Files
```yaml
---
title: [existing title]
description: [existing description]
order: [existing order]
last_updated: 2026-01-30
version: 2.0.0
reviewed_by: documentation-plan-agent
---
```

## Implementation Steps

### Phase 1: API Reference Corrections (30 minutes)
1. Fix `index_repository` tool parameters in `api-reference.md:40-52`
2. Remove `since` parameter from `list_recent_files` in `api-reference.md:63`
3. Add three missing MCP tools: `validate_implementation_spec`, `kota_sync_export`, `kota_sync_import`
4. Replace HTTP endpoints section with correct endpoint paths and methods

### Phase 2: Architecture Updates (20 minutes)
1. Update parser information from tree-sitter to TypeScript ESLint parser
2. Correct database location from `~/.kotadb/` to project-local `.kotadb/`
3. Add Sentry integration and authentication middleware sections
4. Update file structure diagram with correct paths

### Phase 3: Installation Improvements (15 minutes)
1. Update default port from 3000 to 8080 with environment variable note
2. Fix CLI command format for index operations
3. Add troubleshooting section for common configuration issues

### Phase 4: Versioning and Metadata (15 minutes)
1. Add versioning front matter to all three documentation files
2. Include last updated timestamps and review attribution
3. Add version correlation with package.json version

## Validation Requirements

### Automated Checks
- All HTTP endpoints documented match routes in `app/src/api/routes.ts`
- All MCP tools documented match tools in `app/src/mcp/tools.ts`
- Parameter names and types match actual implementation schemas
- Code examples use valid JSON syntax and parameter combinations

### Manual Review
- Documentation renders correctly in web interface
- Internal links work between documentation sections
- Examples can be copy-pasted and executed successfully
- Technical terminology is consistent across all documents

### Integration Testing
- CLI commands in installation guide work with actual implementation
- HTTP endpoint examples return expected response formats
- MCP tool parameter examples validate against schemas
- Database and configuration paths resolve correctly

## Files Modified

### Primary Documentation Files
- `web/docs/content/api-reference.md` - Complete MCP tools and HTTP endpoints overhaul
- `web/docs/content/architecture.md` - Parser, database, and integration updates
- `web/docs/content/installation.md` - CLI commands and port corrections

### Reference Files (for validation)
- `app/src/mcp/tools.ts` - Source of truth for MCP tool definitions
- `app/src/api/routes.ts` - Source of truth for HTTP endpoint paths
- `app/src/indexer/ast-parser.ts` - Parser implementation details
- `app/src/db/sqlite/sqlite-client.ts` - Database location logic

## Risk Assessment

### Low Risk
- Documentation updates are non-breaking changes
- No code functionality changes required
- Changes improve accuracy of existing information

### Medium Risk
- Extensive changes across multiple files increase chance of introducing errors
- Dependencies on understanding actual implementation details correctly
- Potential for documentation to become stale again without process improvements

### Mitigation Strategies
- Cross-reference all parameter names and types with actual TypeScript interfaces
- Test all code examples and CLI commands before documenting
- Include version metadata to track when documentation was last verified
- Implement documentation review as part of feature development process

## Success Metrics

### Completeness
- [ ] All 8 MCP tools documented with accurate parameters
- [ ] All 7 HTTP endpoints documented with correct paths and methods
- [ ] Architecture reflects actual TypeScript ESLint parser usage
- [ ] Database location matches `getDefaultDbPath()` implementation

### Accuracy
- [ ] All parameter names match implementation schemas
- [ ] All endpoint paths match `routes.ts` definitions
- [ ] All integration details verified in source code
- [ ] All CLI commands tested with actual implementation

### Usability
- [ ] Installation instructions work end-to-end
- [ ] API examples can be copy-pasted successfully
- [ ] Architecture diagrams reflect current implementation
- [ ] Troubleshooting covers common developer issues

### Maintainability
- [ ] Versioning metadata tracks documentation freshness
- [ ] Clear correlation between docs version and implementation
- [ ] Process documented for keeping documentation current
- [ ] Automated checks prevent documentation drift

---

**Specification Complete**
**Ready for Implementation**
**Estimated Duration: 1-2 hours for complete update**
**Files to Modify: 3 primary documentation files**
**Validation Method: Cross-reference with 4 implementation files**