# Phase 3 - Sync Layer (JSONL Export + Git Merge Driver)

**Issue**: #541
**Type**: feature
**Status**: complete
**Created**: 2025-12-15
**Dependencies**: #532 (Phase 1A), #538 (Phase 1B), #539 (Phase 2B)

## BLUF (Bottom Line Up Front)

Build sync infrastructure on top of existing JSONL export/import foundation to enable git-based collaboration for local-first SQLite databases. Adds file watcher for automatic import on git pull, custom merge driver for conflict resolution, deletion manifest tracking, and CLI commands.

## Summary

Phase 3 completes the local-first architecture by adding sync capabilities to the existing JSONL export/import infrastructure (already implemented in `jsonl-exporter.ts` and `jsonl-importer.ts`). This enables:

- **Automatic git pull detection**: File watcher triggers import when JSONL files change
- **Conflict-free JSONL merging**: Custom git merge driver using line-based reconciliation
- **Deletion tracking**: Manifest file records removed entities for proper sync
- **CLI integration**: `kota sync export/import` commands for manual control
- **Debounced exports**: Existing 5-second debouncing prevents excessive writes

**What Already Exists**:
- ✅ `JSONLExporter` class with hash-based change detection
- ✅ `importFromJSONL()` with transactional imports
- ✅ Comprehensive tests (`jsonl.test.ts` - 422 lines)
- ✅ Default export directory (`~/.kotadb/export`)
- ✅ Table configurations for 6 local-first tables

**What's New in Phase 3**:
- File watcher for git pull detection
- Custom git merge driver
- Deletion manifest system
- MCP CLI tools registration
- `@sync/*` path alias

## Requirements

- [ ] Add `@sync/*` path alias to `tsconfig.json`
- [ ] Create file watcher for `.kotadb/export/*.jsonl` changes
- [ ] Implement custom git merge driver for JSONL files
- [ ] Build deletion manifest system (track removed entities)
- [ ] Integrate deletion manifest with exporter/importer
- [ ] Register `kota_sync_export` and `kota_sync_import` MCP tools
- [ ] Add comprehensive tests using real SQLite databases
- [ ] Document git merge driver installation for users

## Implementation Steps

### Step 1: Add @sync/* Path Alias

**Files**: `app/tsconfig.json`

**Changes**:
```json
{
  "compilerOptions": {
    "paths": {
      "@sync/*": ["src/sync/*"],
      // ... existing aliases
    }
  }
}
```

**Justification**: Establish module boundary for sync layer, consistent with existing `@db/*`, `@api/*` patterns.

**Test**: Import `@sync/*` modules successfully, verify path resolution.

---

### Step 2: Create File Watcher for Git Pull Detection

**Files**: `app/src/sync/watcher.ts` (new)

