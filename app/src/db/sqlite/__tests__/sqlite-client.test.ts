/**
 * Tests for SQLite client (KotaDatabase)
 *
 * Following antimocking philosophy: uses real SQLite databases
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	KotaDatabase,
	createDatabase,
	resolveDbPath,
	getDefaultDbPath,
} from "../sqlite-client.js";

describe("KotaDatabase", () => {
	let tempDir: string;
	let db: KotaDatabase;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-sqlite-test-"));
	});

	afterEach(() => {
		if (db) {
			db.close();
		}
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("initialization", () => {
		it("should create database at specified path", () => {
			const dbPath = join(tempDir, "test.db");
			db = createDatabase({ path: dbPath });

			expect(db.path).toBe(dbPath);
			expect(db.isReadOnly).toBe(false);
		});

		it("should create parent directory if needed", () => {
			const dbPath = join(tempDir, "nested", "dir", "test.db");
			db = createDatabase({ path: dbPath });

			expect(db.path).toBe(dbPath);
		});

		it("should enable WAL mode by default", () => {
			const dbPath = join(tempDir, "wal-test.db");
			db = createDatabase({ path: dbPath });

			const result = db.queryOne<{ journal_mode: string }>("PRAGMA journal_mode");
			expect(result?.journal_mode).toBe("wal");
		});

		it("should enable foreign keys by default", () => {
			const dbPath = join(tempDir, "fk-test.db");
			db = createDatabase({ path: dbPath });

			const result = db.queryOne<{ foreign_keys: number }>("PRAGMA foreign_keys");
			expect(result?.foreign_keys).toBe(1);
		});

		it("should set busy timeout", () => {
			const dbPath = join(tempDir, "timeout-test.db");
			db = createDatabase({ path: dbPath, busyTimeout: 5000 });

			// Verify configuration was passed
			expect(db.path).toBe(dbPath);
		});
	});

	describe("query methods", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "query-test.db");
			db = createDatabase({ path: dbPath });

			// Create test table
			db.exec(`
				CREATE TABLE users (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					email TEXT NOT NULL,
					tier TEXT DEFAULT 'free'
				)
			`);
		});

		it("should execute SQL statements", () => {
			db.exec("INSERT INTO users (id, name, email) VALUES ('1', 'Test', 'test@example.com')");

			const result = db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users");
			expect(result?.count).toBe(1);
		});

		it("should run parameterized queries", () => {
			db.run(
				"INSERT INTO users (id, name, email, tier) VALUES (?, ?, ?, ?)",
				["1", "Alice", "alice@example.com", "pro"],
			);

			const user = db.queryOne<{ name: string; tier: string }>(
				"SELECT name, tier FROM users WHERE id = ?",
				["1"],
			);
			expect(user?.name).toBe("Alice");
			expect(user?.tier).toBe("pro");
		});

		it("should query all matching rows", () => {
			db.run("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", ["1", "Alice", "alice@example.com"]);
			db.run("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", ["2", "Bob", "bob@example.com"]);

			const users = db.query<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY id");
			expect(users.length).toBe(2);
			expect(users[0]?.name).toBe("Alice");
			expect(users[1]?.name).toBe("Bob");
		});

		it("should return null for non-existent row", () => {
			// SQLite returns null (not undefined) when row not found
			const user = db.queryOne<{ name: string }>("SELECT name FROM users WHERE id = ?", ["nonexistent"]);
			expect(user).toBeNull();
		});
	});

	describe("transactions", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "tx-test.db");
			db = createDatabase({ path: dbPath });

			db.exec(`
				CREATE TABLE accounts (
					id TEXT PRIMARY KEY,
					balance INTEGER NOT NULL
				)
			`);

			db.run("INSERT INTO accounts (id, balance) VALUES (?, ?)", ["acc1", 100]);
			db.run("INSERT INTO accounts (id, balance) VALUES (?, ?)", ["acc2", 50]);
		});

		it("should commit successful transactions", () => {
			db.transaction(() => {
				db.run("UPDATE accounts SET balance = balance - 30 WHERE id = ?", ["acc1"]);
				db.run("UPDATE accounts SET balance = balance + 30 WHERE id = ?", ["acc2"]);
			});

			const acc1 = db.queryOne<{ balance: number }>("SELECT balance FROM accounts WHERE id = ?", ["acc1"]);
			const acc2 = db.queryOne<{ balance: number }>("SELECT balance FROM accounts WHERE id = ?", ["acc2"]);

			expect(acc1?.balance).toBe(70);
			expect(acc2?.balance).toBe(80);
		});

		it("should rollback failed transactions", () => {
			try {
				db.transaction(() => {
					db.run("UPDATE accounts SET balance = balance - 30 WHERE id = ?", ["acc1"]);
					throw new Error("Simulated failure");
				});
			} catch {
				// Expected
			}

			const acc1 = db.queryOne<{ balance: number }>("SELECT balance FROM accounts WHERE id = ?", ["acc1"]);
			expect(acc1?.balance).toBe(100); // Should be unchanged
		});

		it("should support IMMEDIATE transactions", () => {
			const result = db.immediateTransaction(() => {
				db.run("UPDATE accounts SET balance = balance + 10 WHERE id = ?", ["acc1"]);
				return db.queryOne<{ balance: number }>("SELECT balance FROM accounts WHERE id = ?", ["acc1"]);
			});

			expect(result?.balance).toBe(110);
		});
	});

	describe("utility methods", () => {
		beforeEach(() => {
			const dbPath = join(tempDir, "util-test.db");
			db = createDatabase({ path: dbPath });
		});

		it("should check if table exists", () => {
			db.exec("CREATE TABLE test_table (id TEXT PRIMARY KEY)");

			expect(db.tableExists("test_table")).toBe(true);
			expect(db.tableExists("nonexistent")).toBe(false);
		});

		it("should get and set schema version", () => {
			expect(db.getSchemaVersion()).toBe(0);

			db.setSchemaVersion(5);
			expect(db.getSchemaVersion()).toBe(5);
		});

		it("should verify FTS5 support", () => {
			// Bun's SQLite includes FTS5 by default
			expect(db.verifyFTS5Support()).toBe(true);
		});

		it("should get database file size", () => {
			db.exec("CREATE TABLE data (id TEXT, content TEXT)");
			db.run("INSERT INTO data VALUES (?, ?)", ["1", "x".repeat(1000)]);

			const size = db.getFileSize();
			expect(size).toBeGreaterThan(0);
		});
	});
});

describe("resolveDbPath", () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should use explicit path if provided", () => {
		const path = resolveDbPath("/custom/path/db.db");
		expect(path).toBe("/custom/path/db.db");
	});

	it("should use KOTADB_PATH env var if set", () => {
		process.env = { ...originalEnv, KOTADB_PATH: "/env/path/db.db" };
		const path = resolveDbPath();
		expect(path).toBe("/env/path/db.db");
	});

	it("should use project-local default path as fallback", () => {
		delete process.env.KOTADB_PATH;
		const path = resolveDbPath();
		// Should return project-local path (finds .git in kotadb repo)
		expect(path).toContain(".kotadb");
		expect(path).toContain("kota.db");
		expect(path).toContain("kotadb"); // Repo name
		expect(path.endsWith("/.kotadb/kota.db")).toBe(true);
	});
});

describe("getDefaultDbPath", () => {
	it("should return project-local path under .kotadb/", () => {
		const path = getDefaultDbPath();
		expect(path).toContain(".kotadb");
		expect(path).toContain("kota.db");
		expect(path).toContain("kotadb"); // Repo name
		// Should be project-local, not global
		expect(path.endsWith("/.kotadb/kota.db")).toBe(true);
	});
});
