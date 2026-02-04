/**
 * Migration runner for KotaDB SQLite schema management.
 *
 * Features:
 * - Scans migrations directory for .sql files
 * - Applies pending migrations in order
 * - Validates checksums for drift detection
 * - Transactional execution with automatic rollback
 *
 * @module @db/sqlite/migration-runner
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { KotaDatabase } from "./sqlite-client.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "migration-runner" });

/**
 * Parsed migration file information
 */
export interface Migration {
	filename: string;
	name: string;
	number: number;
	path: string;
	content: string;
	checksum: string;
}

/**
 * Migration record from the database
 */
export interface AppliedMigration {
	name: string;
	applied_at: string;
	checksum?: string | null;
}

/**
 * Result of a migration run
 */
export interface MigrationResult {
	appliedCount: number;
	driftDetected: boolean;
	appliedMigrations: string[];
	errors: string[];
}

/**
 * Parse migration filename to extract number and name.
 * Format: {number}_{name}.sql
 *
 * @param filename - Migration filename (e.g., "004_memory_layer.sql")
 * @returns Parsed number and name, or null if invalid format
 */
export function parseMigrationFilename(
	filename: string
): { number: number; name: string } | null {
	const match = filename.match(/^(\d+)_(.+)\.sql$/);
	if (!match) return null;

	const numStr = match[1];
	const name = match[2];
	if (!numStr || !name) return null;

	return { number: parseInt(numStr, 10), name: `${numStr}_${name}` };
}

/**
 * Compute SHA-256 checksum of migration content.
 *
 * @param content - Migration SQL content
 * @returns Hex-encoded SHA-256 hash
 */