**Changes**:
```typescript
/**
 * File watcher for automatic JSONL import on git pull
 * 
 * Watches ~/.kotadb/export/*.jsonl for changes and triggers
 * import when modifications are detected (e.g., after git pull).
 * 
 * Features:
 * - Debounced import (1-second delay to batch rapid changes)
 * - Hash-based change detection (skip unchanged files)
 * - Graceful error handling (log failures, don't crash)
 * 
 * @module @sync/watcher
 */

import { watch, type FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@logging/logger.js";
import { getDefaultExportDir } from "@db/sqlite/jsonl-exporter.js";
import { importFromJSONL } from "@db/sqlite/jsonl-importer.js";
import { getDb } from "@db/sqlite/client.js";
import { applyDeletionManifest } from "@sync/deletion-manifest.js";

const logger = createLogger({ module: "sync-watcher" });

/**
 * Watcher state for debouncing imports
 */
interface WatcherState {
  timer: ReturnType<typeof setTimeout> | null;
  changedFiles: Set<string>;
  lastImportAt: string;
}

/**
 * SyncWatcher - Watches JSONL export directory for changes.
 * 
 * Usage:
 * ```typescript
 * const watcher = new SyncWatcher();
 * watcher.start();
 * 
 * // Later...
 * watcher.stop();
 * ```
 */
export class SyncWatcher {
  private fsWatcher: FSWatcher | null = null;
  private state: WatcherState;
  private readonly exportDir: string;
  private readonly debounceMs: number;

  constructor(
    exportDir: string = getDefaultExportDir(),
    debounceMs: number = 1000
  ) {
    this.exportDir = exportDir;
    this.debounceMs = debounceMs;
    this.state = {
      timer: null,
      changedFiles: new Set(),
      lastImportAt: new Date().toISOString()
    };
  }

  /**
   * Start watching the export directory
   */
  start(): void {
    if (this.fsWatcher) {
      logger.warn("Watcher already started");
      return;
    }

    if (!existsSync(this.exportDir)) {
      logger.error("Export directory not found", { path: this.exportDir });
      throw new Error(`Export directory not found: ${this.exportDir}`);
    }

    this.fsWatcher = watch(
      this.exportDir,
      { recursive: false },
      (eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) {
          return;
        }

        // Skip deletion manifest (handled separately)
        if (filename === ".deletions.jsonl") {
          return;
        }

        logger.debug("File change detected", {
          event: eventType,
          file: filename
        });

        this.state.changedFiles.add(filename);
        this.scheduleImport();
      }
    );

    logger.info("Sync watcher started", {
      export_dir: this.exportDir,
      debounce_ms: this.debounceMs
    });
  }

  /**
   * Stop watching (cleanup)
   */
  stop(): void {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
      this.state.timer = null;
    }

    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
      logger.info("Sync watcher stopped");
    }
  }

  /**
   * Schedule import with debouncing
   */
  private scheduleImport(): void {
    if (this.state.timer) {
      clearTimeout(this.state.timer);
    }

    this.state.timer = setTimeout(() => {
      this.executeImport().catch((error) => {
        logger.error(
          "Scheduled import failed",
          error instanceof Error ? error : new Error(String(error))
        );
      });
    }, this.debounceMs);

    logger.debug("Import scheduled (debounced)", {
      changed_files: Array.from(this.state.changedFiles)
    });
  }

  /**
   * Execute import for all changed files
   */
  private async executeImport(): Promise<void> {
    const changedFiles = Array.from(this.state.changedFiles);
    this.state.changedFiles.clear();

    logger.info("Starting automatic import", {
      files: changedFiles,
      count: changedFiles.length
    });

    const startTime = Date.now();

    try {
      const db = getDb();

      // Import JSONL files
      const result = await importFromJSONL(db, this.exportDir);

      // Apply deletion manifest if present
      const deletionManifestPath = join(this.exportDir, ".deletions.jsonl");
      if (existsSync(deletionManifestPath)) {
        await applyDeletionManifest(db, deletionManifestPath);
      }

      const duration = Date.now() - startTime;

      logger.info("Automatic import completed", {
        tables_imported: result.tablesImported,
        rows_imported: result.totalRowsImported,
        duration_ms: duration,
        errors: result.errors
      });

      this.state.lastImportAt = new Date().toISOString();
    } catch (error) {
      logger.error(
        "Import failed",
        error instanceof Error ? error : new Error(String(error)),
        {
          changed_files: changedFiles
        }
      );
    }
  }

  /**
   * Get current watcher state (for debugging)
   */
  getState(): {
    isRunning: boolean;
    lastImportAt: string;
    pendingFiles: string[];
  } {
    return {
      isRunning: this.fsWatcher !== null,
      lastImportAt: this.state.lastImportAt,
      pendingFiles: Array.from(this.state.changedFiles)
    };
  }
}

/**
 * Factory function to create and start watcher
 */
export function createWatcher(
  exportDir?: string,
  debounceMs?: number
): SyncWatcher {
  const watcher = new SyncWatcher(exportDir, debounceMs);
  watcher.start();
  return watcher;
}
```

**Test Cases**:
- Create watcher, modify JSONL file, verify import triggered after debounce
- Modify multiple files rapidly, verify single batched import
- Modify non-JSONL file, verify no import triggered
- Stop watcher, modify file, verify no import

**Test File**: `app/src/sync/__tests__/watcher.test.ts`

---

### Step 3: Implement Custom Git Merge Driver

**Files**: `app/src/sync/merge-driver.ts` (new)

