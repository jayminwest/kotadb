/**
 * Tests for MCP Server Tool Routing Coverage
 *
 * Following antimocking philosophy: uses real MCP server and SQLite databases
 *
 * Test Coverage:
 * - All tools from getToolDefinitions() have case handlers in server.ts
 * - Filtered tool tiers (core, default, memory, full) have working routes
 * - Clear failure messages when case handlers are missing
 *
 * Purpose:
 * Prevents bugs where tools are fully defined but missing their routing logic,
 * which only manifests at runtime with "Unknown tool" errors.
 *
 * @module tests/mcp/server-routing-coverage
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { createMcpServer } from "@mcp/server.js";
import { getToolDefinitions, filterToolsByTier, type ToolsetTier } from "@mcp/tools.js";
import { getGlobalDatabase, closeGlobalConnections } from "@db/sqlite/index.js";
import {
	createTempDir,
	cleanupTempDir,
	clearTestData,
	createTestRepository,
} from "../helpers/db.js";

/**
 * Provide minimal valid arguments for each tool
 * This prevents argument validation errors during routing tests
 */
function getMinimalValidArgs(toolName: string): unknown {
	switch (toolName) {
		case "search":
			return { query: "test" };
		case "index_repository":
			return { path: "/tmp/test" };
		case "list_recent_files":
			return {};
		case "search_dependencies":
			return { file_path: "test.ts" };
		case "analyze_change_impact":
			return { change_type: "feature", description: "test change" };
		case "get_index_statistics":
			return {};
		case "validate_implementation_spec":
			return { spec_content: "# Test Spec" };
		case "kota_sync_export":
			return { output_file: "/tmp/export.jsonl" };
		case "kota_sync_import":
			return { input_file: "/tmp/import.jsonl" };
		case "generate_task_context":
			return { task_description: "test task" };
		case "record_decision":
			return { title: "test", decision: "test decision" };
		case "record_failure":
			return { approach: "test", reason: "test reason" };
		case "record_insight":
			return { content: "test insight" };
		case "get_domain_key_files":
			return { domain: "api" };
		case "validate_expertise":
			return { domain: "api" };
		case "sync_expertise":
			return { domain: "api" };
		case "get_recent_patterns":
			return { domain: "api" };
		default:
			return {};
	}
}

describe("MCP Server Tool Routing Coverage", () => {
	let tempDir: string;
	let dbPath: string;
	let originalDbPath: string | undefined;

	beforeAll(() => {
		// Create isolated temp directory
		tempDir = createTempDir("mcp-server-routing-test-");
		dbPath = join(tempDir, "test.db");

		// Override KOTADB_PATH for test isolation
		originalDbPath = process.env.KOTADB_PATH;
		process.env.KOTADB_PATH = dbPath;
		closeGlobalConnections();
	});

	afterAll(() => {
		// Restore environment
		if (originalDbPath !== undefined) {
			process.env.KOTADB_PATH = originalDbPath;
		} else {
			delete process.env.KOTADB_PATH;
		}
		closeGlobalConnections();
		cleanupTempDir(tempDir);
	});

	beforeEach(() => {
		// Create minimal test repository
		const db = getGlobalDatabase();
		createTestRepository(db, {
			name: "routing-test-repo",
			fullName: "test/routing-test-repo",
		});
	});

	afterEach(() => {
		const db = getGlobalDatabase();
		clearTestData(db);
	});

	test("all tools in getToolDefinitions() have case handlers in server switch statement", async () => {
		const allTools = getToolDefinitions();
		const server = createMcpServer({ userId: "test-user", toolset: "full" });

		// Track results for comprehensive reporting
		const results: { tool: string; status: "success" | "missing_route" | "error"; message?: string }[] = [];

		for (const tool of allTools) {
			const toolName = tool.name;
			const args = getMinimalValidArgs(toolName);

			try {
				// Attempt to call the tool through the request handler
				// We use the internal CallToolRequest schema structure
				await server.request({
					method: "tools/call",
					params: {
						name: toolName,
						arguments: args,
					},
				});

				// If we get here, routing worked
				// Response may contain errors due to invalid args, but that's OK
				// We only care that the route exists
				results.push({ tool: toolName, status: "success" });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);

				// Check if it's the specific "Unknown tool" error
				if (message.includes(`Unknown tool: ${toolName}`)) {
					results.push({
						tool: toolName,
						status: "missing_route",
						message,
					});
				} else {
					// Other errors are OK (e.g., invalid args, database errors)
					// As long as routing worked
					results.push({ tool: toolName, status: "success", message });
				}
			}
		}

		// Check for any tools with missing routes
		const missingRoutes = results.filter((r) => r.status === "missing_route");

		if (missingRoutes.length > 0) {
			const toolNames = missingRoutes.map((r) => r.tool).join(", ");
			throw new Error(
				`Missing case handlers in server.ts for tools: ${toolNames}\n` +
					`Add case statements in createMcpServer() switch block.`,
			);
		}

		// Verify we tested all tools
		expect(results.length).toBe(allTools.length);
	});

	test.each(["core", "default", "memory", "full"] as ToolsetTier[])(
		"all tools in '%s' tier have working routes",
		async (tier) => {
			const tools = filterToolsByTier(tier);
			const server = createMcpServer({ userId: "test-user", toolset: tier });

			for (const tool of tools) {
				const toolName = tool.name;
				const args = getMinimalValidArgs(toolName);

				try {
					await server.request({
						method: "tools/call",
						params: {
							name: toolName,
							arguments: args,
						},
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);

					// Fail test if routing is missing
					expect(message).not.toContain(`Unknown tool: ${toolName}`);
				}
			}
		},
	);
});
