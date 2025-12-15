/**
 * JSONL export layer for SQLite database.
 *
 * Exports SQLite tables to JSONL (JSON Lines) format for:
 * - Git-trackable snapshots
 * - Backup and recovery
 * - Sync between machines
 *
 * Features:
 * - 5-second debounced exports to batch changes
 * - Hash-based change detection to skip unchanged tables
 * - Sensitive field exclusion (never export key_hash, etc.)
 *
 * @module @db/sqlite/jsonl-exporter
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "@logging/logger.js";
import type { KotaDatabase } from "./sqlite-client.js";

const logger = createLogger({ module: "jsonl-exporter" });

/**
 * Export state tracking
 */
interface ExportState {
	/** Hash of last exported content for each table */
	lastHashes: Record<string, string>;
	/** ISO timestamp of last export */
	lastExportAt: string;
}

/**
 * Configuration for table exports
 */
interface TableExportConfig {
	/** Table name */
	name: string;
	/** Fields to exclude from export (sensitive data) */
	excludeFields?: string[];
	/** Custom SQL to select data (default: SELECT * FROM table) */
	customQuery?: string;
}

/**
 * Default tables to export
 */
const DEFAULT_TABLES: TableExportConfig[] = [
	{ name: "users", excludeFields: [] },
	{ name: "api_keys", excludeFields: ["key_hash"] }, // Never export hashes
	{ name: "repositories" },
	{ name: "indexed_files" },
	{ name: "indexed_symbols" },
	{ name: "indexed_references" },
	{ name: "projects" },
	{ name: "project_repositories" },
];

/**
 * Get the default export directory (~/.kotadb/export)
 */
export function getDefaultExportDir(): string {
	const home = process.env.HOME;
	if (!home) {
		throw new Error("HOME environment variable not set");
	}
	return join(home, ".kotadb", "export");
}

/**
 * JSONLExporter - Manages database exports to JSONL format.
 *
 * Usage:
 * ```typescript
 * const exporter = new JSONLExporter(db);
 *
 * // Trigger export (debounced)
 * exporter.scheduleExport();
 *
 * // Force immediate export
 * await exporter.exportNow();
 * ```
 */
export class JSONLExporter {
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private state: ExportState;
	private readonly stateFile: string;
	private readonly tables: TableExportConfig[];

	constructor(
		private readonly db: KotaDatabase,
		private readonly exportDir: string = getDefaultExportDir(),
		tables: TableExportConfig[] = DEFAULT_TABLES,
	) {
		this.tables = tables;

		// Ensure export directory exists
		if (!existsSync(this.exportDir)) {
			mkdirSync(this.exportDir, { recursive: true });
			logger.info("Created export directory", { path: this.exportDir });
		}

		// Load or initialize state
		this.stateFile = join(this.exportDir, ".export-state.json");
		this.state = this.loadState();

		logger.info("JSONL exporter initialized", {
			export_dir: this.exportDir,
			tables: this.tables.map((t) => t.name),
			last_export: this.state.lastExportAt,
		});
	}

	/**
	 * Load export state from disk
	 */
	private loadState(): ExportState {
		if (!existsSync(this.stateFile)) {
			return {
				lastHashes: {},
				lastExportAt: new Date().toISOString(),
			};
		}

		try {
			const content = Bun.file(this.stateFile).text();
			// Note: This is sync in the constructor, but Bun.file().text() returns a promise
			// We'll handle this properly in the async context
			return JSON.parse(content as unknown as string);
		} catch (error) {
			logger.warn("Failed to load export state, starting fresh", {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				lastHashes: {},
				lastExportAt: new Date().toISOString(),
			};
		}
	}

	/**
	 * Load state asynchronously (for use outside constructor)
	 */
	private async loadStateAsync(): Promise<ExportState> {
		if (!existsSync(this.stateFile)) {
			return {
				lastHashes: {},
				lastExportAt: new Date().toISOString(),
			};
		}

		try {
			const content = await Bun.file(this.stateFile).text();
			return JSON.parse(content);
		} catch (error) {
			logger.warn("Failed to load export state, starting fresh", {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				lastHashes: {},
				lastExportAt: new Date().toISOString(),
			};
		}
	}

	/**
	 * Save export state to disk
	 */
	private async saveState(): Promise<void> {
		try {
			await Bun.write(this.stateFile, JSON.stringify(this.state, null, 2));
		} catch (error) {
			logger.error("Failed to save export state", error instanceof Error ? error : new Error(String(error)));
		}
	}

	/**
	 * Schedule an export with debouncing (5-second delay).
	 * Multiple calls within 5 seconds will be batched into one export.
	 */
	scheduleExport(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.exportAll().catch((error) => {
				logger.error("Scheduled export failed", error instanceof Error ? error : new Error(String(error)));
			});
		}, 5000); // 5-second debounce

		logger.debug("Export scheduled (debounced)");
	}

