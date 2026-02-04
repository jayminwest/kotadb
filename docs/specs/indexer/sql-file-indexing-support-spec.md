# SQL File Indexing Support Specification

## Overview

**Issue**: GitHub #154 - Add SQL file indexing support
**Domain**: Indexer
**Priority**: Low
**Effort**: Small
**Impact**: Improved search consistency and semantic discovery of SQL schema definitions

### Problem Statement

SQL schema files (`.sql`) are currently not indexed by KotaDB, which creates inconsistent search experiences. Users investigating database schema definitions, table structures, and migration content must fall back to Grep instead of utilizing KotaDB's semantic search capabilities via MCP tools like `search_code`.

**Current Gap**:
- Main schema file: `app/src/db/sqlite-schema.sql`
- Migration files: `app/src/db/migrations/*.sql`
- SQL function definitions: `app/src/db/functions/*.sql`
- These files are invisible to `mcp__kotadb-local-dev__search` and related tools

**User Impact**: When searching for database-related terms like `session_id`, `repositories`, or `workflow_contexts`, users cannot discover the authoritative schema definitions through KotaDB's semantic search, forcing manual Grep searches and reducing the value of the integrated search experience.

## Current State Analysis

### Existing Indexer Support
**File Extensions** (from `app/src/indexer/parsers.ts:10-18`):
```typescript
const SUPPORTED_EXTENSIONS = new Set<string>([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".json"
]);
```

**Architecture Components**:
- `parsers.ts:175` - `isSupportedSource()` function filters by extension
- `ast-parser.ts:31` - AST parsing excludes JSON (data-only)
- `symbol-extractor.ts` - Visitor pattern for TypeScript/JavaScript symbols
- `storage.ts` - SQLite storage with FTS5 full-text search

### SQL Files in Repository
**Schema Files**:
- `/app/src/db/sqlite-schema.sql` (470 lines) - Main schema with tables, indexes, triggers
- `/app/src/db/schema.sql` - Legacy/alternative schema file

**Migration Files**:
- `/app/src/db/migrations/004_memory_layer.sql` - Memory layer tables
- `/app/src/db/migrations/005_workflow_contexts.sql` - Workflow context storage

**Function Files**:
- `/app/src/db/functions/increment_rate_limit.sql`
- `/app/src/db/functions/increment_rate_limit_daily.sql`

### SQL Content Analysis
**Indexable Elements in SQL Files**:
1. **Tables**: `CREATE TABLE repositories`, `CREATE TABLE indexed_files`
2. **Columns**: `id TEXT PRIMARY KEY`, `session_id TEXT`
3. **Indexes**: `CREATE INDEX idx_repositories_full_name`
4. **Triggers**: `CREATE TRIGGER indexed_files_fts_ai`
5. **Views**: `CREATE VIEW` (if present)
6. **Functions**: `CREATE TRIGGER`, custom SQL functions
7. **Comments**: `-- Migration: 005_workflow_contexts`

**Search Value**:
- **Schema Discovery**: Find table definitions by name
- **Column Tracking**: Locate all uses of specific column names
- **Migration History**: Search migration files for specific changes
- **Comment Content**: Access migration descriptions and context

## Technical Requirements

### 1. File Extension Support

**Goal**: Extend indexer to recognize and process `.sql` files.

**Implementation**:
```typescript
// app/src/indexer/parsers.ts
const SUPPORTED_EXTENSIONS = new Set<string>([
  ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".json", ".sql"
]);
```

**Integration Points**:
- `parsers.ts:175` - Update `isSupportedSource()` to include `.sql`
- `constants.ts:21` - Add `.sql` to `SUPPORTED_EXTENSIONS` array
- Maintain consistency between both extension lists

### 2. SQL Content Processing

**Goal**: Process SQL files as structured text content without AST parsing.

**Approach: Simple Content Indexing** (Recommended)
- Treat SQL files similar to JSON files (content-only, no AST)
- Store full content in `indexed_files.content` for FTS5 search
- Skip symbol extraction (no visitor pattern needed)
- Leverage existing FTS5 infrastructure for text search

**Implementation Path**:
```typescript
// app/src/indexer/parsers.ts:131-173
export async function parseSourceFile(path: string, projectRoot: string): Promise<IndexedFile | null> {
  if (!isSupportedSource(path)) return null;

  const content = await readFile(path, "utf8");

  // Skip dependency extraction for SQL files
  const dependencies = extname(path) === ".sql" ? [] : extractDependencies(content);

  return {
    projectRoot: resolve(projectRoot),
    path: path.replace(resolve(projectRoot) + "/", ""),
    content,
    dependencies,
    indexedAt: new Date(),
  };
}
```

