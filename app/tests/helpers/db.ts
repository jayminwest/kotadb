/**
 * SQLite test helpers for integration testing
 *
 * Provides in-memory and file-based SQLite test databases with
 * fixture creation utilities for KotaDB local-only architecture.
 *
 * @module tests/helpers/db
 */

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createDatabase, type KotaDatabase } from "@db/sqlite/index.js";

// ============================================================================
// Type Definitions
// ============================================================================

export interface TestRepository {
	id: string;
	name: string;
	owner: string;
	defaultBranch: string;
	remoteUrl?: string;
	localPath?: string;
}

export interface TestFile {
	id: string;
	repositoryId: string;
	path: string;
	content: string;
	language: string;
	lastIndexedAt: string;
	contentHash: string;
}

export interface TestSymbol {
	id: string;
	fileId: string;
	repositoryId: string;
	name: string;
	kind: string;
	signature?: string;
	startLine: number;
	endLine: number;
	startColumn: number;
	endColumn: number;
	documentation?: string;
}

export interface TestReference {
	id: string;
	fileId: string;
	repositoryId: string;
	targetSymbolId?: string;
	referenceType: string;
	line: number;
	column: number;
	context?: string;
}

export interface TestFixture {
	repository: TestRepository;
	files: TestFile[];
	symbols: TestSymbol[];
	references: TestReference[];
}

// ============================================================================
// Default Test Content
// ============================================================================

const DEFAULT_TEST_FILE_CONTENT = `
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "test" });

export function processData(input: string): string {
  logger.info("Processing data", { input });
  return input.toUpperCase();
}

export class DataProcessor {
  constructor(private config: ProcessorConfig) {}
  
  process(data: string): string {
    return processData(data);
  }
}

interface ProcessorConfig {
  mode: "strict" | "lenient";
}
`.trim();

// ============================================================================
// Database Creation Functions
// ============================================================================

/**
 * Get an in-memory test database with schema initialized
 */
export function getTestDatabase(): KotaDatabase {
	return createDatabase({ path: ":memory:" });
}

/**
 * Get a file-based test database in a temp directory
 */
export function getFileTestDatabase(
	tempDir: string,
	filename: string = "test.db",
): KotaDatabase {
	return createDatabase({ path: join(tempDir, filename) });
}

/**
 * Create a temporary directory for test databases
 *
 * Returns the path to the created temp directory.
 * Caller is responsible for cleanup using cleanupTempDir().
 */
export function createTempDir(prefix: string = "kotadb-test-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(tempDir: string): void {
	rmSync(tempDir, { recursive: true, force: true });
}

// ============================================================================
// Fixture Creation Functions
// ============================================================================

/**
 * Create a test repository
 */
export function createTestRepository(
	db: KotaDatabase,
	overrides: Partial<TestRepository> = {},
): TestRepository {
	const repo: TestRepository = {
		id: randomUUID(),
		name: "test-repo",
		owner: "test-owner",
		defaultBranch: "main",
		remoteUrl: "https://github.com/test-owner/test-repo",
		localPath: "/tmp/test-repo",
		...overrides,
	};

	db.run(
		`INSERT INTO repositories (id, name, owner, default_branch, remote_url, local_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
		[
			repo.id,
			repo.name,
			repo.owner,
			repo.defaultBranch,
			repo.remoteUrl ?? null,
			repo.localPath ?? null,
		],
	);

	return repo;
}

/**
 * Create a test file
 */
export function createTestFile(
	db: KotaDatabase,
	repositoryId: string,
	overrides: Partial<Omit<TestFile, "id" | "repositoryId">> = {},
): TestFile {
	const file: TestFile = {
		id: randomUUID(),
		repositoryId,
		path: "src/test.ts",
		content: DEFAULT_TEST_FILE_CONTENT,
		language: "typescript",
		lastIndexedAt: new Date().toISOString(),
		contentHash: randomUUID(),
		...overrides,
	};

	db.run(
		`INSERT INTO indexed_files (id, repository_id, path, content, language, last_indexed_at, content_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			file.id,
			file.repositoryId,
			file.path,
			file.content,
			file.language,
			file.lastIndexedAt,
			file.contentHash,
		],
	);

	return file;
}

