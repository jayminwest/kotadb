/**
 * JSONL import layer for SQLite database.
 *
 * Imports JSONL (JSON Lines) files into SQLite database for:
 * - Database recovery from backups
 * - Sync from git repository
 * - Migration between machines
 *
 * Features:
 * - Transactional imports (all-or-nothing per table)
 * - Conflict handling (INSERT OR REPLACE)
 * - Validation of required fields
 *
 * @module @db/sqlite/jsonl-importer
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@logging/logger.js";
import type { KotaDatabase } from "./sqlite-client.js";

const logger = createLogger({ module: "jsonl-importer" });

/**
 * Configuration for table imports
 */
interface TableImportConfig {
	/** Table name */
	name: string;
	/** Primary key column(s) */
	primaryKey: string | string[];
	/** Required fields for validation */
	requiredFields?: string[];
	/** Use INSERT OR IGNORE instead of INSERT OR REPLACE */
	ignoreConflicts?: boolean;
}

/**
 * Default table import configurations
 */
const DEFAULT_IMPORT_CONFIGS: TableImportConfig[] = [
	{ name: "users", primaryKey: "id", requiredFields: ["id", "email", "tier"] },
	{ name: "api_keys", primaryKey: "id", requiredFields: ["id", "user_id", "name"] },
	{ name: "repositories", primaryKey: "id", requiredFields: ["id", "user_id", "name"] },
	{ name: "indexed_files", primaryKey: "id", requiredFields: ["id", "repository_id", "path"] },
	{ name: "indexed_symbols", primaryKey: "id", requiredFields: ["id", "file_id", "name"] },
	{ name: "indexed_references", primaryKey: "id", requiredFields: ["id", "file_id", "symbol_name"] },
	{ name: "projects", primaryKey: "id", requiredFields: ["id", "name"] },
	{ name: "project_repositories", primaryKey: ["project_id", "repository_id"] },
];

/**
 * Result of a single table import
 */
interface TableImportResult {
	table: string;
	status: "imported" | "skipped" | "error";
	rowsImported: number;
	rowsSkipped: number;
	errors: string[];
}

/**
 * Result of a full import operation
 */
export interface ImportResult {
	tablesImported: number;
	tablesSkipped: number;
	totalRowsImported: number;
	totalRowsSkipped: number;
	durationMs: number;
	results: TableImportResult[];
	errors: string[];
}

/**
 * Import JSONL files from a directory into the database.
 *
 * @param db - Database to import into
 * @param importDir - Directory containing JSONL files
 * @param configs - Table configurations (optional, uses defaults)
 * @returns Import result with statistics
 */
