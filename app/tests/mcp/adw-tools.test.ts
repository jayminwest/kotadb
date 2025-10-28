/**
 * Integration tests for ADW MCP tools
 *
 * Tests the Python bridge CLI and MCP tool execution for ADW workflow state queries.
 * Uses real subprocess execution to verify end-to-end functionality.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import {
	executeBridgeCommand,
	spawnPythonProcess,
	parsePythonOutput,
} from "@mcp/utils/python";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const TEST_ADW_ID = "test-adw-mcp-integration";
const TEST_AGENTS_DIR = resolve(__dirname, "../../..", "automation/agents");

/**
 * Helper to create test ADW state file
 */
function createTestState(adwId: string, state: Record<string, unknown>) {
	const stateDir = resolve(TEST_AGENTS_DIR, adwId);
	mkdirSync(stateDir, { recursive: true });
	writeFileSync(
		resolve(stateDir, "adw_state.json"),
		JSON.stringify(state, null, 2),
	);
}

/**
 * Helper to clean up test state
 */
function cleanupTestState(adwId: string) {
	const stateDir = resolve(TEST_AGENTS_DIR, adwId);
	if (existsSync(stateDir)) {
		rmSync(stateDir, { recursive: true, force: true });
	}
}

describe("Python Bridge CLI", () => {
	beforeAll(() => {
		// Clean up any existing test state
		cleanupTestState(TEST_ADW_ID);

		// Create test state
		createTestState(TEST_ADW_ID, {
			adw_id: TEST_ADW_ID,
			issue_number: "297",
			branch_name: "feat/297-adw-mcp-tools",
			issue_class: "feature",
			worktree_path: "/path/to/worktree",
			pr_created: false,
			extra: {
				status: "in_progress",
				triggered_by: "manual",
			},
		});
	});

	it("should parse JSON output from Python subprocess", () => {
		const output = '{"test": true, "count": 42}';
		const result = parsePythonOutput(output);
		expect(result).toEqual({ test: true, count: 42 });
	});

	it("should throw error on empty output", () => {
		expect(() => parsePythonOutput("")).toThrow("Empty stdout from Python process");
	});

	it("should throw error on invalid JSON", () => {
		expect(() => parsePythonOutput("not json")).toThrow("Failed to parse JSON");
	});

	it("should execute get_state command", async () => {
		const result = await executeBridgeCommand("get_state", [TEST_ADW_ID]);

		expect(result).toBeDefined();
		expect(typeof result).toBe("object");

		const state = result as Record<string, unknown>;
		expect(state.adw_id).toBe(TEST_ADW_ID);
		expect(state.issue_number).toBe("297");
		expect(state.branch_name).toBe("feat/297-adw-mcp-tools");
	});

	it("should execute list_workflows command", async () => {
		const result = await executeBridgeCommand("list_workflows", [
			"--limit",
			"10",
		]);

		expect(result).toBeDefined();
		expect(typeof result).toBe("object");

		const response = result as Record<string, unknown>;
		expect(response.workflows).toBeDefined();
		expect(Array.isArray(response.workflows)).toBe(true);
		expect(typeof response.total).toBe("number");
		expect(typeof response.filtered).toBe("number");
	});

	it("should filter workflows by ADW ID prefix", async () => {
		const result = await executeBridgeCommand("list_workflows", [
			"--adw-id",
			TEST_ADW_ID,
		]);

		const response = result as Record<string, unknown>;
		const workflows = response.workflows as Array<Record<string, unknown>>;

		// Should find our test workflow
		expect(workflows.length).toBeGreaterThan(0);
		expect(workflows[0].adw_id).toBe(TEST_ADW_ID);
	});

	it("should handle missing state file", async () => {
		const result = await executeBridgeCommand("get_state", [
			"nonexistent-adw-id",
		]);

		expect(result).toBeDefined();
		const state = result as Record<string, unknown>;
		expect(state.error).toBeDefined();
	});

	it("should handle subprocess timeout", async () => {
		const result = await spawnPythonProcess("sleep", ["5"], {
			timeout: 100, // 100ms timeout for 5s sleep
		});

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("timed out");
	});
});

describe("MCP Tool Execution", () => {
	// Note: Full MCP integration tests would require Supabase setup and authentication
	// For now, we verify the Python bridge works correctly, which is the critical path
	// Full MCP tests can be added in a follow-up PR with proper test fixtures

	it("should validate that bridge CLI is accessible", async () => {
		// This test verifies that the Python bridge can be executed from the MCP context
		const projectRoot = resolve(__dirname, "../../..");
		const bridgeScript = resolve(
			projectRoot,
			"automation/adws/adw_modules/mcp_bridge.py",
		);

		expect(existsSync(bridgeScript)).toBe(true);
	});
});

// Clean up after tests
describe("Cleanup", () => {
	it("should clean up test state", () => {
		cleanupTestState(TEST_ADW_ID);
		const stateDir = resolve(TEST_AGENTS_DIR, TEST_ADW_ID);
		expect(existsSync(stateDir)).toBe(false);
	});
});
