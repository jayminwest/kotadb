# Enable index_repository in Local Mode and Remove Auth Requirements

**Issue**: #575
**Type**: feature
**Created**: 2025-01-25

## Summary

Enable the `index_repository` MCP tool to work in local SQLite mode by implementing synchronous indexing that stores data directly to `~/.kotadb/kota.db`. Additionally, ensure that local mode requires no `Authorization` header at all - requests should work with only `Content-Type` and `Accept` headers.

## Expert Analysis Summary

### Architecture
- **Pattern**: Extend existing mode-aware query layer (`isLocalMode()` checks) to the indexing pipeline
- **Data Flow**: `executeIndexRepository()` → `prepareRepository()` → `discoverSources()` → `parseSourceFile()` → SQLite storage via `saveIndexedFilesLocal()` and related functions
- **Key Insight**: Most infrastructure already exists in `queries-local.ts` and `storage-local.ts`; the gap is the orchestration layer in `executeIndexRepository()`

### Testing Strategy
- **Validation Level**: 2 (integration tests with real SQLite)
- **Test Scope**: Manual curl validation per issue requirements; no automated tests specified
- **Coverage**: Index operation → SQLite storage → search retrieval round-trip

### Security Considerations
- **Local Mode**: Auth bypass is intentional for local-only operation (no network exposure)
- **Auth Flow**: `authenticateRequest()` already returns `LOCAL_AUTH_CONTEXT` when `isLocalMode()` is true (line 54 of middleware.ts)
- **No Change Needed**: Current implementation already skips auth in local mode

### Integration Impact
- **MCP Tools Affected**: `index_repository`, `search_code`, `list_recent_files`, `search_dependencies`
- **Backward Compatibility**: Cloud mode behavior unchanged; only adds local mode capability
- **Storage Path**: Uses existing SQLite infrastructure (`getGlobalDatabase()`)

### UX/DX Impact
- **Developer Experience**: Enables fully offline code intelligence without Supabase
- **Error Messages**: Should indicate "indexing completed" vs current "cloud mode required" error
- **Progress Feedback**: Synchronous execution means caller blocks until complete

## Requirements

- [x] Auth middleware already bypasses auth in local mode (verified in code)
- [ ] `index_repository` works in local mode without throwing "requires cloud mode" error
- [ ] Indexed data is stored in SQLite (`~/.kotadb/kota.db`)
- [ ] MCP requests work with just `Content-Type` and `Accept` headers (no `Authorization`)
- [ ] All search tools (`search_code`, `list_recent_files`, etc.) return indexed data from SQLite

## Implementation Steps

### Step 1: Create Local Indexing Workflow Function
**Files**: `app/src/api/queries.ts`
**Changes**:
- Add new function `runIndexingWorkflowLocal()` that performs synchronous indexing without Supabase
- Reuse existing helper functions: `prepareRepository()`, `discoverSources()`, `parseSourceFile()`
- Store results via `saveIndexedFilesLocal()`, `storeSymbolsLocal()`, `storeReferencesLocal()`
- Skip cloud-only operations: `recordIndexRun()`, `updateIndexRunStatus()`, `ensureRepository()` (Supabase version)

```typescript
/**
 * Run indexing workflow for local mode (synchronous, no queue).
 * 
 * Unlike cloud mode which queues an async job, local mode
 * executes indexing synchronously and stores directly to SQLite.
 */
export async function runIndexingWorkflowLocal(
    request: IndexRequest,
): Promise<{
    repositoryId: string;
    filesIndexed: number;
    symbolsExtracted: number;
    referencesExtracted: number;
}> {
    // Implementation details in Step 1
}
```

### Step 2: Add Local Repository Management
**Files**: `app/src/api/queries-local.ts`
**Changes**:
- Add `ensureRepositoryLocal()` function to create/update repository records in SQLite
- Add `getRepositoryByFullName()` for lookup by owner/repo format
- Add `updateRepositoryLastIndexed()` to track indexing timestamps

```typescript
/**
 * Ensure repository exists in SQLite, create if not.
 * Returns repository UUID.
 */
export function ensureRepositoryLocal(
    db: KotaDatabase,
    fullName: string,
    gitUrl?: string,
    defaultBranch?: string,
): string {
    // Check if exists by full_name
    // If exists, return id
    // If not, insert and return new id
}
```

### Step 3: Modify executeIndexRepository to Support Local Mode
**Files**: `app/src/mcp/tools.ts`
**Changes**:
- Replace the cloud-only guard (lines 736-739) with a mode switch
- In local mode: call `runIndexingWorkflowLocal()` synchronously
- In cloud mode: keep existing async queue behavior
- Return appropriate response structure for both modes

```typescript
export async function executeIndexRepository(
    supabase: SupabaseClient | null,
    params: unknown,
    requestId: string | number,
    userId: string,
): Promise<unknown> {
    // ... parameter validation (unchanged) ...

    // LOCAL MODE: Synchronous indexing
    if (!supabase) {
        const db = getGlobalDatabase();
        const result = await runIndexingWorkflowLocal(indexRequest);
        return {
            repositoryId: result.repositoryId,
            status: "completed",
            message: "Indexing completed successfully",
            stats: {
                files_indexed: result.filesIndexed,
                symbols_extracted: result.symbolsExtracted,
                references_extracted: result.referencesExtracted,
            },
        };
    }

    // CLOUD MODE: Existing async queue behavior (unchanged)
    // ...
}
```

### Step 4: Handle localPath Parameter Correctly
**Files**: `app/src/mcp/tools.ts`, `app/src/indexer/repos.ts`
**Changes**:
- When `localPath` is provided, skip git clone and use path directly
- `prepareRepository()` already handles this (line 25-31 in repos.ts)
- For local mode, `repository` parameter can be the path itself or a logical name

