# Phase 2C - Dependency Graph SQLite Migration

**Issue**: #547
**Type**: feature
**Created**: 2025-12-15

## Summary

Migrate dependency graph functionality to SQLite for local-first architecture. This adds the `dependency_graph` table to SQLite schema and implements local versions of three dependency-related functions, enabling full dependency tracking and traversal in local mode without Supabase.

## Requirements

- [ ] Add `dependency_graph` table to SQLite schema with PostgreSQL parity
- [ ] Implement `storeDependenciesLocal()` for batch inserts
- [ ] Implement `queryDependentsLocal()` with recursive CTE traversal
- [ ] Implement `queryDependenciesLocal()` with recursive CTE traversal
- [ ] Add local mode guards to public API functions
- [ ] Create comprehensive test suite with in-memory database
- [ ] Ensure cycle detection via path tracking in recursive queries

## Implementation Steps

### Step 1: Update SQLite Schema
**Files**: `app/src/db/sqlite-schema.sql`
**Changes**:
- Add `dependency_graph` table matching PostgreSQL structure:
  - Columns: id (INTEGER PRIMARY KEY), repository_id, from_file_id, to_file_id, from_symbol_id, to_symbol_id, dependency_type ('file_import' | 'symbol_usage'), metadata (TEXT as JSON), created_at
  - CHECK constraint: `(from_file_id IS NOT NULL OR from_symbol_id IS NOT NULL) AND (to_file_id IS NOT NULL OR to_symbol_id IS NOT NULL)`
- Create 8 indexes matching PostgreSQL:
  - idx_dependency_graph_repository_id
  - idx_dependency_graph_from_file_id
  - idx_dependency_graph_to_file_id
  - idx_dependency_graph_from_symbol_id
  - idx_dependency_graph_to_symbol_id
  - idx_dependency_graph_dependency_type
  - idx_dependency_graph_from_file_to_file
  - idx_dependency_graph_composite

### Step 2: Implement storeDependenciesLocal()
**Files**: `app/src/api/queries-local.ts`
**Changes**:
- Add function signature matching PostgreSQL version
- Accept array of dependency objects with fields: repository_id, from_file_id, to_file_id, from_symbol_id, to_symbol_id, dependency_type, metadata
- Use `db.transaction()` for atomic batch insert
- Use prepared statement for efficiency
- Serialize metadata JSON before insert
- Return void (matches PostgreSQL version)

### Step 3: Implement queryDependentsLocal()
**Files**: `app/src/api/queries-local.ts`
**Changes**:
- Add function with parameters: db, repository_id, file_id, symbol_id (optional), depth (default 5)
- Implement recursive CTE for traversal:
  - Base case: direct dependents where to_file_id/to_symbol_id match
  - Recursive case: follow dependency chain up to depth limit
  - Use string concatenation for path tracking (e.g., `'/' || id || '/'`) to detect cycles
  - Check path with `INSTR(path, '/' || id || '/') = 0` for cycle detection
- Join with files/symbols tables for file_path and symbol_name
- Return array of objects: { file_id, file_path, symbol_id, symbol_name, dependency_type, depth }
- Order by depth ASC

### Step 4: Implement queryDependenciesLocal()
**Files**: `app/src/api/queries-local.ts`
**Changes**:
- Add function with parameters: db, repository_id, file_id, symbol_id (optional), depth (default 5)
- Implement recursive CTE for traversal:
  - Base case: direct dependencies where from_file_id/from_symbol_id match
  - Recursive case: follow dependency chain up to depth limit
  - Use same path tracking approach as queryDependentsLocal
- Join with files/symbols tables
- Return same structure as queryDependentsLocal
- Order by depth ASC

### Step 5: Add Local Mode Guards
**Files**: `app/src/api/queries.ts`
**Changes**:
- Update `storeDependencies()`: check isLocalMode, delegate to storeDependenciesLocal() if true
- Update `queryDependents()`: check isLocalMode, delegate to queryDependentsLocal() if true
- Update `queryDependencies()`: check isLocalMode, delegate to queryDependenciesLocal() if true
- Follow existing pattern from other guarded functions (e.g., storeSymbolsLocal)

