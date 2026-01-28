/**
 * Tests for SQLite schema validation
 *
 * Validates the schema defined in sqlite-schema.sql works correctly.
 * Schema contains local-first essentials per issue #543:
 * - repositories: Git repository metadata
 * - indexed_files: Source files with FTS5 for code search
 * - indexed_symbols: Functions, classes, variables
 * - indexed_references: Dependency graph edges
 * - projects: User-defined groupings
 * - project_repositories: Project-repo associations
 * - schema_migrations: Migration tracking
 *
 * Following antimocking philosophy: uses real SQLite databases
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SQLite Schema Validation", () => {
	let db: Database;

	beforeEach(() => {
		// Create in-memory database
		db = new Database(":memory:");

		// Read and apply schema
		const schemaPath = join(__dirname, "../../../db/sqlite-schema.sql");
		const schema = readFileSync(schemaPath, "utf-8");

		// Execute schema (SQLite supports multiple statements)
		db.exec(schema);
	});

	afterEach(() => {
		db.close();
	});

	describe("table existence", () => {
		it("should create all 7 core tables", () => {
			const tables = db
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)
				.all();

			const tableNames = tables.map((t) => t.name);

			// Expected tables (excluding internal tables like sqlite_sequence)
			expect(tableNames).toContain("repositories");
			expect(tableNames).toContain("indexed_files");
			expect(tableNames).toContain("indexed_symbols");
			expect(tableNames).toContain("indexed_references");
			expect(tableNames).toContain("projects");
			expect(tableNames).toContain("project_repositories");
			expect(tableNames).toContain("schema_migrations");

			// Should have at least 7 tables (may have more with internal tables)
			expect(tableNames.length).toBeGreaterThanOrEqual(7);
		});

		it("should create FTS5 virtual table for full-text search", () => {
			const virtualTables = db
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%VIRTUAL TABLE%' ORDER BY name",
				)
				.all();

			const vtableNames = virtualTables.map((t) => t.name);
			expect(vtableNames).toContain("indexed_files_fts");
		});
	});

	describe("trigger existence", () => {
		it("should create all FTS5 sync triggers", () => {
			const triggers = db
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
				)
				.all();

			const triggerNames = triggers.map((t) => t.name);

			// FTS5 triggers for indexed_files
			expect(triggerNames).toContain("indexed_files_fts_ai"); // After INSERT
			expect(triggerNames).toContain("indexed_files_fts_ad"); // After DELETE
			expect(triggerNames).toContain("indexed_files_fts_au"); // After UPDATE
		});
	});

	describe("repositories table", () => {
		it("should enforce unique full_name constraint", () => {
			const insert = db.prepare(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
			);

			insert.run("repo1", "test-repo", "owner/test-repo");

			// Should fail on duplicate full_name
			expect(() => {
				insert.run("repo2", "test-repo", "owner/test-repo");
			}).toThrow();
		});

		it("should set default values for timestamps and metadata", () => {
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);

			const repo = db
				.query<{ created_at: string; updated_at: string; metadata: string; default_branch: string }, [string]>(
					"SELECT created_at, updated_at, metadata, default_branch FROM repositories WHERE id = ?",
				)
				.get("repo1");

			expect(repo?.created_at).toBeTruthy();
			expect(repo?.updated_at).toBeTruthy();
			expect(repo?.metadata).toBe("{}");
			expect(repo?.default_branch).toBe("main");
		});

		it("should create indexes for common queries", () => {
			const indexes = db
				.query<{ name: string }, []>(
					"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='repositories' ORDER BY name",
				)
				.all();

			const indexNames = indexes.map((i) => i.name);

			expect(indexNames).toContain("idx_repositories_full_name");
			expect(indexNames).toContain("idx_repositories_user_id");
			expect(indexNames).toContain("idx_repositories_org_id");
			expect(indexNames).toContain("idx_repositories_last_indexed");
		});
	});

	describe("indexed_files table", () => {
		beforeEach(() => {
			// Create repository first (foreign key requirement)
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);
		});

		it("should enforce foreign key to repositories", () => {
			// Enable foreign keys (should be on by default but explicit here)
			db.run("PRAGMA foreign_keys = ON");

			// Should fail - repository doesn't exist
			expect(() => {
				db.run(
					"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
					["file1", "nonexistent", "src/main.ts", "console.log('test')"],
				);
			}).toThrow();
		});

		it("should enforce unique (repository_id, path) constraint", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/main.ts", "content1"],
			);

			// Should fail - duplicate path in same repository
			expect(() => {
				db.run(
					"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
					["file2", "repo1", "src/main.ts", "content2"],
				);
			}).toThrow();
		});

		it("should cascade delete when repository is deleted", () => {
			db.run("PRAGMA foreign_keys = ON");

			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/main.ts", "content"],
			);

			// Delete repository
			db.run("DELETE FROM repositories WHERE id = ?", ["repo1"]);

			// File should be deleted
			const files = db
				.query<{ id: string }, [string]>("SELECT id FROM indexed_files WHERE id = ?").all("file1");

			expect(files.length).toBe(0);
		});

		it("should set default values for indexed_at and metadata", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/main.ts", "content"],
			);

			const file = db
				.query<{ indexed_at: string; metadata: string }, [string]>(
					"SELECT indexed_at, metadata FROM indexed_files WHERE id = ?",
				)
				.get("file1");

			expect(file?.indexed_at).toBeTruthy();
			expect(file?.metadata).toBe("{}");
		});
	});

	describe("FTS5 full-text search", () => {
		beforeEach(() => {
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);
		});

		it("should automatically index file content on INSERT", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/utils.ts", "export function calculateTotal(items) { return items.reduce(); }"],
			);

			// Search for content using FTS5
			const results = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("calculateTotal");

			expect(results.length).toBe(1);
			expect(results[0]?.path).toBe("src/utils.ts");
		});

		it("should automatically update FTS index on UPDATE", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/utils.ts", "old content with keyword"],
			);

			// Update content
			db.run(
				"UPDATE indexed_files SET content = ? WHERE id = ?",
				["new content with different term", "file1"],
			);

			// Old keyword should not be found
			const oldResults = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("keyword");

			expect(oldResults.length).toBe(0);

			// New term should be found
			const newResults = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("different");

			expect(newResults.length).toBe(1);
		});

		it("should automatically remove from FTS index on DELETE", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/utils.ts", "unique searchable content"],
			);

			// Verify it's searchable
			let results = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("searchable");

			expect(results.length).toBe(1);

			// Delete the file
			db.run("DELETE FROM indexed_files WHERE id = ?", ["file1"]);

			// Should not be searchable anymore
			results = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("searchable");

			expect(results.length).toBe(0);
		});

		it("should support multi-word search queries", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/auth.ts", "export async function authenticateUser(credentials) {}"],
			);

			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file2", "repo1", "src/user.ts", "export function createUser(data) {}"],
			);

			// Search for "function" should match both (common word in both files)
			const results = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ? ORDER BY f.path",
				)
				.all("function");

			expect(results.length).toBe(2);
			expect(results[0]?.path).toBe("src/auth.ts");
			expect(results[1]?.path).toBe("src/user.ts");
		});

		it("should search in both path and content fields", () => {
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/authentication/login.ts", "export function handleLogin() {}"],
			);

			// Search for path term
			const pathResults = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("authentication");

			expect(pathResults.length).toBe(1);

			// Search for content term
			const contentResults = db
				.query<{ path: string }, [string]>(
					"SELECT f.path FROM indexed_files_fts JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid WHERE indexed_files_fts MATCH ?",
				)
				.all("handleLogin");

			expect(contentResults.length).toBe(1);
		});
	});

	describe("indexed_symbols table", () => {
		beforeEach(() => {
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/main.ts", "content"],
			);
		});

		it("should enforce foreign key to indexed_files", () => {
			db.run("PRAGMA foreign_keys = ON");

			expect(() => {
				db.run(
					"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
					["sym1", "nonexistent", "repo1", "myFunc", "function", 1, 10],
				);
			}).toThrow();
		});

		it("should enforce CHECK constraint on kind enum", () => {
			expect(() => {
				db.run(
					"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
					["sym1", "file1", "repo1", "myFunc", "invalid_kind", 1, 10],
				);
			}).toThrow();
		});

		it("should accept valid kind values", () => {
			const validKinds = [
				"function",
				"class",
				"interface",
				"type",
				"variable",
				"constant",
				"method",
				"property",
				"module",
				"namespace",
				"enum",
				"enum_member",
			];

			for (const kind of validKinds) {
				db.run(
					"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
					[`sym_${kind}`, "file1", "repo1", `test_${kind}`, kind, 1, 10],
				);
			}

			const symbols = db
				.query<{ kind: string }, []>("SELECT kind FROM indexed_symbols").all();

			expect(symbols.length).toBe(validKinds.length);
		});

		it("should cascade delete when file is deleted", () => {
			db.run("PRAGMA foreign_keys = ON");

			db.run(
				"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["sym1", "file1", "repo1", "myFunc", "function", 1, 10],
			);

			// Delete file
			db.run("DELETE FROM indexed_files WHERE id = ?", ["file1"]);

			// Symbol should be deleted
			const symbols = db
				.query<{ id: string }, [string]>("SELECT id FROM indexed_symbols WHERE id = ?").all("sym1");

			expect(symbols.length).toBe(0);
		});
	});

	describe("indexed_references table", () => {
		beforeEach(() => {
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);
			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/main.ts", "content"],
			);
		});

		it("should enforce foreign key to indexed_files", () => {
			db.run("PRAGMA foreign_keys = ON");

			expect(() => {
				db.run(
					"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, line_number, reference_type) VALUES (?, ?, ?, ?, ?, ?)",
					["ref1", "nonexistent", "repo1", "myFunc", 5, "call"],
				);
			}).toThrow();
		});

		it("should enforce CHECK constraint on reference_type enum", () => {
			expect(() => {
				db.run(
					"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, line_number, reference_type) VALUES (?, ?, ?, ?, ?, ?)",
					["ref1", "file1", "repo1", "myFunc", 5, "invalid_type"],
				);
			}).toThrow();
		});

		it("should accept valid reference_type values", () => {
			const validTypes = [
				"import",
				"call",
				"extends",
				"property_access",
				"implements",
				"type_reference",
				"variable_reference",
			];

			for (const refType of validTypes) {
				db.run(
					"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, line_number, reference_type) VALUES (?, ?, ?, ?, ?, ?)",
					[`ref_${refType}`, "file1", "repo1", `test_${refType}`, 1, refType],
				);
			}

			const refs = db
				.query<{ reference_type: string }, []>("SELECT reference_type FROM indexed_references").all();

			expect(refs.length).toBe(validTypes.length);
		});

		it("should allow nullable target_symbol_id for external references", () => {
			db.run(
				"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, line_number, reference_type, target_symbol_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["ref1", "file1", "repo1", "externalFunc", 5, "call", null],
			);

			const ref = db
				.query<{ target_symbol_id: string | null }, [string]>(
					"SELECT target_symbol_id FROM indexed_references WHERE id = ?",
				)
				.get("ref1");

			expect(ref?.target_symbol_id).toBeNull();
		});

		it("should set NULL on target_symbol_id when symbol is deleted", () => {
			db.run("PRAGMA foreign_keys = ON");

			// Create symbol
			db.run(
				"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["sym1", "file1", "repo1", "targetFunc", "function", 1, 10],
			);

			// Create reference to symbol
			db.run(
				"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, line_number, reference_type, target_symbol_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["ref1", "file1", "repo1", "targetFunc", 15, "call", "sym1"],
			);

			// Delete symbol
			db.run("DELETE FROM indexed_symbols WHERE id = ?", ["sym1"]);

			// Reference should still exist but target_symbol_id should be NULL
			const ref = db
				.query<{ id: string; target_symbol_id: string | null }, [string]>(
					"SELECT id, target_symbol_id FROM indexed_references WHERE id = ?",
				)
				.get("ref1");

			expect(ref?.id).toBe("ref1");
			expect(ref?.target_symbol_id).toBeNull();
		});
	});

	describe("projects table", () => {
		it("should enforce unique (user_id, name) constraint", () => {
			db.run(
				"INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
				["proj1", "user1", "My Project"],
			);

			// Should fail - duplicate name for same user
			expect(() => {
				db.run(
					"INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
					["proj2", "user1", "My Project"],
				);
			}).toThrow();
		});

		it("should allow same name for different users", () => {
			db.run(
				"INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
				["proj1", "user1", "My Project"],
			);

			// Should succeed - different user
			db.run(
				"INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)",
				["proj2", "user2", "My Project"],
			);

			const projects = db
				.query<{ id: string }, [string]>("SELECT id FROM projects WHERE name = ?").all("My Project");

			expect(projects.length).toBe(2);
		});

		it("should enforce unique (org_id, name) constraint", () => {
			db.run(
				"INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)",
				["proj1", "org1", "Org Project"],
			);

			// Should fail - duplicate name for same org
			expect(() => {
				db.run(
					"INSERT INTO projects (id, org_id, name) VALUES (?, ?, ?)",
					["proj2", "org1", "Org Project"],
				);
			}).toThrow();
		});
	});

	describe("project_repositories junction table", () => {
		beforeEach(() => {
			db.run(
				"INSERT INTO projects (id, name) VALUES (?, ?)",
				["proj1", "My Project"],
			);
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);
		});

		it("should enforce foreign key to projects", () => {
			db.run("PRAGMA foreign_keys = ON");

			expect(() => {
				db.run(
					"INSERT INTO project_repositories (id, project_id, repository_id) VALUES (?, ?, ?)",
					["pr1", "nonexistent", "repo1"],
				);
			}).toThrow();
		});

		it("should enforce foreign key to repositories", () => {
			db.run("PRAGMA foreign_keys = ON");

			expect(() => {
				db.run(
					"INSERT INTO project_repositories (id, project_id, repository_id) VALUES (?, ?, ?)",
					["pr1", "proj1", "nonexistent"],
				);
			}).toThrow();
		});

		it("should enforce unique (project_id, repository_id) constraint", () => {
			db.run(
				"INSERT INTO project_repositories (id, project_id, repository_id) VALUES (?, ?, ?)",
				["pr1", "proj1", "repo1"],
			);

			// Should fail - duplicate association
			expect(() => {
				db.run(
					"INSERT INTO project_repositories (id, project_id, repository_id) VALUES (?, ?, ?)",
					["pr2", "proj1", "repo1"],
				);
			}).toThrow();
		});

		it("should cascade delete when project is deleted", () => {
			db.run("PRAGMA foreign_keys = ON");

			db.run(
				"INSERT INTO project_repositories (id, project_id, repository_id) VALUES (?, ?, ?)",
				["pr1", "proj1", "repo1"],
			);

			// Delete project
			db.run("DELETE FROM projects WHERE id = ?", ["proj1"]);

			// Association should be deleted
			const associations = db
				.query<{ id: string }, [string]>("SELECT id FROM project_repositories WHERE id = ?").all("pr1");

			expect(associations.length).toBe(0);
		});
	});

	describe("schema_migrations table", () => {
		it("should have initial migration recorded", () => {
			const migration = db
				.query<{ name: string }, [string]>(
					"SELECT name FROM schema_migrations WHERE name = ?",
				)
				.get("001_initial_sqlite_schema");

			expect(migration?.name).toBe("001_initial_sqlite_schema");
		});

		it("should enforce unique migration names", () => {
			expect(() => {
				db.run(
					"INSERT INTO schema_migrations (name) VALUES (?)",
					["001_initial_sqlite_schema"],
				);
			}).toThrow();
		});

		it("should auto-increment id", () => {
			db.run("INSERT INTO schema_migrations (name) VALUES (?)", ["002_test_migration"]);
			db.run("INSERT INTO schema_migrations (name) VALUES (?)", ["003_another_migration"]);

			const migrations = db
				.query<{ id: number; name: string }, []>(
					"SELECT id, name FROM schema_migrations ORDER BY id",
				)
				.all();

			expect(migrations.length).toBe(3); // Including initial migration
			expect(migrations[0]?.id).toBe(1);
			expect(migrations[1]?.id).toBe(2);
			expect(migrations[2]?.id).toBe(3);
		});
	});

	describe("complex queries", () => {
		beforeEach(() => {
			// Set up a complete dataset for testing
			db.run(
				"INSERT INTO repositories (id, name, full_name) VALUES (?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo"],
			);

			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file1", "repo1", "src/auth.ts", "export async function login(user, password) { return authenticateUser(user, password); }"],
			);

			db.run(
				"INSERT INTO indexed_files (id, repository_id, path, content) VALUES (?, ?, ?, ?)",
				["file2", "repo1", "src/utils.ts", "export function authenticateUser(user, password) { /* impl */ }"],
			);

			db.run(
				"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["sym1", "file1", "repo1", "login", "function", 1, 1],
			);

			db.run(
				"INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, line_start, line_end) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["sym2", "file2", "repo1", "authenticateUser", "function", 1, 1],
			);

			db.run(
				"INSERT INTO indexed_references (id, file_id, repository_id, symbol_name, target_symbol_id, line_number, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
				["ref1", "file1", "repo1", "authenticateUser", "sym2", 1, "call"],
			);
		});

		it("should query dependency graph via references", () => {
			// Find all symbols that login depends on
			const dependencies = db
				.query<{ symbol_name: string; target_file: string }, [string]>(
					`
					SELECT 
						r.symbol_name,
						f.path as target_file
					FROM indexed_references r
					JOIN indexed_symbols s ON r.target_symbol_id = s.id
					JOIN indexed_files f ON s.file_id = f.id
					WHERE r.file_id IN (
						SELECT file_id FROM indexed_symbols WHERE name = ?
					)
					`,
				)
				.all("login");

			expect(dependencies.length).toBe(1);
			expect(dependencies[0]?.symbol_name).toBe("authenticateUser");
			expect(dependencies[0]?.target_file).toBe("src/utils.ts");
		});

		it("should combine FTS search with symbol lookup", () => {
			// Find files containing "login" and get their symbols
			const results = db
				.query<{ path: string; symbol_name: string; kind: string }, [string]>(
					`
					SELECT 
						f.path,
						s.name as symbol_name,
						s.kind
					FROM indexed_files_fts
					JOIN indexed_files f ON indexed_files_fts.rowid = f.rowid
					LEFT JOIN indexed_symbols s ON s.file_id = f.id
					WHERE indexed_files_fts MATCH ?
					ORDER BY f.path, s.name
					`,
				)
				.all("login");

			expect(results.length).toBeGreaterThan(0);
			expect(results.some((r) => r.symbol_name === "login")).toBe(true);
		});

		it("should query repositories with file counts", () => {
			const repoStats = db
				.query<{ full_name: string; file_count: number }, []>(
					`
					SELECT 
						r.full_name,
						COUNT(f.id) as file_count
					FROM repositories r
					LEFT JOIN indexed_files f ON f.repository_id = r.id
					GROUP BY r.id, r.full_name
					`,
				)
				.all();

			expect(repoStats.length).toBe(1);
			expect(repoStats[0]?.full_name).toBe("owner/test-repo");
			expect(repoStats[0]?.file_count).toBe(2);
		});
	});

	describe("JSON metadata handling", () => {
		it("should store and retrieve JSON metadata in repositories", () => {
			const metadata = {
				stars: 100,
				language: "TypeScript",
				topics: ["testing", "sqlite"],
			};

			db.run(
				"INSERT INTO repositories (id, name, full_name, metadata) VALUES (?, ?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo", JSON.stringify(metadata)],
			);

			const repo = db
				.query<{ metadata: string }, [string]>("SELECT metadata FROM repositories WHERE id = ?").get("repo1");

			const parsed = JSON.parse(repo?.metadata || "{}");
			expect(parsed.stars).toBe(100);
			expect(parsed.language).toBe("TypeScript");
			expect(parsed.topics).toEqual(["testing", "sqlite"]);
		});

		it("should use JSON1 extension to query metadata", () => {
			db.run(
				"INSERT INTO repositories (id, name, full_name, metadata) VALUES (?, ?, ?, ?)",
				["repo1", "test-repo", "owner/test-repo", JSON.stringify({ language: "TypeScript" })],
			);

			db.run(
				"INSERT INTO repositories (id, name, full_name, metadata) VALUES (?, ?, ?, ?)",
				["repo2", "python-repo", "owner/python-repo", JSON.stringify({ language: "Python" })],
			);

			// Use json_extract to query metadata
			const tsRepos = db
				.query<{ full_name: string }, [string]>(
					"SELECT full_name FROM repositories WHERE json_extract(metadata, '$.language') = ?",
				)
				.all("TypeScript");

			expect(tsRepos.length).toBe(1);
			expect(tsRepos[0]?.full_name).toBe("owner/test-repo");
		});
	});
});
