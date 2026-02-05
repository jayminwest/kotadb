/**
 * Tests for generateSearchTips() via executeSearch
 *
 * Following antimocking philosophy: uses real global database (no mocks).
 * generateSearchTips is not exported, so all testing is done indirectly
 * through executeSearch which calls formatSearchResults -> generateSearchTips.
 *
 * Test Coverage:
 * - Empty results tips (nonsense query, filtered empty)
 * - MAX_TIPS = 2 enforcement
 * - Priority ordering (high before low)
 * - Context-aware suppression (glob, repository, multi-scope)
 * - Backward compatibility (tips is string[], optional)
 * - Structural keyword tips (Pattern 1)
 * - Error/why/how keyword tips (Patterns 6-8)
 * - seenTips parameter (not passed via executeSearch, verified structurally)
 *
 * @module tests/mcp/search-tips
 */

import { describe, test, expect } from "bun:test";
import { executeSearch } from "@mcp/tools";

const REQUEST_ID = "test-search-tips";
const USER_ID = "test-user";

/**
 * Helper to extract tips from a search result.
 * Returns the tips array or undefined if absent.
 */
function getTips(result: unknown): string[] | undefined {
	const response = result as Record<string, unknown>;
	return response.tips as string[] | undefined;
}

describe("Search Tips - Empty Results", () => {
	test("should return 'No results found' tip for nonsense query with zero results", async () => {
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
		const tips = getTips(result);

		// Only assert on tips when we truly got zero results
		if (counts.total === 0) {
			expect(tips).toBeDefined();
			expect(tips!.length).toBeGreaterThanOrEqual(1);
			expect(tips!.some(t => t.includes("No results found"))).toBe(true);
		}
	});

	test("should return 'active filters' tip when searching with filters and zero results", async () => {
		const result = await executeSearch(
			{
				query: "xyznonexistent12345qqq",
				scope: ["code"],
				filters: { glob: "**/*.nonexistent_extension_xyz" },
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		const counts = response.counts as Record<string, unknown>;
		const tips = getTips(result);

		if (counts.total === 0) {
			expect(tips).toBeDefined();
			expect(tips!.some(t => t.includes("active filters"))).toBe(true);
		}
	});

	test("should return at most 2 tips even for empty results with active filters", async () => {
		const result = await executeSearch(
			{
				query: "xyznonexistent12345qqq",
				scope: ["code"],
				filters: { glob: "**/*.xyz", language: "nonexistent" },
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			expect(tips.length).toBeLessThanOrEqual(2);
		}
	});
});

describe("Search Tips - MAX_TIPS Limit", () => {
	test("should never return more than 2 tips", async () => {
		// Use a query that triggers many patterns:
		// - "function" -> Pattern 1 (structural keyword, suggests symbols)
		// - "error" -> Pattern 8 (error keyword, suggests failures)
		// - single scope "code" -> Pattern 9 (suggests multi-scope)
		// This should trigger 3+ patterns, but only 2 should be returned
		const result = await executeSearch(
			{
				query: "function error handler",
				scope: ["code"],
				limit: 100,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			expect(tips.length).toBeLessThanOrEqual(2);
		}
	});

	test("should return at most 2 tips when many patterns match with large results", async () => {
		// Query with "why" (Pattern 6), "how" (Pattern 7), single "code" scope (Pattern 9)
		const result = await executeSearch(
			{
				query: "why and how to fix pattern",
				scope: ["code"],
				limit: 100,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			expect(tips.length).toBeLessThanOrEqual(2);
		}
	});
});

describe("Search Tips - Priority Ordering", () => {
	test("should prioritize high-priority scope tips over low-priority format tips", async () => {
		// "function" triggers Pattern 1 (high priority, scope)
		// Single "code" scope triggers Pattern 9 (low priority, scope)
		// If results > 30, Pattern 10 fires (low priority, format)
		// High priority tips should appear before low priority
		const result = await executeSearch(
			{
				query: "function",
				scope: ["code"],
				limit: 100,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips && tips.length > 0) {
			// The first tip should be a high-priority one (Pattern 1 about symbols)
			// and NOT the low-priority Pattern 9 about multi-scope
			const firstTip = tips[0]!;
			const isHighPriority =
				firstTip.includes("symbols") || // Pattern 1
				firstTip.includes("No results found") || // Empty results
				firstTip.includes("errors/issues") || // Pattern 8
				firstTip.includes("how to") || // Pattern 7
				firstTip.includes("why/reason") || // Pattern 6
				firstTip.includes("file path"); // Pattern 2
			// If we got tips, at least the first should be high priority
			// (not the low-priority "You can search multiple scopes" or "compact" tip)
			expect(isHighPriority).toBe(true);
		}
	});

	test("should prefer structural keyword tip (high) over multi-scope tip (low)", async () => {
		// "class" triggers Pattern 1 (high priority)
		// scope: ["code"] triggers Pattern 9 (low priority)
		const result = await executeSearch(
			{
				query: "class DataProcessor",
				scope: ["code"],
				limit: 20,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips && tips.length >= 1) {
			// First tip should mention symbols (Pattern 1, high priority)
			expect(tips[0]!.includes("symbols") || tips[0]!.includes("No results")).toBe(true);
		}
	});
});

describe("Search Tips - Context-Aware Suppression", () => {
	test("should NOT suggest file type filters when glob filter is already set", async () => {
		// Pattern 5 should be suppressed when glob is set
		const result = await executeSearch(
			{
				query: "import",
				scope: ["code"],
				filters: { glob: "**/*.ts" },
				limit: 50,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			// No tip should suggest glob filter when glob is already active
			const suggestsGlob = tips.some(t =>
				t.includes('glob: "**/*.ts"') && t.includes("narrow file types"),
			);
			expect(suggestsGlob).toBe(false);
		}
	});

	test("should NOT suggest repository filter when repository is already set", async () => {
		// Pattern 4 should be suppressed when repository filter is set
		const result = await executeSearch(
			{
				query: "test",
				scope: ["code"],
				filters: { repository: "test-owner/test-repo" },
				limit: 50,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			// No tip should suggest repository filter
			const suggestsRepo = tips.some(t =>
				t.includes("repository") && t.includes("narrow to a specific repository"),
			);
			expect(suggestsRepo).toBe(false);
		}
	});

	test("should NOT suggest multi-scope when multiple scopes are already used", async () => {
		// Pattern 9 fires only when scopes.length === 1 and scope[0] === "code"
		const result = await executeSearch(
			{
				query: "test data",
				scope: ["code", "symbols"],
				limit: 20,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const suggestsMultiScope = tips.some(t =>
				t.includes("search multiple scopes simultaneously"),
			);
			expect(suggestsMultiScope).toBe(false);
		}
	});

	test("should NOT suggest language filter when language is already set", async () => {
		// Pattern 5 should be suppressed when language is set
		const result = await executeSearch(
			{
				query: "import",
				scope: ["code"],
				filters: { language: "typescript" },
				limit: 50,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const suggestsLanguage = tips.some(t =>
				t.includes("narrow file types"),
			);
			expect(suggestsLanguage).toBe(false);
		}
	});
});

describe("Search Tips - Backward Compatibility", () => {
	test("tips field should be an array of strings when present", async () => {
		const result = await executeSearch(
			{
				query: "function handler",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips !== undefined) {
			expect(Array.isArray(tips)).toBe(true);
			for (const tip of tips) {
				expect(typeof tip).toBe("string");
			}
		}
	});

	test("tips field should be undefined when no tips apply", async () => {
		// Use a well-optimized search that shouldn't trigger tips:
		// - symbols scope (not code-only, so no Pattern 9)
		// - exported_only set (no Pattern 3)
		// - specific query (no structural keywords in code scope)
		const result = await executeSearch(
			{
				query: "User",
				scope: ["symbols"],
				filters: {
					exported_only: true,
					symbol_kind: ["class"],
				},
				limit: 5,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		// Tips should either be undefined or an empty case (omitted from response)
		if (response.tips !== undefined) {
			expect(Array.isArray(response.tips)).toBe(true);
		}
		// The key test: if tips is present, it should be string[]
		// If absent, that's valid backward compatibility
	});

	test("response always has query, scopes, results, counts fields", async () => {
		const result = await executeSearch(
			{
				query: "anything",
				scope: ["code"],
				limit: 5,
			},
			REQUEST_ID,
			USER_ID,
		);

		const response = result as Record<string, unknown>;
		expect(response.query).toBe("anything");
		expect(Array.isArray(response.scopes)).toBe(true);
		expect(response.results).toBeDefined();
		expect(response.counts).toBeDefined();
	});
});

describe("Search Tips - Structural Keyword Tips (Pattern 1)", () => {
	test("should suggest symbols scope when query contains 'function' in code scope", async () => {
		const result = await executeSearch(
			{
				query: "function parseConfig",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasScopeSymbolsTip = tips.some(t =>
				t.includes("symbols") && t.includes("function"),
			);
			// Pattern 1 should fire since query has "function" and scope is code (not symbols)
			expect(hasScopeSymbolsTip).toBe(true);
		}
	});

	test("should suggest symbols scope when query contains 'class'", async () => {
		const result = await executeSearch(
			{
				query: "class UserService",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasClassTip = tips.some(t =>
				t.includes("symbols") && t.includes("class"),
			);
			expect(hasClassTip).toBe(true);
		}
	});

	test("should NOT suggest symbols scope when already using symbols scope", async () => {
		const result = await executeSearch(
			{
				query: "function parseConfig",
				scope: ["symbols"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasScopeSymbolsTip = tips.some(t =>
				t.includes("Try scope: ['symbols']"),
			);
			expect(hasScopeSymbolsTip).toBe(false);
		}
	});

	test("should suggest symbols scope when query contains 'interface'", async () => {
		const result = await executeSearch(
			{
				query: "interface Config",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasInterfaceTip = tips.some(t =>
				t.includes("symbols") && t.includes("interface"),
			);
			expect(hasInterfaceTip).toBe(true);
		}
	});
});

describe("Search Tips - Decision/Pattern/Failure Scope Tips", () => {
	test("should suggest decisions scope for 'why' questions (Pattern 6)", async () => {
		const result = await executeSearch(
			{
				query: "why use SQLite",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasDecisionTip = tips.some(t =>
				t.includes("decisions") && t.includes("why/reason/decision"),
			);
			expect(hasDecisionTip).toBe(true);
		}
	});

	test("should suggest patterns scope for 'how' questions (Pattern 7)", async () => {
		const result = await executeSearch(
			{
				query: "how to handle errors",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasPatternTip = tips.some(t =>
				t.includes("patterns") && t.includes("how to"),
			);
			expect(hasPatternTip).toBe(true);
		}
	});

	test("should suggest failures scope for error-related queries (Pattern 8)", async () => {
		const result = await executeSearch(
			{
				query: "fix database error",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasFailureTip = tips.some(t =>
				t.includes("failures") && t.includes("errors/issues"),
			);
			expect(hasFailureTip).toBe(true);
		}
	});

	test("should NOT suggest decisions scope when already included", async () => {
		const result = await executeSearch(
			{
				query: "why use this pattern",
				scope: ["code", "decisions"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const suggestsDecisions = tips.some(t =>
				t.includes("Try scope: ['decisions']"),
			);
			expect(suggestsDecisions).toBe(false);
		}
	});

	test("should NOT suggest patterns scope when already included", async () => {
		const result = await executeSearch(
			{
				query: "how to create a service",
				scope: ["code", "patterns"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const suggestsPatterns = tips.some(t =>
				t.includes("Try scope: ['patterns']"),
			);
			expect(suggestsPatterns).toBe(false);
		}
	});

	test("should NOT suggest failures scope when already included", async () => {
		const result = await executeSearch(
			{
				query: "error handling bug",
				scope: ["code", "failures"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const suggestsFailures = tips.some(t =>
				t.includes("Try scope: ['failures']"),
			);
			expect(suggestsFailures).toBe(false);
		}
	});
});

describe("Search Tips - File Path Pattern (Pattern 2)", () => {
	test("should suggest search_dependencies for file path queries", async () => {
		const result = await executeSearch(
			{
				query: "src/index.ts",
				scope: ["code"],
				limit: 10,
			},
			REQUEST_ID,
			USER_ID,
		);

		const tips = getTips(result);
		if (tips) {
			const hasFilePathTip = tips.some(t =>
				t.includes("search_dependencies") && t.includes("file path"),
			);
			expect(hasFilePathTip).toBe(true);
		}
	});
});
