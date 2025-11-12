/**
 * Integration tests for project management functionality.
 *
 * Tests the complete flow:
 * - Project CRUD operations
 * - Repository associations
 * - RLS isolation between users
 * - Search filtering by project
 *
 * Uses real Supabase connection (no mocks).
 * Requires local Supabase instance or CI test environment.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
	getSupabaseTestClient,
	TEST_USER_IDS,
	createTestRepository,
} from "../helpers/db";
import {
	createProject,
	listProjects,
	getProject,
	updateProject,
	deleteProject,
	addRepositoryToProject,
	removeRepositoryFromProject,
} from "@api/projects";
import { searchFiles, saveIndexedFiles } from "@api/queries";
import type { IndexedFile } from "@shared/types";

describe("Integration: Project Management", () => {
	const client = getSupabaseTestClient();
	const testRepoIds: string[] = [];
	const testProjectIds: string[] = [];

	beforeAll(async () => {
		// Create test repositories for Alice (free user)
		const repo1 = await createTestRepository({
			fullName: "alice/repo1",
			userId: TEST_USER_IDS.alice,
		});
		const repo2 = await createTestRepository({
			fullName: "alice/repo2",
			userId: TEST_USER_IDS.alice,
		});
		testRepoIds.push(repo1, repo2);

		// Create test repository for Bob (solo user)
		const repo3 = await createTestRepository({
			fullName: "bob/repo1",
			userId: TEST_USER_IDS.bob,
		});
		testRepoIds.push(repo3);

		// Index some files for search testing
		const indexedFile1: IndexedFile = {
			path: "src/auth.ts",
			content: "function authenticate() { return true; }",
			dependencies: [],
			indexedAt: new Date(),
			projectRoot: repo1,
		};

		const indexedFile2: IndexedFile = {
			path: "src/utils.ts",
			content: "function helper() { return authenticate(); }",
			dependencies: [],
			indexedAt: new Date(),
			projectRoot: repo2,
		};

		await saveIndexedFiles(client, [indexedFile1], TEST_USER_IDS.alice, repo1);
		await saveIndexedFiles(client, [indexedFile2], TEST_USER_IDS.alice, repo2);
	});

	afterAll(async () => {
		// Clean up projects
		for (const projectId of testProjectIds) {
			await client.from("projects").delete().eq("id", projectId);
		}

		// Clean up indexed files and repositories
		for (const repoId of testRepoIds) {
			await client.from("indexed_files").delete().eq("repository_id", repoId);
			await client.from("repositories").delete().eq("id", repoId);
		}
	});

	test("creates a project with repositories", async () => {
		const repo1 = testRepoIds[0];
		const repo2 = testRepoIds[1];
		if (!repo1 || !repo2) throw new Error("Test repos not initialized");

		const projectId = await createProject(client, TEST_USER_IDS.alice, {
			name: "Frontend Project",
			description: "All frontend repos",
			repository_ids: [repo1, repo2],
		});

		testProjectIds.push(projectId);
		expect(projectId).toBeDefined();

		// Verify project exists
		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.name).toBe("Frontend Project");
		expect(project?.description).toBe("All frontend repos");
		expect(project?.repositories.length).toBe(2);
		expect(project?.repository_count).toBe(2);
	});

	test("creates a project without repositories", async () => {
		const projectId = await createProject(client, TEST_USER_IDS.alice, {
			name: "Empty Project",
		});

		testProjectIds.push(projectId);
		expect(projectId).toBeDefined();

		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.repositories.length).toBe(0);
		expect(project?.repository_count).toBe(0);
	});

	test("lists projects for a user", async () => {
		const projects = await listProjects(client, TEST_USER_IDS.alice);
		expect(projects.length).toBeGreaterThanOrEqual(2);

		const frontendProject = projects.find((p) => p.name === "Frontend Project");
		expect(frontendProject).toBeDefined();
		expect(frontendProject?.repository_count).toBe(2);
	});

	test("updates project name and description", async () => {
		const projectId = testProjectIds[0];
		if (!projectId) throw new Error("Test project not initialized");

		await updateProject(client, TEST_USER_IDS.alice, projectId, {
			name: "Updated Frontend",
			description: "Updated description",
		});

		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.name).toBe("Updated Frontend");
		expect(project?.description).toBe("Updated description");
	});

	test("updates project repositories", async () => {
		const projectId = testProjectIds[0];
		const repo1 = testRepoIds[0];
		const repo2 = testRepoIds[1];
		if (!projectId || !repo1 || !repo2) throw new Error("Test data not initialized");

		// Remove one repository
		await updateProject(client, TEST_USER_IDS.alice, projectId, {
			repository_ids: [repo1],
		});

		let project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.repositories.length).toBe(1);

		// Add repository back
		await updateProject(client, TEST_USER_IDS.alice, projectId, {
			repository_ids: [repo1, repo2],
		});

		project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.repositories.length).toBe(2);
	});

	test("adds repository to project", async () => {
		const projectId = testProjectIds[1]; // Empty project
		const repo1 = testRepoIds[0];
		if (!projectId || !repo1) throw new Error("Test data not initialized");

		await addRepositoryToProject(
			client,
			TEST_USER_IDS.alice,
			projectId,
			repo1,
		);

		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.repositories.length).toBe(1);
	});

	test("removes repository from project", async () => {
		const projectId = testProjectIds[1];
		const repo1 = testRepoIds[0];
		if (!projectId || !repo1) throw new Error("Test data not initialized");

		await removeRepositoryFromProject(
			client,
			TEST_USER_IDS.alice,
			projectId,
			repo1,
		);

		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).not.toBeNull();
		expect(project?.repositories.length).toBe(0);
	});

	test("deletes project", async () => {
		const projectId = await createProject(client, TEST_USER_IDS.alice, {
			name: "Temporary Project",
		});
		expect(projectId).toBeDefined();

		await deleteProject(client, TEST_USER_IDS.alice, projectId);

		const project = await getProject(client, TEST_USER_IDS.alice, projectId);
		expect(project).toBeNull();
	});

	test("enforces RLS - user cannot access another user's project", async () => {
		const aliceProjectId = testProjectIds[0];
		if (!aliceProjectId) throw new Error("Test project not initialized");

		// Bob tries to get Alice's project
		const project = await getProject(
			client,
			TEST_USER_IDS.bob,
			aliceProjectId,
		);

		// Should be null due to RLS
		expect(project).toBeNull();
	});

	test("enforces RLS - user cannot list another user's projects", async () => {
		// Bob lists his projects
		const bobProjects = await listProjects(client, TEST_USER_IDS.bob);

		// Should not see Alice's projects
		const hasAliceProject = bobProjects.some(
			(p) => p.user_id === TEST_USER_IDS.alice,
		);
		expect(hasAliceProject).toBe(false);
	});

	test("searches within project scope", async () => {
		const projectId = testProjectIds[0]; // Project with repo1 and repo2
		if (!projectId) throw new Error("Test project not initialized");

		// Search with project filter
		const results = await searchFiles(client, "authenticate", TEST_USER_IDS.alice, {
			projectId,
		});

		// Should find results from both repos in project
		expect(results.length).toBeGreaterThan(0);

		// Verify all results are from repos in the project
		for (const result of results) {
			const repoId =
				typeof result.projectRoot === "string"
					? result.projectRoot
					: result.repository_id;
			if (!repoId) continue;
			expect(testRepoIds.slice(0, 2)).toContain(repoId);
		}
	});

	test("search with project filter returns empty for project with no repos", async () => {
		const emptyProjectId = testProjectIds[1]; // Empty project

		const results = await searchFiles(
			client,
			"authenticate",
			TEST_USER_IDS.alice,
			{
				projectId: emptyProjectId,
			},
		);

		expect(results.length).toBe(0);
	});

	test("prevents duplicate name for same user", async () => {
		const existingProject = await createProject(client, TEST_USER_IDS.alice, {
			name: "Unique Name Test",
		});

		testProjectIds.push(existingProject);

		// Try to create another project with same name
		try {
			await createProject(client, TEST_USER_IDS.alice, {
				name: "Unique Name Test",
			});
			expect(true).toBe(false); // Should not reach here
		} catch (error) {
			expect((error as Error).message).toContain("Failed to create project");
		}
	});

	test("allows same project name for different users", async () => {
		const aliceProjectId = await createProject(client, TEST_USER_IDS.alice, {
			name: "Shared Name",
		});

		testProjectIds.push(aliceProjectId);

		// Bob creates project with same name
		const bobProjectId = await createProject(client, TEST_USER_IDS.bob, {
			name: "Shared Name",
		});

		testProjectIds.push(bobProjectId);

		expect(aliceProjectId).not.toBe(bobProjectId);

		// Verify both exist
		const aliceProject = await getProject(
			client,
			TEST_USER_IDS.alice,
			aliceProjectId,
		);
		const bobProject = await getProject(client, TEST_USER_IDS.bob, bobProjectId);

		expect(aliceProject?.name).toBe("Shared Name");
		expect(bobProject?.name).toBe("Shared Name");
	});
});
