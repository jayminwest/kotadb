import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { ensureSchema } from "@db/schema";
import { saveIndexedFiles } from "@api/queries";

const TEST_PORT = 3098;
let server: ReturnType<typeof Bun.serve>;
let db: Database;

beforeAll(async () => {
	// Set up in-memory test database
	db = new Database(":memory:");
	ensureSchema(db);

	// Seed test data
	saveIndexedFiles(db, [
		{
			projectRoot: "/test/project",
			path: "src/router.ts",
			content: 'export class Router {\n  handle(req) {}\n}',
			dependencies: [],
			indexedAt: new Date(),
		},
		{
			projectRoot: "/test/project",
			path: "src/handler.ts",
			content: 'import { Router } from "./router";\nexport function createHandler() {}',
			dependencies: ["./router"],
			indexedAt: new Date(),
		},
	]);

	// Import and start test server
	const { createRouter } = await import("@api/routes");
	const router = createRouter(db);

	server = Bun.serve({
		port: TEST_PORT,
		fetch: router.handle,
	});
});

afterAll(() => {
	server.stop();
	db.close();
});

describe("MCP Tools Integration", () => {
	const baseUrl = `http://localhost:${TEST_PORT}`;
	const headers = {
		"Content-Type": "application/json",
		"Origin": "http://localhost:3000",
		"MCP-Protocol-Version": "2025-06-18",
		"Accept": "application/json",
	};

	test("tools/list returns available tools", async () => {
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
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();
		expect(data.result.tools).toBeArray();
		expect(data.result.tools.length).toBe(3);

		const toolNames = data.result.tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("search_code");
		expect(toolNames).toContain("index_repository");
		expect(toolNames).toContain("list_recent_files");
	});

	test("search_code tool finds matching files", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "Router",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.jsonrpc).toBe("2.0");
		expect(data.result).toBeDefined();
		expect(data.result.results).toBeArray();
		expect(data.result.results.length).toBeGreaterThan(0);

		const firstResult = data.result.results[0];
		expect(firstResult.projectRoot).toBe("/test/project");
		expect(firstResult.path).toBeDefined();
		expect(firstResult.snippet).toBeDefined();
	});

	test("search_code with project filter", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {
						term: "Router",
						project: "/test/project",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result.results).toBeArray();
		for (const result of data.result.results) {
			expect(result.projectRoot).toBe("/test/project");
		}
	});

	test("list_recent_files tool returns indexed files", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "list_recent_files",
					arguments: {
						limit: 5,
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();
		expect(data.result.results).toBeArray();
		expect(data.result.results.length).toBeGreaterThan(0);

		const firstFile = data.result.results[0];
		expect(firstFile.projectRoot).toBeDefined();
		expect(firstFile.path).toBeDefined();
		expect(firstFile.indexedAt).toBeDefined();
	});

	test("index_repository tool queues indexing", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 5,
				method: "tools/call",
				params: {
					name: "index_repository",
					arguments: {
						repository: "test/repo",
						ref: "main",
					},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.result).toBeDefined();
		expect(data.result.runId).toBeNumber();
		expect(data.result.status).toBe("pending");
	});

	test("tools/call with missing name returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 6,
				method: "tools/call",
				params: {
					arguments: { term: "test" },
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602); // Invalid Params
	});

	test("tools/call with unknown tool returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: {
					name: "unknown_tool",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602); // Invalid Params
	});

	test("search_code with missing term returns error", async () => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 8,
				method: "tools/call",
				params: {
					name: "search_code",
					arguments: {},
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = (await response.json()) as any;
		expect(data.error).toBeDefined();
		expect(data.error.code).toBe(-32602); // Invalid Params
	});
});
