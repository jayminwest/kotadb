/**
 * SQLite database client for KotaDB local-first architecture.
 *
 * Provides a type-safe wrapper around bun:sqlite with:
 * - WAL mode for concurrent reads and writes
 * - Connection pool (1 writer + N readers)
 * - Proper pragmas for performance and safety
 * - Hash-based ID generation for multi-agent workflows
 *
 * Inspired by the beads pattern: https://github.com/steveyegge/beads
 *
 * @module @db/sqlite/sqlite-client
 */

import { Database, type Statement } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { cpus } from "node:os";
import { createLogger } from "@logging/logger.js";
import { findProjectRoot } from "@config/project-root.js";
import { ensureKotadbIgnored } from "@config/gitignore.js";
import { runMigrations, updateExistingChecksums } from "./migration-runner.js";

const logger = createLogger({ module: "sqlite-client" });

/**
 * Configuration options for KotaDatabase
 */
export interface DatabaseConfig {
	/** Path to the SQLite database file */
	path: string;
	/** Open in read-only mode (for reader connections) */
	readonly: boolean;
	/** Enable WAL mode for concurrent access */
	wal: boolean;
	/** Busy timeout in milliseconds */
	busyTimeout: number;
	/** Enable foreign key enforcement */
	foreignKeys: boolean;
	/** Cache size in pages (negative = KB) */
	cacheSize: number;
	/** Skip auto-initialization of schema (for tests that manage their own schema) */
	skipSchemaInit: boolean;
}

/**
 * Default configuration for KotaDatabase
 */
export const DEFAULT_CONFIG: DatabaseConfig = {
	path: "",
	readonly: false,
	wal: true,
	busyTimeout: 30000,
	foreignKeys: true,
	cacheSize: -64000, // 64MB cache
	skipSchemaInit: false,
};

/**
 * Get the default database path (project-local .kotadb/kota.db).
 * Falls back to error if no project root found and no explicit path configured.
 * 
 * @returns Absolute path to database file
 * @throws Error if no project root found and no explicit config
 */
export function getDefaultDbPath(): string {
	const projectRoot = findProjectRoot();
	
	if (!projectRoot) {
		throw new Error(
			"Unable to determine project root. Please either:\n" +
			"  1. Run KotaDB from within a project directory (containing .git)\n" +
			"  2. Set KOTADB_PATH environment variable\n" +
			"  3. Provide explicit path via config.path parameter"
		);
	}
	
	// Ensure .kotadb/ is in .gitignore (non-fatal)
	ensureKotadbIgnored(projectRoot);
	
	return join(projectRoot, ".kotadb", "kota.db");
}

/**
 * Resolve database path from config or environment
 */
export function resolveDbPath(configPath?: string): string {
	// Priority: explicit config > env var > default
	if (configPath) {
		return configPath;
	}

	const envPath = process.env.KOTADB_PATH;
	if (envPath) {
		return envPath;
	}

	return getDefaultDbPath();
}

/**
 * KotaDatabase - SQLite database wrapper for local-first operation.
 *
 * Features:
 * - WAL mode enabled by default for concurrent access
 * - Connection pooling with separate writer and readers
 * - Automatic directory creation
 * - Prepared statement caching
 * - Type-safe query methods
 */
export class KotaDatabase {
	private db: Database;
	private readonly config: DatabaseConfig;
	private preparedStatements: Map<string, Statement> = new Map();

	constructor(config: Partial<DatabaseConfig> = {}) {
		const resolvedPath = resolveDbPath(config.path);
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			path: resolvedPath,
		};