### Step 6: Create Test Suite
**Files**: `app/src/api/__tests__/queries-sqlite.test.ts`
**Changes**:
- Add `describe('Dependency Graph - Local Mode')` block
- Test `storeDependenciesLocal()`:
  - Batch insert of file-level and symbol-level dependencies
  - Verify inserted data
  - Test transaction rollback on error
- Test `queryDependentsLocal()`:
  - Single-level dependents
  - Multi-level traversal (depth > 1)
  - Cycle detection (A → B → C → A)
  - Symbol-level filtering
  - Depth limit enforcement
- Test `queryDependenciesLocal()`:
  - Single-level dependencies
  - Multi-level traversal
  - Cycle detection
  - Symbol-level filtering
  - Depth limit enforcement
- Use in-memory `:memory:` database
- Inline schema setup in beforeEach
- Follow antimocking principle

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/src/db/sqlite-schema.sql` | modify | Add dependency_graph table and indexes |
| `app/src/api/queries-local.ts` | modify | Add 3 new local functions |
| `app/src/api/queries.ts` | modify | Add local mode guards to 3 functions |
| `app/src/api/__tests__/queries-sqlite.test.ts` | modify | Add comprehensive dependency graph tests |

## Files to Create

None - all changes are modifications to existing files.

## Testing Strategy

**Validation Level**: 2 (New feature with moderate complexity)
**Justification**: Adds new table and functions but follows established patterns. Recursive CTEs require thorough testing but structure is similar to PostgreSQL implementation.

### Test Cases
- [ ] storeDependenciesLocal batch insert succeeds
- [ ] storeDependenciesLocal respects CHECK constraint
- [ ] storeDependenciesLocal transaction atomicity
- [ ] queryDependentsLocal returns direct dependents
- [ ] queryDependentsLocal multi-level traversal (depth 3)
- [ ] queryDependentsLocal cycle detection prevents infinite loop
- [ ] queryDependentsLocal symbol filtering
- [ ] queryDependentsLocal depth limit enforcement
- [ ] queryDependenciesLocal returns direct dependencies
- [ ] queryDependenciesLocal multi-level traversal (depth 3)
- [ ] queryDependenciesLocal cycle detection prevents infinite loop
- [ ] queryDependenciesLocal symbol filtering
- [ ] queryDependenciesLocal depth limit enforcement
- [ ] Public API functions delegate to local versions when isLocalMode = true

### Test Files
- `app/src/api/__tests__/queries-sqlite.test.ts`: Dependency graph local mode tests

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @db/*, etc.)
- [ ] Logging via process.stdout.write (no console.*)
- [ ] Tests use in-memory SQLite database (antimocking)
- [ ] SQLite schema matches PostgreSQL migrations
- [ ] Prepared statements used for efficiency
- [ ] Transactions used for atomic operations

## Dependencies

- Depends on:
  - `app/src/db/sqlite-schema.sql` (files and symbols tables)
  - `app/src/api/queries-local.ts` (KotaDatabase wrapper)
  - PostgreSQL schema: `app/src/db/migrations/20241021000000_add_dependency_graph_table.sql`
- Depended on by:
  - Future MCP tools for dependency analysis
  - Indexer storage layer (`app/src/indexer/storage-local.ts`)

## Risks

- **Recursive CTE Syntax Differences**: SQLite uses different syntax than PostgreSQL for path tracking (string concat vs arrays)
  - **Mitigation**: Use `'/' || id || '/'` pattern and `INSTR()` for cycle detection, validated in tests
- **Performance with Deep Graphs**: Large codebases with deep dependency chains may slow down
  - **Mitigation**: Default depth limit of 5, indexes on all foreign keys, consider adding depth-based query timeout if needed
- **Metadata JSON Serialization**: SQLite stores JSON as TEXT, requires manual serialization
  - **Mitigation**: Use `JSON.stringify()` on insert, `JSON.parse()` on select, wrap in try/catch

## Notes

- `getIndexJobStatus()` remains cloud-only (no local implementation needed per line 938 TODO)
- Follow existing local function patterns: db.transaction(), prepared statements, KotaDatabase wrapper
- Recursive CTE depth tracking: start at 1 for direct relationships, increment per level
- Path tracking prevents cycles: if node ID already in path string, skip to avoid infinite recursion
