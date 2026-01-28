/**
 * Tests for analyze_change_impact MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - analyze_change_impact: Change impact analysis with dependency aggregation
 *
 * @module tests/mcp/analyze-change-impact
 */

import { describe, expect, test } from "bun:test";
import { executeAnalyzeChangeImpact } from "@mcp/tools.js";

describe("analyze_change_impact MCP tool", () => {
	const requestId = "test-request-1";
	const userId = "test-user-1";

	test("should require change_type parameter", async () => {
		await expect(async () => {
			await executeAnalyzeChangeImpact({ description: "Test change" }, requestId, userId);
		}).toThrow("Missing required parameter: change_type");
	});

	test("should require description parameter", async () => {
		await expect(async () => {
			await executeAnalyzeChangeImpact({ change_type: "feature" }, requestId, userId);
		}).toThrow("Missing required parameter: description");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeAnalyzeChangeImpact("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should validate change_type enum", async () => {
		await expect(async () => {
			await executeAnalyzeChangeImpact(
				{ change_type: "invalid", description: "Test" },
				requestId,
				userId,
			);
		}).toThrow("Parameter 'change_type' must be one of: feature, refactor, fix, chore");
	});

	test("should analyze change impact with minimal params", async () => {
		const result = (await executeAnalyzeChangeImpact(
			{
				change_type: "feature",
				description: "Add new authentication feature",
			},
			requestId,
			userId,
		)) as {
			affected_files: Array<unknown>;
			test_scope: { test_files: Array<unknown> };
			risk_level: string;
		};

		expect(result.affected_files).toBeDefined();
		expect(result.test_scope).toBeDefined();
		expect(result.risk_level).toBeDefined();
	});

	test("should accept files_to_modify parameter", async () => {
		const result = (await executeAnalyzeChangeImpact(
			{
				change_type: "refactor",
				description: "Refactor middleware",
				files_to_modify: ["src/auth/middleware.ts"],
			},
			requestId,
			userId,
		)) as { affected_files: Array<unknown> };

		expect(result.affected_files).toBeDefined();
	});

	test("should accept files_to_create parameter", async () => {
		const result = (await executeAnalyzeChangeImpact(
			{
				change_type: "feature",
				description: "Add new feature",
				files_to_create: ["src/features/new-feature.ts"],
			},
			requestId,
			userId,
		)) as { affected_files: Array<unknown> };

		expect(result.affected_files).toBeDefined();
	});

	test("should accept files_to_delete parameter", async () => {
		const result = (await executeAnalyzeChangeImpact(
			{
				change_type: "chore",
				description: "Remove deprecated code",
				files_to_delete: ["src/deprecated/old.ts"],
			},
			requestId,
			userId,
		)) as { affected_files: Array<unknown> };

		expect(result.affected_files).toBeDefined();
	});

	test("should handle breaking_changes flag", async () => {
		const result = (await executeAnalyzeChangeImpact(
			{
				change_type: "refactor",
				description: "Breaking API changes",
				breaking_changes: true,
			},
			requestId,
			userId,
		)) as { risk_level: string };

		expect(result.risk_level).toBeDefined();
	});

	test("should throw error for invalid files_to_modify type", async () => {
		await expect(async () => {
			await executeAnalyzeChangeImpact(
				{
					change_type: "feature",
					description: "Test",
					files_to_modify: "not-an-array",
				},
				requestId,
				userId,
			);
		}).toThrow("Parameter 'files_to_modify' must be an array");
	});
});