		// Ensure directory exists
		const dbDir = dirname(this.config.path);
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true });
			logger.info("Created database directory", { path: dbDir });
		}

		// Create database connection
		this.db = new Database(this.config.path, {
			readonly: this.config.readonly,
			create: !this.config.readonly,
		});

		// Configure database pragmas
		this.configurePragmas();

		// Auto-initialize schema if not already present (writer only)
		// - New database: Apply full base schema
		// - Existing database: Run pending migrations
		if (!this.config.readonly && !this.config.skipSchemaInit) {
			if (!this.tableExists("indexed_files")) {
				// NEW DATABASE: Apply base schema
				const schemaPath = join(__dirname, "../sqlite-schema.sql");
				const schema = readFileSync(schemaPath, "utf-8");
				this.exec(schema);
				logger.info("SQLite schema initialized", {
					path: this.config.path,
				});
			} else {
				// EXISTING DATABASE: Run migrations
				const migrationsDir = join(__dirname, "../migrations");
				try {
					const result = runMigrations(this, migrationsDir);
					if (result.appliedCount > 0) {
						logger.info("Applied pending migrations", {
							count: result.appliedCount,
							migrations: result.appliedMigrations,
						});
					}
					// Update checksums for existing migrations (after checksum column added)
					updateExistingChecksums(this, migrationsDir);
					if (result.errors.length > 0) {
						logger.error("Migration errors", { errors: result.errors });
					}
				} catch (error) {
					logger.error("Migration runner failed", {
						error: error instanceof Error ? error.message : String(error),
					});
					// Do not throw - allow database to continue operating with current schema
					// This prevents startup failures due to migration issues
				}
			}
		}

		logger.info("Database initialized", {
			path: this.config.path,
			readonly: this.config.readonly,
			wal: this.config.wal,
		});
	}

	/**
	 * Configure SQLite pragmas for optimal performance and safety
	 */
	private configurePragmas(): void {
		// For readonly connections, only set read-compatible pragmas
		if (this.config.readonly) {
			// These pragmas work in readonly mode
			this.db.exec("PRAGMA busy_timeout = " + String(this.config.busyTimeout));
			this.db.exec("PRAGMA cache_size = " + String(this.config.cacheSize));
			this.db.exec("PRAGMA temp_store = MEMORY");
			this.db.exec("PRAGMA mmap_size = 268435456");
			
			logger.debug("Configured readonly database pragmas", {
				busy_timeout: this.config.busyTimeout,
				cache_size: this.config.cacheSize,
			});
			return;
		}

		// WAL mode for concurrent reads and writes (writer only)
		if (this.config.wal) {
			this.db.exec("PRAGMA journal_mode = WAL");
			logger.debug("Enabled WAL mode");
		}

		// Foreign key enforcement
		if (this.config.foreignKeys) {
			this.db.exec("PRAGMA foreign_keys = ON");
		}

		// Busy timeout for lock contention
		this.db.exec("PRAGMA busy_timeout = " + String(this.config.busyTimeout));

		// Performance optimizations
		this.db.exec("PRAGMA cache_size = " + String(this.config.cacheSize));
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.db.exec("PRAGMA temp_store = MEMORY");
		this.db.exec("PRAGMA mmap_size = 268435456"); // 256MB memory-mapped I/O

		logger.debug("Configured database pragmas", {
			busy_timeout: this.config.busyTimeout,
			foreign_keys: this.config.foreignKeys,
			cache_size: this.config.cacheSize,
		});
	}
	/**
	 * Get the underlying Database instance for direct access
	 */
	get raw(): Database {
		return this.db;
	}

	/**
	 * Get the database file path
	 */
	get path(): string {
		return this.config.path;
	}

	/**
	 * Check if the database is in read-only mode
	 */
	get isReadOnly(): boolean {
		return this.config.readonly;
	}

	/**
	 * Execute a SQL statement without returning results
	 */
	exec(sql: string): void {
		this.db.exec(sql);
	}

	/**
	 * Execute a parameterized statement without returning results
	 */
	run(sql: string, params?: (string | number | bigint | boolean | null | Uint8Array)[]): void {
		if (params && params.length > 0) {
			this.db.run(sql, params);
		} else {
			this.db.run(sql);
		}
	}

	/**
	 * Query and return all matching rows
	 */
	query<T>(sql: string, params?: (string | number | bigint | boolean | null | Uint8Array)[]): T[] {
		const stmt = this.db.prepare(sql);
		if (params && params.length > 0) {
			return stmt.all(...params) as T[];
		}
		return stmt.all() as T[];
	}

	/**
	 * Query and return a single row (or undefined if not found)
	 */
	queryOne<T>(sql: string, params?: (string | number | bigint | boolean | null | Uint8Array)[]): T | undefined {
		const stmt = this.db.prepare(sql);
		if (params && params.length > 0) {
			return stmt.get(...params) as T | undefined;
		}
		return stmt.get() as T | undefined;
	}

	/**
	 * Get or create a prepared statement (cached)
	 */
	prepare(sql: string): Statement {
		let stmt = this.preparedStatements.get(sql);
		if (!stmt) {
			stmt = this.db.prepare(sql);
			this.preparedStatements.set(sql, stmt);
		}
		return stmt;
	}

	/**
	 * Execute a function within a transaction.
	 * Automatically commits on success, rolls back on error.
	 */
	transaction<T>(fn: () => T): T {
		const txFn = this.db.transaction(fn);
		return txFn();
	}

	/**
	 * Execute a function within an IMMEDIATE transaction.
	 * Use for write operations to prevent SQLITE_BUSY errors.
	 */
	immediateTransaction<T>(fn: () => T): T {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			this.db.exec("COMMIT");
			return result;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	/**
	 * Check if a table exists in the database
	 */
	tableExists(tableName: string): boolean {
		const result = this.queryOne<{ count: number }>(
			"SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
			[tableName],
		);
		return (result?.count ?? 0) > 0;
	}

	/**
	 * Get the current database schema version
	 */
	getSchemaVersion(): number {
		const result = this.queryOne<{ user_version: number }>("PRAGMA user_version");
		return result?.user_version ?? 0;
	}

	/**
	 * Set the database schema version
	 */
	setSchemaVersion(version: number): void {
		this.db.exec("PRAGMA user_version = " + String(version));
	}

	/**
	 * Verify FTS5 support is available
	 */
	verifyFTS5Support(): boolean {
		try {
			// Try to create a temporary FTS5 table to verify support
			this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content)");
			this.db.exec("DROP TABLE IF EXISTS _fts5_test");
			return true;
		} catch {
			logger.warn("FTS5 support not available");
			return false;
		}
	}

	/**
	 * Get database file size in bytes
	 */
	getFileSize(): number {
		const result = this.queryOne<{ page_count: number; page_size: number }>(
			"SELECT page_count, page_size FROM pragma_page_count(), pragma_page_size()",
		);
		if (!result) return 0;
		return result.page_count * result.page_size;
	}

	/**
	 * Checkpoint WAL file to main database
	 */
	checkpoint(): void {
		this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		logger.debug("WAL checkpoint completed");
	}

	/**
	 * Optimize database (VACUUM and ANALYZE)
	 */
	optimize(): void {
		this.db.exec("VACUUM");
		this.db.exec("ANALYZE");
		logger.info("Database optimized");
	}

	/**
	 * Close the database connection
	 */
	close(): void {
		// Finalize all prepared statements
		for (const stmt of this.preparedStatements.values()) {
			stmt.finalize();
		}
		this.preparedStatements.clear();

		this.db.close();
		logger.info("Database connection closed", { path: this.config.path });
	}
}

