/**
 * MCP Project CRUD Tools Integration Tests
 *
 * Tests the MCP project management tools with real database connection.
 * Environment variables are loaded from .env.test in CI or default to local Supabase ports.
 *
 * Required environment variables:
 * - SUPABASE_URL (defaults to http://localhost:54322)
 * - SUPABASE_SERVICE_KEY (defaults to local demo key)
 * - SUPABASE_ANON_KEY (defaults to local demo key)
 * - DATABASE_URL (defaults to postgresql://postgres:postgres@localhost:5434/postgres)
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import { createAuthHeader } from "../helpers/db";
import { extractToolResult } from "../helpers/mcp";
import { startTestServer, stopTestServer } from "../helpers/server";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	// Start Express test server with real database connection
	const testServer = await startTestServer();
	server = testServer.server;
	baseUrl = testServer.url;
});

afterAll(async () => {
	await stopTestServer(server);
});

describe("MCP Project CRUD Tools", () => {
	const headers = {
		"Content-Type": "application/json",
		Origin: "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		Accept: "application/json, text/event-stream",
		Authorization: createAuthHeader("free"),
	};

	describe("tools/list includes project tools", () => {
		test("returns all 7 project CRUD tools", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.result.tools).toBeArray();

			const toolNames = data.result.tools.map((t: { name: string }) => t.name);
			expect(toolNames).toContain("create_project");
			expect(toolNames).toContain("list_projects");
			expect(toolNames).toContain("get_project");
			expect(toolNames).toContain("update_project");
			expect(toolNames).toContain("delete_project");
			expect(toolNames).toContain("add_repository_to_project");
			expect(toolNames).toContain("remove_repository_from_project");
		});
	});

	describe("create_project tool", () => {
		test("creates project with name only", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "test-project-name-only",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.projectId).toBeDefined();
			expect(typeof result.projectId).toBe("string");
			expect(result.name).toBe("test-project-name-only");
		});

		test("creates project with description", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "test-project-with-desc",
							description: "A test project with description",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.projectId).toBeDefined();
			expect(result.name).toBe("test-project-with-desc");
		});

		test("creates project with repository associations", async () => {
			// First, create a test repository via search_code to ensure we have one
			// In the test database seed, there should be existing repositories
			const listReposResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 4,
					method: "tools/call",
					params: {
						name: "list_recent_files",
						arguments: {
							limit: 1,
						},
					},
				}),
			});

			const listData = (await listReposResponse.json()) as any;
			const listResult = extractToolResult(listData);

			// Skip if no repositories exist
			if (!listResult.files || listResult.files.length === 0) {
				return;
			}

			const repositoryId = listResult.files[0].repository_id;

			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 5,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "test-project-with-repos",
							repository_ids: [repositoryId],
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.projectId).toBeDefined();
		});

		test("returns error for missing name parameter", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 6,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeDefined();
			expect(data.error.code).toBe(-32603);
			expect(data.error.message).toContain("Missing required parameter: name");
		});

		test("returns error for duplicate project name", async () => {
			// Create first project
			await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 7,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "duplicate-project-name",
						},
					},
				}),
			});

			// Try to create duplicate
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 8,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "duplicate-project-name",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeDefined();
			expect(data.error.code).toBe(-32603);
		});
	});

	describe("list_projects tool", () => {
		test("lists projects with repository counts", async () => {
			// Create a test project first
			await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 9,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "list-test-project",
						},
					},
				}),
			});

			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 10,
					method: "tools/call",
					params: {
						name: "list_projects",
						arguments: {},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.projects).toBeArray();
			expect(result.projects.length).toBeGreaterThan(0);

			// Verify structure
			const project = result.projects[0];
			expect(project.id).toBeDefined();
			expect(project.name).toBeDefined();
			expect(project.repository_count).toBeDefined();
			expect(typeof project.repository_count).toBe("number");
		});

		test("respects limit parameter", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 11,
					method: "tools/call",
					params: {
						name: "list_projects",
						arguments: {
							limit: 2,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.projects).toBeArray();
			expect(result.projects.length).toBeLessThanOrEqual(2);
		});
	});

	describe("get_project tool", () => {
		test("gets project by UUID", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 12,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "get-by-uuid-project",
							description: "Test project for UUID lookup",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);
			const projectId = createResult.projectId;

			// Get by UUID
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 13,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: projectId,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.id).toBe(projectId);
			expect(result.name).toBe("get-by-uuid-project");
			expect(result.description).toBe("Test project for UUID lookup");
			expect(result.repositories).toBeDefined();
			expect(result.repositories).toBeArray();
		});

		test("gets project by name (case-insensitive)", async () => {
			// Create a project
			await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 14,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "get-by-name-project",
						},
					},
				}),
			});

			// Get by name with different case
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 15,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: "GET-BY-NAME-PROJECT",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.name).toBe("get-by-name-project");
		});

		test("returns error for non-existent project", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 16,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: "non-existent-project",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeDefined();
			expect(data.error.code).toBe(-32603);
			expect(data.error.message).toContain("Project not found");
		});
	});

	describe("update_project tool", () => {
		test("updates project name", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 17,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "old-project-name",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Update name
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 18,
					method: "tools/call",
					params: {
						name: "update_project",
						arguments: {
							project: createResult.projectId,
							name: "new-project-name",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
			expect(result.message).toBe("Project updated");

			// Verify update
			const getResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 19,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: createResult.projectId,
						},
					},
				}),
			});

			const getData = (await getResponse.json()) as any;
			const getResult = extractToolResult(getData);
			expect(getResult.name).toBe("new-project-name");
		});

		test("updates project description", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 20,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "update-desc-project",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Update description
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 21,
					method: "tools/call",
					params: {
						name: "update_project",
						arguments: {
							project: "update-desc-project",
							description: "Updated description",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
		});

		test("returns error when no update fields provided", async () => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 22,
					method: "tools/call",
					params: {
						name: "update_project",
						arguments: {
							project: "some-project",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeDefined();
			expect(data.error.code).toBe(-32603);
			expect(data.error.message).toContain("At least one update field required");
		});
	});

	describe("delete_project tool", () => {
		test("deletes project successfully", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 23,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "project-to-delete",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Delete project
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 24,
					method: "tools/call",
					params: {
						name: "delete_project",
						arguments: {
							project: createResult.projectId,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
			expect(result.message).toBe("Project deleted");

			// Verify deletion
			const getResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 25,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: createResult.projectId,
						},
					},
				}),
			});

			const getData = (await getResponse.json()) as any;
			expect(getData.error).toBeDefined();
			expect(getData.error.message).toContain("Project not found");
		});
	});

	describe("add_repository_to_project tool", () => {
		test("adds repository to project successfully", async () => {
			// This test requires a repository to exist
			// Skip if no repositories in test data
			const listReposResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 26,
					method: "tools/call",
					params: {
						name: "list_recent_files",
						arguments: {
							limit: 1,
						},
					},
				}),
			});

			const listData = (await listReposResponse.json()) as any;
			const listResult = extractToolResult(listData);

			if (!listResult.files || listResult.files.length === 0) {
				return; // Skip test if no repositories
			}

			const repositoryId = listResult.files[0].repository_id;

			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 27,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "add-repo-test-project",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Add repository
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 28,
					method: "tools/call",
					params: {
						name: "add_repository_to_project",
						arguments: {
							project: createResult.projectId,
							repository_id: repositoryId,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
			expect(result.message).toBe("Repository added to project");
		});

		test("is idempotent (adding twice succeeds)", async () => {
			const listReposResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 29,
					method: "tools/call",
					params: {
						name: "list_recent_files",
						arguments: {
							limit: 1,
						},
					},
				}),
			});

			const listData = (await listReposResponse.json()) as any;
			const listResult = extractToolResult(listData);

			if (!listResult.files || listResult.files.length === 0) {
				return; // Skip test if no repositories
			}

			const repositoryId = listResult.files[0].repository_id;

			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 30,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "idempotent-add-test",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Add repository first time
			await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 31,
					method: "tools/call",
					params: {
						name: "add_repository_to_project",
						arguments: {
							project: createResult.projectId,
							repository_id: repositoryId,
						},
					},
				}),
			});

			// Add repository second time (should succeed)
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 32,
					method: "tools/call",
					params: {
						name: "add_repository_to_project",
						arguments: {
							project: createResult.projectId,
							repository_id: repositoryId,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
		});

		test("returns error for invalid repository ID", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 33,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "invalid-repo-test",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Try to add non-existent repository
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 34,
					method: "tools/call",
					params: {
						name: "add_repository_to_project",
						arguments: {
							project: createResult.projectId,
							repository_id: "00000000-0000-0000-0000-000000000000",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeDefined();
			expect(data.error.code).toBe(-32603);
			expect(data.error.message).toContain("Repository not found");
		});
	});

	describe("remove_repository_from_project tool", () => {
		test("removes repository from project successfully", async () => {
			const listReposResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 35,
					method: "tools/call",
					params: {
						name: "list_recent_files",
						arguments: {
							limit: 1,
						},
					},
				}),
			});

			const listData = (await listReposResponse.json()) as any;
			const listResult = extractToolResult(listData);

			if (!listResult.files || listResult.files.length === 0) {
				return; // Skip test if no repositories
			}

			const repositoryId = listResult.files[0].repository_id;

			// Create a project with repository
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 36,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "remove-repo-test",
							repository_ids: [repositoryId],
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Remove repository
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 37,
					method: "tools/call",
					params: {
						name: "remove_repository_from_project",
						arguments: {
							project: createResult.projectId,
							repository_id: repositoryId,
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
			expect(result.message).toBe("Repository removed from project");
		});

		test("is idempotent (removing twice succeeds)", async () => {
			// Create a project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 38,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "idempotent-remove-test",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);

			// Remove non-existent association (should succeed)
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 39,
					method: "tools/call",
					params: {
						name: "remove_repository_from_project",
						arguments: {
							project: createResult.projectId,
							repository_id: "00000000-0000-0000-0000-000000000000",
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = (await response.json()) as any;
			expect(data.error).toBeUndefined();

			const result = extractToolResult(data);
			expect(result.success).toBe(true);
		});
	});

	describe("end-to-end workflow", () => {
		test("create project, add repos, search with scope, delete project", async () => {
			// Get a repository ID from test data
			const listReposResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 40,
					method: "tools/call",
					params: {
						name: "list_recent_files",
						arguments: {
							limit: 1,
						},
					},
				}),
			});

			const listData = (await listReposResponse.json()) as any;
			const listResult = extractToolResult(listData);

			if (!listResult.files || listResult.files.length === 0) {
				return; // Skip test if no repositories
			}

			const repositoryId = listResult.files[0].repository_id;

			// 1. Create project
			const createResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 41,
					method: "tools/call",
					params: {
						name: "create_project",
						arguments: {
							name: "e2e-workflow-project",
							description: "End-to-end test project",
						},
					},
				}),
			});

			const createData = (await createResponse.json()) as any;
			const createResult = extractToolResult(createData);
			expect(createResult.projectId).toBeDefined();

			// 2. Add repository
			const addRepoResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 42,
					method: "tools/call",
					params: {
						name: "add_repository_to_project",
						arguments: {
							project: "e2e-workflow-project",
							repository_id: repositoryId,
						},
					},
				}),
			});

			const addRepoData = (await addRepoResponse.json()) as any;
			const addRepoResult = extractToolResult(addRepoData);
			expect(addRepoResult.success).toBe(true);

			// 3. Search with project scope
			const searchResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 43,
					method: "tools/call",
					params: {
						name: "search_code",
						arguments: {
							term: "function",
							project: "e2e-workflow-project",
						},
					},
				}),
			});

			const searchData = (await searchResponse.json()) as any;
			expect(searchData.error).toBeUndefined();
			const searchResult = extractToolResult(searchData);
			expect(searchResult.results).toBeDefined();

			// 4. Delete project
			const deleteResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 44,
					method: "tools/call",
					params: {
						name: "delete_project",
						arguments: {
							project: createResult.projectId,
						},
					},
				}),
			});

			const deleteData = (await deleteResponse.json()) as any;
			const deleteResult = extractToolResult(deleteData);
			expect(deleteResult.success).toBe(true);

			// Verify project is deleted
			const getResponse = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 45,
					method: "tools/call",
					params: {
						name: "get_project",
						arguments: {
							project: createResult.projectId,
						},
					},
				}),
			});

			const getData = (await getResponse.json()) as any;
			expect(getData.error).toBeDefined();
			expect(getData.error.message).toContain("Project not found");
		});
	});
});
