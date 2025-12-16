# Phase 2B: Query Layer Rewrite (Supabase → SQLite)

**Issue**: #539
**Type**: feature
**Status**: planned
**Created**: 2025-12-15
**Dependencies**: #532 (Phase 1A), #538 (Phase 1B), #540 (Phase 2A)

## BLUF (Bottom Line Up Front)

Migrate 10 core query functions from Supabase to SQLite for LOCAL tier operations, enabling offline-first code intelligence. Functions include FTS5 search, dependency graph queries, batch storage, and file listing. CLOUD tier functions remain unchanged.

## Summary

Phase 2B rewrites the query layer (`app/src/api/queries.ts` and `app/src/indexer/storage.ts`) to use SQLite when `KOTA_LOCAL_MODE=true`. This enables:
- **FTS5 full-text search** for code patterns
- **Recursive CTE queries** for dependency graphs
- **Batch inserts** with prepared statements
- **Type-safe queries** using existing SQLite client patterns

Cloud tier functions (repository management, index runs, organizations) remain Supabase-only.

## Requirements

- [ ] Migrate `searchFiles()` to SQLite FTS5 with `MATCH` syntax
- [ ] Migrate `listRecentFiles()` to SQLite with `ORDER BY indexed_at DESC`
- [ ] Migrate `saveIndexedFiles()` to SQLite batch inserts with transactions
- [ ] Migrate `storeSymbols()` to SQLite prepared statements
- [ ] Migrate `storeReferences()` to SQLite prepared statements
- [ ] Migrate `storeDependencies()` to SQLite prepared statements
- [ ] Migrate `queryDependents()` to SQLite recursive CTE
- [ ] Migrate `queryDependencies()` to SQLite recursive CTE
- [ ] Migrate `resolveFilePath()` to SQLite path queries
- [ ] Migrate `getIndexJobStatus()` to SQLite job tracking
- [ ] Rewrite `storeIndexedData()` in `storage.ts` to use SQLite batch operations
- [ ] Add LOCAL/CLOUD tier guards using `isLocalMode()` type guard
- [ ] Add comprehensive tests using `:memory:` databases (antimocking)

## Implementation Steps

### Step 1: Add Local Mode Type Guard to queries.ts

**Files**: `app/src/api/queries.ts`

**Changes**:
```typescript
import { isLocalMode } from '@db/sqlite/config.js';
import { getDb } from '@db/sqlite/client.js';
```

**Justification**: Establish pattern for tier-based routing.

---

### Step 2: Migrate searchFiles() to SQLite FTS5

**Files**: `app/src/api/queries.ts` (line 325)

**Changes**:
```typescript
export async function searchFiles(
  repositoryId: string,
  query: string,
  limit = 50
): Promise<FileSearchResult[]> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      SELECT
        f.id,
        f.path,
        f.content,
        snippet(files_fts, 2, '<mark>', '</mark>', '...', 32) as snippet,
        f.indexed_at,
        f.size_bytes,
        f.language
      FROM files_fts fts
      JOIN files f ON fts.rowid = f.id
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    return db.query<FileSearchResult>(sql, [query, limit]);
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase.rpc('search_files_fts', {
    p_repository_id: repositoryId,
    p_query: query,
    p_limit: limit
  });
  if (error) throw error;
  return data;
}
```

**Test Case**: Search for "export function" in indexed files, verify snippet extraction.

---

### Step 3: Migrate listRecentFiles() to SQLite

**Files**: `app/src/api/queries.ts` (line 391)