### Step 5: Verify Search Tools Use SQLite Data
**Files**: `app/src/mcp/tools.ts` (no changes needed, verification only)
**Verification**:
- `executeSearchCode()` already calls `searchFiles()` which routes to `searchFilesLocal()` in local mode (queries.ts line 395-397)
- `executeListRecentFiles()` already calls `listRecentFiles()` which routes to `listRecentFilesLocal()` in local mode (queries.ts line 468-471)
- `executeSearchDependencies()` already uses mode-aware `queryDependents()` and `queryDependencies()` (queries.ts lines 1006-1128)

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/src/mcp/tools.ts` | modify | Replace cloud-only guard with mode switch in `executeIndexRepository()` |
| `app/src/api/queries.ts` | modify | Add `runIndexingWorkflowLocal()` function |
| `app/src/api/queries-local.ts` | modify | Add `ensureRepositoryLocal()` and related helper functions |

## Files to Create

| File | Purpose |
|------|---------|
| None | All changes are modifications to existing files |

## Testing Strategy

**Validation Level**: 2 (Integration)
**Justification**: Requires real SQLite database and full indexing pipeline; manual curl commands specified in issue

### Test Cases
- [ ] Start server with `KOTA_LOCAL_MODE=true bun run src/index.ts`
- [ ] Index repository via MCP (no auth header): verify 200 response with "completed" status
- [ ] Search indexed code via MCP (no auth header): verify results returned
- [ ] Verify data persists in `~/.kotadb/kota.db`
- [ ] Verify FTS5 search returns highlighted snippets

### Validation Commands

```bash
# Start in local mode
KOTA_LOCAL_MODE=true bun run src/index.ts

# Index a repository (NO auth header)
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"index_repository","arguments":{"repository":"kotadb/kotadb","localPath":"/path/to/repo"}}}'

# Expected response:
# {"jsonrpc":"2.0","id":"1","result":{"repositoryId":"...","status":"completed","message":"Indexing completed successfully","stats":{...}}}

# Search indexed code (NO auth header)
curl -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"search_code","arguments":{"term":"function"}}}'

# Expected response:
# {"jsonrpc":"2.0","id":"2","result":{"results":[{"path":"...","snippet":"...","dependencies":[...]}]}}

# Verify SQLite data
sqlite3 ~/.kotadb/kota.db "SELECT COUNT(*) FROM indexed_files;"
sqlite3 ~/.kotadb/kota.db "SELECT COUNT(*) FROM indexed_symbols;"
```

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @db/*, etc.)
- [ ] Logging via process.stdout.write (no console.*)
- [ ] Tests use real SQLite (antimocking pattern)
- [ ] No new migrations needed (SQLite schema already has required tables)
- [ ] Pre-commit hooks pass
- [ ] Agent workflow compatible

## Dependencies

- Depends on: `@db/sqlite/index.js` (getGlobalDatabase), `@indexer/*` (parsers, extractors)
- Depended on by: MCP server, all search-related tools

## Risks

- **Large Repository Performance**: Synchronous indexing blocks the caller. Mitigation: Document that large repos may take time; consider streaming progress in future enhancement.
- **Disk Space**: SQLite can grow large with many repos. Mitigation: Use existing `~/.kotadb/` default path; users can configure `KOTADB_PATH`.
- **Concurrent Indexing**: SQLite WAL mode handles concurrent reads but writes are serialized. Mitigation: Current single-threaded server makes this a non-issue.

## Implementation Notes

### Key Observations from Code Review

1. **Auth Already Bypassed**: The `authenticateRequest()` function in `app/src/auth/middleware.ts` (lines 52-57) already returns `LOCAL_AUTH_CONTEXT` when `isLocalMode()` is true. No changes needed for auth.

2. **SQLite Infrastructure Exists**: The `queries-local.ts` file already has:
   - `saveIndexedFilesLocal()` - stores files to SQLite
   - `storeSymbolsLocal()` - stores symbols to SQLite
   - `storeReferencesLocal()` - stores references to SQLite
   - `storeDependenciesLocal()` - stores dependency graph edges
   - `searchFilesLocal()` - FTS5-based code search

3. **Mode-Aware Query Layer**: The `queries.ts` file already routes to local implementations:
   - `saveIndexedFiles()` → `saveIndexedFilesLocal()` when local mode
   - `searchFiles()` → `searchFilesLocal()` when local mode
   - `listRecentFiles()` → `listRecentFilesLocal()` when local mode

4. **Missing Piece**: The `executeIndexRepository()` function has a hard guard that throws an error in local mode (line 737-738). This is the primary change needed.

5. **Repository Table Management**: The cloud workflow uses `ensureRepository()` to create/lookup repositories in Supabase. We need a local equivalent for SQLite.

### Execution Order

1. First: Add `ensureRepositoryLocal()` to `queries-local.ts`
2. Second: Add `runIndexingWorkflowLocal()` to `queries.ts`
3. Third: Modify `executeIndexRepository()` in `tools.ts` to use local workflow
4. Fourth: Manual testing with curl commands

### Response Structure Alignment

Local mode should return a synchronous "completed" response:
```json
{
  "repositoryId": "uuid",
  "status": "completed",
  "message": "Indexing completed successfully",
  "stats": {
    "files_indexed": 150,
    "symbols_extracted": 1200,
    "references_extracted": 3500
  }
}
```

Cloud mode continues to return async "pending" response:
```json
{
  "runId": "uuid",
  "status": "pending", 
  "message": "Indexing queued successfully"
}
```