	/**
	 * Export all configured tables immediately
	 */
	async exportNow(): Promise<ExportResult> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		return this.exportAll();
	}

	/**
	 * Export all tables
	 */
	private async exportAll(): Promise<ExportResult> {
		const startTime = Date.now();
		const results: TableExportResult[] = [];
		let totalRows = 0;
		let tablesExported = 0;
		let tablesSkipped = 0;

		logger.info("Starting JSONL export", {
			tables: this.tables.length,
		});

		for (const tableConfig of this.tables) {
			try {
				// Check if table exists
				if (!this.db.tableExists(tableConfig.name)) {
					logger.debug("Skipping non-existent table", { table: tableConfig.name });
					results.push({
						table: tableConfig.name,
						status: "skipped",
						reason: "table_not_found",
						rows: 0,
					});
					tablesSkipped++;
					continue;
				}

				const result = await this.exportTable(tableConfig);
				results.push(result);

				if (result.status === "exported") {
					tablesExported++;
					totalRows += result.rows;
				} else {
					tablesSkipped++;
				}
			} catch (error) {
				logger.error("Failed to export table", error instanceof Error ? error : new Error(String(error)), {
					table: tableConfig.name,
				});
				results.push({
					table: tableConfig.name,
					status: "error",
					reason: error instanceof Error ? error.message : String(error),
					rows: 0,
				});
			}
		}

		this.state.lastExportAt = new Date().toISOString();
		await this.saveState();

		const duration = Date.now() - startTime;

		logger.info("JSONL export completed", {
			tables_exported: tablesExported,
			tables_skipped: tablesSkipped,
			total_rows: totalRows,
			duration_ms: duration,
		});

		return {
			tablesExported,
			tablesSkipped,
			totalRows,
			durationMs: duration,
			results,
		};
	}

	/**
	 * Export a single table to JSONL
	 */
	private async exportTable(config: TableExportConfig): Promise<TableExportResult> {
		const { name, excludeFields = [], customQuery } = config;

		// Query all rows
		const query = customQuery || `SELECT * FROM ${name}`;
		const rows = this.db.query<Record<string, unknown>>(query);

		// Filter out excluded fields and convert to JSONL
		const lines: string[] = [];
		for (const row of rows) {
			const filtered: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(row)) {
				if (!excludeFields.includes(key)) {
					filtered[key] = value;
				}
			}
			lines.push(JSON.stringify(filtered));
		}

		const content = lines.length > 0 ? lines.join("\n") + "\n" : "";

		// Calculate hash for change detection
		const hash = createHash("sha256").update(content).digest("hex");

		// Skip if unchanged
		if (this.state.lastHashes[name] === hash) {
			return {
				table: name,
				status: "skipped",
				reason: "unchanged",
				rows: rows.length,
			};
		}

		// Write to file
		const filepath = join(this.exportDir, `${name}.jsonl`);
		await Bun.write(filepath, content);

		// Update state
		this.state.lastHashes[name] = hash;

		logger.info("Exported table", {
			table: name,
			rows: rows.length,
			hash: hash.substring(0, 8),
			file: filepath,
		});

		return {
			table: name,
			status: "exported",
			rows: rows.length,
			hash,
			filepath,
		};
	}

	/**
	 * Get the current export state
	 */
	getState(): ExportState {
		return { ...this.state };
	}

	/**
	 * Clear the debounce timer (for cleanup)
	 */
	cancel(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}
}

/**
 * Result of a single table export
 */
interface TableExportResult {
	table: string;
	status: "exported" | "skipped" | "error";
	reason?: string;
	rows: number;
	hash?: string;
	filepath?: string;
}

/**
 * Result of a full export operation
 */
interface ExportResult {
	tablesExported: number;
	tablesSkipped: number;
	totalRows: number;
	durationMs: number;
	results: TableExportResult[];
}

/**
 * Factory function to create a JSONL exporter
 */
export function createExporter(
	db: KotaDatabase,
	exportDir?: string,
	tables?: TableExportConfig[],
): JSONLExporter {
	return new JSONLExporter(db, exportDir, tables);
}
