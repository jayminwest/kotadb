/**
 * SQLite module exports for KotaDB local-first architecture.
 *
 * @module @db/sqlite
 */

// SQLite client exports
export {
	KotaDatabase,
	ConnectionPool,
	createDatabase,
	createConnectionPool,
	getGlobalPool,
	getGlobalDatabase,
	closeGlobalConnections,
	getDefaultDbPath,
	resolveDbPath,
	DEFAULT_CONFIG,
	type DatabaseConfig,
} from "./sqlite-client.js";

// JSONL export layer
export {
	JSONLExporter,
	createExporter,
	getDefaultExportDir,
} from "./jsonl-exporter.js";

// JSONL import layer
export {
	importFromJSONL,
	importTableFromJSONL,
	validateJSONL,
	type ImportResult,
} from "./jsonl-importer.js";
