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

import { existsSync, appendFileSync } from "node:fs";
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
  appendFileSync(manifestPath, line, "utf-8");

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
          db.run(sql, ids as (string | number | bigint | boolean | null | Uint8Array)[]);
          // Note: db.run() doesn't return changes count, so we count the IDs
          deletedCount += ids.length;

          logger.debug("Deleted entries from table", {
            table,
            deleted_count: ids.length
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
 * const db = getClient();
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
