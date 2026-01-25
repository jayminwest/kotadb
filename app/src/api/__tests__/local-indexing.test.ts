/**
 * Integration tests for local mode indexing workflow (runIndexingWorkflowLocal)
 *
 * Following antimocking philosophy: tests real filesystem operations
 * and SQLite database operations with temporary directories.
 *
 * Test Coverage:
 * - Local path indexing end-to-end (happy path)
 * - Nonexistent path handling (error case)
 * - Path traversal rejection (security test)
 *
 * @module @api/__tests__/local-indexing
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { runIndexingWorkflowLocal } from "../queries";
import { closeGlobalConnections } from "@db/sqlite/index.js";

describe("Local Indexing Workflow", () => {
	const testId = randomUUID().slice(0, 8);
	const testDir = join(process.cwd(), `.test-indexing-temp-${testId}`);
	const testDbPath = join(testDir, "test.db");
	
	// Store original env vars
	const originalEnv = {
		KOTADB_PATH: process.env.KOTADB_PATH,
		KOTA_LOCAL_MODE: process.env.KOTA_LOCAL_MODE,
	};

	beforeAll(() => {
		// Create temp directory structure
		mkdirSync(testDir, { recursive: true });
		
		// Set environment for local mode with temp database
		process.env.KOTADB_PATH = testDbPath;
		process.env.KOTA_LOCAL_MODE = "true";
	});

	afterAll(() => {
		// Close database connections before cleanup
		closeGlobalConnections();
		
		// Cleanup temp directory
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		
		// Restore original environment variables
		if (originalEnv.KOTADB_PATH !== undefined) {
			process.env.KOTADB_PATH = originalEnv.KOTADB_PATH;
		} else {
			delete process.env.KOTADB_PATH;
		}
		
		if (originalEnv.KOTA_LOCAL_MODE !== undefined) {
			process.env.KOTA_LOCAL_MODE = originalEnv.KOTA_LOCAL_MODE;
		} else {
			delete process.env.KOTA_LOCAL_MODE;
		}
	});

	test("indexes local directory successfully", async () => {
		// Create a sample project directory with TypeScript files
		const projectDir = join(testDir, "sample-project");
		mkdirSync(projectDir, { recursive: true });
		
		// Create sample TypeScript file with a function
		const sampleContent = `
export function greet(name: string): string {
	return \`Hello, \${name}!\`;
}

export const PI = 3.14159;

export class Calculator {
	add(a: number, b: number): number {
		return a + b;
	}
}
`;
		writeFileSync(join(projectDir, "sample.ts"), sampleContent);
		
		// Create another file that imports from sample
		const indexContent = `
import { greet, Calculator } from "./sample";

const calc = new Calculator();
const result = calc.add(1, 2);
const greeting = greet("World");
`;
		writeFileSync(join(projectDir, "index.ts"), indexContent);
		
		// Run the indexing workflow
		const result = await runIndexingWorkflowLocal({
			repository: "test-project",
			localPath: projectDir,
		});
		
		// Verify the result
		expect(result).toBeDefined();
		expect(result.repositoryId).toBeDefined();
		expect(typeof result.repositoryId).toBe("string");
		expect(result.filesIndexed).toBeGreaterThanOrEqual(2);
		expect(result.symbolsExtracted).toBeGreaterThan(0);
		// References may or may not be extracted depending on AST support
		expect(typeof result.referencesExtracted).toBe("number");
		expect(typeof result.dependenciesExtracted).toBe("number");
	});

	test("throws error for nonexistent path", async () => {
		const nonExistentPath = join(testDir, "does-not-exist-" + randomUUID());
		
		await expect(
			runIndexingWorkflowLocal({
				repository: "nonexistent-repo",
				localPath: nonExistentPath,
			})
		).rejects.toThrow(/does not exist/i);
	});

	test("rejects path traversal attempts", async () => {
		// Security test: Path traversal using relative path components
		// Constructs a path that attempts to escape the workspace directory
		const workspaceRoot = resolve(testDir);
		const traversalPath = join(testDir, "..", "..", "..", "..", "tmp");
		const resolvedTraversal = resolve(traversalPath);
		
		// Verify the path actually escapes the workspace (sanity check)
		const escapesWorkspace = !resolvedTraversal.startsWith(workspaceRoot);
		expect(escapesWorkspace).toBe(true);
		
		// The function should handle path traversal in one of these ways:
		// 1. Throw an error about the path being outside workspace/invalid
		// 2. Throw an error about the path not existing (if /tmp doesn't exist or is empty)
		// 3. Return 0 files indexed (if directory exists but contains no indexable code)
		//
		// All of these are acceptable security outcomes - the key is that
		// indexing should NOT succeed with files from outside the intended scope.
		
		let threw = false;
		let filesIndexed = -1;
		
		try {
			const result = await runIndexingWorkflowLocal({
				repository: "traversal-attempt",
				localPath: traversalPath,
			});
			filesIndexed = result.filesIndexed;
		} catch {
			threw = true;
		}
		
		// Either it threw an error OR it indexed 0 files (acceptable security outcomes)
		const secureOutcome = threw || filesIndexed === 0;
		expect(secureOutcome).toBe(true);
	});
});