**Changes**:
```typescript
export async function listRecentFiles(
  repositoryId: string,
  limit = 100
): Promise<RecentFile[]> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      SELECT
        id,
        path,
        language,
        size_bytes,
        indexed_at,
        content_hash
      FROM files
      WHERE repository_id = ?
      ORDER BY indexed_at DESC
      LIMIT ?
    `;
    return db.query<RecentFile>(sql, [repositoryId, limit]);
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase
    .from('indexed_files')
    .select('*')
    .eq('repository_id', repositoryId)
    .order('indexed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
```

**Test Case**: Index 50 files, verify most recent 10 returned in correct order.

---

### Step 4: Migrate saveIndexedFiles() to SQLite Batch Inserts

**Files**: `app/src/api/queries.ts` (line 111)

**Changes**:
```typescript
export async function saveIndexedFiles(
  files: IndexedFile[]
): Promise<void> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      INSERT OR REPLACE INTO files (
        id, repository_id, path, language, content,
        size_bytes, content_hash, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.transaction(() => {
      const stmt = db.prepare(sql);
      for (const file of files) {
        stmt.run([
          file.id,
          file.repository_id,
          file.path,
          file.language,
          file.content,
          file.size_bytes,
          file.content_hash,
          file.indexed_at || new Date().toISOString()
        ]);
      }
    });
    return;
  }

  // Cloud tier - existing Supabase logic
  const { error } = await supabase
    .from('indexed_files')
    .upsert(files);
  if (error) throw error;
}
```

**Test Case**: Insert 100 files in single transaction, verify atomicity.

---

### Step 5: Migrate storeSymbols() to SQLite

**Files**: `app/src/api/queries.ts` (line 155)

**Changes**:
```typescript
export async function storeSymbols(
  symbols: Symbol[]
): Promise<void> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      INSERT OR REPLACE INTO symbols (
        id, file_id, name, kind, start_line, end_line,
        start_column, end_column, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.transaction(() => {
      const stmt = db.prepare(sql);
      for (const symbol of symbols) {
        stmt.run([
          symbol.id,
          symbol.file_id,
          symbol.name,
          symbol.kind,
          symbol.start_line,
          symbol.end_line,
          symbol.start_column,
          symbol.end_column,
          JSON.stringify(symbol.metadata || {})
        ]);
      }
    });
    return;
  }

  // Cloud tier - existing Supabase logic
  const { error } = await supabase
    .from('symbols')
    .upsert(symbols);
  if (error) throw error;
}
```

**Test Case**: Store 500 symbols, verify JSON metadata roundtrip.

---

### Step 6: Migrate storeReferences() to SQLite

**Files**: `app/src/api/queries.ts` (line 203)

**Changes**:
```typescript
export async function storeReferences(
  references: Reference[]
): Promise<void> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      INSERT OR REPLACE INTO references (
        id, symbol_id, file_id, line, column, context
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.transaction(() => {
      const stmt = db.prepare(sql);
      for (const ref of references) {
        stmt.run([
          ref.id,
          ref.symbol_id,
          ref.file_id,
          ref.line,
          ref.column,
          ref.context
        ]);
      }
    });
    return;
  }

  // Cloud tier - existing Supabase logic
  const { error } = await supabase
    .from('references')
    .upsert(references);
  if (error) throw error;
}
```

**Test Case**: Store cross-file references, verify context preservation.

---

### Step 7: Migrate storeDependencies() to SQLite

**Files**: `app/src/api/queries.ts` (line 275)

**Changes**:
```typescript
export async function storeDependencies(
  dependencies: Dependency[]
): Promise<void> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      INSERT OR REPLACE INTO dependencies (
        id, source_file_id, target_file_id, import_type, metadata
      ) VALUES (?, ?, ?, ?, ?)
    `;

    db.transaction(() => {
      const stmt = db.prepare(sql);
      for (const dep of dependencies) {
        stmt.run([
          dep.id,
          dep.source_file_id,
          dep.target_file_id,
          dep.import_type,
          JSON.stringify(dep.metadata || {})
        ]);
      }
    });
    return;
  }

  // Cloud tier - existing Supabase logic
  const { error } = await supabase
    .from('dependencies')
    .upsert(dependencies);
  if (error) throw error;
}
```

**Test Case**: Create circular dependency graph, verify insertion.

---

### Step 8: Migrate queryDependents() to SQLite Recursive CTE

**Files**: `app/src/api/queries.ts` (line 910)