**Advantages**:
- Minimal code changes required
- Reuses existing FTS5 full-text search infrastructure
- Enables `mcp__kotadb-local-dev__search` to find SQL content immediately
- No complex SQL parsing required
- Consistent with JSON file handling approach

### 3. Enhanced SQL Symbol Extraction (Stretch Goal)

**Goal**: Extract SQL schema elements as searchable symbols.

**Implementation Strategy**:
```typescript
// New: app/src/indexer/sql-symbol-extractor.ts
export interface SQLSymbol extends Symbol {
  sqlType: 'table' | 'column' | 'index' | 'trigger' | 'view' | 'function';
  tableName?: string; // For columns, indexes, triggers
  dataType?: string;  // For columns
}

export function extractSQLSymbols(content: string, filePath: string): SQLSymbol[] {
  const symbols: SQLSymbol[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Table extraction: CREATE TABLE table_name
    const tableMatch = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    if (tableMatch) {
      symbols.push({
        name: tableMatch[1],
        kind: 'table' as SymbolKind,
        sqlType: 'table',
        lineStart: i + 1,
        lineEnd: findTableEnd(lines, i),
        // ... other Symbol properties
      });
    }

    // Column extraction within CREATE TABLE blocks
    // Index extraction: CREATE INDEX
    // Trigger extraction: CREATE TRIGGER
  }

  return symbols;
}
```

**Database Schema Updates**:
```sql
-- Extend indexed_symbols.metadata to include SQL-specific information
-- Example metadata JSON:
-- {
--   "sql_type": "table",
--   "table_name": "repositories",
--   "data_type": "TEXT",
--   "constraints": ["PRIMARY KEY", "NOT NULL"]
-- }
```

**Benefits**:
- Enables symbol-level search for SQL schema elements
- Supports navigation to specific table/column definitions
- Provides structured access to database schema through MCP tools

**Complexity Considerations**:
- Requires SQL parsing logic (regex-based or proper parser)
- More complex error handling for malformed SQL
- Additional testing for SQL syntax variations
- Increased maintenance overhead

### 4. MCP Tool Integration

**Goal**: Ensure SQL file content is discoverable through existing MCP tools.

**Primary Integration**: `mcp__kotadb-local-dev__search`
- SQL file content automatically included in FTS5 search results
- No additional MCP tool changes required
- Existing search ranking and snippet extraction works

**Secondary Integration**: `mcp__kotadb-local-dev__list_recent_files`
- SQL files appear in recent file listings
- Supports discovery workflow for schema changes

**Validation Approach**:
```bash
# Test search functionality after implementation
cd app && bun run src/index.ts &
# Query via MCP: search for "session_id" should return SQL file hits
# Query via MCP: list_recent_files should include .sql files
```

## Implementation Plan

### Phase 1: Basic SQL File Indexing (Core Requirement)

**Objective**: Enable SQL files to be indexed as content-only, making them discoverable via `search_code`.

**Tasks**:
1. **Update File Extension Support**
   ```typescript
   // app/src/indexer/parsers.ts:10-18
   const SUPPORTED_EXTENSIONS = new Set<string>([
     ".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs", ".json", ".sql"
   ]);

   // app/src/indexer/constants.ts:21-28
   export const SUPPORTED_EXTENSIONS = [
     ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql"
   ] as const;
   ```

2. **Modify Dependency Extraction Logic**
   ```typescript
   // app/src/indexer/parsers.ts:164
   const dependencies = extname(path) === ".sql" ? [] : extractDependencies(content);
   ```

3. **Update AST Parser Extension Filter**
   ```typescript
   // app/src/indexer/ast-parser.ts:31
   const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"] as const;
   // Note: Keep .sql OUT of AST parsing (content-only like JSON)
   ```

4. **Test SQL File Discovery**
   - Index a repository containing SQL files
   - Verify `indexed_files` table contains SQL file entries
   - Validate FTS5 search finds SQL content
   - Test MCP `search_code` tool returns SQL results

**Expected Outcome**:
- SQL files indexed as content with empty dependency arrays
- Full-text search operational via existing FTS5 infrastructure
- MCP tools can discover SQL file content
- Zero breaking changes to existing indexer functionality

### Phase 2: SQL Symbol Extraction (Stretch Goal)

**Objective**: Extract SQL schema elements (tables, columns, indexes) as searchable symbols.

**Prerequisites**: Phase 1 complete and validated