**Changes**:
```typescript
/**
 * Custom git merge driver for JSONL files
 * 
 * Resolves conflicts in .jsonl files using line-based reconciliation:
 * - Lines with same ID: use THEIRS (assume remote is authoritative)
 * - Lines unique to OURS: keep them
 * - Lines unique to THEIRS: keep them
 * 
 * Algorithm:
 * 1. Parse BASE, OURS, THEIRS into ID-keyed maps
 * 2. Collect all unique IDs across versions
 * 3. For each ID, choose THEIRS if present, else OURS
 * 4. Sort by ID for deterministic output
 * 5. Write merged JSONL to OURS path
 * 
 * Installation:
 * ```bash
 * # Add to .git/config or ~/.gitconfig
 * [merge "jsonl"]
 *   name = JSONL merge driver
 *   driver = bun run src/sync/merge-driver.ts %O %A %B %L
 * ```
 * 
 * @module @sync/merge-driver
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "merge-driver" });

/**
 * Parsed JSONL entry with ID
 */
interface JSONLEntry {
  id: string;
  line: string;
  data: Record<string, unknown>;
}

/**
 * Parse JSONL file into ID-keyed map
 */
function parseJSONL(filepath: string): Map<string, JSONLEntry> {
  const content = readFileSync(filepath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = new Map<string, JSONLEntry>();

  for (const line of lines) {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      const id = data.id as string;

      if (!id) {
        logger.warn("JSONL entry missing ID, skipping", { line });
        continue;
      }

      entries.set(id, { id, line, data });
    } catch (error) {
      logger.error(
        "Failed to parse JSONL line",
        error instanceof Error ? error : new Error(String(error)),
        { line }
      );
    }
  }

  return entries;
}

/**
 * Merge three JSONL versions (base, ours, theirs)
 * 
 * Strategy: THEIRS-preferred merge
 * - If ID in THEIRS: use THEIRS
 * - Else if ID in OURS: use OURS
 * - Else: skip (was deleted in both)
 */
function mergeJSONL(
  basePath: string,
  oursPath: string,
  theirsPath: string
): string {
  const base = parseJSONL(basePath);
  const ours = parseJSONL(oursPath);
  const theirs = parseJSONL(theirsPath);

  // Collect all IDs
  const allIds = new Set<string>([
    ...base.keys(),
    ...ours.keys(),
    ...theirs.keys()
  ]);

  // Merge: prefer THEIRS, fallback to OURS
  const merged: JSONLEntry[] = [];
  for (const id of allIds) {
    if (theirs.has(id)) {
      merged.push(theirs.get(id)!);
    } else if (ours.has(id)) {
      merged.push(ours.get(id)!);
    }
    // If neither has it, ID was deleted in both - skip
  }

  // Sort by ID for deterministic output
  merged.sort((a, b) => a.id.localeCompare(b.id));

  // Format as JSONL
  return merged.map((entry) => entry.line).join("\n") + "\n";
}

/**
 * Main merge driver entry point
 * 
 * Git invokes as: merge-driver %O %A %B %L
 * - %O: base version path
 * - %A: ours version path (current branch)
 * - %B: theirs version path (incoming branch)
 * - %L: conflict marker size (unused)
 */
export function runMergeDriver(
  basePath: string,
  oursPath: string,
  theirsPath: string,
  _markerSize: string
): number {
  logger.info("JSONL merge driver invoked", {
    base: basePath,
    ours: oursPath,
    theirs: theirsPath
  });

  try {
    const merged = mergeJSONL(basePath, oursPath, theirsPath);

    // Write merged result to OURS path
    writeFileSync(oursPath, merged, "utf-8");

    logger.info("JSONL merge completed successfully", {
      output: oursPath
    });

    return 0; // Success
  } catch (error) {
    logger.error(
      "JSONL merge failed",
      error instanceof Error ? error : new Error(String(error)),
      {
        base: basePath,
        ours: oursPath,
        theirs: theirsPath
      }
    );

    return 1; // Conflict (git will mark file as conflicted)
  }
}

// CLI entry point (when run via `bun run merge-driver.ts`)
if (import.meta.main) {
  const [basePath, oursPath, theirsPath, markerSize] = process.argv.slice(2);

  if (!basePath || !oursPath || !theirsPath) {
    process.stderr.write("Usage: merge-driver.ts <base> <ours> <theirs> <marker-size>\n");
    process.exit(1);
  }

  const exitCode = runMergeDriver(basePath, oursPath, theirsPath, markerSize || "7");
  process.exit(exitCode);
}
```

**Test Cases**:
- Merge with no conflicts (same IDs, same content)
- Merge with modified IDs (THEIRS preferred)
- Merge with new IDs in OURS only
- Merge with new IDs in THEIRS only
- Merge with deleted IDs in both branches

**Test File**: `app/src/sync/__tests__/merge-driver.test.ts`

---

### Step 4: Build Deletion Manifest System

**Files**: `app/src/sync/deletion-manifest.ts` (new)

**Changes**:
```typescript
/**
 * Deletion manifest for tracking removed entities during sync
 * 
 * Problem: JSONL export only captures current state. If you delete
 * a repository locally, other machines won't know to delete it on
 * import because it's simply absent from the export.
 * 
 * Solution: .deletions.jsonl manifest tracks deletions explicitly:
 * ```jsonl
 * {"table":"repositories","id":"abc-123","deleted_at":"2025-12-15T10:30:00Z"}
 * {"table":"indexed_files","id":"def-456","deleted_at":"2025-12-15T10:31:00Z"}
 * ```
 * 
 * Lifecycle:
 * 1. Export: Record deletions in manifest
 * 2. Git: Manifest syncs like any other file
 * 3. Import: Apply deletions before importing new data
 * 4. Cleanup: Clear manifest after successful import
 * 
 * @module @sync/deletion-manifest
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@logging/logger.js";
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { getDefaultExportDir } from "@db/sqlite/jsonl-exporter.js";

const logger = createLogger({ module: "deletion-manifest" });

/**
 * Deletion entry in manifest
 */
export interface DeletionEntry {
  table: string;
  id: string;
  deleted_at: string;
}

/**
 * Record a deletion in the manifest
 */
export async function recordDeletion(
  table: string,
  id: string,
  exportDir: string = getDefaultExportDir()
): Promise<void> {
  const manifestPath = join(exportDir, ".deletions.jsonl");

  const entry: DeletionEntry = {
    table,
    id,
    deleted_at: new Date().toISOString()
  };

  const line = JSON.stringify(entry) + "\n";

  // Append to manifest (create if doesn't exist)
  await Bun.write(manifestPath, line, { append: true });

  logger.debug("Deletion recorded", { table, id });
}

/**
 * Load all deletions from manifest
 */
export async function loadDeletionManifest(
  manifestPath: string
): Promise<DeletionEntry[]> {
  if (!existsSync(manifestPath)) {
    return [];
  }

  const content = await Bun.file(manifestPath).text();
  const lines = content.trim().split("\n").filter(Boolean);
  const entries: DeletionEntry[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    try {
      const entry = JSON.parse(line as string) as DeletionEntry;
      entries.push(entry);
    } catch (error) {
      logger.warn("Invalid deletion entry, skipping", {
        line_number: idx + 1,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return entries;
}

/**
 * Apply deletions from manifest to database
 */
export async function applyDeletionManifest(
  db: KotaDatabase,
  manifestPath: string
): Promise<{ deletedCount: number; errors: string[] }> {
  const entries = await loadDeletionManifest(manifestPath);

  if (entries.length === 0) {
    logger.debug("No deletions to apply");
    return { deletedCount: 0, errors: [] };
  }

  logger.info("Applying deletion manifest", { entry_count: entries.length });

  const errors: string[] = [];
  let deletedCount = 0;

  // Group by table for batch deletions
  const byTable = new Map<string, string[]>();
  for (const entry of entries) {
    if (!byTable.has(entry.table)) {
      byTable.set(entry.table, []);
    }
    byTable.get(entry.table)!.push(entry.id);
  }

  // Apply deletions in transaction
  try {
    db.immediateTransaction(() => {
      for (const [table, ids] of byTable) {
        if (!db.tableExists(table)) {
          logger.warn("Deletion target table not found, skipping", { table });
          errors.push(`Table not found: ${table}`);
          continue;
        }

        // DELETE FROM table WHERE id IN (?, ?, ...)
        const placeholders = ids.map(() => "?").join(", ");
        const sql = `DELETE FROM ${table} WHERE id IN (${placeholders})`;

        try {
          const result = db.run(sql, ids as (string | number | bigint | boolean | null | Uint8Array)[]);
          deletedCount += result.changes;

          logger.debug("Deleted entries from table", {
            table,
            deleted_count: result.changes
          });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to delete from ${table}`, new Error(errorMsg));
          errors.push(`${table}: ${errorMsg}`);
        }
      }
    });
  } catch (txError) {
    const errorMsg = txError instanceof Error ? txError.message : String(txError);
    logger.error("Deletion transaction failed", new Error(errorMsg));
    return { deletedCount: 0, errors: [errorMsg] };
  }

  logger.info("Deletion manifest applied", {
    deleted_count: deletedCount,
    error_count: errors.length
  });

  return { deletedCount, errors };
}