**Changes**:
```typescript
export async function queryDependents(
  fileId: string,
  depth = 10
): Promise<DependencyNode[]> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      WITH RECURSIVE dependents(file_id, level) AS (
        SELECT source_file_id, 1
        FROM dependencies
        WHERE target_file_id = ?

        UNION ALL

        SELECT d.source_file_id, dep.level + 1
        FROM dependencies d
        JOIN dependents dep ON d.target_file_id = dep.file_id
        WHERE dep.level < ?
      )
      SELECT DISTINCT
        f.id,
        f.path,
        d.level
      FROM dependents d
      JOIN files f ON d.file_id = f.id
      ORDER BY d.level, f.path
    `;
    return db.query<DependencyNode>(sql, [fileId, depth]);
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase.rpc('query_dependents', {
    p_file_id: fileId,
    p_depth: depth
  });
  if (error) throw error;
  return data;
}
```

**Test Case**: Create 3-level dependency tree, verify all dependents returned.

---

### Step 9: Migrate queryDependencies() to SQLite Recursive CTE

**Files**: `app/src/api/queries.ts` (line 1009)

**Changes**:
```typescript
export async function queryDependencies(
  fileId: string,
  depth = 10
): Promise<DependencyNode[]> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      WITH RECURSIVE dependencies_tree(file_id, level) AS (
        SELECT target_file_id, 1
        FROM dependencies
        WHERE source_file_id = ?

        UNION ALL

        SELECT d.target_file_id, dt.level + 1
        FROM dependencies d
        JOIN dependencies_tree dt ON d.source_file_id = dt.file_id
        WHERE dt.level < ?
      )
      SELECT DISTINCT
        f.id,
        f.path,
        dt.level
      FROM dependencies_tree dt
      JOIN files f ON dt.file_id = f.id
      ORDER BY dt.level, f.path
    `;
    return db.query<DependencyNode>(sql, [fileId, depth]);
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase.rpc('query_dependencies', {
    p_file_id: fileId,
    p_depth: depth
  });
  if (error) throw error;
  return data;
}
```

**Test Case**: Create diamond dependency pattern, verify no duplicates.

---

### Step 10: Migrate resolveFilePath() to SQLite

**Files**: `app/src/api/queries.ts` (line 823)

