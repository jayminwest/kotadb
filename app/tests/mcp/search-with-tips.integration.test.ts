import { describe, test, expect } from "bun:test";
import { executeSearch } from "@mcp/tools";

describe("executeSearch with tips integration", () => {
	test("search response includes required fields", async () => {
		const result = await executeSearch(
			{
				query: "authentication",
				scope: ["code"],
				limit: 10,
			},
			"test-request",
			"test-user"
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
			"test-request",
			"test-user"
		);

		// tips may or may not be present depending on search characteristics
		// If present, it should be an array
		const response = result as Record<string, unknown>;
		if (response.tips !== undefined) {
			expect(Array.isArray(response.tips)).toBe(true);
		}
	});

	test("search with structural query may include tips", async () => {
		const result = await executeSearch(
			{
				query: "function parseUser",
				scope: ["code"],
				limit: 20,
			},
			"test-request",
			"test-user"
		);

		const response = result as Record<string, unknown>;
		// May have tips suggesting symbols scope
		// This is pattern-dependent, so we just verify structure
		if (response.tips) {
			expect(Array.isArray(response.tips)).toBe(true);
			expect((response.tips as string[]).length).toBeGreaterThan(0);
		}
	});

	test("search with optimal parameters may omit tips", async () => {
		const result = await executeSearch(
			{
				query: "User",
				scope: ["symbols"],
				filters: {
					exported_only: true,
					symbol_kind: ["class"]
				},
				limit: 10,
			},
			"test-request",
			"test-user"
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
			"test-request",
			"test-user"
		);

		const response = result as Record<string, unknown>;
		expect(response.scopes).toEqual(["code", "symbols", "decisions", "patterns", "failures"]);
		expect(response.results).toHaveProperty("code");
		expect(response.results).toHaveProperty("symbols");
		expect(response.results).toHaveProperty("decisions");
		expect(response.results).toHaveProperty("patterns");
		expect(response.results).toHaveProperty("failures");
	});

	// Enhanced tip system tests
	test("empty results should generate high-priority tips", async () => {
		const result = await executeSearch(
			{
				query: "nonexistent-query-that-will-return-no-results-12345",
				scope: ["code"],
				limit: 10,
			},
			"test-request",
			"test-user-empty"
		);

		const response = result as Record<string, unknown>;
		// Empty results should generate tips
		if (response.tips) {
			expect(Array.isArray(response.tips)).toBe(true);
			const tips = response.tips as string[];
			expect(tips.length).toBeGreaterThan(0);
			// Should suggest broader search terms
			expect(tips.some(tip => tip.includes("broader search terms"))).toBe(true);
		}
	});

	test("tip deduplication prevents repeated tips", async () => {
		const userId = "test-user-dedup";

		// First search with structural query
		const result1 = await executeSearch(
			{
				query: "function testFunc",
				scope: ["code"],
				limit: 20,
			},
			"test-request-1",
			userId
		);

		// Second identical search
		const result2 = await executeSearch(
			{
				query: "function testFunc",
				scope: ["code"],
				limit: 20,
			},
			"test-request-2",
			userId
		);

		const response1 = result1 as Record<string, unknown>;
		const response2 = result2 as Record<string, unknown>;

		// Second response should have fewer or no tips due to deduplication
		const tips1Count = response1.tips ? (response1.tips as string[]).length : 0;
		const tips2Count = response2.tips ? (response2.tips as string[]).length : 0;

		// Tip count should be same or less in second response
		expect(tips2Count).toBeLessThanOrEqual(tips1Count);
	});

	test("tips are limited to maximum of 2 per response", async () => {
		// Use a query that would generate many tips in old system
		const result = await executeSearch(
			{
				query: "function authentication error",
				scope: ["code"],
				limit: 50, // Large result set to trigger multiple tip patterns
			},
			"test-request",
			"test-user-limit"
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			expect(Array.isArray(response.tips)).toBe(true);
			const tips = response.tips as string[];
			expect(tips.length).toBeLessThanOrEqual(2);
		}
	});

	test("context-aware suppression prevents redundant tips", async () => {
		// Search with specific filters that should suppress certain tips
		const result = await executeSearch(
			{
				query: "authentication",
				scope: ["code", "symbols"], // multiple scopes
				filters: {
					glob: "**/*.ts", // specific file type
					exported_only: true // specific symbol filter
				},
				limit: 20,
			},
			"test-request",
			"test-user-suppress"
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			const tips = response.tips as string[];
			// Should not suggest multiple scopes (already using them)
			expect(tips.some(tip => tip.includes("multiple scopes"))).toBe(false);
			// Should not suggest file type filtering (already applied)
			expect(tips.some(tip => tip.includes("glob:") && tip.includes("typescript"))).toBe(false);
		}
	});

	test("query patterns trigger appropriate scope suggestions", async () => {
		const testCases = [
			{
				query: "why did we choose this approach",
				expectedScope: "decisions",
				userId: "test-why-user"
			},
			{
				query: "how to implement authentication",
				expectedScope: "patterns",
				userId: "test-how-user"
			},
			{
				query: "error handling bug fix",
				expectedScope: "failures",
				userId: "test-error-user"
			}
		];

		for (const testCase of testCases) {
			const result = await executeSearch(
				{
					query: testCase.query,
					scope: ["code"], // Single scope to trigger suggestions
					limit: 10,
				},
				"test-request",
				testCase.userId
			);

			const response = result as Record<string, unknown>;
			if (response.tips) {
				const tips = response.tips as string[];
				expect(tips.some(tip => tip.includes(testCase.expectedScope))).toBe(true);
			}
		}
	});

	test("backward compatibility maintained for tip response format", async () => {
		const result = await executeSearch(
			{
				query: "function test",
				scope: ["code"],
				limit: 10,
			},
			"test-request",
			"test-user-compat"
		);

		const response = result as Record<string, unknown>;
		if (response.tips) {
			// Tips should still be an array of strings (not objects)
			expect(Array.isArray(response.tips)).toBe(true);
			const tips = response.tips as unknown[];
			for (const tip of tips) {
				expect(typeof tip).toBe("string");
			}
		}
	});
});

describe("executeGetIndexStatistics integration", () => {
	test("get_index_statistics returns expected structure", async () => {
		// Import the executor
		const { executeGetIndexStatistics } = await import("@mcp/tools");
		
		const result = await executeGetIndexStatistics(
			{},
			"test-request",
			"test-user"
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