/**
 * Clear deletion manifest after successful import
 */
export async function clearDeletionManifest(
  exportDir: string = getDefaultExportDir()
): Promise<void> {
  const manifestPath = join(exportDir, ".deletions.jsonl");

  if (!existsSync(manifestPath)) {
    return;
  }

  await Bun.write(manifestPath, "");
  logger.info("Deletion manifest cleared");
}

/**
 * Hook into database operations to track deletions
 * 
 * Usage:
 * ```typescript
 * const db = getDb();
 * trackDeletions(db);
 * 
 * // Now all DELETE operations are logged to manifest
 * db.run("DELETE FROM repositories WHERE id = ?", ["abc-123"]);
 * ```
 * 
 * Note: This is a post-Phase-3 enhancement. For MVP, manual calls
 * to recordDeletion() are sufficient.
 */
export function trackDeletions(
  db: KotaDatabase,
  exportDir: string = getDefaultExportDir()
): void {
  // Implementation note: This would require wrapping db.run() to intercept
  // DELETE statements and extract table/id pairs. Complex pattern matching
  // needed. Consider for Phase 3B or Phase 4.

  logger.warn("Automatic deletion tracking not yet implemented");
  logger.info(
    "Use recordDeletion(table, id) manually after deletions",
    { export_dir: exportDir }
  );
}
```

**Test Cases**:
- Record deletion, verify entry in manifest
- Load manifest with multiple entries
- Apply deletions, verify records removed from database
- Apply deletions for non-existent table (graceful skip)
- Clear manifest after import

**Test File**: `app/src/sync/__tests__/deletion-manifest.test.ts`

---

### Step 5: Integrate Deletion Manifest with Exporter/Importer

**Files**: 
- `app/src/db/sqlite/jsonl-exporter.ts` (modify)
- `app/src/db/sqlite/jsonl-importer.ts` (modify)

**Changes to jsonl-exporter.ts**:
```typescript
// Add import at top
import { clearDeletionManifest } from "@sync/deletion-manifest.js";

// In JSONLExporter.exportAll() method, after saving state:
this.state.lastExportAt = new Date().toISOString();
await this.saveState();

// Clear deletion manifest after successful export
// (deletions are now reflected in JSONL absence)
await clearDeletionManifest(this.exportDir);

const duration = Date.now() - startTime;
```

**Changes to jsonl-importer.ts**:
```typescript
// Add import at top
import { applyDeletionManifest } from "@sync/deletion-manifest.js";
import { join } from "node:path";
import { existsSync } from "node:fs";

// In importFromJSONL() function, before table imports:
logger.info("Starting JSONL import", {
  import_dir: importDir,
  tables: configs.map((c) => c.name),
});

// Apply deletion manifest first
const deletionManifestPath = join(importDir, ".deletions.jsonl");
if (existsSync(deletionManifestPath)) {
  const deletionResult = await applyDeletionManifest(db, deletionManifestPath);
  logger.info("Deletion manifest applied", {
    deleted_count: deletionResult.deletedCount,
    errors: deletionResult.errors
  });
}

