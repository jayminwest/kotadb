/**
 * Tests for JSONL export/import layer
 *
 * Following antimocking philosophy: uses real SQLite databases and file operations
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KotaDatabase, createDatabase } from "../sqlite-client.js";
import { JSONLExporter, createExporter } from "../jsonl-exporter.js";
import { importFromJSONL, validateJSONL } from "../jsonl-importer.js";

describe("JSONLExporter", () => {
	let tempDir: string;
	let exportDir: string;
	let db: KotaDatabase;
	let exporter: JSONLExporter;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-jsonl-test-"));
		exportDir = join(tempDir, "export");

		const dbPath = join(tempDir, "test.db");
		db = createDatabase({ path: dbPath });

		// Create test table
		db.exec(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				tier TEXT DEFAULT 'free'
			)
		`);

		exporter = createExporter(db, exportDir, [
			{ name: "users", excludeFields: [] },
		]);
	});

	afterEach(() => {
		exporter.cancel();
		db.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	describe("exportNow", () => {
		it("should export table to JSONL file", async () => {
			db.run("INSERT INTO users (id, email, tier) VALUES (?, ?, ?)", ["1", "test@example.com", "free"]);
			db.run("INSERT INTO users (id, email, tier) VALUES (?, ?, ?)", ["2", "pro@example.com", "pro"]);

			const result = await exporter.exportNow();

			expect(result.tablesExported).toBe(1);
			expect(result.totalRows).toBe(2);

			const filepath = join(exportDir, "users.jsonl");
			expect(existsSync(filepath)).toBe(true);

			const content = await Bun.file(filepath).text();
			const lines = content.trim().split("\n");
			expect(lines.length).toBe(2);

			const row1 = JSON.parse(lines[0] as string);
			expect(row1.id).toBe("1");
			expect(row1.email).toBe("test@example.com");
		});

		it("should skip unchanged tables on subsequent exports", async () => {
			db.run("INSERT INTO users (id, email) VALUES (?, ?)", ["1", "test@example.com"]);

			const result1 = await exporter.exportNow();
			expect(result1.tablesExported).toBe(1);

			const result2 = await exporter.exportNow();
			expect(result2.tablesSkipped).toBe(1);
			expect(result2.tablesExported).toBe(0);
		});

		it("should export after changes", async () => {
			db.run("INSERT INTO users (id, email) VALUES (?, ?)", ["1", "test@example.com"]);

			await exporter.exportNow();

			// Make a change
			db.run("INSERT INTO users (id, email) VALUES (?, ?)", ["2", "new@example.com"]);

			const result = await exporter.exportNow();
			expect(result.tablesExported).toBe(1);
			expect(result.totalRows).toBe(2);
		});

		it("should exclude sensitive fields", async () => {
			// Create table with sensitive field
			db.exec(`
				CREATE TABLE api_keys (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					key_hash TEXT NOT NULL
				)
			`);
			db.run("INSERT INTO api_keys (id, name, key_hash) VALUES (?, ?, ?)", ["1", "My Key", "secrethash123"]);

			const sensitiveExporter = createExporter(db, exportDir, [
				{ name: "api_keys", excludeFields: ["key_hash"] },
			]);

			await sensitiveExporter.exportNow();

			const filepath = join(exportDir, "api_keys.jsonl");
			const content = await Bun.file(filepath).text();
			const row = JSON.parse(content.trim());

			expect(row.id).toBe("1");
			expect(row.name).toBe("My Key");
			expect(row.key_hash).toBeUndefined();

			sensitiveExporter.cancel();
		});

		it("should skip non-existent tables", async () => {
			const missingExporter = createExporter(db, exportDir, [
				{ name: "nonexistent_table" },
			]);

			const result = await missingExporter.exportNow();

			expect(result.tablesSkipped).toBe(1);
			expect(result.tablesExported).toBe(0);

			missingExporter.cancel();
		});
	});

	describe("scheduleExport", () => {
		it("should debounce multiple export requests", async () => {
			db.run("INSERT INTO users (id, email) VALUES (?, ?)", ["1", "test@example.com"]);

			// Schedule multiple exports
			exporter.scheduleExport();
			exporter.scheduleExport();
			exporter.scheduleExport();

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 6000));

			const filepath = join(exportDir, "users.jsonl");
			expect(existsSync(filepath)).toBe(true);
		}, 10000);
	});
});

describe("importFromJSONL", () => {
	let tempDir: string;
	let importDir: string;
	let db: KotaDatabase;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-import-test-"));
		importDir = join(tempDir, "import");

		const dbPath = join(tempDir, "test.db");
		db = createDatabase({ path: dbPath });

		// Create test table
		db.exec(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				tier TEXT DEFAULT 'free'
			)
		`);

		// Create import directory
		mkdirSync(importDir, { recursive: true });
	});

	afterEach(() => {
		db.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should import JSONL file into table", async () => {
		// Create JSONL file
		const jsonl = [
			JSON.stringify({ id: "1", email: "alice@example.com", tier: "free" }),
			JSON.stringify({ id: "2", email: "bob@example.com", tier: "pro" }),
		].join("\n") + "\n";

		await Bun.write(join(importDir, "users.jsonl"), jsonl);

		const result = await importFromJSONL(db, importDir, [
			{ name: "users", primaryKey: "id", requiredFields: ["id", "email"] },
		]);

		expect(result.tablesImported).toBe(1);
		expect(result.totalRowsImported).toBe(2);
		expect(result.errors.length).toBe(0);

		const users = db.query<{ id: string; email: string }>("SELECT id, email FROM users ORDER BY id");
		expect(users.length).toBe(2);
		expect(users[0]?.email).toBe("alice@example.com");
		expect(users[1]?.email).toBe("bob@example.com");
	});

	it("should skip missing JSONL files", async () => {
		const result = await importFromJSONL(db, importDir, [
			{ name: "users", primaryKey: "id" },
		]);

		expect(result.tablesSkipped).toBe(1);
		expect(result.tablesImported).toBe(0);
	});

	it("should validate required fields", async () => {
		const jsonl = [
			JSON.stringify({ id: "1", email: "valid@example.com" }),
			JSON.stringify({ id: "2" }), // Missing email
		].join("\n") + "\n";

		await Bun.write(join(importDir, "users.jsonl"), jsonl);

		const result = await importFromJSONL(db, importDir, [
			{ name: "users", primaryKey: "id", requiredFields: ["id", "email"] },
		]);

		expect(result.totalRowsImported).toBe(1);
		expect(result.totalRowsSkipped).toBe(1);
		expect(result.errors.length).toBe(1);
	});

	it("should handle JSON objects in fields", async () => {
		db.exec(`
			CREATE TABLE settings (
				id TEXT PRIMARY KEY,
				config TEXT
			)
		`);

		const jsonl = JSON.stringify({
			id: "1",
			config: { theme: "dark", fontSize: 14 },
		}) + "\n";

		await Bun.write(join(importDir, "settings.jsonl"), jsonl);

		const result = await importFromJSONL(db, importDir, [
			{ name: "settings", primaryKey: "id" },
		]);

		expect(result.totalRowsImported).toBe(1);

		const row = db.queryOne<{ config: string }>("SELECT config FROM settings WHERE id = ?", ["1"]);
		const config = JSON.parse(row?.config || "{}");
		expect(config.theme).toBe("dark");
	});

	it("should use INSERT OR REPLACE by default", async () => {
		// Insert initial data
		db.run("INSERT INTO users (id, email, tier) VALUES (?, ?, ?)", ["1", "old@example.com", "free"]);

		// Import with updated data
		const jsonl = JSON.stringify({ id: "1", email: "new@example.com", tier: "pro" }) + "\n";
		await Bun.write(join(importDir, "users.jsonl"), jsonl);

		await importFromJSONL(db, importDir, [
			{ name: "users", primaryKey: "id" },
		]);

		const user = db.queryOne<{ email: string; tier: string }>("SELECT email, tier FROM users WHERE id = ?", ["1"]);
		expect(user?.email).toBe("new@example.com");
		expect(user?.tier).toBe("pro");
	});

	it("should report errors for invalid JSON", async () => {
		const invalidJsonl = `{"id": "1", "email": "test@example.com"}
not valid json
{"id": "3", "email": "valid@example.com"}
`;

		await Bun.write(join(importDir, "users.jsonl"), invalidJsonl);

		const result = await importFromJSONL(db, importDir, [
			{ name: "users", primaryKey: "id" },
		]);

		expect(result.totalRowsImported).toBe(2);
		expect(result.totalRowsSkipped).toBe(1);
		expect(result.errors.length).toBe(1);
	});
});

describe("validateJSONL", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-validate-test-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should validate valid JSONL file", async () => {
		const filepath = join(tempDir, "valid.jsonl");
		const content = [
			JSON.stringify({ id: "1", name: "Alice" }),
			JSON.stringify({ id: "2", name: "Bob" }),
		].join("\n") + "\n";

		await Bun.write(filepath, content);

		const result = await validateJSONL(filepath);

		expect(result.valid).toBe(true);
		expect(result.lineCount).toBe(2);
		expect(result.errors.length).toBe(0);
	});

	it("should detect invalid JSON lines", async () => {
		const filepath = join(tempDir, "invalid.jsonl");
		const content = `{"valid": true}
not json
{"also": "valid"}
`;

		await Bun.write(filepath, content);

		const result = await validateJSONL(filepath);

		expect(result.valid).toBe(false);
		expect(result.lineCount).toBe(3);
		expect(result.errors.length).toBe(1);
		expect(result.errors[0]).toContain("Line 2");
	});

	it("should handle non-existent file", async () => {
		const result = await validateJSONL(join(tempDir, "nonexistent.jsonl"));

		expect(result.valid).toBe(false);
		expect(result.errors).toContain("File not found");
	});
});

describe("round-trip export/import", () => {
	let tempDir: string;
	let exportDir: string;
	let sourceDb: KotaDatabase;
	let targetDb: KotaDatabase;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "kota-roundtrip-test-"));
		exportDir = join(tempDir, "export");

		// Create source database with data
		const sourcePath = join(tempDir, "source.db");
		sourceDb = createDatabase({ path: sourcePath });

		sourceDb.exec(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				tier TEXT DEFAULT 'free'
			)
		`);

		sourceDb.run("INSERT INTO users VALUES (?, ?, ?)", ["1", "alice@example.com", "pro"]);
		sourceDb.run("INSERT INTO users VALUES (?, ?, ?)", ["2", "bob@example.com", "free"]);

		// Create empty target database
		const targetPath = join(tempDir, "target.db");
		targetDb = createDatabase({ path: targetPath });

		targetDb.exec(`
			CREATE TABLE users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL,
				tier TEXT DEFAULT 'free'
			)
		`);
	});

	afterEach(() => {
		sourceDb.close();
		targetDb.close();
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("should preserve data through export/import cycle", async () => {
		// Export from source
		const exporter = createExporter(sourceDb, exportDir, [
			{ name: "users" },
		]);
		await exporter.exportNow();
		exporter.cancel();

		// Import to target
		await importFromJSONL(targetDb, exportDir, [
			{ name: "users", primaryKey: "id" },
		]);

		// Verify data matches
		const sourceUsers = sourceDb.query<{ id: string; email: string; tier: string }>(
			"SELECT * FROM users ORDER BY id",
		);
		const targetUsers = targetDb.query<{ id: string; email: string; tier: string }>(
			"SELECT * FROM users ORDER BY id",
		);

		expect(targetUsers.length).toBe(sourceUsers.length);

		for (let idx = 0; idx < sourceUsers.length; idx++) {
			const source = sourceUsers[idx];
			const target = targetUsers[idx];
			expect(target?.id).toBe(source?.id);
			expect(target?.email).toBe(source?.email);
			expect(target?.tier).toBe(source?.tier);
		}
	});
});