export async function importFromJSONL(
	db: KotaDatabase,
	importDir: string,
	configs: TableImportConfig[] = DEFAULT_IMPORT_CONFIGS,
): Promise<ImportResult> {
	const startTime = Date.now();
	const results: TableImportResult[] = [];
	const globalErrors: string[] = [];
	let totalRowsImported = 0;
	let totalRowsSkipped = 0;
	let tablesImported = 0;
	let tablesSkipped = 0;

	logger.info("Starting JSONL import", {
		import_dir: importDir,
		tables: configs.map((c) => c.name),
	});

	// Validate import directory exists
	if (!existsSync(importDir)) {
		const error = "Import directory not found: " + importDir;
		logger.error(error);
		return {
			tablesImported: 0,
			tablesSkipped: configs.length,
			totalRowsImported: 0,
			totalRowsSkipped: 0,
			durationMs: Date.now() - startTime,
			results: [],
			errors: [error],
		};
	}

	// Import tables in order (respecting foreign key constraints)
	for (const config of configs) {
		try {
			const result = await importTable(db, importDir, config);
			results.push(result);

			if (result.status === "imported") {
				tablesImported++;
				totalRowsImported += result.rowsImported;
				totalRowsSkipped += result.rowsSkipped;
			} else {
				tablesSkipped++;
			}

			if (result.errors.length > 0) {
				globalErrors.push(...result.errors.map((e) => config.name + ": " + e));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error("Failed to import table", new Error(errorMessage), {
				table: config.name,
			});
			results.push({
				table: config.name,
				status: "error",
				rowsImported: 0,
				rowsSkipped: 0,
				errors: [errorMessage],
			});
			globalErrors.push(config.name + ": " + errorMessage);
			tablesSkipped++;
		}
	}

	const duration = Date.now() - startTime;

	logger.info("JSONL import completed", {
		tables_imported: tablesImported,
		tables_skipped: tablesSkipped,
		total_rows_imported: totalRowsImported,
		total_rows_skipped: totalRowsSkipped,
		duration_ms: duration,
		error_count: globalErrors.length,
	});

	return {
		tablesImported,
		tablesSkipped,
		totalRowsImported,
		totalRowsSkipped,
		durationMs: duration,
		results,
		errors: globalErrors,
	};
}

/**
 * Import a single JSONL file into a table
 */
async function importTable(
	db: KotaDatabase,
	importDir: string,
	config: TableImportConfig,
): Promise<TableImportResult> {
	const { name, requiredFields = [], ignoreConflicts = false } = config;
	const filepath = join(importDir, name + ".jsonl");

	// Check if file exists
	if (!existsSync(filepath)) {
		logger.debug("JSONL file not found, skipping", { table: name, file: filepath });
		return {
			table: name,
			status: "skipped",
			rowsImported: 0,
			rowsSkipped: 0,
			errors: [],
		};
	}

	// Read and parse file
	const content = await Bun.file(filepath).text();
	const lines = content.trim().split("\n").filter(Boolean);

	if (lines.length === 0) {
		logger.debug("Empty JSONL file, skipping", { table: name });
		return {
			table: name,
			status: "skipped",
			rowsImported: 0,
			rowsSkipped: 0,
			errors: [],
		};
	}

	const errors: string[] = [];
	let rowsImported = 0;
	let rowsSkipped = 0;

	// Import within a transaction
	try {
		db.immediateTransaction(() => {
			for (let idx = 0; idx < lines.length; idx++) {
				const line = lines[idx];
				if (!line) continue;

				try {
					const row = JSON.parse(line) as Record<string, unknown>;

					// Validate required fields
					const missingFields = requiredFields.filter((field) => !(field in row));
					if (missingFields.length > 0) {
						errors.push("Row " + (idx + 1) + ": Missing required fields: " + missingFields.join(", "));
						rowsSkipped++;
						continue;
					}

					// Build INSERT statement
					const columns = Object.keys(row);
					const placeholders = columns.map(() => "?").join(", ");
					const values = columns.map((col) => {
						const value = row[col];
						// Convert objects/arrays to JSON strings
						if (typeof value === "object" && value !== null) {
							return JSON.stringify(value);
						}
						return value;
					});

					const conflictClause = ignoreConflicts ? "OR IGNORE" : "OR REPLACE";
					const sql = "INSERT " + conflictClause + " INTO " + name + " (" + columns.join(", ") + ") VALUES (" + placeholders + ")";

					db.run(sql, values as (string | number | bigint | boolean | null | Uint8Array)[]);
					rowsImported++;
				} catch (parseError) {
					const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
					errors.push("Row " + (idx + 1) + ": " + errorMessage);
					rowsSkipped++;
				}
			}
		});
	} catch (txError) {
		const errorMessage = txError instanceof Error ? txError.message : String(txError);
		logger.error("Transaction failed for table import", new Error(errorMessage), {
			table: name,
		});
		return {
			table: name,
			status: "error",
			rowsImported: 0,
			rowsSkipped: lines.length,
			errors: [errorMessage],
		};
	}

	logger.info("Imported table", {
		table: name,
		rows_imported: rowsImported,
		rows_skipped: rowsSkipped,
		error_count: errors.length,
	});

	return {
		table: name,
		status: "imported",
		rowsImported,
		rowsSkipped,
		errors,
	};
}

/**
 * Import a specific table from JSONL
 */
export async function importTableFromJSONL(
	db: KotaDatabase,
	filepath: string,
	tableName: string,
	options: Partial<TableImportConfig> = {},
): Promise<TableImportResult> {
	const config: TableImportConfig = {
		name: tableName,
		primaryKey: options.primaryKey || "id",
		requiredFields: options.requiredFields,
		ignoreConflicts: options.ignoreConflicts,
	};

	// Extract directory from filepath
	const importDir = filepath.replace("/" + tableName + ".jsonl", "").replace("\\" + tableName + ".jsonl", "");

	return importTable(db, importDir, config);
}

/**
 * Validate a JSONL file without importing
 */
export async function validateJSONL(filepath: string): Promise<{
	valid: boolean;
	lineCount: number;
	errors: string[];
}> {
	if (!existsSync(filepath)) {
		return {
			valid: false,
			lineCount: 0,
			errors: ["File not found"],
		};
	}

	const content = await Bun.file(filepath).text();
	const lines = content.trim().split("\n").filter(Boolean);
	const errors: string[] = [];

	for (let idx = 0; idx < lines.length; idx++) {
		const line = lines[idx];
		if (!line) continue;

		try {
			JSON.parse(line);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push("Line " + (idx + 1) + ": Invalid JSON - " + message);
		}
	}

	return {
		valid: errors.length === 0,
		lineCount: lines.length,
		errors,
	};
}