export function computeChecksum(content: string): string {
	return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Scan migrations directory and return sorted list of migrations.
 *
 * @param migrationsDir - Path to migrations directory
 * @returns Array of migrations sorted by number
 */
export function scanMigrations(migrationsDir: string): Migration[] {
	if (!existsSync(migrationsDir)) {
		logger.warn("Migrations directory does not exist", { path: migrationsDir });
		return [];
	}

	const files = readdirSync(migrationsDir)
		.filter((f) => f.endsWith(".sql"))
		.sort(); // Alphabetical sort ensures numeric order for 001, 002, etc.

	const migrations: Migration[] = [];

	for (const filename of files) {
		const parsed = parseMigrationFilename(filename);
		if (!parsed) {
			logger.warn("Invalid migration filename (skipping)", { filename });
			continue;
		}

		const path = join(migrationsDir, filename);
		const content = readFileSync(path, "utf-8");
		const checksum = computeChecksum(content);

		migrations.push({
			filename,
			name: parsed.name,
			number: parsed.number,
			path,
			content,
			checksum,
		});
	}

	// Sort by number (redundant if naming is correct, but ensures correctness)
	migrations.sort((a, b) => a.number - b.number);

	return migrations;
}

/**
 * Get list of applied migrations from schema_migrations table.
 *
 * @param db - Database instance
 * @returns Map of migration name to applied migration record
 */
export function getAppliedMigrations(
	db: KotaDatabase
): Map<string, AppliedMigration> {
	// Ensure schema_migrations table exists
	if (!db.tableExists("schema_migrations")) {
		logger.warn("schema_migrations table does not exist");
		return new Map();
	}

	// Check if checksum column exists
	const columns = db.query<{ name: string }>(
		"SELECT name FROM pragma_table_info('schema_migrations')"
	);
	const hasChecksum = columns.some((c) => c.name === "checksum");

	// Query with or without checksum column
	const query = hasChecksum
		? "SELECT name, applied_at, checksum FROM schema_migrations ORDER BY id"
		: "SELECT name, applied_at, NULL as checksum FROM schema_migrations ORDER BY id";

	const rows = db.query<AppliedMigration>(query);

	return new Map(rows.map((r) => [r.name, r]));
}

/**
 * Apply a single migration within a transaction.
 *
 * @param db - Database instance
 * @param migration - Migration to apply
 */
export function applyMigration(db: KotaDatabase, migration: Migration): void {
	logger.info("Applying migration", { name: migration.name });

	db.immediateTransaction(() => {
		// Execute migration SQL
		db.exec(migration.content);

		// Check if checksum column exists for INSERT
		const columns = db.query<{ name: string }>(
			"SELECT name FROM pragma_table_info('schema_migrations')"
		);
		const hasChecksum = columns.some((c) => c.name === "checksum");

		// Record migration (with checksum if column exists)
		if (hasChecksum) {
			db.run(
				"INSERT OR REPLACE INTO schema_migrations (name, checksum, applied_at) VALUES (?, ?, datetime('now'))",
				[migration.name, migration.checksum]
			);
		} else {
			// Migration file already contains INSERT OR IGNORE for name
			// Just ensure the record exists
			db.run(
				"INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))",
				[migration.name]
			);
		}
	});

	logger.info("Migration applied successfully", { name: migration.name });
}

/**
 * Validate checksum for already-applied migration (drift detection).
 *
 * @param migration - Migration file info
 * @param applied - Applied migration record
 * @returns True if checksum matches or no checksum stored
 */
export function validateChecksum(
	migration: Migration,
	applied: AppliedMigration
): boolean {
	if (!applied.checksum) {
		// Old migrations may not have checksum - skip validation
		logger.debug("No checksum stored for migration (skipping validation)", {
			name: migration.name,
		});
		return true;
	}

	if (migration.checksum !== applied.checksum) {
		logger.warn("Migration checksum mismatch (DRIFT DETECTED)", {
			name: migration.name,
			expected: applied.checksum,
			actual: migration.checksum,
			message:
				"Migration file was modified after being applied. This may indicate schema drift.",
		});
		return false;
	}

	return true;
}

/**
 * Run all pending migrations.
 *
 * @param db - Database instance
 * @param migrationsDir - Path to migrations directory
 * @returns Migration result with count and status
 */
export function runMigrations(
	db: KotaDatabase,
	migrationsDir: string
): MigrationResult {
	logger.info("Starting migration runner", { migrationsDir });

	const result: MigrationResult = {
		appliedCount: 0,
		driftDetected: false,
		appliedMigrations: [],
		errors: [],
	};

	// Scan filesystem for migration files
	const availableMigrations = scanMigrations(migrationsDir);
	logger.debug("Found migration files", { count: availableMigrations.length });

	// Get applied migrations from database
	const appliedMigrations = getAppliedMigrations(db);
	logger.debug("Found applied migrations", { count: appliedMigrations.size });

	for (const migration of availableMigrations) {
		const applied = appliedMigrations.get(migration.name);

		if (applied) {
			// Migration already applied - validate checksum
			const valid = validateChecksum(migration, applied);
			if (!valid) {
				result.driftDetected = true;
			}
		} else {
			// Migration not yet applied - apply it
			try {
				applyMigration(db, migration);
				result.appliedCount++;
				result.appliedMigrations.push(migration.name);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logger.error("Migration failed", {
					name: migration.name,
					error: errorMessage,
				});
				result.errors.push(`Migration ${migration.name} failed: ${errorMessage}`);
				// Stop applying further migrations on failure
				break;
			}
		}
	}

	if (result.driftDetected) {
		logger.warn(
			"Schema drift detected. Some migration files have been modified after being applied."
		);
	}

	logger.info("Migration runner completed", {
		appliedCount: result.appliedCount,
		driftDetected: result.driftDetected,
	});

	return result;
}

/**
 * Update checksums for all existing migrations.
 * Useful after adding checksum column to update records.
 *
 * @param db - Database instance
 * @param migrationsDir - Path to migrations directory
 * @returns Number of records updated
 */
export function updateExistingChecksums(
	db: KotaDatabase,
	migrationsDir: string
): number {
	const migrations = scanMigrations(migrationsDir);
	const applied = getAppliedMigrations(db);
	let updatedCount = 0;

	for (const migration of migrations) {
		const record = applied.get(migration.name);
		if (record && !record.checksum) {
			db.run("UPDATE schema_migrations SET checksum = ? WHERE name = ?", [
				migration.checksum,
				migration.name,
			]);
			updatedCount++;
			logger.debug("Updated checksum for migration", { name: migration.name });
		}
	}

	if (updatedCount > 0) {
		logger.info("Updated checksums for existing migrations", {
			count: updatedCount,
		});
	}

	return updatedCount;
}
