/**
 * File watcher for automatic JSONL import on git pull
 * 
 * Watches .kotadb/export/*.jsonl (project-local) for changes and triggers
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
import type { KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { getClient } from "@db/client.js";
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
      const db = getClient() as KotaDatabase;

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
