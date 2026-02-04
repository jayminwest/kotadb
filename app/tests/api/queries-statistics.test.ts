import { describe, test, expect } from "bun:test";
import { getIndexStatistics } from "@api/queries";

describe("getIndexStatistics", () => {
	test("returns statistics with numeric counts", () => {
		const stats = getIndexStatistics();
		
		expect(stats).toHaveProperty("files");
		expect(stats).toHaveProperty("symbols");
		expect(stats).toHaveProperty("references");
		expect(stats).toHaveProperty("decisions");
		expect(stats).toHaveProperty("patterns");
		expect(stats).toHaveProperty("failures");
		expect(stats).toHaveProperty("repositories");
		
		expect(typeof stats.files).toBe("number");
		expect(typeof stats.symbols).toBe("number");
		expect(typeof stats.references).toBe("number");
		expect(typeof stats.decisions).toBe("number");
		expect(typeof stats.patterns).toBe("number");
		expect(typeof stats.failures).toBe("number");
		expect(typeof stats.repositories).toBe("number");
	});
	
	test("returns non-negative counts", () => {
		const stats = getIndexStatistics();
		
		expect(stats.files).toBeGreaterThanOrEqual(0);
		expect(stats.symbols).toBeGreaterThanOrEqual(0);
		expect(stats.references).toBeGreaterThanOrEqual(0);
		expect(stats.decisions).toBeGreaterThanOrEqual(0);
		expect(stats.patterns).toBeGreaterThanOrEqual(0);
		expect(stats.failures).toBeGreaterThanOrEqual(0);
		expect(stats.repositories).toBeGreaterThanOrEqual(0);
	});
	
	test("function executes without throwing", () => {
		expect(() => getIndexStatistics()).not.toThrow();
	});
});