// Import tables in order (respecting foreign key constraints)
for (const config of configs) {
  // ... existing import logic
}
```

**Test Cases**:
- Export database, verify deletion manifest cleared
- Import with deletion manifest present, verify deletions applied first
- Import without deletion manifest, verify normal operation

---

### Step 6: Register MCP CLI Tools

**Files**: 
- `app/src/mcp/tools.ts` (modify)
- `app/src/mcp/server.ts` (modify)

**Changes to tools.ts** (add to end of file):
```typescript
/**
 * Tool: kota_sync_export
 */
export const SYNC_EXPORT_TOOL: ToolDefinition = {
  name: "kota_sync_export",
  description: "Export local SQLite database to JSONL files for git sync. Uses hash-based change detection to skip unchanged tables. Exports to ~/.kotadb/export/ by default.",
  inputSchema: {
    type: "object",
    properties: {
      force: {
        type: "boolean",
        description: "Force export even if tables unchanged (default: false)"
      },
      export_dir: {
        type: "string",
        description: "Optional: Custom export directory path"
      }
    }
  }
};

/**
 * Tool: kota_sync_import
 */
export const SYNC_IMPORT_TOOL: ToolDefinition = {
  name: "kota_sync_import",
  description: "Import JSONL files into local SQLite database. Applies deletion manifest first, then imports all tables transactionally. Typically run after git pull to sync remote changes.",
  inputSchema: {
    type: "object",
    properties: {
      import_dir: {
        type: "string",
        description: "Optional: Custom import directory path (default: ~/.kotadb/export)"
      }
    }
  }
};

// Add to getToolDefinitions():
export function getToolDefinitions(): ToolDefinition[] {
  return [
    // ... existing tools
    SYNC_EXPORT_TOOL,
    SYNC_IMPORT_TOOL,
  ];
}

/**
 * Execute kota_sync_export tool
 */
export async function executeSyncExport(
  params: unknown,
  _requestId: string | number
): Promise<unknown> {
  // Validate params
  if (params !== undefined && (typeof params !== "object" || params === null)) {
    throw new Error("Parameters must be an object");
  }

  const p = params as Record<string, unknown> | undefined;
  const force = p?.force === true;
  const exportDir = typeof p?.export_dir === "string" ? p.export_dir : undefined;

  const { getDb } = await import("@db/sqlite/client.js");
  const { createExporter } = await import("@db/sqlite/jsonl-exporter.js");

  const db = getDb();
  const exporter = createExporter(db, exportDir);

  // Force export or use normal flow with change detection
  const result = await exporter.exportNow();

  return {
    success: true,
    tables_exported: result.tablesExported,
    tables_skipped: result.tablesSkipped,
    total_rows: result.totalRows,
    duration_ms: result.durationMs,
    export_dir: exportDir || "~/.kotadb/export"
  };
}

/**
 * Execute kota_sync_import tool
 */
export async function executeSyncImport(
  params: unknown,
  _requestId: string | number
): Promise<unknown> {
  // Validate params
  if (params !== undefined && (typeof params !== "object" || params === null)) {
    throw new Error("Parameters must be an object");
  }

  const p = params as Record<string, unknown> | undefined;
  const importDir = typeof p?.import_dir === "string" ? p.import_dir : undefined;

  const { getDb } = await import("@db/sqlite/client.js");
  const { importFromJSONL } = await import("@db/sqlite/jsonl-importer.js");
  const { getDefaultExportDir } = await import("@db/sqlite/jsonl-exporter.js");

  const db = getDb();
  const dir = importDir || getDefaultExportDir();

  const result = await importFromJSONL(db, dir);

  if (result.errors.length > 0) {
    return {
      success: false,
      tables_imported: result.tablesImported,
      rows_imported: result.totalRowsImported,
      errors: result.errors,
      duration_ms: result.durationMs
    };
  }

  return {
    success: true,
    tables_imported: result.tablesImported,
    rows_imported: result.totalRowsImported,
    duration_ms: result.durationMs,
    import_dir: dir
  };
}

// Add to handleToolCall() switch:
case "kota_sync_export":
  return await executeSyncExport(params, requestId);
case "kota_sync_import":
  return await executeSyncImport(params, requestId);
```

**Changes to server.ts**:
```typescript
// Add to tool list registration (no code changes needed, tools.ts exports handle it)
```

**Test Cases**:
- Call `kota_sync_export` via MCP, verify JSONL files created
- Call `kota_sync_import` via MCP, verify data loaded
- Call with custom directories, verify paths respected

---

### Step 7: Create Sync Module Index

**Files**: `app/src/sync/index.ts` (new)

**Changes**:
```typescript
/**
 * Sync layer module exports
 * 
 * @module @sync
 */

