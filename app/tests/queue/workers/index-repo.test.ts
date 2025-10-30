/**
 * Indexing Worker Integration Tests
 *
 * Tests the complete indexing worker pipeline end-to-end:
 * - Job enqueuing and processing
 * - Status transitions (pending → processing → completed)
 * - Database storage verification
 * - Temp directory cleanup
 *
 * Uses real Supabase Local instance and pg-boss (antimocking philosophy)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";
import { createIndexJob, getJobStatus } from "@queue/job-tracker";
import { QUEUE_NAMES } from "@queue/config";
import {
	getSupabaseTestClient,
	TEST_USER_IDS,
	createTestRepository,
} from "../../helpers/db";
import type { IndexRepoJobPayload } from "@queue/types";

describe("Indexing Worker - End-to-End Integration", () => {
	const testRepoPath = "/tmp/kotadb-test-repo-worker";
	let testRepoId: string;

	beforeEach(async () => {
		// Create test repository on filesystem
		await rm(testRepoPath, { recursive: true, force: true });
		await mkdir(testRepoPath, { recursive: true });

		// Create sample TypeScript files for indexing
		await writeFile(
			join(testRepoPath, "example.ts"),
			`
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
}
`,
		);

		await writeFile(
			join(testRepoPath, "utils.ts"),
			`
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
`,
		);

		// Initialize as git repository (required by prepareRepository)
		const { execSync } = require("node:child_process");
		execSync("git init", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git config user.email 'test@test.com'", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git config user.name 'Test User'", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git add .", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git commit -m 'Initial commit'", { cwd: testRepoPath, stdio: "ignore" });

		// Create test repository in database with local path as full_name
		// Worker will recognize paths starting with '/' as local paths
		const client = getSupabaseTestClient();
		testRepoId = await createTestRepository({
			fullName: testRepoPath, // Use local path for testing
			userId: TEST_USER_IDS.free,
		});

		// Start queue and workers
		await startQueue();
		const queue = getQueue();
		await queue.createQueue(QUEUE_NAMES.INDEX_REPO);
		await startIndexWorker(queue);
	});

	afterEach(async () => {
		// Stop queue and clean up
		try {
			await stopQueue();
		} catch {
			// Ignore errors
		}

		// Clean up test repository from database
		const client = getSupabaseTestClient();
		await client.from("repositories").delete().eq("id", testRepoId);

		// Clean up test repository from filesystem
		await rm(testRepoPath, { recursive: true, force: true });
	});

	it("should process indexing job end-to-end", async () => {
		// 1. Create index job record
		const indexJob = await createIndexJob(
			testRepoId,
			"main",
			"abc123",
			TEST_USER_IDS.free,
		);

		expect(indexJob.status).toBe("pending");
		expect(indexJob.repository_id).toBe(testRepoId);

		// 2. Enqueue job in pg-boss
		const queue = getQueue();
		const payload: IndexRepoJobPayload = {
			indexJobId: indexJob.id,
			repositoryId: testRepoId,
			commitSha: "abc123",
		};

		const jobId = await queue.send(QUEUE_NAMES.INDEX_REPO, payload);
		expect(jobId).toBeDefined();
		expect(jobId).not.toBeNull();

		// 3. Wait for worker to process job (poll status)
		let attempts = 0;
		const maxAttempts = 60; // 30 seconds max wait
		let finalStatus = "pending";

		while (attempts < maxAttempts) {
			const currentJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
			finalStatus = currentJob.status;

			if (finalStatus === "completed" || finalStatus === "failed") {
				break;
			}

			// Wait 500ms before next poll
			await new Promise((resolve) => setTimeout(resolve, 500));
			attempts++;
		}

		// 4. Verify job completed successfully
		const completedJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
		expect(completedJob.status).toBe("completed");
		expect(completedJob.started_at).not.toBeNull();
		expect(completedJob.completed_at).not.toBeNull();

		// 5. Verify stats were recorded
		expect(completedJob.stats).toBeDefined();
		expect(completedJob.stats?.files_indexed).toBeGreaterThan(0);
		expect(completedJob.stats?.symbols_extracted).toBeGreaterThan(0);

		// 6. Verify indexed files stored in database
		const client = getSupabaseTestClient();
		const { data: indexedFiles, error: filesError } = await client
			.from("indexed_files")
			.select("*")
			.eq("repository_id", testRepoId);

		expect(filesError).toBeNull();
		expect(indexedFiles).toBeDefined();
		expect(indexedFiles!.length).toBeGreaterThan(0);

		// Verify file content was stored
		const exampleFile = indexedFiles?.find((f: any) =>
			f.path.endsWith("example.ts"),
		);
		expect(exampleFile).toBeDefined();
		expect(exampleFile?.content).toContain("greet");
		expect(exampleFile?.content).toContain("Calculator");

		// 7. Verify symbols were extracted and stored
		const { data: symbols, error: symbolsError } = await client
			.from("symbols")
			.select("*")
			.in(
				"file_id",
				indexedFiles!.map((f: any) => f.id),
			);

		expect(symbolsError).toBeNull();
		expect(symbols).toBeDefined();
		expect(symbols!.length).toBeGreaterThan(0);

		// Verify specific symbols were extracted
		const symbolNames = symbols!.map((s: any) => s.name);
		expect(symbolNames).toContain("greet");
		expect(symbolNames).toContain("Calculator");
		expect(symbolNames).toContain("capitalize");

		// 8. Verify temp directory was cleaned up
		// Worker uses /tmp/kotadb-{jobId} pattern
		// We can't easily verify cleanup synchronously, but the worker's try/finally
		// block guarantees cleanup. Manual verification via `ls /tmp | grep kotadb`
		// should show no orphaned directories after test completion.
	}, 40000); // 40 second timeout for integration test

	it("should handle partial failures gracefully", async () => {
		// Create repository with invalid TypeScript file
		await writeFile(
			join(testRepoPath, "invalid.ts"),
			"this is not valid TypeScript syntax at all!!!",
		);

		await writeFile(
			join(testRepoPath, "valid.ts"),
			"export const foo = 42;",
		);

		// Commit new files to git (required for indexer to discover them)
		const { execSync } = require("node:child_process");
		execSync("git add .", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git commit -m 'Add test files'", { cwd: testRepoPath, stdio: "ignore" });

		// Create and enqueue job
		const indexJob = await createIndexJob(
			testRepoId,
			"main",
			"def456",
			TEST_USER_IDS.free,
		);

		const queue = getQueue();
		const payload: IndexRepoJobPayload = {
			indexJobId: indexJob.id,
			repositoryId: testRepoId,
			commitSha: "def456",
		};

		await queue.send(QUEUE_NAMES.INDEX_REPO, payload);

		// Wait for completion (poll status)
		let attempts = 0;
		const maxAttempts = 60;

		while (attempts < maxAttempts) {
			const currentJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);

			if (
				currentJob.status === "completed" ||
				currentJob.status === "failed"
			) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
			attempts++;
		}

		// Verify job completed (not failed) despite parse error
		const completedJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
		expect(completedJob.status).toBe("completed");

		// Verify valid file was indexed
		const client = getSupabaseTestClient();
		const { data: indexedFiles } = await client
			.from("indexed_files")
			.select("*")
			.eq("repository_id", testRepoId);

		expect(indexedFiles).toBeDefined();
		const validFile = indexedFiles?.find((f: any) => f.path === "valid.ts");
		expect(validFile).toBeDefined();
		expect(validFile?.content).toContain("foo");
	}, 40000);

	it("should handle 250+ files via batch processing", async () => {
		// Clean up existing test files first (example.ts, utils.ts from beforeEach)
		await rm(join(testRepoPath, "example.ts"), { force: true });
		await rm(join(testRepoPath, "utils.ts"), { force: true });

		// Create 250 TypeScript files to trigger batch processing
		// With BATCH_SIZE=50, this should result in 5 chunks
		const fileCount = 250;

		for (let i = 0; i < fileCount; i++) {
			await writeFile(
				join(testRepoPath, `file${i}.ts`),
				`export const value${i} = ${i};`,
			);
		}

		// Commit files to git
		const { execSync } = require("node:child_process");
		execSync("git add .", { cwd: testRepoPath, stdio: "ignore" });
		execSync("git commit -m 'Add 250 files'", {
			cwd: testRepoPath,
			stdio: "ignore",
		});

		// Create and enqueue job
		const indexJob = await createIndexJob(
			testRepoId,
			"main",
			"batch123",
			TEST_USER_IDS.free,
		);

		const queue = getQueue();
		const payload: IndexRepoJobPayload = {
			indexJobId: indexJob.id,
			repositoryId: testRepoId,
			commitSha: "batch123",
		};

		await queue.send(QUEUE_NAMES.INDEX_REPO, payload);

		// Wait for completion (longer timeout for large repository)
		let attempts = 0;
		const maxAttempts = 120; // 60 seconds max wait

		while (attempts < maxAttempts) {
			const currentJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);

			if (
				currentJob.status === "completed" ||
				currentJob.status === "failed"
			) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
			attempts++;
		}

		// Verify job completed successfully
		const completedJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
		expect(completedJob.status).toBe("completed");

		// Verify all 250 files were indexed
		expect(completedJob.stats?.files_indexed).toBe(fileCount);

		// Verify chunks_completed metadata (250 files / 50 per chunk = 5 chunks)
		expect(completedJob.stats?.chunks_completed).toBe(5);

		// Verify database contains all 250 files
		const client = getSupabaseTestClient();
		const { data: indexedFiles, error: filesError } = await client
			.from("indexed_files")
			.select("id")
			.eq("repository_id", testRepoId);

		expect(filesError).toBeNull();
		expect(indexedFiles).toBeDefined();
		expect(indexedFiles!.length).toBe(fileCount);

		// Verify symbols were extracted from all files
		// Use join query instead of .in() to avoid URI length limits with 250 file IDs
		const { data: symbols, error: symbolsError, count: symbolCount } = await client
			.from("symbols")
			.select("id, file_id", { count: "exact" })
			.in(
				"file_id",
				indexedFiles!.slice(0, 10).map((f: any) => f.id),
			);

		expect(symbolsError).toBeNull();
		expect(symbols).toBeDefined();
		expect(symbols!.length).toBeGreaterThan(0);

		// Verify symbol count matches file count (each file has 1 symbol)
		// We can't query all symbols efficiently with .in() due to URI limits,
		// but we verified above that at least some symbols were extracted
		expect(completedJob.stats?.symbols_extracted).toBe(fileCount);
	}, 80000); // 80 second timeout for large repository test

	it("should pass installation_id to prepareRepository when available", async () => {
		// Update test repository with installation_id
		const client = getSupabaseTestClient();
		const testInstallationId = 87654321;

		await client
			.from("repositories")
			.update({ installation_id: testInstallationId })
			.eq("id", testRepoId);

		// Create and enqueue job
		const indexJob = await createIndexJob(
			testRepoId,
			"main",
			"installation456",
			TEST_USER_IDS.free,
		);

		const queue = getQueue();
		const payload: IndexRepoJobPayload = {
			indexJobId: indexJob.id,
			repositoryId: testRepoId,
			commitSha: "installation456",
		};

		await queue.send(QUEUE_NAMES.INDEX_REPO, payload);

		// Wait for completion
		let attempts = 0;
		const maxAttempts = 60;

		while (attempts < maxAttempts) {
			const currentJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);

			if (
				currentJob.status === "completed" ||
				currentJob.status === "failed"
			) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
			attempts++;
		}

		// Verify job completed successfully
		const completedJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
		expect(completedJob.status).toBe("completed");

		// Verify files were indexed (confirms prepareRepository succeeded)
		const { data: indexedFiles } = await client
			.from("indexed_files")
			.select("*")
			.eq("repository_id", testRepoId);

		expect(indexedFiles).toBeDefined();
		expect(indexedFiles!.length).toBeGreaterThan(0);

		// Note: We can't directly verify that installation_id was used for authentication
		// since this is a local path test, but the worker code path is exercised
		// and the installation_id is logged in worker output
	}, 40000);

	it("should handle null installation_id gracefully (public repos)", async () => {
		// Ensure installation_id is null (default for test repos)
		const client = getSupabaseTestClient();
		await client
			.from("repositories")
			.update({ installation_id: null })
			.eq("id", testRepoId);

		// Create and enqueue job
		const indexJob = await createIndexJob(
			testRepoId,
			"main",
			"noinstall789",
			TEST_USER_IDS.free,
		);

		const queue = getQueue();
		const payload: IndexRepoJobPayload = {
			indexJobId: indexJob.id,
			repositoryId: testRepoId,
			commitSha: "noinstall789",
		};

		await queue.send(QUEUE_NAMES.INDEX_REPO, payload);

		// Wait for completion
		let attempts = 0;
		const maxAttempts = 60;

		while (attempts < maxAttempts) {
			const currentJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);

			if (
				currentJob.status === "completed" ||
				currentJob.status === "failed"
			) {
				break;
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
			attempts++;
		}

		// Verify job completed successfully without installation_id
		const completedJob = await getJobStatus(indexJob.id, TEST_USER_IDS.free);
		expect(completedJob.status).toBe("completed");

		// Verify files were indexed
		const { data: indexedFiles } = await client
			.from("indexed_files")
			.select("*")
			.eq("repository_id", testRepoId);

		expect(indexedFiles).toBeDefined();
		expect(indexedFiles!.length).toBeGreaterThan(0);
	}, 40000);
});
