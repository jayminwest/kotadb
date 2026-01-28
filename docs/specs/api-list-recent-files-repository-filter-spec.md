# API Implementation Specification: Repository Filter for list_recent_files

**Issue:** #608 - Add repository filter to list_recent_files MCP tool  
**Type:** Feature Enhancement  
**Priority:** Medium  
**Complexity:** Low  
**Estimated Effort:** 1-2 hours  

## Overview

Add an optional `repository` parameter to the `list_recent_files` MCP tool to enable filtering results by repository ID. This brings consistency with other MCP tools (`search_code`, `search_dependencies`) and provides better multi-repository support now that project-local `.kotadb/` storage (#592) is the default.

### Context

- Issue #592 implemented project-local storage in `.kotadb/`, providing automatic isolation between projects
- Remaining scope: Add `repository` filter for consistency with other tools
- This follows established patterns from `search_code` tool

## Objectives

1. Add optional `repository` parameter to `list_recent_files` MCP tool
2. Filter query results when repository parameter is provided
3. Maintain backward compatibility (no parameter = return all files)
4. Add comprehensive test coverage
5. Document multi-repo best practices

## Technical Design

### 1. MCP Tool Schema Changes

**File:** `app/src/mcp/tools.ts`

**Current Schema (lines 98-111):**

```typescript
export const LIST_RECENT_FILES_TOOL: ToolDefinition = {
	name: "list_recent_files",
	description:
		"List recently indexed files, ordered by indexing timestamp. Useful for seeing what code is available.",
	inputSchema: {
		type: "object",
		properties: {
			limit: {
				type: "number",
				description: "Optional: Maximum number of files to return (default: 10)",
			},
		},
	},
};
```

**Updated Schema:**

```typescript
export const LIST_RECENT_FILES_TOOL: ToolDefinition = {
	name: "list_recent_files",
	description:
		"List recently indexed files, ordered by indexing timestamp. Useful for seeing what code is available.",
	inputSchema: {
		type: "object",
		properties: {
			limit: {
				type: "number",
				description: "Optional: Maximum number of files to return (default: 10)",
			},
			repository: {
				type: "string",
				description: "Optional: Filter results to a specific repository ID",
			},
		},
	},
};
```

### 2. Tool Executor Changes

**File:** `app/src/mcp/tools.ts`

**Current Executor (lines 475-500):**

```typescript
export async function executeListRecentFiles(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	if (!isListRecentParams(params)) {
		throw invalidParams(requestId, "Invalid parameters for list_recent_files tool");
	}

	const limit =
		params && typeof params === "object" && "limit" in params ? (params.limit as number) : 10;

	// Use SQLite via listRecentFiles
	const files = listRecentFiles(limit);

	return {
		results: files.map((file) => ({
			projectRoot: file.projectRoot,
			path: file.path,
			dependencies: file.dependencies,
			indexedAt: file.indexedAt.toISOString(),
		})),
	};
}
```

**Updated Executor:**

```typescript
export async function executeListRecentFiles(
	params: unknown,
	requestId: string | number,
	userId: string,
): Promise<unknown> {
	if (!isListRecentParams(params)) {
		throw invalidParams(requestId, "Invalid parameters for list_recent_files tool");
	}

	const limit =
		params && typeof params === "object" && "limit" in params ? (params.limit as number) : 10;
	
	const repository =
		params && typeof params === "object" && "repository" in params 
			? (params.repository as string | undefined) 
			: undefined;

	// Use SQLite via listRecentFiles with optional repository filter
	const files = listRecentFiles(limit, repository);

	return {
		results: files.map((file) => ({
			projectRoot: file.projectRoot,
			path: file.path,
			dependencies: file.dependencies,
			indexedAt: file.indexedAt.toISOString(),
		})),
	};
}
```

**Updated Type Guard (line 340):**

```typescript
function isListRecentParams(params: unknown): params is { limit?: number; repository?: string } | undefined {
	if (params === undefined) return true;
	if (typeof params !== "object" || params === null) return false;
	const p = params as Record<string, unknown>;
	if (p.limit !== undefined && typeof p.limit !== "number") return false;
	if (p.repository !== undefined && typeof p.repository !== "string") return false;
	return true;
}
```

### 3. Query Layer Changes

**File:** `app/src/api/queries.ts`

**Current Public Function (lines 516-520):**

```typescript
export function listRecentFiles(
	limit: number,
): IndexedFile[] {
	return listRecentFilesInternal(getGlobalDatabase(), limit);
}
```

**Updated Public Function:**

```typescript
export function listRecentFiles(
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	return listRecentFilesInternal(getGlobalDatabase(), limit, repositoryId);
}
```

**Current Internal Function (lines 328-360):**

```typescript
function listRecentFilesInternal(
	db: KotaDatabase,
	limit: number,
): IndexedFile[] {
	const sql = `
		SELECT
			id, repository_id, path, content, metadata, indexed_at
		FROM indexed_files
		ORDER BY indexed_at DESC
		LIMIT ?
	`;

	const rows = db.query<{
		id: string;
		repository_id: string;
		path: string;
		content: string;
		metadata: string;
		indexed_at: string;
	}>(sql, [limit]);

	return rows.map((row) => {
		const metadata = JSON.parse(row.metadata || '{}');
		return {
			id: row.id,
			projectRoot: row.repository_id,
			path: row.path,
			content: row.content,
			dependencies: metadata.dependencies || [],
			indexedAt: new Date(row.indexed_at),
		};
	});
}
```

**Updated Internal Function:**

```typescript
function listRecentFilesInternal(
	db: KotaDatabase,
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	const hasRepoFilter = repositoryId !== undefined;
	const sql = hasRepoFilter
		? `
			SELECT
				id, repository_id, path, content, metadata, indexed_at
			FROM indexed_files
			WHERE repository_id = ?
			ORDER BY indexed_at DESC
			LIMIT ?
		`
		: `
			SELECT
				id, repository_id, path, content, metadata, indexed_at
			FROM indexed_files
			ORDER BY indexed_at DESC
			LIMIT ?
		`;

	const params = hasRepoFilter ? [repositoryId, limit] : [limit];
	const rows = db.query<{
		id: string;
		repository_id: string;
		path: string;
		content: string;
		metadata: string;
		indexed_at: string;
	}>(sql, params);

	return rows.map((row) => {
		const metadata = JSON.parse(row.metadata || '{}');
		return {
			id: row.id,
			projectRoot: row.repository_id,
			path: row.path,
			content: row.content,
			dependencies: metadata.dependencies || [],
			indexedAt: new Date(row.indexed_at),
		};
	});
}
```

**Update Backward-Compatible Alias (lines 1070-1075):**

```typescript
export function listRecentFilesLocal(
	db: KotaDatabase,
	limit: number,
	repositoryId?: string,
): IndexedFile[] {
	return listRecentFilesInternal(db, limit, repositoryId);
}
```

### 4. Test Coverage

**File:** `app/tests/mcp/list-recent-files.test.ts`

**Add New Tests (append to existing file):**

```typescript
describe("list_recent_files MCP tool - repository filtering", () => {
	const requestId = "test-request-1";
	const userId = "test-user-1";

	test("should accept repository parameter", async () => {
		const result = (await executeListRecentFiles(
			{ limit: 10, repository: "test-repo-id" },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(result.results).toBeDefined();
		expect(Array.isArray(result.results)).toBe(true);
	});

	test("should throw error when repository is not a string", async () => {
		await expect(async () => {
			await executeListRecentFiles({ repository: 123 }, requestId, userId);
		}).toThrow();
	});

	test("should filter results by repository when provided", async () => {
		// Note: This test requires seeded test data with multiple repositories
		// Implementation will depend on existing test setup patterns
		const result = (await executeListRecentFiles(
			{ repository: "specific-repo-id" },
			requestId,
			userId,
		)) as { 
			results: Array<{ projectRoot: string }> 
		};

		expect(result.results).toBeDefined();
		// All results should be from the specified repository
		result.results.forEach(file => {
			expect(file.projectRoot).toBe("specific-repo-id");
		});
	});

	test("should return all files when repository not specified (backward compatibility)", async () => {
		const withoutFilter = (await executeListRecentFiles(
			{ limit: 10 },
			requestId,
			userId,
		)) as { results: Array<unknown> };

		expect(withoutFilter.results).toBeDefined();
		expect(Array.isArray(withoutFilter.results)).toBe(true);
	});
});
```

**Pattern Reference:** Follow test patterns from `app/tests/mcp/search-code.test.ts` lines 70-78 for repository parameter acceptance.

## Implementation Steps

### Phase 1: Code Changes (30 minutes)

1. **Update MCP Tool Definition**
   - Open `app/src/mcp/tools.ts`
   - Add `repository` property to `LIST_RECENT_FILES_TOOL.inputSchema.properties` (line 108)
   - Update description to mention optional repository filter

2. **Update Type Guard**
   - Modify `isListRecentParams` function (line 340)
   - Add validation for optional `repository` string parameter

3. **Update Tool Executor**
   - Modify `executeListRecentFiles` function (lines 475-500)
   - Extract `repository` parameter from params
   - Pass to `listRecentFiles()` call

4. **Update Query Layer - Internal Function**
   - Modify `listRecentFilesInternal` (lines 328-360)
   - Add optional `repositoryId?: string` parameter
   - Use conditional SQL (pattern from `searchFilesInternal`)
   - Apply WHERE clause when repository is provided

5. **Update Query Layer - Public Function**
   - Modify `listRecentFiles` (lines 516-520)
   - Add optional `repositoryId?: string` parameter
   - Pass through to internal function

6. **Update Backward-Compatible Alias**
   - Modify `listRecentFilesLocal` (lines 1070-1075)
   - Add optional `repositoryId?: string` parameter

### Phase 2: Testing (30 minutes)

7. **Add Unit Tests**
   - Open `app/tests/mcp/list-recent-files.test.ts`
   - Add test suite for repository filtering
   - Test cases:
     - Accept repository parameter
     - Validate parameter type
     - Filter results correctly
     - Backward compatibility without parameter

8. **Run Test Suite**
   ```bash
   cd app && bun test app/tests/mcp/list-recent-files.test.ts
   ```

9. **Verify Existing Tests Pass**
   ```bash
   cd app && bun test
   ```

### Phase 3: Documentation (30 minutes)

10. **Create Multi-Repo Guide**
    - Create `docs/guides/multi-repo-best-practices.md`
    - Sections:
      - Overview of project-local `.kotadb/` storage
      - When to index external repositories
      - Using `repository` filter on MCP tools
      - Example `.mcp.json` configurations
      - Troubleshooting multi-repo scenarios

11. **Update README**
    - Open `README.public.md`
    - Add section "Multi-Repository Support" (after line 164)
    - Brief overview with link to full guide

## Request/Response Schemas

### Request Schema

```typescript
interface ListRecentFilesRequest {
	limit?: number;        // Optional: Max files to return (default: 10)
	repository?: string;   // Optional: Filter by repository ID
}
```

### Response Schema

```typescript
interface ListRecentFilesResponse {
	results: Array<{
		projectRoot: string;     // Repository ID
		path: string;            // File path relative to repo root
		dependencies: string[];  // Imported file paths
		indexedAt: string;       // ISO 8601 timestamp
	}>;
}
```

### Example Requests

**Without Repository Filter (Backward Compatible):**

```json
{
	"limit": 10
}
```

**With Repository Filter:**

```json
{
	"limit": 10,
	"repository": "8f7a9b2c-4d1e-4a3b-9c8d-1f2e3d4c5b6a"
}
```

**Default Behavior (No Parameters):**

```json
{}
```

Returns 10 most recent files from all repositories.

## Error Cases

| Error | Status | Response | Cause |
|-------|--------|----------|-------|
| Invalid params type | 400 | `{ error: "Parameters must be an object" }` | params is not an object |
| Invalid limit type | 400 | `{ error: "Parameter 'limit' must be a number" }` | limit is not a number |
| Invalid repository type | 400 | `{ error: "Parameter 'repository' must be a string" }` | repository is not a string |
| Repository not found | 200 | `{ results: [] }` | Valid UUID but no matching repository |

**Note:** Empty results for non-existent repository is intentional (consistent with `search_code` behavior).

## SQL Query Pattern

**Without Repository Filter:**

```sql
SELECT id, repository_id, path, content, metadata, indexed_at
FROM indexed_files
ORDER BY indexed_at DESC
LIMIT ?
```

**With Repository Filter:**

```sql
SELECT id, repository_id, path, content, metadata, indexed_at
FROM indexed_files
WHERE repository_id = ?
ORDER BY indexed_at DESC
LIMIT ?
```

**Performance Considerations:**

- Existing index on `indexed_at` supports ORDER BY clause
- WHERE clause on `repository_id` will use existing index (repositories FK)
- No additional indexes required
- Query performance should remain O(log n) for LIMIT operation

## Validation Criteria

### Functional Requirements

- [ ] MCP tool accepts optional `repository` parameter
- [ ] Parameter validation rejects non-string values
- [ ] Query filters by repository when provided
- [ ] Query returns all repositories when not provided
- [ ] Response format matches existing structure
- [ ] Backward compatibility: existing calls work unchanged

### Technical Requirements

- [ ] Follows pattern from `search_code` tool
- [ ] Uses conditional SQL (hasRepoFilter pattern)
- [ ] Type guard updated for new parameter
- [ ] Public function signature updated
- [ ] Internal function signature updated
- [ ] Backward-compatible alias updated

### Testing Requirements

- [ ] Tests accept repository parameter
- [ ] Tests validate parameter types
- [ ] Tests verify filtering behavior
- [ ] Tests verify backward compatibility
- [ ] All existing tests pass
- [ ] New tests follow antimocking philosophy

### Documentation Requirements

- [ ] Multi-repo guide created
- [ ] Guide covers project-local storage
- [ ] Guide explains repository filtering
- [ ] Guide includes example configurations
- [ ] README updated with multi-repo section
- [ ] README links to full guide

## Documentation Outline

### docs/guides/multi-repo-best-practices.md

```markdown
# Multi-Repository Best Practices

## Overview

KotaDB v2.0.0 introduced project-local storage in `.kotadb/` directories,
providing automatic isolation between projects. This guide covers best
practices for working with multiple repositories.

## Project-Local Storage (Default)

### What is Project-Local Storage?

Since #592, KotaDB stores all indexed data in `.kotadb/` within each
project directory. Each project maintains its own database:

```
project-a/
  .kotadb/
    kota.db          # Project A's index
project-b/
  .kotadb/
    kota.db          # Project B's index (isolated)
```

### Benefits

- **Automatic Isolation**: No cross-project data contamination
- **Git-Friendly**: Add `.kotadb/` to `.gitignore`
- **Portable**: Move projects without database migration
- **Cleanup**: Delete `.kotadb/` to reset index

## When to Index External Repositories

### Use Cases

1. **Dependency Analysis**: Index libraries your project depends on
2. **Cross-Repo Refactoring**: Analyze changes across multiple repos
3. **Monorepo Support**: Index multiple logical repos in one workspace

### Example: Indexing External Library

```json
// .mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"],
      "env": {
        "KOTADB_PATH": ".kotadb/kota.db"
      }
    }
  }
}
```

Then use MCP tools:

```typescript
// Index external dependency
await mcp.tools.index_repository({
  repository: "external-org/dependency-lib",
  localPath: "../dependency-lib"
});