export { SyncWatcher, createWatcher } from "./watcher.js";
export { runMergeDriver } from "./merge-driver.js";
export {
  recordDeletion,
  loadDeletionManifest,
  applyDeletionManifest,
  clearDeletionManifest,
  trackDeletions,
  type DeletionEntry
} from "./deletion-manifest.js";
```

---

### Step 8: Add Comprehensive Tests

**Files**: 
- `app/src/sync/__tests__/watcher.test.ts` (new)
- `app/src/sync/__tests__/merge-driver.test.ts` (new)
- `app/src/sync/__tests__/deletion-manifest.test.ts` (new)
- `app/src/sync/__tests__/integration.test.ts` (new)

**watcher.test.ts**:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SyncWatcher, createWatcher } from "@sync/watcher.js";
import { createDatabase } from "@db/sqlite/sqlite-client.js";
import { createExporter } from "@db/sqlite/jsonl-exporter.js";

describe("SyncWatcher", () => {
  let tempDir: string;
  let exportDir: string;
  let watcher: SyncWatcher;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    exportDir = join(tempDir, "export");

    // Create test database
    const dbPath = join(tempDir, "test.db");
    const db = createDatabase({ path: dbPath });

    // Create export directory with sample data
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["1", "test-repo"]);

    const exporter = createExporter(db, exportDir, [{ name: "repositories" }]);
    await exporter.exportNow();
    exporter.cancel();
    db.close();
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("start() begins watching export directory", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();

    const state = watcher.getState();
    expect(state.isRunning).toBe(true);
  });

  test("stop() ceases watching", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();
    watcher.stop();

    const state = watcher.getState();
    expect(state.isRunning).toBe(false);
  });

  test("file modification triggers import after debounce", async () => {
    const db = createDatabase({ path: join(tempDir, "target.db") });
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    watcher = createWatcher(exportDir, 100); // 100ms debounce for fast test

    // Modify JSONL file
    const jsonlPath = join(exportDir, "repositories.jsonl");
    writeFileSync(jsonlPath, JSON.stringify({ id: "2", name: "new-repo" }) + "\n");

    // Wait for debounce + import
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify import occurred
    const rows = db.query<{ id: string; name: string }>("SELECT * FROM repositories");
    expect(rows.length).toBe(1);
    expect(rows[0]?.name).toBe("new-repo");

    db.close();
  });

  test("non-JSONL file changes are ignored", async () => {
    watcher = new SyncWatcher(exportDir, 100);
    watcher.start();

    const txtPath = join(exportDir, "readme.txt");
    writeFileSync(txtPath, "hello");

    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = watcher.getState();
    expect(state.pendingFiles.length).toBe(0);
  });
});
```

**merge-driver.test.ts**:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMergeDriver } from "@sync/merge-driver.js";

describe("JSONL Merge Driver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "merge-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("merges with no conflicts (same data)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    const data = JSON.stringify({ id: "1", name: "Alice" }) + "\n";
    writeFileSync(base, data);
    writeFileSync(ours, data);
    writeFileSync(theirs, data);

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    expect(merged).toBe(data);
  });

  test("prefers THEIRS on conflict (same ID, different data)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, JSON.stringify({ id: "1", name: "Alice" }) + "\n");
    writeFileSync(ours, JSON.stringify({ id: "1", name: "Alice Local" }) + "\n");
    writeFileSync(theirs, JSON.stringify({ id: "1", name: "Alice Remote" }) + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Alice Remote"); // THEIRS wins
  });

  test("keeps OURS-only entries", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, JSON.stringify({ id: "1", name: "Local Only" }) + "\n");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Local Only");
  });

  test("keeps THEIRS-only entries", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, "");
    writeFileSync(theirs, JSON.stringify({ id: "1", name: "Remote Only" }) + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Remote Only");
  });

  test("handles deleted entries (absent in both OURS and THEIRS)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, JSON.stringify({ id: "1", name: "Deleted" }) + "\n");
    writeFileSync(ours, "");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    expect(merged.trim()).toBe(""); // No entries
  });
});
```

**deletion-manifest.test.ts**:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "@db/sqlite/sqlite-client.js";
import {
  recordDeletion,
  loadDeletionManifest,
  applyDeletionManifest,
  clearDeletionManifest
} from "@sync/deletion-manifest.js";

describe("Deletion Manifest", () => {
  let tempDir: string;
  let exportDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "deletion-test-"));
    exportDir = join(tempDir, "export");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("recordDeletion() appends entry to manifest", async () => {
    await recordDeletion("repositories", "abc-123", exportDir);

    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(1);
    expect(entries[0]?.table).toBe("repositories");
    expect(entries[0]?.id).toBe("abc-123");
  });

  test("loadDeletionManifest() returns empty array if file missing", async () => {
    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(0);
  });

  test("applyDeletionManifest() removes records from database", async () => {
    const db = createDatabase({ path: join(tempDir, "test.db") });
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["1", "repo-1"]);
    db.run("INSERT INTO repositories VALUES (?, ?)", ["2", "repo-2"]);

    // Record deletion of repo-1
    await recordDeletion("repositories", "1", exportDir);

    // Apply deletions
    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(1);
    expect(result.errors.length).toBe(0);

    // Verify repo-1 deleted, repo-2 remains
    const rows = db.query<{ id: string }>("SELECT id FROM repositories");
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("2");

    db.close();
  });

  test("applyDeletionManifest() handles non-existent table gracefully", async () => {
    const db = createDatabase({ path: join(tempDir, "test.db") });

    await recordDeletion("nonexistent_table", "123", exportDir);

    const result = await applyDeletionManifest(db, join(exportDir, ".deletions.jsonl"));

    expect(result.deletedCount).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Table not found");

    db.close();
  });

  test("clearDeletionManifest() empties the file", async () => {
    await recordDeletion("repositories", "1", exportDir);
    await clearDeletionManifest(exportDir);

    const entries = await loadDeletionManifest(join(exportDir, ".deletions.jsonl"));
    expect(entries.length).toBe(0);
  });
});
```