/**
 * Connection pool for managing multiple database connections.
 * Implements the pattern: 1 writer + N readers (N = number of CPUs)
 */
export class ConnectionPool {
	private writer: KotaDatabase;
	private readers: KotaDatabase[];
	private readerIndex: number = 0;
	private readonly dbPath: string;

	constructor(dbPath?: string) {
		this.dbPath = resolveDbPath(dbPath);

		// Create writer connection first (WAL mode, read-write)
		// This ensures the database file is created before readers try to open it
		this.writer = new KotaDatabase({
			path: this.dbPath,
			readonly: false,
			wal: true,
		});

		// Run a simple pragma to ensure the database file is fully initialized
		// This is necessary because SQLite may not create the file until first write
		this.writer.exec("SELECT 1");

		// Create reader connections (read-only)
		const numReaders = cpus().length;
		this.readers = [];

		for (let i = 0; i < numReaders; i++) {
			this.readers.push(
				new KotaDatabase({
					path: this.dbPath,
					readonly: true,
					wal: true,
				}),
			);
		}

		logger.info("Connection pool initialized", {
			path: this.dbPath,
			writers: 1,
			readers: numReaders,
		});
	}

	/**
	 * Get the writer connection for write operations
	 */
	getWriter(): KotaDatabase {
		return this.writer;
	}

	/**
	 * Get a reader connection using round-robin selection
	 */
	getReader(): KotaDatabase {
		const reader = this.readers[this.readerIndex];
		this.readerIndex = (this.readerIndex + 1) % this.readers.length;
		return reader!;
	}

	/**
	 * Execute a read operation using a reader connection
	 */
	read<T>(fn: (db: KotaDatabase) => T): T {
		return fn(this.getReader());
	}

	/**
	 * Execute a write operation using the writer connection
	 */
	write<T>(fn: (db: KotaDatabase) => T): T {
		return fn(this.writer);
	}

	/**
	 * Execute a write operation in an IMMEDIATE transaction
	 */
	writeTransaction<T>(fn: (db: KotaDatabase) => T): T {
		return this.writer.immediateTransaction(() => fn(this.writer));
	}

	/**
	 * Close all connections in the pool
	 */
	close(): void {
		this.writer.close();
		for (const reader of this.readers) {
			reader.close();
		}
		logger.info("Connection pool closed");
	}
}

/**
 * Factory function to create a single database connection.
 * Use this for simple use cases or testing.
 */
export function createDatabase(config?: Partial<DatabaseConfig>): KotaDatabase {
	return new KotaDatabase(config);
}

/**
 * Factory function to create a connection pool.
 * Use this for production deployments with concurrent access.
 */
export function createConnectionPool(dbPath?: string): ConnectionPool {
	return new ConnectionPool(dbPath);
}

// Singleton instances for global access
let globalPool: ConnectionPool | null = null;
let globalDb: KotaDatabase | null = null;

/**
 * Get or create the global connection pool.
 * Use this for application-wide database access.
 */
export function getGlobalPool(): ConnectionPool {
	if (!globalPool) {
		globalPool = createConnectionPool();
	}
	return globalPool;
}

/**
 * Get or create the global database instance.
 * Simpler alternative to the pool for single-threaded use.
 */
export function getGlobalDatabase(): KotaDatabase {
	if (!globalDb) {
		globalDb = createDatabase();
	}
	return globalDb;
}

/**
 * Close global connections (for cleanup during shutdown)
 */
export function closeGlobalConnections(): void {
	if (globalPool) {
		globalPool.close();
		globalPool = null;
	}
	if (globalDb) {
		globalDb.close();
		globalDb = null;
	}
}
