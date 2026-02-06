/**
 * Tests for --toolset CLI flag and tool tier filtering
 *
 * Following antimocking philosophy: tests real CLI parsing and filtering logic.
 *
 * Test Coverage:
 * - parseArgs correctly parses --toolset flag
 * - filterToolsByTier returns correct tool counts per tier
 * - Invalid toolset values are rejected
 *
 * @module tests/mcp/toolset-filtering
 */

import { describe, expect, test } from "bun:test";
import type { ToolsetTier } from "@mcp/tools.js";

describe("parseArgs --toolset flag", () => {
	test("parseArgs correctly parses --toolset core", async () => {
		const { parseArgs } = await import("../../src/cli/args.js");

		const options = parseArgs(["--toolset", "core"]);
		expect(options.toolset).toBe("core");
	});

	test("parseArgs correctly parses --toolset=memory", async () => {
		const { parseArgs } = await import("../../src/cli/args.js");

		const options = parseArgs(["--toolset=memory"]);
		expect(options.toolset).toBe("memory");
	});

	test("parseArgs correctly parses --toolset full", async () => {
		const { parseArgs } = await import("../../src/cli/args.js");

		const options = parseArgs(["--toolset", "full"]);
		expect(options.toolset).toBe("full");
	});

	test("parseArgs defaults to 'default' when no --toolset provided", async () => {
		const { parseArgs } = await import("../../src/cli/args.js");

		const options = parseArgs([]);
		expect(options.toolset).toBe("default");
	});

	test("parseArgs defaults to 'default' with other flags but no --toolset", async () => {
		const { parseArgs } = await import("../../src/cli/args.js");

		const options = parseArgs(["--stdio", "--port", "4000"]);
		expect(options.toolset).toBe("default");
	});
});

describe("filterToolsByTier", () => {
	test("filterToolsByTier('core') returns exactly 8 tools", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const tools = filterToolsByTier("core");
		expect(tools).toHaveLength(8);

		// Verify core tools are present
		const toolNames = tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("search");
		expect(toolNames).toContain("index_repository");
		expect(toolNames).toContain("list_recent_files");
		expect(toolNames).toContain("search_dependencies");
		expect(toolNames).toContain("analyze_change_impact");
		expect(toolNames).toContain("generate_task_context");
		expect(toolNames).toContain("get_index_statistics");
		expect(toolNames).toContain("find_usages");
	});

	test("filterToolsByTier('default') returns exactly 10 tools", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const tools = filterToolsByTier("default");
		expect(tools).toHaveLength(10);

		// Verify default includes core + sync tools
		const toolNames = tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("search");
		expect(toolNames).toContain("kota_sync_export");
		expect(toolNames).toContain("kota_sync_import");
	});

	test("filterToolsByTier('memory') returns exactly 13 tools", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const tools = filterToolsByTier("memory");
		expect(tools).toHaveLength(13);

		// Verify memory layer tools are present
		const toolNames = tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("record_decision");
		expect(toolNames).toContain("record_failure");
		expect(toolNames).toContain("record_insight");
	});

	test("filterToolsByTier('full') returns exactly 18 tools", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const tools = filterToolsByTier("full");
		expect(tools).toHaveLength(18);

		// Verify expertise tools are present
		const toolNames = tools.map((t: { name: string }) => t.name);
		expect(toolNames).toContain("get_domain_key_files");
		expect(toolNames).toContain("validate_expertise");
		expect(toolNames).toContain("sync_expertise");
		expect(toolNames).toContain("get_recent_patterns");
		expect(toolNames).toContain("validate_implementation_spec");
	});
});

describe("Invalid toolset values", () => {
	test("isValidToolsetTier returns false for invalid tier names", async () => {
		const { isValidToolsetTier } = await import("../../src/cli/args.js");

		expect(isValidToolsetTier("invalid")).toBe(false);
		expect(isValidToolsetTier("")).toBe(false);
		expect(isValidToolsetTier("CORE")).toBe(false); // Case sensitive
		expect(isValidToolsetTier("all")).toBe(false);
		expect(isValidToolsetTier("minimal")).toBe(false);
	});

	test("isValidToolsetTier returns true for valid tier names", async () => {
		const { isValidToolsetTier } = await import("../../src/cli/args.js");

		expect(isValidToolsetTier("core")).toBe(true);
		expect(isValidToolsetTier("default")).toBe(true);
		expect(isValidToolsetTier("memory")).toBe(true);
		expect(isValidToolsetTier("full")).toBe(true);
	});
});

describe("Tool tier hierarchy", () => {
	test("each tier includes all tools from previous tiers", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const coreTools = filterToolsByTier("core");
		const defaultTools = filterToolsByTier("default");
		const memoryTools = filterToolsByTier("memory");
		const fullTools = filterToolsByTier("full");

		const coreNames = new Set(coreTools.map((t: { name: string }) => t.name));
		const defaultNames = new Set(defaultTools.map((t: { name: string }) => t.name));
		const memoryNames = new Set(memoryTools.map((t: { name: string }) => t.name));
		const fullNames = new Set(fullTools.map((t: { name: string }) => t.name));

		// All core tools should be in default
		for (const name of coreNames) {
			expect(defaultNames.has(name)).toBe(true);
		}

		// All default tools should be in memory
		for (const name of defaultNames) {
			expect(memoryNames.has(name)).toBe(true);
		}

		// All memory tools should be in full
		for (const name of memoryNames) {
			expect(fullNames.has(name)).toBe(true);
		}
	});

	test("tier sizes increase correctly", async () => {
		const { filterToolsByTier } = await import("@mcp/tools.js");

		const coreCount = filterToolsByTier("core").length;
		const defaultCount = filterToolsByTier("default").length;
		const memoryCount = filterToolsByTier("memory").length;
		const fullCount = filterToolsByTier("full").length;

		expect(coreCount).toBeLessThan(defaultCount);
		expect(defaultCount).toBeLessThan(memoryCount);
		expect(memoryCount).toBeLessThan(fullCount);
	});
});