**Tasks**:
1. **Create SQL Symbol Extractor**
   - New module: `app/src/indexer/sql-symbol-extractor.ts`
   - Implement regex-based extraction for common SQL patterns
   - Support CREATE TABLE, CREATE INDEX, CREATE TRIGGER patterns
   - Extract column names and data types from table definitions

2. **Integrate with Main Symbol Extraction**
   ```typescript
   // app/src/indexer/symbol-extractor.ts - Update main entry point
   export async function extractSymbolsFromFile(content: string, filePath: string): Promise<Symbol[]> {
     const ext = extname(filePath);

     if (ext === ".sql") {
       return extractSQLSymbols(content, filePath);
     }

     // Existing AST-based extraction for TS/JS files
     const ast = parseFileContent(content, filePath);
     if (!ast) return [];
     return extractSymbolsFromAST(ast);
   }
   ```

3. **Extend Database Schema**
   - Add SQL-specific metadata fields to `indexed_symbols.metadata`
   - Document JSON schema for SQL symbol metadata
   - Update storage functions to handle SQL symbol types

4. **Testing and Validation**
   - Unit tests for SQL pattern recognition
   - Integration tests with actual schema files
   - Validation of symbol searchability through MCP tools

### Phase 3: Advanced SQL Analysis (Future Enhancement)

**Objective**: Comprehensive SQL analysis including relationships and dependencies.

**Scope**:
- Foreign key relationship extraction
- Column references across multiple tables
- Migration dependency tracking
- SQL function call analysis

**Implementation Timeline**: Future release, dependent on user demand

## Success Criteria

### Primary Goals (Phase 1)
- [ ] `.sql` files are recognized and indexed by `discoverSources()`
- [ ] SQL file content is stored in `indexed_files` table
- [ ] FTS5 search includes SQL file content in results
- [ ] `mcp__kotadb-local-dev__search` returns SQL file matches
- [ ] `mcp__kotadb-local-dev__list_recent_files` includes SQL files
- [ ] No regression in existing TypeScript/JavaScript indexing

### Validation Tests
- [ ] Search for "session_id" returns hits from `sqlite-schema.sql`
- [ ] Search for "workflow_contexts" returns migration file content
- [ ] Search for "CREATE TABLE" returns multiple schema files
- [ ] SQL files appear in recent files listing
- [ ] Existing test suite passes without modification

### Quality Metrics
- [ ] Zero breaking changes to existing indexer API
- [ ] SQL file indexing performance < 50ms per file
- [ ] Memory usage increase < 10% for mixed repositories
- [ ] Code coverage maintained at 90%+ for indexer module

### Secondary Goals (Phase 2)
- [ ] SQL tables extracted as symbols with `kind: 'table'`
- [ ] Column names extractable through symbol search
- [ ] Index definitions discoverable as symbols
- [ ] Migration comments included in symbol metadata

## Risk Assessment

### Low Risk
- **Extension Addition**: Adding `.sql` to supported extensions is minimally invasive
- **Content Indexing**: Reuses proven FTS5 infrastructure without modification
- **Backward Compatibility**: No changes to existing file processing logic

### Medium Risk
- **Performance Impact**: Additional file processing may slow repository indexing
- **Storage Growth**: SQL content increases database size
- **Search Relevance**: SQL results may dilute TypeScript/JavaScript search quality

### Mitigation Strategies
- **Performance**: Profile indexing time with large SQL files
- **Storage**: Monitor database growth and implement cleanup if needed
- **Relevance**: Consider file-type filtering in MCP search tools
- **Testing**: Comprehensive test coverage for SQL file edge cases

## Implementation Details

### File Structure
```
app/src/indexer/
├── parsers.ts              # ✓ Update SUPPORTED_EXTENSIONS
├── constants.ts            # ✓ Update extension constants
├── ast-parser.ts          # ✗ Keep SQL files excluded from AST parsing
├── symbol-extractor.ts    # ○ Optional: Add SQL symbol extraction entry point
└── sql-symbol-extractor.ts # ○ Optional: New module for SQL analysis
```

### TypeScript Interfaces
```typescript
// Extend existing Symbol interface for SQL (Phase 2)
export interface SQLSymbol extends Symbol {
  sqlType: 'table' | 'column' | 'index' | 'trigger' | 'view' | 'function';
  tableName?: string;  // For columns, indexes referencing tables
  dataType?: string;   // For column definitions
  constraints?: string[]; // PRIMARY KEY, NOT NULL, etc.
}

// SQL-specific metadata structure
interface SQLMetadata {
  sql_type: 'table' | 'column' | 'index' | 'trigger';
  table_name?: string;
  data_type?: string;
  constraints?: string[];
  migration_name?: string; // For migration file symbols
}
```

