/**
 * SQLite storage adapter for persistent code intelligence data.
 *
 * Uses bun:sqlite to store symbols, references, and dependencies in a
 * SQLite database. Supports both in-memory and file-based databases.
 */

import { Database } from "bun:sqlite";
import type { StorageAdapter } from "../types/storage.js";
import type { Symbol } from "../types/symbol.js";
import type { Reference } from "../types/reference.js";
import type { DependencyEdge } from "../types/dependency.js";

/**
 * SQLite storage adapter.
 *
 * Stores data in SQLite database with schema matching the core types.
 * Automatically creates tables on initialization.
 */
export class SqliteStorageAdapter implements StorageAdapter {
	private db: Database;

	/**
	 * Create a new SQLite storage adapter.
	 *
	 * @param dbPath - Database file path (default: :memory: for in-memory)
	 */
	constructor(dbPath: string = ":memory:") {
		this.db = new Database(dbPath);
		this.initializeTables();
	}

	private initializeTables(): void {
		// Create symbols table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS symbols (
				id TEXT PRIMARY KEY,
				file_id TEXT NOT NULL,
				name TEXT NOT NULL,
				kind TEXT NOT NULL,
				line_start INTEGER NOT NULL,
				line_end INTEGER NOT NULL,
				column_start INTEGER NOT NULL,
				column_end INTEGER NOT NULL,
				signature TEXT,
				documentation TEXT,
				is_exported INTEGER NOT NULL,
				is_async INTEGER,
				access_modifier TEXT
			)
		`);

		// Create references table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS references (
				id TEXT PRIMARY KEY,
				file_id TEXT NOT NULL,
				target_name TEXT NOT NULL,
				reference_type TEXT NOT NULL,
				line_number INTEGER NOT NULL,
				column_number INTEGER NOT NULL,
				metadata TEXT NOT NULL
			)
		`);

		// Create dependencies table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS dependencies (
				id TEXT PRIMARY KEY,
				from_file_id TEXT,
				to_file_id TEXT,
				from_symbol_id TEXT,
				to_symbol_id TEXT,
				dependency_type TEXT NOT NULL,
				metadata TEXT NOT NULL
			)
		`);

		// Create indexes for common queries
		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
			CREATE INDEX IF NOT EXISTS idx_references_file_id ON references(file_id);
			CREATE INDEX IF NOT EXISTS idx_dependencies_from_file ON dependencies(from_file_id);
			CREATE INDEX IF NOT EXISTS idx_dependencies_to_file ON dependencies(to_file_id);
		`);
	}

	async storeSymbol(fileId: string, symbol: Symbol): Promise<string> {
		const id = crypto.randomUUID();

		const stmt = this.db.prepare(`
			INSERT INTO symbols (
				id, file_id, name, kind, line_start, line_end,
				column_start, column_end, signature, documentation,
				is_exported, is_async, access_modifier
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			fileId,
			symbol.name,
			symbol.kind,
			symbol.lineStart,
			symbol.lineEnd,
			symbol.columnStart,
			symbol.columnEnd,
			symbol.signature,
			symbol.documentation,
			symbol.isExported ? 1 : 0,
			symbol.isAsync ? 1 : 0,
			symbol.accessModifier || null,
		);

		return id;
	}

	async storeReference(fileId: string, reference: Reference): Promise<string> {
		const id = crypto.randomUUID();

		const stmt = this.db.prepare(`
			INSERT INTO references (
				id, file_id, target_name, reference_type,
				line_number, column_number, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			fileId,
			reference.targetName,
			reference.referenceType,
			reference.lineNumber,
			reference.columnNumber,
			JSON.stringify(reference.metadata),
		);

		return id;
	}

	async storeDependency(dependency: DependencyEdge): Promise<string> {
		const id = crypto.randomUUID();

		const stmt = this.db.prepare(`
			INSERT INTO dependencies (
				id, from_file_id, to_file_id, from_symbol_id,
				to_symbol_id, dependency_type, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		stmt.run(
			id,
			dependency.fromFileId,
			dependency.toFileId,
			dependency.fromSymbolId,
			dependency.toSymbolId,
			dependency.dependencyType,
			JSON.stringify(dependency.metadata),
		);

		return id;
	}

	async getSymbolsByFile(fileId: string): Promise<Symbol[]> {
		const stmt = this.db.prepare(`
			SELECT * FROM symbols WHERE file_id = ?
		`);

		const rows = stmt.all(fileId) as any[];

		return rows.map((row) => ({
			name: row.name,
			kind: row.kind,
			lineStart: row.line_start,
			lineEnd: row.line_end,
			columnStart: row.column_start,
			columnEnd: row.column_end,
			signature: row.signature,
			documentation: row.documentation,
			isExported: row.is_exported === 1,
			isAsync: row.is_async === 1 ? true : undefined,
			accessModifier: row.access_modifier || undefined,
		}));
	}

	async getReferencesByFile(fileId: string): Promise<Reference[]> {
		const stmt = this.db.prepare(`
			SELECT * FROM references WHERE file_id = ?
		`);

		const rows = stmt.all(fileId) as any[];

		return rows.map((row) => ({
			targetName: row.target_name,
			referenceType: row.reference_type,
			lineNumber: row.line_number,
			columnNumber: row.column_number,
			metadata: JSON.parse(row.metadata),
		}));
	}

	async getDependenciesByFile(fileId: string): Promise<DependencyEdge[]> {
		const stmt = this.db.prepare(`
			SELECT * FROM dependencies
			WHERE from_file_id = ? OR to_file_id = ?
		`);

		const rows = stmt.all(fileId, fileId) as any[];

		return rows.map((row) => ({
			fromFileId: row.from_file_id,
			toFileId: row.to_file_id,
			fromSymbolId: row.from_symbol_id,
			toSymbolId: row.to_symbol_id,
			dependencyType: row.dependency_type,
			metadata: JSON.parse(row.metadata),
		}));
	}

	async clear(): Promise<void> {
		this.db.exec("DELETE FROM symbols");
		this.db.exec("DELETE FROM references");
		this.db.exec("DELETE FROM dependencies");
	}

	/**
	 * Close the database connection.
	 *
	 * Should be called when done with the adapter.
	 */
	close(): void {
		this.db.close();
	}
}