/**
 * Create a test symbol
 */
export function createTestSymbol(
	db: KotaDatabase,
	fileId: string,
	repositoryId: string,
	overrides: Partial<Omit<TestSymbol, "id" | "fileId" | "repositoryId">> = {},
): TestSymbol {
	const symbol: TestSymbol = {
		id: randomUUID(),
		fileId,
		repositoryId,
		name: "testFunction",
		kind: "function",
		signature: "function testFunction(): void",
		startLine: 1,
		endLine: 5,
		startColumn: 0,
		endColumn: 1,
		documentation: "A test function",
		...overrides,
	};

	db.run(
		`INSERT INTO indexed_symbols (id, file_id, repository_id, name, kind, signature, start_line, end_line, start_column, end_column, documentation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			symbol.id,
			symbol.fileId,
			symbol.repositoryId,
			symbol.name,
			symbol.kind,
			symbol.signature ?? null,
			symbol.startLine,
			symbol.endLine,
			symbol.startColumn,
			symbol.endColumn,
			symbol.documentation ?? null,
		],
	);

	return symbol;
}

/**
 * Create a test reference
 */
export function createTestReference(
	db: KotaDatabase,
	fileId: string,
	repositoryId: string,
	overrides: Partial<Omit<TestReference, "id" | "fileId" | "repositoryId">> = {},
): TestReference {
	const ref: TestReference = {
		id: randomUUID(),
		fileId,
		repositoryId,
		referenceType: "call",
		line: 10,
		column: 5,
		context: "testFunction();",
		...overrides,
	};

	db.run(
		`INSERT INTO indexed_references (id, file_id, repository_id, target_symbol_id, reference_type, line, column, context)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			ref.id,
			ref.fileId,
			ref.repositoryId,
			ref.targetSymbolId ?? null,
			ref.referenceType,
			ref.line,
			ref.column,
			ref.context ?? null,
		],
	);

	return ref;
}

/**
 * Create a full test fixture with repository, files, symbols, and references
 */
export function createFullTestFixture(
	db: KotaDatabase,
	options: {
		fileCount?: number;
		symbolsPerFile?: number;
	} = {},
): TestFixture {
	const { fileCount = 3, symbolsPerFile = 2 } = options;

	const repository = createTestRepository(db);
	const files: TestFile[] = [];
	const symbols: TestSymbol[] = [];
	const references: TestReference[] = [];

	for (let i = 0; i < fileCount; i++) {
		const file = createTestFile(db, repository.id, {
			path: `src/module${i + 1}.ts`,
		});
		files.push(file);

		for (let j = 0; j < symbolsPerFile; j++) {
			const symbol = createTestSymbol(db, file.id, repository.id, {
				name: `function${i + 1}_${j + 1}`,
				startLine: j * 10 + 1,
				endLine: j * 10 + 8,
			});
			symbols.push(symbol);
		}
	}

	// Create cross-file references
	if (symbols.length > 1) {
		const ref = createTestReference(db, files[0]!.id, repository.id, {
			targetSymbolId: symbols[1]!.id,
			referenceType: "call",
		});
		references.push(ref);
	}

	return { repository, files, symbols, references };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all data from test tables (useful for test isolation)
 */
export function clearTestData(db: KotaDatabase): void {
	// Order matters due to foreign key constraints
	db.run("DELETE FROM indexed_references");
	db.run("DELETE FROM indexed_symbols");
	db.run("DELETE FROM indexed_files");
	db.run("DELETE FROM repositories");
}

/**
 * Get count of records in a table
 */
export function getTableCount(db: KotaDatabase, tableName: string): number {
	const result = db.queryOne<{ count: number }>(
		`SELECT COUNT(*) as count FROM ${tableName}`,
	);
	return result?.count ?? 0;
}