// Search across all indexed repos
await mcp.tools.search_code({
  term: "ApiClient"
  // No repository filter = search all
});

// Search only in external repo
await mcp.tools.search_code({
  term: "ApiClient",
  repository: "external-org/dependency-lib"
});
```

## Repository Filter Parameter

### Tools Supporting Repository Filter

All MCP tools support optional `repository` parameter:

- `search_code`: Filter search results by repository
- `list_recent_files`: Filter recent files by repository
- `search_dependencies`: Analyze dependencies within repository

### Usage Patterns

**List All Recent Files (Default):**

```typescript
await mcp.tools.list_recent_files({
  limit: 20
});
// Returns files from ALL indexed repositories
```

**Filter by Repository:**

```typescript
await mcp.tools.list_recent_files({
  limit: 20,
  repository: "your-org/your-repo"
});
// Returns only files from specified repository
```

## Configuration Examples

### Single Project (Default)

```json
// .mcp.json - Most common setup
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
    }
  }
}
```

No configuration needed. KotaDB automatically uses `.kotadb/kota.db`.

### Multiple Projects (Separate Instances)

```json
// project-a/.mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
      // Uses .kotadb/kota.db in project-a
    }
  }
}

// project-b/.mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
      // Uses .kotadb/kota.db in project-b (isolated)
    }
  }
}
```

### Shared Database (Advanced)

```json
// Both projects point to shared database
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"],
      "env": {
        "KOTADB_PATH": "/Users/you/shared-index/kota.db"
      }
    }
  }
}
```

Use when analyzing multiple repos together (monorepo style).

## Troubleshooting

### Problem: Search returns results from wrong repository

**Cause:** Multiple repositories indexed in same database.

**Solution:** Use `repository` filter parameter:

```typescript
await mcp.tools.search_code({
  term: "MyClass",
  repository: "your-org/your-repo"  // Filter to specific repo
});
```

### Problem: Can't find recently indexed files

**Cause:** Looking in wrong project's `.kotadb/` directory.

**Solution:** Check KOTADB_PATH environment variable:

```bash
echo $KOTADB_PATH
# Should point to current project's .kotadb/kota.db
```

### Problem: Old index data persists after git clone

**Cause:** `.kotadb/` not in `.gitignore`.

**Solution:**

```bash
# Add to .gitignore
echo ".kotadb/" >> .gitignore

