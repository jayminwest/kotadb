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
 * Whitelist of tables that can be targeted by deletion operations.
 * This list MUST be kept in sync with the database schema.
 */
export const ALLOWED_DELETION_TABLES = [
  'repositories',
  'indexed_files',
  'indexed_symbols',
  'indexed_references',
  'projects',
  'project_repositories'
] as const;

export type AllowedDeletionTable = typeof ALLOWED_DELETION_TABLES[number];

/**
 * Security-related error for deletion operations
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Validation error for deletion entries
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Deletion entry in manifest (original interface)
 */
export interface DeletionEntry {
  table: string;
  id: string;
  deleted_at: string;
}

/**
 * Strict schema for deletion entries with validation
 */
export interface ValidatedDeletionEntry {
  table: AllowedDeletionTable;
  id: string;
  deleted_at: string;
}

/**
 * Validates that a table name is allowed for deletion operations.
 * @param tableName - The table name to validate
 * @returns true if table is allowed, false otherwise
 */
export function isAllowedDeletionTable(tableName: string): tableName is AllowedDeletionTable {
  return (ALLOWED_DELETION_TABLES as readonly string[]).includes(tableName);
}

/**
 * Validates and throws if table name is not allowed.
 * @param tableName - The table name to validate
 * @throws SecurityError if table name is not in whitelist
 */
export function validateDeletionTableName(tableName: string): asserts tableName is AllowedDeletionTable {
  if (!isAllowedDeletionTable(tableName)) {
    throw new SecurityError(`Invalid table name for deletion: '${tableName}'. Allowed tables: ${ALLOWED_DELETION_TABLES.join(', ')}`);
  }
}

/**
 * Validates and transforms raw deletion entry to validated entry
 */
export function validateDeletionEntry(raw: unknown): ValidatedDeletionEntry {
  // Type guard and validation logic
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('Deletion entry must be an object');
  }

  const entry = raw as Record<string, unknown>;

  // Validate table name
  if (typeof entry.table !== 'string') {
    throw new ValidationError('Deletion entry table must be a string');
  }
  validateDeletionTableName(entry.table);

  // Validate ID
  if (typeof entry.id !== 'string' || !entry.id.trim()) {
    throw new ValidationError('Deletion entry id must be a non-empty string');
  }

  // Validate timestamp
  if (typeof entry.deleted_at !== 'string') {
    throw new ValidationError('Deletion entry deleted_at must be a string');
  }

  // Validate ISO timestamp format
  const timestamp = new Date(entry.deleted_at);
  if (isNaN(timestamp.getTime())) {
    throw new ValidationError('Deletion entry deleted_at must be a valid ISO timestamp');
  }

  return {
    table: entry.table,
    id: entry.id.trim(),
    deleted_at: entry.deleted_at
  };
}

/**
 * Record a deletion in the manifest
 */
export async function recordDeletion(
  table: string,
  id: string,
  exportDir: string = getDefaultExportDir()
): Promise<void> {
  // Validate table name before recording
  validateDeletionTableName(table);

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
 * Securely load and validate deletion manifest entries
 */
export async function loadDeletionManifest(
  manifestPath: string
): Promise<ValidatedDeletionEntry[]> {
  if (!existsSync(manifestPath)) {
    return [];
  }

  const content = await Bun.file(manifestPath).text();

  // Limit manifest size to prevent DoS
  const MAX_MANIFEST_SIZE = 10 * 1024 * 1024; // 10MB
  if (content.length > MAX_MANIFEST_SIZE) {
    throw new SecurityError(`Manifest file too large: ${content.length} bytes (max: ${MAX_MANIFEST_SIZE})`);
  }

  const lines = content.trim().split('\n').filter(Boolean);
  const entries: ValidatedDeletionEntry[] = [];
  const errors: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line) continue;
    try {
      const rawEntry = JSON.parse(line);
      const validatedEntry = validateDeletionEntry(rawEntry);
      entries.push(validatedEntry);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Line ${idx + 1}: ${errorMsg}`);
      logger.warn('Invalid deletion entry, skipping', {
        line_number: idx + 1,
        error: errorMsg
      });
    }
  }

  // Fail fast if too many errors (potential attack)
  const errorRate = errors.length / lines.length;
  if (errorRate > 0.1 && errors.length > 10) {
    throw new SecurityError(`Too many invalid entries in manifest (${errors.length}/${lines.length}). Potential malicious file.`);
  }

  return entries;
}

/**
 * Builds a secure DELETE query with validated table name
 * @param table - Pre-validated table name from whitelist
 * @param idCount - Number of IDs to delete (for placeholder generation)
 * @returns Safe SQL query string
 */
function buildSecureDeletionQuery(table: AllowedDeletionTable, idCount: number): string {
  // Table name is already validated by type system and whitelist
  // Generate placeholders safely
  const placeholders = Array(idCount).fill('?').join(', ');

  // Use template literal with validated table name (safe since it's from whitelist)
  return `DELETE FROM ${table} WHERE id IN (${placeholders})`;
}

/**
 * Apply deletions from manifest to database with security controls
 */
export async function applyDeletionManifest(
  db: KotaDatabase,
  manifestPath: string
): Promise<{ deletedCount: number; errors: string[]; securityIssues: string[] }> {

  // Load and validate entries
  const entries = await loadDeletionManifest(manifestPath);

  if (entries.length === 0) {
    logger.debug('No deletions to apply');
    return { deletedCount: 0, errors: [], securityIssues: [] };
  }

  logger.info('Applying deletion manifest', { entry_count: entries.length });

  const errors: string[] = [];
  const securityIssues: string[] = [];
  let deletedCount = 0;

  // Group by validated table name
  const byTable = new Map<AllowedDeletionTable, string[]>();
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
        // Double-check table exists (defense in depth)
        if (!db.tableExists(table)) {
          const issue = `Table not found: ${table}`;
          logger.warn('Deletion target table not found, skipping', { table });
          securityIssues.push(issue);
          continue;
        }

        // Build secure query
        const sql = buildSecureDeletionQuery(table, ids.length);

        try {
          db.run(sql, ids);
          deletedCount += ids.length;

          logger.debug('Deleted entries from table', {
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
    logger.error('Deletion transaction failed', new Error(errorMsg));
    return { deletedCount: 0, errors: [errorMsg], securityIssues };
  }

  logger.info('Deletion manifest applied', {
    deleted_count: deletedCount,
    error_count: errors.length,
    security_issue_count: securityIssues.length
  });

  return { deletedCount, errors, securityIssues };
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
