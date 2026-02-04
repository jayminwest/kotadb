import { describe, test, expect } from "bun:test";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * Parsers Tests
 *
 * Tests the parsers module for file discovery and source file parsing.
 * Follows anti-mock principles by using real files and filesystem operations.
 */

describe("SQL File Support", () => {
	let testDir: string;

	function setupTestDirectory(): string {
		const tempDir = join(tmpdir(), `kotadb-parsers-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		return tempDir;
	}

	function teardownTestDirectory(dir: string) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}

	function createTestFile(dir: string, path: string, content: string) {
		const fullPath = join(dir, path);
		const dirPath = join(fullPath, "..");
		mkdirSync(dirPath, { recursive: true });
		writeFileSync(fullPath, content);
	}

	test("should discover SQL files in repository", async () => {
		testDir = setupTestDirectory();

		// Create test files
		createTestFile(testDir, "schema.sql", "CREATE TABLE users (id INTEGER);");
		createTestFile(testDir, "migrations/001_initial.sql", "-- Migration comment\nCREATE TABLE sessions;");
		createTestFile(testDir, "functions/increment.sql", "CREATE TRIGGER test_trigger;");
		createTestFile(testDir, "index.ts", "export const test = 1;");

		const sources = await discoverSources(testDir);
		const sqlFiles = sources.filter(path => path.endsWith(".sql"));

		expect(sqlFiles).toHaveLength(3);
		expect(sqlFiles.some(path => path.includes("schema.sql"))).toBe(true);
		expect(sqlFiles.some(path => path.includes("001_initial.sql"))).toBe(true);
		expect(sqlFiles.some(path => path.includes("increment.sql"))).toBe(true);

		teardownTestDirectory(testDir);
	});

	test("should parse SQL files as content-only with no dependencies", async () => {
		testDir = setupTestDirectory();

		const sqlContent = `-- Migration: Add user sessions
CREATE TABLE user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);`;

		createTestFile(testDir, "schema.sql", sqlContent);

		const indexedFile = await parseSourceFile(join(testDir, "schema.sql"), testDir);

		expect(indexedFile).not.toBeNull();
		expect(indexedFile!.path).toBe("schema.sql");
		expect(indexedFile!.content).toBe(sqlContent);
		expect(indexedFile!.dependencies).toEqual([]);
		expect(indexedFile!.projectRoot).toBe(resolve(testDir));
		expect(indexedFile!.indexedAt).toBeInstanceOf(Date);

		teardownTestDirectory(testDir);
	});

	test("should handle SQL files with various CREATE statements", async () => {
		testDir = setupTestDirectory();

		const complexSql = `-- Complex schema with various elements
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    clone_url TEXT,
    default_branch TEXT DEFAULT 'main'
);

CREATE VIEW active_repos AS
SELECT * FROM repositories WHERE clone_url IS NOT NULL;

CREATE TRIGGER update_timestamp
AFTER UPDATE ON repositories
FOR EACH ROW
BEGIN
    UPDATE repositories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;`;

		createTestFile(testDir, "complex-schema.sql", complexSql);

		const indexedFile = await parseSourceFile(join(testDir, "complex-schema.sql"), testDir);

		expect(indexedFile).not.toBeNull();
		expect(indexedFile!.content).toContain("CREATE TABLE IF NOT EXISTS repositories");
		expect(indexedFile!.content).toContain("CREATE VIEW active_repos");
		expect(indexedFile!.content).toContain("CREATE TRIGGER update_timestamp");
		expect(indexedFile!.dependencies).toEqual([]);

		teardownTestDirectory(testDir);
	});

	test("should parse SQL migration files correctly", async () => {
		testDir = setupTestDirectory();

		const migrationContent = `-- Migration: 005_workflow_contexts
-- Add workflow context storage for enhanced search capabilities

CREATE TABLE workflow_contexts (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    context_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_workflow_contexts_workflow_id ON workflow_contexts(workflow_id);`;

		createTestFile(testDir, "migrations/005_workflow_contexts.sql", migrationContent);

		const indexedFile = await parseSourceFile(join(testDir, "migrations/005_workflow_contexts.sql"), testDir);

		expect(indexedFile).not.toBeNull();
		expect(indexedFile!.path).toBe("migrations/005_workflow_contexts.sql");
		expect(indexedFile!.content).toContain("-- Migration: 005_workflow_contexts");
		expect(indexedFile!.content).toContain("workflow_contexts");
		expect(indexedFile!.dependencies).toEqual([]);

		teardownTestDirectory(testDir);
	});

	test("should handle SQL files with comments and whitespace", async () => {
		testDir = setupTestDirectory();

		const sqlWithComments = `
-- This is a comment at the start

/* Multi-line comment
   spanning multiple lines */

CREATE TABLE test_table (
    -- Inline comment for id column
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL, -- Another inline comment
    /* Block comment for description */
    description TEXT
);

-- Final comment
`;

		createTestFile(testDir, "commented-schema.sql", sqlWithComments);

		const indexedFile = await parseSourceFile(join(testDir, "commented-schema.sql"), testDir);

		expect(indexedFile).not.toBeNull();
		expect(indexedFile!.content).toBe(sqlWithComments);
		expect(indexedFile!.content).toContain("-- This is a comment at the start");
		expect(indexedFile!.content).toContain("/* Multi-line comment");
		expect(indexedFile!.dependencies).toEqual([]);

		teardownTestDirectory(testDir);
	});

	test("should not attempt dependency extraction on SQL files", async () => {
		testDir = setupTestDirectory();

		// SQL content that might look like it has imports/dependencies
		const sqlContent = `-- This SQL file references other files but should not extract dependencies
-- File: schema/users.sql
-- Import: functions/utilities.sql

CREATE TABLE users (
    id INTEGER PRIMARY KEY
);

-- Reference to another table that might be in a different file
ALTER TABLE user_sessions ADD FOREIGN KEY (user_id) REFERENCES users(id);`;

		createTestFile(testDir, "references.sql", sqlContent);

		const indexedFile = await parseSourceFile(join(testDir, "references.sql"), testDir);

		expect(indexedFile).not.toBeNull();
		expect(indexedFile!.dependencies).toEqual([]);
		expect(indexedFile!.content).toContain("-- Import: functions/utilities.sql");
		expect(indexedFile!.content).toContain("REFERENCES users(id)");

		teardownTestDirectory(testDir);
	});
});

describe("File Discovery Integration", () => {
	let testDir: string;

	function setupTestDirectory(): string {
		const tempDir = join(tmpdir(), `kotadb-discovery-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		return tempDir;
	}

	function teardownTestDirectory(dir: string) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}

	function createTestFile(dir: string, path: string, content: string) {
		const fullPath = join(dir, path);
		const dirPath = join(fullPath, "..");
		mkdirSync(dirPath, { recursive: true });
		writeFileSync(fullPath, content);
	}

	test("should discover mixed file types including SQL", async () => {
		testDir = setupTestDirectory();

		// Create a mixed repository with various file types
		createTestFile(testDir, "src/index.ts", "export const app = 1;");
		createTestFile(testDir, "src/types.d.ts", "declare module 'test';");
		createTestFile(testDir, "components/Button.jsx", "export default function Button() {}");
		createTestFile(testDir, "db/schema.sql", "CREATE TABLE test (id INTEGER);");
		createTestFile(testDir, "db/migrations/001.sql", "-- Migration");
		createTestFile(testDir, "config.json", "{}");
		createTestFile(testDir, "README.md", "# Test");
		createTestFile(testDir, "package.json", "{}");

		const sources = await discoverSources(testDir);

		// Should include all supported extensions
		const typeScriptFiles = sources.filter(p => p.endsWith(".ts"));
		const javascriptFiles = sources.filter(p => p.endsWith(".jsx"));
		const sqlFiles = sources.filter(p => p.endsWith(".sql"));
		const jsonFiles = sources.filter(p => p.endsWith(".json"));

		expect(typeScriptFiles).toHaveLength(2); // index.ts and types.d.ts
		expect(javascriptFiles).toHaveLength(1); // Button.jsx
		expect(sqlFiles).toHaveLength(2); // schema.sql and 001.sql
		expect(jsonFiles).toHaveLength(2); // config.json and package.json

		// Should not include unsupported files
		expect(sources.some(p => p.endsWith(".md"))).toBe(false);

		teardownTestDirectory(testDir);
	});

	test("should respect ignored directories and not discover SQL files in them", async () => {
		testDir = setupTestDirectory();

		// Create SQL files in ignored directories
		createTestFile(testDir, "node_modules/package/schema.sql", "CREATE TABLE ignored;");
		createTestFile(testDir, ".git/hooks/schema.sql", "CREATE TABLE ignored;");
		createTestFile(testDir, "build/generated/schema.sql", "CREATE TABLE ignored;");

		// Create SQL files in non-ignored directories
		createTestFile(testDir, "src/db/schema.sql", "CREATE TABLE valid;");
		createTestFile(testDir, "migrations/001.sql", "CREATE TABLE migration;");

		const sources = await discoverSources(testDir);
		const sqlFiles = sources.filter(p => p.endsWith(".sql"));

		expect(sqlFiles).toHaveLength(2);
		expect(sqlFiles.every(p => !p.includes("node_modules"))).toBe(true);
		expect(sqlFiles.every(p => !p.includes(".git"))).toBe(true);
		expect(sqlFiles.every(p => !p.includes("build"))).toBe(true);
		expect(sqlFiles.some(p => p.includes("schema.sql"))).toBe(true);
		expect(sqlFiles.some(p => p.includes("001.sql"))).toBe(true);

		teardownTestDirectory(testDir);
	});
});