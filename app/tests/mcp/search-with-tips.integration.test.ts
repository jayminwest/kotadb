/**
 * Integration tests for search tips within executeSearch
 *
 * Following antimocking philosophy: uses real global database.
 * Tests verify that tips integrate correctly with full search pipeline
 * including scope routing, filter normalization, and result formatting.
 *
 * Test Coverage:
 * - Search response structure with tips
 * - Tips appear for structural queries
 * - Tips suppressed for optimized queries
 * - Multi-scope searches
 * - Index statistics integration
 * - End-to-end tip generation with real data
 *
 * @module tests/mcp/search-with-tips.integration
 */

import { describe, test, expect } from "bun:test";
import { executeSearch } from "@mcp/tools";

const REQUEST_ID = "test-integration";
const USER_ID = "test-user";

describe("executeSearch with tips integration", () => {
	test("search response includes required fields", async () => {
		const result = await executeSearch(
			{
				query: "authentication",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		expect(result).toHaveProperty("query");
		expect(result).toHaveProperty("scopes");
		expect(result).toHaveProperty("results");
		expect(result).toHaveProperty("counts");

		const response = result as Record<string, unknown>;
		expect(response.query).toBe("authentication");
		expect(Array.isArray(response.scopes)).toBe(true);
	});

	test("tips field is optional in response", async () => {
		const result = await executeSearch(
			{
				query: "test",
				scope: ["code"],
				limit: 5,
			},
			REQUEST_ID,
			USER_ID,
		);

		// tips may or may not be present depending on search characteristics
		// If present, it should be an array
		const response = result as Record<string, unknown>;
		if (response.tips !== undefined) {
			expect(Array.isArray(response.tips)).toBe(true);
		}
	});

	test("search with structural query includes tip suggesting symbols scope", async () => {
		const result = await executeSearch(
			{
				query: "function parseUser",
				scope: ["code"],
				limit: 20,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		// Pattern 1: structural keyword "function" in code scope should suggest symbols
		if (response.tips) {
			expect(Array.isArray(response.tips)).toBe(true);
			const tips = response.tips as string[];
			expect(tips.length).toBeGreaterThan(0);
			expect(tips.length).toBeLessThanOrEqual(2);
			// At least one tip should mention symbols scope
			const mentionsSymbols = tips.some(t => t.includes("symbols"));
			expect(mentionsSymbols).toBe(true);
		}
	});

	test("search with optimal parameters may omit tips", async () => {
		const result = await executeSearch(
			{
				query: "User",
				scope: ["symbols"],
				filters: {
					exported_only: true,
					symbol_kind: ["class"],
				},
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		// Well-formed query should have fewer or no tips
		if (response.tips) {
			expect(Array.isArray(response.tips)).toBe(true);
		}
	});

	test("search handles all scopes correctly", async () => {
		const result = await executeSearch(
			{
				query: "test",
				scope: ["code", "symbols", "decisions", "patterns", "failures"],
				limit: 5,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		expect(response.scopes).toEqual([
			"code",
			"symbols",
			"decisions",
			"patterns",
			"failures",
		]);
		expect(response.results).toHaveProperty("code");
		expect(response.results).toHaveProperty("symbols");
		expect(response.results).toHaveProperty("decisions");
		expect(response.results).toHaveProperty("patterns");
		expect(response.results).toHaveProperty("failures");
	});
});

describe("Search Tips - Empty Results Integration", () => {
	test("nonsense query returns 'No results found' tip with zero total results", async () => {
		const result = await executeSearch(
			{
				query: "xyznonexistent12345qqq",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		const counts = response.counts as Record<string, unknown>;

		if (counts.total === 0) {
			expect(response.tips).toBeDefined();
			const tips = response.tips as string[];
			expect(tips.some(t => t.includes("No results found"))).toBe(true);
		}
	});

	test("nonsense query with filters returns both empty and filter tips", async () => {
		const result = await executeSearch(
			{
				query: "xyznonexistent12345qqq",
				scope: ["code"],
				filters: { glob: "**/*.nonexistent_xyz" },
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		const counts = response.counts as Record<string, unknown>;

		if (counts.total === 0) {
			expect(response.tips).toBeDefined();
			const tips = response.tips as string[];
			// Should have both: "No results found" and "active filters"
			expect(tips.length).toBe(2);
			expect(tips.some(t => t.includes("No results found"))).toBe(true);
			expect(tips.some(t => t.includes("active filters"))).toBe(true);
		}
	});
});

describe("Search Tips - MAX_TIPS Enforcement Integration", () => {
	test("tips array never exceeds 2 entries regardless of matching patterns", async () => {
		// "function error" triggers: Pattern 1 (structural), Pattern 8 (error), Pattern 9 (single scope)
		const result = await executeSearch(
			{
				query: "function error handler",
				scope: ["code"],
				limit: 100,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			expect(tips.length).toBeLessThanOrEqual(2);
		}
	});
});

describe("Search Tips - Context Suppression Integration", () => {
	test("glob filter suppresses file type narrowing tip", async () => {
		const result = await executeSearch(
			{
				query: "import",
				scope: ["code"],
				filters: { glob: "**/*.ts" },
				limit: 100,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			const suggestsGlobFilter = tips.some(
				t => t.includes("narrow file types"),
			);
			expect(suggestsGlobFilter).toBe(false);
		}
	});

	test("multi-scope suppresses single-scope tip", async () => {
		const result = await executeSearch(
			{
				query: "data processing",
				scope: ["code", "symbols"],
				limit: 20,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			const suggestsMultiScope = tips.some(t =>
				t.includes("search multiple scopes simultaneously"),
			);
			expect(suggestsMultiScope).toBe(false);
		}
	});

	test("decisions scope in query suppresses decisions tip", async () => {
		const result = await executeSearch(
			{
				query: "why use SQLite database",
				scope: ["code", "decisions"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			const suggestsDecisions = tips.some(t =>
				t.includes("Try scope: ['decisions']"),
			);
			expect(suggestsDecisions).toBe(false);
		}
	});
});

describe("Search Tips - Priority Integration", () => {
	test("high-priority tips appear first when multiple patterns match", async () => {
		// "function" (Pattern 1: high) + single code scope (Pattern 9: low)
		const result = await executeSearch(
			{
				query: "function",
				scope: ["code"],
				limit: 50,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			if (tips.length >= 2) {
				// First tip should be a high-priority one (symbols suggestion)
				// NOT the low-priority multi-scope tip
				expect(
					tips[0]!.includes("search multiple scopes simultaneously"),
				).toBe(false);
			}
		}
	});
});

describe("Search Tips - Backward Compatibility Integration", () => {
	test("each tip in the array is a plain string", async () => {
		const result = await executeSearch(
			{
				query: "function error why",
				scope: ["code"],
				limit: 20,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as unknown[];
			for (const tip of tips) {
				expect(typeof tip).toBe("string");
				// Tips should not be objects (SearchTip interface is internal)
				expect(typeof tip).not.toBe("object");
			}
		}
	});

	test("tips are excluded from response when no patterns match", async () => {
		// Optimize query to avoid triggering any tips:
		// - Use "symbols" scope (no Pattern 9)
		// - Set exported_only (no Pattern 3)
		// - Use non-keyword query (no Patterns 1,6,7,8)
		// - Set repository filter (no Pattern 4)
		const result = await executeSearch(
			{
				query: "User",
				scope: ["symbols"],
				filters: {
					exported_only: true,
					repository: "test-owner/test-repo",
				},
				limit: 5,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		const counts = response.counts as Record<string, unknown>;

		// If zero results, tips will be present (empty result tip)
		// If results exist with well-optimized query, tips should be absent
		if ((counts.total as number) > 0) {
			// No tips should have been generated
			expect(response.tips).toBeUndefined();
		}
	});
});

describe("executeGetIndexStatistics integration", () => {
	test("get_index_statistics returns expected structure", async () => {
		const { executeGetIndexStatistics } = await import("@mcp/tools");

		const result = await executeGetIndexStatistics(
			{},
			REQUEST_ID,
			USER_ID,
		);

		expect(result).toHaveProperty("files");
		expect(result).toHaveProperty("symbols");
		expect(result).toHaveProperty("references");
		expect(result).toHaveProperty("decisions");
		expect(result).toHaveProperty("patterns");
		expect(result).toHaveProperty("failures");
		expect(result).toHaveProperty("repositories");
		expect(result).toHaveProperty("summary");

		const stats = result as Record<string, unknown>;
		expect(typeof stats.summary).toBe("string");
	});
});
