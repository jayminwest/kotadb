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