# Remove from tracking
git rm -r --cached .kotadb/

# Commit
git add .gitignore
git commit -m "chore: ignore .kotadb/ directory"
```

## Best Practices Summary

1. **Default Setup**: Use project-local `.kotadb/` (no config needed)
2. **Gitignore**: Always add `.kotadb/` to `.gitignore`
3. **Filtering**: Use `repository` parameter for multi-repo scenarios
4. **Isolation**: Separate databases for separate projects (default)
5. **Cleanup**: Delete `.kotadb/` directory to reset index
6. **External Deps**: Index sparingly, filter aggressively
```

### README.public.md Addition

Add after line 164 (after "Available MCP Tools"):

```markdown
## Multi-Repository Support

KotaDB v2.0.0 uses project-local storage in `.kotadb/` directories, providing automatic isolation between projects. All MCP tools support an optional `repository` parameter for filtering results when multiple repositories are indexed.

**Quick Start:**

```typescript
// List all recent files
await tools.list_recent_files({ limit: 20 });

// Filter by repository
await tools.list_recent_files({ 
  limit: 20, 
  repository: "your-org/your-repo" 
});
```

See `docs/guides/multi-repo-best-practices.md` for detailed guidance on working with multiple repositories, including configuration examples and troubleshooting.
```

## References