**integration.test.ts**:
```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase } from "@db/sqlite/sqlite-client.js";
import { createExporter } from "@db/sqlite/jsonl-exporter.js";
import { importFromJSONL } from "@db/sqlite/jsonl-importer.js";
import { recordDeletion } from "@sync/deletion-manifest.js";

describe("Sync Integration", () => {
  let tempDir: string;
  let exportDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "sync-integration-test-"));
    exportDir = join(tempDir, "export");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("full sync cycle: export, delete, import", async () => {
    // Setup: Create source database
    const sourceDb = createDatabase({ path: join(tempDir, "source.db") });
    sourceDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["1", "repo-1"]);
    sourceDb.run("INSERT INTO repositories VALUES (?, ?)", ["2", "repo-2"]);

    // Export
    const exporter = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter.exportNow();
    exporter.cancel();

    // Simulate deletion
    sourceDb.run("DELETE FROM repositories WHERE id = ?", ["1"]);
    await recordDeletion("repositories", "1", exportDir);

    // Re-export (repo-1 now absent from JSONL)
    const exporter2 = createExporter(sourceDb, exportDir, [{ name: "repositories" }]);
    await exporter2.exportNow();
    exporter2.cancel();

    sourceDb.close();

    // Import to target database
    const targetDb = createDatabase({ path: join(tempDir, "target.db") });
    targetDb.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    await importFromJSONL(targetDb, exportDir, [
      { name: "repositories", primaryKey: "id" }
    ]);

    // Verify: Only repo-2 present (repo-1 deleted)
    const rows = targetDb.query<{ id: string; name: string }>(
      "SELECT * FROM repositories"
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe("2");
    expect(rows[0]?.name).toBe("repo-2");

    targetDb.close();
  });
});
```