### Error Handling Strategy
```typescript
// Graceful handling of SQL parsing errors (Phase 2)
export function extractSQLSymbols(content: string, filePath: string): SQLSymbol[] {
  try {
    return parseSQLContent(content);
  } catch (error) {
    logger.warn("Failed to extract SQL symbols", {
      file_path: filePath,
      error_message: error instanceof Error ? error.message : String(error)
    });
    return []; // Graceful failure - return empty symbols array
  }
}
```

### Testing Approach
```typescript
// Test cases for SQL file indexing
describe("SQL File Indexing", () => {
  test("should index SQL files as content-only", async () => {
    const sqlFile = await parseSourceFile("/path/to/schema.sql", "/project");
    expect(sqlFile).toMatchObject({
      path: "schema.sql",
      content: expect.stringContaining("CREATE TABLE"),
      dependencies: [] // No dependencies for SQL files
    });
  });

  test("should make SQL content searchable via FTS5", async () => {
    // Index SQL file
    await indexRepository("/test/repo");

    // Search should find SQL content
    const results = await searchCode("session_id");
    expect(results.some(r => r.path.endsWith(".sql"))).toBe(true);
  });

  test("should not attempt AST parsing on SQL files", async () => {
    const sqlContent = "CREATE TABLE test (id INTEGER);";
    const ast = parseFileContent(sqlContent, "test.sql");
    expect(ast).toBeNull(); // SQL excluded from AST parsing
  });
});
```

## Files to Modify

### Core Changes (Phase 1)
- **`app/src/indexer/parsers.ts`** - Add `.sql` to `SUPPORTED_EXTENSIONS`, modify dependency extraction logic
- **`app/src/indexer/constants.ts`** - Add `.sql` to extension constants array
- **`app/tests/indexer/parsers.test.ts`** - Add test cases for SQL file processing

### Optional Changes (Phase 2)
- **`app/src/indexer/sql-symbol-extractor.ts`** - New module for SQL symbol extraction
- **`app/src/indexer/symbol-extractor.ts`** - Add SQL file routing logic
- **`app/tests/indexer/sql-symbol-extractor.test.ts`** - Test suite for SQL symbol extraction

### Documentation Updates
- Update indexer module documentation with SQL file support
- Add examples of SQL file search capabilities to MCP tool documentation
- Include SQL indexing in repository setup guides

## Validation Steps

### Pre-Implementation
- [ ] Backup current database and test repository
- [ ] Profile indexing performance baseline
- [ ] Document current search behavior for comparison

### During Implementation
- [ ] Unit test each change incrementally
- [ ] Verify no TypeScript compilation errors
- [ ] Run existing test suite after each modification
- [ ] Test with sample SQL files throughout development

### Post-Implementation
- [ ] Full indexer test suite execution
- [ ] Integration testing with MCP tools
- [ ] Performance comparison with baseline
- [ ] Search quality evaluation with real SQL files
- [ ] Database size impact analysis

## Rollback Strategy

**Risk Mitigation**: All changes are additive and non-breaking.

**Rollback Steps** (if needed):
1. Revert `.sql` from `SUPPORTED_EXTENSIONS` arrays
2. Remove SQL-specific logic from `parseSourceFile()`
3. Clean up any SQL entries from `indexed_files` table
4. Restore original test suite

**Recovery Time**: < 15 minutes due to minimal invasive changes.

## Future Enhancements

### Advanced SQL Analysis
- **Table Relationship Mapping**: Extract foreign key relationships
- **Column Usage Tracking**: Find all references to specific columns across migrations
- **Schema Evolution**: Track how table structures change across migrations
- **Query Analysis**: Parse SELECT/INSERT/UPDATE statements for column usage

### Migration-Specific Features
- **Dependency Ordering**: Understand migration sequence requirements
- **Rollback Analysis**: Identify reversible vs irreversible migrations
- **Change Impact**: Assess which tables are affected by specific migrations

### Integration Enhancements
- **Schema Visualization**: Generate ERD from indexed SQL schema
- **Documentation Extraction**: Extract comments and metadata from SQL files
- **Validation**: Verify schema consistency across migration files

---

**Specification Author**: Indexer Plan Agent
**Created**: 2026-02-04
**Status**: Implementation Ready
**Review Required**: No (Low effort, minimal risk)