**Changes**:
```typescript
export async function resolveFilePath(
  repositoryId: string,
  path: string
): Promise<string | null> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      SELECT id
      FROM files
      WHERE repository_id = ? AND path = ?
      LIMIT 1
    `;
    const result = db.queryOne<{ id: string }>(sql, [repositoryId, path]);
    return result?.id || null;
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase
    .from('indexed_files')
    .select('id')
    .eq('repository_id', repositoryId)
    .eq('path', path)
    .single();
  if (error) return null;
  return data.id;
}
```

**Test Case**: Resolve absolute and relative paths.

---

### Step 11: Migrate getIndexJobStatus() to SQLite

**Files**: `app/src/api/queries.ts` (line 880)

**Changes**:
```typescript
export async function getIndexJobStatus(
  jobId: string
): Promise<IndexJobStatus | null> {
  if (isLocalMode()) {
    const db = getDb();
    const sql = `
      SELECT
        id,
        repository_id,
        status,
        files_indexed,
        total_files,
        started_at,
        completed_at,
        error_message
      FROM index_jobs
      WHERE id = ?
    `;
    return db.queryOne<IndexJobStatus>(sql, [jobId]);
  }

  // Cloud tier - existing Supabase logic
  const { data, error } = await supabase
    .from('index_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (error) return null;
  return data;
}
```

**Test Case**: Track job progress from 0% to 100%.

---

### Step 12: Rewrite storeIndexedData() in storage.ts

**Files**: `app/src/indexer/storage.ts` (entire file rewrite)

**Changes**:
```typescript
import { isLocalMode } from '@db/sqlite/config.js';
import { getDb } from '@db/sqlite/client.js';
import {
  saveIndexedFiles,
  storeSymbols,
  storeReferences,
  storeDependencies
} from '@api/queries.js';
import type { IndexedData } from '@indexer/types.js';

export async function storeIndexedData(data: IndexedData): Promise<void> {
  if (isLocalMode()) {
    const db = getDb();

    // Single transaction for all operations
    db.transaction(() => {
      // Store files
      if (data.files.length > 0) {
        const fileStmt = db.prepare(`
          INSERT OR REPLACE INTO files (
            id, repository_id, path, language, content,
            size_bytes, content_hash, indexed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const file of data.files) {
          fileStmt.run([
            file.id,
            file.repository_id,
            file.path,
            file.language,
            file.content,
            file.size_bytes,
            file.content_hash,
            file.indexed_at || new Date().toISOString()
          ]);
        }
      }

      // Store symbols
      if (data.symbols.length > 0) {
        const symbolStmt = db.prepare(`
          INSERT OR REPLACE INTO symbols (
            id, file_id, name, kind, start_line, end_line,
            start_column, end_column, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const symbol of data.symbols) {
          symbolStmt.run([
            symbol.id,
            symbol.file_id,
            symbol.name,
            symbol.kind,
            symbol.start_line,
            symbol.end_line,
            symbol.start_column,
            symbol.end_column,
            JSON.stringify(symbol.metadata || {})
          ]);
        }
      }

      // Store references
      if (data.references.length > 0) {
        const refStmt = db.prepare(`
          INSERT OR REPLACE INTO references (
            id, symbol_id, file_id, line, column, context
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const ref of data.references) {
          refStmt.run([
            ref.id,
            ref.symbol_id,
            ref.file_id,
            ref.line,
            ref.column,
            ref.context
          ]);
        }
      }

      // Store dependencies
      if (data.dependencies.length > 0) {
        const depStmt = db.prepare(`
          INSERT OR REPLACE INTO dependencies (
            id, source_file_id, target_file_id, import_type, metadata
          ) VALUES (?, ?, ?, ?, ?)
        `);

        for (const dep of data.dependencies) {
          depStmt.run([
            dep.id,
            dep.source_file_id,
            dep.target_file_id,
            dep.import_type,
            JSON.stringify(dep.metadata || {})
          ]);
        }
      }
    });

    process.stdout.write(
      `Stored ${data.files.length} files, ${data.symbols.length} symbols, ` +
      `${data.references.length} references, ${data.dependencies.length} dependencies\n`
    );
    return;
  }

  // Cloud tier - use existing query functions
  await Promise.all([
    saveIndexedFiles(data.files),
    storeSymbols(data.symbols),
    storeReferences(data.references),
    storeDependencies(data.dependencies)
  ]);
}
```

**Test Case**: Index entire repository, verify single transaction commits all data.

---

### Step 13: Add Comprehensive Tests

**Files**: `app/src/api/__tests__/queries-sqlite.test.ts` (new file)

**Changes**:
```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb, getDb } from '@db/sqlite/client.js';
import { setLocalMode } from '@db/sqlite/config.js';
import {
  searchFiles,
  listRecentFiles,
  saveIndexedFiles,
  storeSymbols,
  queryDependents,
  queryDependencies
} from '@api/queries.js';

describe('SQLite Query Layer', () => {
  beforeEach(() => {
    initDb(':memory:');
    setLocalMode(true);
  });

  afterEach(() => {
    closeDb();
    setLocalMode(false);
  });

  test('searchFiles uses FTS5', async () => {
    // Setup: Index sample files
    await saveIndexedFiles([
      {
        id: '1',
        repository_id: 'repo1',
        path: 'src/utils.ts',
        language: 'typescript',
        content: 'export function calculateTotal() { return 42; }',
        size_bytes: 50,
        content_hash: 'abc123',
        indexed_at: new Date().toISOString()
      }
    ]);

    // Test: Search for "export function"
    const results = await searchFiles('repo1', 'export function', 10);

    expect(results.length).toBe(1);
    expect(results[0].path).toBe('src/utils.ts');
    expect(results[0].snippet).toContain('<mark>export function</mark>');
  });

  test('queryDependents returns recursive dependents', async () => {
    // Setup: Create dependency chain A → B → C
    const files = [
      { id: 'A', path: 'a.ts', repository_id: 'repo1' },
      { id: 'B', path: 'b.ts', repository_id: 'repo1' },
      { id: 'C', path: 'c.ts', repository_id: 'repo1' }
    ];
    await saveIndexedFiles(files.map(f => ({
      ...f,
      language: 'typescript',
      content: '',
      size_bytes: 0,
      content_hash: '',
      indexed_at: new Date().toISOString()
    })));

    await storeDependencies([
      { id: 'd1', source_file_id: 'B', target_file_id: 'A', import_type: 'esm' },
      { id: 'd2', source_file_id: 'C', target_file_id: 'B', import_type: 'esm' }
    ]);

    // Test: Query dependents of A
    const dependents = await queryDependents('A', 10);

    expect(dependents.length).toBe(2);
    expect(dependents.map(d => d.path)).toContain('b.ts');
    expect(dependents.map(d => d.path)).toContain('c.ts');
  });

  // Additional tests for each migrated function...
});
```

**Test Coverage**:
- FTS5 search with snippets
- Batch inserts with transactions
- Recursive CTE dependency queries
- Path resolution
- Job status tracking

---

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/src/api/queries.ts` | modify | Add `isLocalMode()` guards to 10 functions, implement SQLite queries |
| `app/src/indexer/storage.ts` | rewrite | Replace Supabase RPC with SQLite batch inserts in single transaction |
| `app/src/api/__tests__/queries-sqlite.test.ts` | create | Comprehensive tests for all migrated functions using `:memory:` databases |

## Files to Create

| File | Purpose |
|------|---------|
| `app/src/api/__tests__/queries-sqlite.test.ts` | Test suite for SQLite query layer with antimocking pattern |

## Testing Strategy

**Validation Level**: 3 (Comprehensive)

**Justification**: Query layer is critical infrastructure affecting all code intelligence features. Requires full integration testing with real SQLite databases.

### Test Cases

- [ ] **FTS5 Search**: Index files with code patterns, search for keywords, verify snippet extraction
- [ ] **Batch Insert Performance**: Insert 1000 files in single transaction, measure time < 100ms
- [ ] **Recursive Dependencies**: Create 5-level dependency tree, verify all levels returned
- [ ] **Circular Dependencies**: Create A → B → C → A cycle, verify no infinite loops
- [ ] **Transaction Atomicity**: Fail mid-batch, verify rollback leaves database unchanged
- [ ] **JSON Metadata Roundtrip**: Store symbols with complex metadata, verify exact retrieval
- [ ] **Path Resolution**: Test absolute paths, relative paths, and non-existent paths
- [ ] **Job Status Tracking**: Create job, update progress, verify final status

### Test Files

- `app/src/api/__tests__/queries-sqlite.test.ts`: All migrated query functions
- `app/src/indexer/__tests__/storage-sqlite.test.ts`: Batch storage integration tests

## Convention Checklist

- [ ] Path aliases used for all imports (`@api/*`, `@db/*`, `@indexer/*`)
- [ ] Logging via `process.stdout.write()` (no `console.*`)
- [ ] Tests use real SQLite `:memory:` databases (antimocking)
- [ ] Imports use `.js` extension for ESM compatibility
- [ ] Type-safe queries with `db.query<T>()` and `db.queryOne<T>()`
- [ ] All batch operations wrapped in `db.transaction()`
- [ ] Local mode type guard pattern: `if (isLocalMode()) { ... }`

## Dependencies

**Depends on**:
- #532 (Phase 1A): SQLite client infrastructure
- #538 (Phase 1B): SQLite schema with FTS5
- #540 (Phase 2A): Local mode detection

**Depended on by**:
- Phase 3: CLI integration
- Phase 4: Performance benchmarking

## Risks

- **FTS5 Query Compatibility**: SQLite FTS5 syntax differs from Postgres `ts_vector`
  - *Mitigation*: Test all search queries with real-world patterns

- **Transaction Performance**: Large batch inserts may block
  - *Mitigation*: Benchmark with 10k+ files, consider chunking if > 200ms

- **Recursive CTE Depth**: Deep dependency trees may hit SQLite limits
  - *Mitigation*: Set max depth = 100, document in API

## Acceptance Criteria

✅ All 10 query functions route to SQLite when `KOTA_LOCAL_MODE=true`
✅ All tests pass with `:memory:` databases (no Supabase required)
✅ FTS5 search returns results with highlighted snippets
✅ Recursive dependency queries handle cycles without infinite loops
✅ Batch inserts commit atomically in single transaction
✅ Zero `console.*` calls (only `process.stdout.write()`)
✅ Type safety maintained with `db.query<T>()` pattern
✅ Cloud tier functions unchanged and still functional

## Notes

- **Performance Target**: Batch insert 1000 files < 100ms
- **Search Syntax**: FTS5 uses `MATCH` instead of `@@` (Postgres)
- **CTE Depth**: Default max depth = 10 for recursive queries
- **Transaction Isolation**: SQLite uses `DEFERRED` by default