---

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/tsconfig.json` | modify | Add `@sync/*` path alias mapping to `src/sync/*` |
| `app/src/db/sqlite/jsonl-exporter.ts` | modify | Clear deletion manifest after successful export (lines ~263-264) |
| `app/src/db/sqlite/jsonl-importer.ts` | modify | Apply deletion manifest before importing tables (lines ~100-106) |
| `app/src/mcp/tools.ts` | modify | Add `SYNC_EXPORT_TOOL`, `SYNC_IMPORT_TOOL`, `executeSyncExport()`, `executeSyncImport()`, update `getToolDefinitions()` and `handleToolCall()` |

## Files to Create

| File | Purpose |
|------|---------|
| `app/src/sync/watcher.ts` | File watcher for automatic JSONL import on git pull (debounced) |
| `app/src/sync/merge-driver.ts` | Custom git merge driver for JSONL conflict resolution (THEIRS-preferred) |
| `app/src/sync/deletion-manifest.ts` | Deletion tracking system (.deletions.jsonl management) |
| `app/src/sync/index.ts` | Module aggregator exporting sync layer APIs |
| `app/src/sync/__tests__/watcher.test.ts` | Tests for file watcher (start/stop, debouncing, import triggering) |
| `app/src/sync/__tests__/merge-driver.test.ts` | Tests for merge driver (conflict resolution, OURS/THEIRS preference) |
| `app/src/sync/__tests__/deletion-manifest.test.ts` | Tests for deletion manifest (record, load, apply, clear) |
| `app/src/sync/__tests__/integration.test.ts` | End-to-end tests for full sync workflow (export → delete → import) |

## Testing Strategy

**Validation Level**: 2 (Standard)

**Justification**: Sync layer is new infrastructure but builds on well-tested JSONL exporter/importer. Focus on integration points and edge cases (conflicts, deletions, debouncing).

### Test Cases

- [ ] **File Watcher - Start/Stop**: Create watcher, verify running state, stop, verify stopped
- [ ] **File Watcher - Debouncing**: Modify 5 files rapidly, verify single batched import
- [ ] **File Watcher - Selective Watching**: Modify `.txt` file, verify no import triggered
- [ ] **Merge Driver - No Conflicts**: Same data in all versions, verify unchanged output
- [ ] **Merge Driver - THEIRS Preference**: Conflicting IDs, verify THEIRS data wins
- [ ] **Merge Driver - OURS-Only**: Entry in OURS but not THEIRS, verify kept
- [ ] **Merge Driver - THEIRS-Only**: Entry in THEIRS but not OURS, verify added
- [ ] **Merge Driver - Deleted in Both**: Entry in BASE but neither OURS/THEIRS, verify absent
- [ ] **Deletion Manifest - Record**: Call `recordDeletion()`, verify `.deletions.jsonl` entry
- [ ] **Deletion Manifest - Load**: Populate manifest with 10 entries, verify all loaded
- [ ] **Deletion Manifest - Apply**: Record 3 deletions, import database, verify records removed
- [ ] **Deletion Manifest - Non-existent Table**: Record deletion for missing table, verify graceful error
- [ ] **Deletion Manifest - Clear**: Populate manifest, call `clearDeletionManifest()`, verify empty
- [ ] **Integration - Full Cycle**: Export → modify → delete → record deletion → re-export → import → verify sync
- [ ] **MCP Tools - Export**: Call `kota_sync_export`, verify JSONL files created in `~/.kotadb/export`
- [ ] **MCP Tools - Import**: Call `kota_sync_import`, verify data loaded and deletion manifest applied

### Test Files

- `app/src/sync/__tests__/watcher.test.ts`: File watcher tests (start/stop, debouncing, selective watching)
- `app/src/sync/__tests__/merge-driver.test.ts`: Merge driver tests (conflict resolution strategies)
- `app/src/sync/__tests__/deletion-manifest.test.ts`: Deletion manifest tests (record/load/apply/clear)
- `app/src/sync/__tests__/integration.test.ts`: End-to-end sync workflow tests

## Convention Checklist

- [ ] Path aliases used for all imports (`@db/*`, `@sync/*`, `@logging/*`, `@mcp/*`)
- [ ] Logging via `@logging/logger` (`process.stdout.write`, no `console.*`)
- [ ] Tests use real SQLite databases (`:memory:` or temp files, antimocking)
- [ ] All batch operations wrapped in `db.immediateTransaction()`
- [ ] Type-safe queries with `db.query<T>()` and `db.queryOne<T>()`
- [ ] Imports use `.js` extension for ESM compatibility
- [ ] Error handling with structured logging (logger.error with Error objects)
- [ ] Sensitive data masked (automatic in createLogger)

## Dependencies

**Depends on**:
- #532 (Phase 1A): SQLite client infrastructure (`KotaDatabase`, `getDb()`)
- #538 (Phase 1B): SQLite schema with local-first tables
- #539 (Phase 2B): Query layer (used by file watcher for verification)
- Existing JSONL export/import infrastructure (`jsonl-exporter.ts`, `jsonl-importer.ts`)

**Depended on by**:
- Phase 4: Performance benchmarking (sync latency, conflict resolution time)
- Phase 5: Multi-machine testing (validate git-based sync across devices)

## Risks

- **Git Merge Conflicts**: Complex 3-way merges may produce incorrect results
  - *Mitigation*: Extensive merge-driver tests covering all conflict scenarios, THEIRS-preferred strategy is conservative

- **File Watcher Performance**: Watching large export directories may cause lag
  - *Mitigation*: 1-second debounce batches rapid changes, ignore non-JSONL files

- **Deletion Manifest Growth**: Manifest file grows unbounded if not cleared
  - *Mitigation*: Clear manifest after successful export (deletions reflected in JSONL absence)

- **Concurrent Modifications**: User edits database while import is running
  - *Mitigation*: Use `db.immediateTransaction()` for atomic imports, file watcher debounces rapid changes

- **Cross-Platform Path Issues**: File watcher behavior differs on Windows/macOS/Linux
  - *Mitigation*: Test on all platforms, use Node.js `fs.watch()` (cross-platform API)

## Acceptance Criteria

✅ `@sync/*` path alias resolves correctly in imports
✅ File watcher starts/stops cleanly without resource leaks
✅ File watcher triggers import after 1-second debounce
✅ Merge driver resolves conflicts using THEIRS-preferred strategy
✅ Merge driver handles OURS-only and THEIRS-only entries correctly
✅ Deletion manifest records deletions with table, ID, timestamp
✅ Deletion manifest is applied before importing tables
✅ Deletion manifest is cleared after successful export
✅ MCP tools `kota_sync_export` and `kota_sync_import` execute successfully
✅ All tests pass using real SQLite databases (antimocking)
✅ Zero `console.*` calls (only `@logging/logger`)
✅ Integration test validates full export → delete → import cycle

## Notes

**Existing Infrastructure Leveraged**:
- `JSONLExporter` (5-second debounce, hash-based change detection)
- `importFromJSONL()` (transactional imports, validation)
- Default export directory (`~/.kotadb/export`)
- 6 local-first tables (repositories, indexed_files, indexed_symbols, indexed_references, projects, project_repositories)

**Git Merge Driver Installation** (for users):
```bash
# Add to .git/config (per-repository)
[merge "jsonl"]
  name = KotaDB JSONL merge driver
  driver = bun run app/src/sync/merge-driver.ts %O %A %B %L

# Add to .gitattributes
*.jsonl merge=jsonl
```

**Performance Targets**:
- File watcher debounce: 1 second (balance responsiveness vs. batching)
- Import latency: < 500ms for 100 tables (transactional)
- Merge driver: < 100ms for 1000-line JSONL files

**Future Enhancements** (Post-Phase 3):
- Automatic deletion tracking (intercept DELETE statements)
- Conflict resolution UI (allow user to choose OURS vs. THEIRS)
- Compression for large JSONL files (gzip before git commit)
- Incremental sync (only export changed tables since last sync)