### Similar Implementations

- **search_code tool** (app/src/mcp/tools.ts lines 44-66, 351-400)
  - Uses optional `repository` parameter
  - Conditional SQL with `hasRepoFilter` pattern
  - Parameter validation in executor

- **searchFilesInternal** (app/src/api/queries.ts lines 264-326)
  - Conditional SQL query construction
  - Parameter ordering: `[escapedTerm, repositoryId, limit]` vs `[escapedTerm, limit]`

### KotaDB Conventions

- **Path Aliases**: Use `@api/*`, `@mcp/*`, `@db/*`
- **Logging**: Use `createLogger()`, never `console.*`
- **Database Access**: `getGlobalDatabase()` in public functions
- **Testing**: Antimocking philosophy (real SQLite databases)
- **Error Handling**: Structured errors with clear messages

## Success Criteria

### Code Quality

- [ ] Follows existing code patterns
- [ ] Type-safe parameter handling
- [ ] Consistent error messages
- [ ] Logging at appropriate levels
- [ ] No console.* usage

### Performance

- [ ] No additional database indexes required
- [ ] Query complexity remains O(log n)
- [ ] No performance regression vs. current implementation

### Integration

- [ ] MCP tool contract maintained
- [ ] Backward compatible with existing calls
- [ ] Works with Claude Code without config changes

### Maintainability

- [ ] Clear code comments
- [ ] Consistent with search_code pattern
- [ ] Easy to understand for future developers
- [ ] Documentation comprehensive and accurate

## Completion Checklist

- [ ] All code changes implemented
- [ ] All tests passing
- [ ] Type checking passes (`bunx tsc --noEmit`)
- [ ] Linting passes (`bun run lint`)
- [ ] Documentation created
- [ ] README updated
- [ ] Spec validated against implementation
- [ ] Ready for code review

## Rollback Plan

If issues are discovered post-merge:

1. **Revert commits** related to this feature
2. **Parameters are optional**, so existing calls continue working
3. **No database migrations** required, so no data cleanup needed
4. **Documentation** can be removed independently

**Risk Level:** Low - Additive change with full backward compatibility.

---

**Specification Version:** 1.0  
**Created:** 2026-01-28  
**Author:** Claude Code (API Planning Agent)  
**Related Issues:** #608, #592  
**Related PRs:** (To be added during implementation)
