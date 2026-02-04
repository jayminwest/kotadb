/**
 * Tests for Migration Runner
 *
 * Following antimocking philosophy: uses real SQLite databases and temporary directories
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KotaDatabase, createDatabase } from "../sqlite-client.js";
import {
	parseMigrationFilename,
	computeChecksum,
	scanMigrations,
	getAppliedMigrations,
	applyMigration,
	validateChecksum,
	runMigrations,
	updateExistingChecksums,
	type Migration,
	type AppliedMigration,
} from "../migration-runner.js";

describe("Migration Runner", () => {
	let tempDir: string;
	let migrationsDir: string;
	let db: KotaDatabase;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-migration-test-"));
		migrationsDir = join(tempDir, "migrations");
		// Create migrations directory
		require("node:fs").mkdirSync(migrationsDir, { recursive: true });
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("parseMigrationFilename", () => {
		it("should parse valid migration filenames", () => {
			const result = parseMigrationFilename("004_memory_layer.sql");
			expect(result).toEqual({ number: 4, name: "004_memory_layer" });
		});

		it("should parse multi-digit migration numbers", () => {
			const result = parseMigrationFilename("123_some_migration.sql");
			expect(result).toEqual({ number: 123, name: "123_some_migration" });
		});

		it("should parse migration names with underscores", () => {
			const result = parseMigrationFilename("006_add_migration_checksums.sql");
			expect(result).toEqual({ number: 6, name: "006_add_migration_checksums" });
		});

		it("should return null for invalid formats", () => {
			expect(parseMigrationFilename("invalid.sql")).toBeNull();
			expect(parseMigrationFilename("004-memory-layer.sql")).toBeNull();
			expect(parseMigrationFilename("not_a_migration")).toBeNull();
			expect(parseMigrationFilename("")).toBeNull();
			expect(parseMigrationFilename("_.sql")).toBeNull();
		});
	});

	describe("computeChecksum", () => {
		it("should compute consistent SHA-256 hash", () => {
			const content = "SELECT 1;";
			const hash1 = computeChecksum(content);
			const hash2 = computeChecksum(content);
			expect(hash1).toBe(hash2);
		});

		it("should return 64-character hex string (SHA-256)", () => {
			const hash = computeChecksum("SELECT 1;");
			expect(hash).toHaveLength(64);
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		it("should produce different hashes for different content", () => {
			const hash1 = computeChecksum("SELECT 1;");
			const hash2 = computeChecksum("SELECT 2;");
			expect(hash1).not.toBe(hash2);
		});
	});

	describe("scanMigrations", () => {
		it("should find and sort migration files", () => {
			writeFileSync(join(migrationsDir, "002_test_b.sql"), "SELECT 2;");
			writeFileSync(join(migrationsDir, "001_test_a.sql"), "SELECT 1;");
			writeFileSync(join(migrationsDir, "003_test_c.sql"), "SELECT 3;");

			const migrations = scanMigrations(migrationsDir);

			expect(migrations).toHaveLength(3);
			expect(migrations[0]?.name).toBe("001_test_a");
			expect(migrations[1]?.name).toBe("002_test_b");
			expect(migrations[2]?.name).toBe("003_test_c");
		});

		it("should include checksums for each migration", () => {
			const content = "CREATE TABLE test (id INTEGER);";
			writeFileSync(join(migrationsDir, "001_test.sql"), content);

			const migrations = scanMigrations(migrationsDir);

			expect(migrations).toHaveLength(1);
			expect(migrations[0]?.checksum).toBe(computeChecksum(content));
		});

		it("should skip invalid migration filenames", () => {
			writeFileSync(join(migrationsDir, "001_valid.sql"), "SELECT 1;");
			writeFileSync(join(migrationsDir, "invalid.sql"), "SELECT 2;");
			writeFileSync(join(migrationsDir, "readme.md"), "# Readme");

			const migrations = scanMigrations(migrationsDir);

			expect(migrations).toHaveLength(1);
			expect(migrations[0]?.name).toBe("001_valid");
		});

		it("should return empty array for non-existent directory", () => {
			const migrations = scanMigrations("/nonexistent/path");
			expect(migrations).toEqual([]);
		});

		it("should return empty array for empty directory", () => {
			const migrations = scanMigrations(migrationsDir);
			expect(migrations).toEqual([]);
		});
	});

	describe("getAppliedMigrations", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "test.db");
			db = createDatabase({ path: dbPath, skipSchemaInit: true });

			// Create minimal schema_migrations table
			db.exec(`
				CREATE TABLE schema_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TEXT NOT NULL DEFAULT (datetime('now')),
					checksum TEXT
				)
			`);
		});

		it("should return empty map for no applied migrations", () => {
			const applied = getAppliedMigrations(db);
			expect(applied.size).toBe(0);
		});

		it("should return applied migrations with checksums", () => {
			db.run(
				"INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
				["001_test", "abc123"]
			);

			const applied = getAppliedMigrations(db);

			expect(applied.size).toBe(1);
			expect(applied.get("001_test")?.name).toBe("001_test");
			expect(applied.get("001_test")?.checksum).toBe("abc123");
		});

		it("should return applied migrations without checksum column", () => {
			// Create table without checksum column
			db.exec("DROP TABLE schema_migrations");
			db.exec(`
				CREATE TABLE schema_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TEXT NOT NULL DEFAULT (datetime('now'))
				)
			`);
			db.run(
				"INSERT INTO schema_migrations (name) VALUES (?)",
				["001_test"]
			);

			const applied = getAppliedMigrations(db);

			expect(applied.size).toBe(1);
			expect(applied.get("001_test")?.name).toBe("001_test");
			expect(applied.get("001_test")?.checksum).toBeNull();
		});

		it("should return empty map when table does not exist", () => {
			db.exec("DROP TABLE schema_migrations");

			const applied = getAppliedMigrations(db);
			expect(applied.size).toBe(0);
		});
	});

	describe("validateChecksum", () => {
		it("should return true when checksums match", () => {
			const migration: Migration = {
				filename: "001_test.sql",
				name: "001_test",
				number: 1,
				path: "/path/to/001_test.sql",
				content: "SELECT 1;",
				checksum: "abc123",
			};
			const applied: AppliedMigration = {
				name: "001_test",
				applied_at: "2026-02-04T00:00:00Z",
				checksum: "abc123",
			};

			expect(validateChecksum(migration, applied)).toBe(true);
		});

		it("should return false when checksums mismatch (drift)", () => {
			const migration: Migration = {
				filename: "001_test.sql",
				name: "001_test",
				number: 1,
				path: "/path/to/001_test.sql",
				content: "SELECT 1;",
				checksum: "abc123",
			};
			const applied: AppliedMigration = {
				name: "001_test",
				applied_at: "2026-02-04T00:00:00Z",
				checksum: "different",
			};

			expect(validateChecksum(migration, applied)).toBe(false);
		});

		it("should return true when no checksum stored (legacy migration)", () => {
			const migration: Migration = {
				filename: "001_test.sql",
				name: "001_test",
				number: 1,
				path: "/path/to/001_test.sql",
				content: "SELECT 1;",
				checksum: "abc123",
			};
			const applied: AppliedMigration = {
				name: "001_test",
				applied_at: "2026-02-04T00:00:00Z",
				checksum: null,
			};

			expect(validateChecksum(migration, applied)).toBe(true);
		});
	});

	describe("applyMigration", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "test.db");
			db = createDatabase({ path: dbPath, skipSchemaInit: true });

			// Create minimal schema_migrations table with checksum column
			db.exec(`
				CREATE TABLE schema_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TEXT NOT NULL DEFAULT (datetime('now')),
					checksum TEXT
				)
			`);
		});

		it("should apply migration and record it", () => {
			const migration: Migration = {
				filename: "001_create_test.sql",
				name: "001_create_test",
				number: 1,
				path: join(migrationsDir, "001_create_test.sql"),
				content: `
					CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);
					INSERT OR IGNORE INTO schema_migrations (name) VALUES ('001_create_test');
				`,
				checksum: "test-checksum",
			};

			applyMigration(db, migration);

			expect(db.tableExists("test_table")).toBe(true);
			const applied = db.queryOne<{ name: string; checksum: string }>(
				"SELECT name, checksum FROM schema_migrations WHERE name = ?",
				["001_create_test"]
			);
			expect(applied?.name).toBe("001_create_test");
			expect(applied?.checksum).toBe("test-checksum");
		});

		it("should rollback on failure", () => {
			const migration: Migration = {
				filename: "001_failing.sql",
				name: "001_failing",
				number: 1,
				path: join(migrationsDir, "001_failing.sql"),
				content: `
					CREATE TABLE first_table (id INTEGER);
					INVALID SQL STATEMENT;
				`,
				checksum: "test-checksum",
			};

			expect(() => applyMigration(db, migration)).toThrow();
			expect(db.tableExists("first_table")).toBe(false);
		});
	});

	describe("runMigrations", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "test.db");
			db = createDatabase({ path: dbPath, skipSchemaInit: true });

			// Create minimal schema_migrations table
			db.exec(`
				CREATE TABLE schema_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TEXT NOT NULL DEFAULT (datetime('now')),
					checksum TEXT
				)
			`);
		});

		it("should apply all pending migrations in order", () => {
			// Create test migrations
			writeFileSync(
				join(migrationsDir, "001_create_users.sql"),
				`
				CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
				INSERT OR IGNORE INTO schema_migrations (name) VALUES ('001_create_users');
				`
			);
			writeFileSync(
				join(migrationsDir, "002_create_posts.sql"),
				`
				CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
				INSERT OR IGNORE INTO schema_migrations (name) VALUES ('002_create_posts');
				`
			);

			const result = runMigrations(db, migrationsDir);

			expect(result.appliedCount).toBe(2);
			expect(result.appliedMigrations).toContain("001_create_users");
			expect(result.appliedMigrations).toContain("002_create_posts");
			expect(result.errors).toHaveLength(0);
			expect(db.tableExists("users")).toBe(true);
			expect(db.tableExists("posts")).toBe(true);
		});

		it("should skip already-applied migrations", () => {
			// Record migration as already applied
			db.run(
				"INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
				["001_create_users", computeChecksum("CREATE TABLE users (id INTEGER);")]
			);
			db.exec("CREATE TABLE users (id INTEGER)");

			// Create migration files
			writeFileSync(
				join(migrationsDir, "001_create_users.sql"),
				"CREATE TABLE users (id INTEGER);"
			);
			writeFileSync(
				join(migrationsDir, "002_create_posts.sql"),
				`
				CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
				INSERT OR IGNORE INTO schema_migrations (name) VALUES ('002_create_posts');
				`
			);

			const result = runMigrations(db, migrationsDir);

			expect(result.appliedCount).toBe(1);
			expect(result.appliedMigrations).toEqual(["002_create_posts"]);
		});

		it("should detect drift when migration file changed", () => {
			// Record migration with old checksum
			db.run(
				"INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
				["001_test", "old-checksum"]
			);

			// Create migration file with different content
			writeFileSync(
				join(migrationsDir, "001_test.sql"),
				"SELECT 'new content';"
			);

			const result = runMigrations(db, migrationsDir);

			expect(result.driftDetected).toBe(true);
			expect(result.appliedCount).toBe(0);
		});

		it("should stop on migration failure", () => {
			writeFileSync(
				join(migrationsDir, "001_valid.sql"),
				`
				CREATE TABLE valid_table (id INTEGER);
				INSERT OR IGNORE INTO schema_migrations (name) VALUES ('001_valid');
				`
			);
			writeFileSync(
				join(migrationsDir, "002_invalid.sql"),
				"INVALID SQL THAT WILL FAIL;"
			);
			writeFileSync(
				join(migrationsDir, "003_never_runs.sql"),
				"CREATE TABLE never_runs (id INTEGER);"
			);

			const result = runMigrations(db, migrationsDir);

			expect(result.appliedCount).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("002_invalid");
			expect(db.tableExists("valid_table")).toBe(true);
			expect(db.tableExists("never_runs")).toBe(false);
		});

		it("should handle empty migrations directory", () => {
			const result = runMigrations(db, migrationsDir);

			expect(result.appliedCount).toBe(0);
			expect(result.driftDetected).toBe(false);
			expect(result.errors).toHaveLength(0);
		});
	});

	describe("updateExistingChecksums", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "test.db");
			db = createDatabase({ path: dbPath, skipSchemaInit: true });

			db.exec(`
				CREATE TABLE schema_migrations (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					name TEXT NOT NULL UNIQUE,
					applied_at TEXT NOT NULL DEFAULT (datetime('now')),
					checksum TEXT
				)
			`);
		});

		it("should update checksums for migrations without them", () => {
			// Record migration without checksum
			db.run(
				"INSERT INTO schema_migrations (name) VALUES (?)",
				["001_test"]
			);

			// Create migration file
			const content = "SELECT 1;";
			writeFileSync(join(migrationsDir, "001_test.sql"), content);

			const updatedCount = updateExistingChecksums(db, migrationsDir);

			expect(updatedCount).toBe(1);
			const record = db.queryOne<{ checksum: string }>(
				"SELECT checksum FROM schema_migrations WHERE name = ?",
				["001_test"]
			);
			expect(record?.checksum).toBe(computeChecksum(content));
		});

		it("should not update migrations that already have checksums", () => {
			db.run(
				"INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
				["001_test", "existing-checksum"]
			);

			writeFileSync(join(migrationsDir, "001_test.sql"), "SELECT 1;");

			const updatedCount = updateExistingChecksums(db, migrationsDir);

			expect(updatedCount).toBe(0);
			const record = db.queryOne<{ checksum: string }>(
				"SELECT checksum FROM schema_migrations WHERE name = ?",
				["001_test"]
			);
			expect(record?.checksum).toBe("existing-checksum");
		});
	});
});
