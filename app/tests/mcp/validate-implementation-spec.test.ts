/**
 * Tests for validate_implementation_spec MCP tool
 *
 * Following antimocking philosophy: uses real in-memory SQLite databases
 *
 * Test Coverage:
 * - validate_implementation_spec: Spec validation against KotaDB conventions
 *
 * @module tests/mcp/validate-implementation-spec
 */

import { describe, expect, test } from "bun:test";
import { executeValidateImplementationSpec } from "@mcp/tools.js";

describe("validate_implementation_spec MCP tool", () => {
	const requestId = "test-request-1";
	const userId = "test-user-1";

	test("should require feature_name parameter", async () => {
		await expect(async () => {
			await executeValidateImplementationSpec({}, requestId, userId);
		}).toThrow("Missing required parameter: feature_name");
	});

	test("should throw error when params is not an object", async () => {
		await expect(async () => {
			await executeValidateImplementationSpec("invalid", requestId, userId);
		}).toThrow("Parameters must be an object");
	});

	test("should throw error when feature_name is not a string", async () => {
		await expect(async () => {
			await executeValidateImplementationSpec({ feature_name: 123 }, requestId, userId);
		}).toThrow("Parameter 'feature_name' must be a string");
	});

	test("should validate spec with minimal params", async () => {
		const result = (await executeValidateImplementationSpec(
			{ feature_name: "Test Feature" },
			requestId,
			userId,
		)) as {
			valid: boolean;
			errors: Array<unknown>;
			warnings: Array<unknown>;
			approval_conditions: Array<string>;
		};

		expect(result.valid).toBeDefined();
		expect(result.errors).toBeDefined();
		expect(result.warnings).toBeDefined();
		expect(result.approval_conditions).toBeDefined();
	});

	test("should validate files_to_create", async () => {
		const result = (await executeValidateImplementationSpec(
			{
				feature_name: "New Feature",
				files_to_create: [
					{ path: "src/new-feature.ts", purpose: "Main feature implementation" },
				],
			},
			requestId,
			userId,
		)) as { valid: boolean };

		expect(result.valid).toBeDefined();
	});

	test("should validate files_to_modify", async () => {
		const result = (await executeValidateImplementationSpec(
			{
				feature_name: "Update Feature",
				files_to_modify: [
					{ path: "src/existing.ts", purpose: "Update implementation" },
				],
			},
			requestId,
			userId,
		)) as { valid: boolean };

		expect(result.valid).toBeDefined();
	});

	test("should validate migrations", async () => {
		const result = (await executeValidateImplementationSpec(
			{
				feature_name: "Database Update",
				migrations: [
					{
						filename: "20250128120000_add_users.sql",
						description: "Add users table",
						tables_affected: ["users"],
					},
				],
			},
			requestId,
			userId,
		)) as { warnings: Array<unknown> };

		expect(result.warnings).toBeDefined();
	});

	test("should validate dependencies_to_add", async () => {
		const result = (await executeValidateImplementationSpec(
			{
				feature_name: "Add Dependencies",
				dependencies_to_add: [
					{ name: "zod", version: "^3.22.0" },
				],
			},
			requestId,
			userId,
		)) as { warnings: Array<unknown> };

		expect(result.warnings).toBeDefined();
	});

	test("should handle breaking_changes flag", async () => {
		const result = (await executeValidateImplementationSpec(
			{
				feature_name: "Breaking Changes",
				breaking_changes: true,
			},
			requestId,
			userId,
		)) as { approval_conditions: Array<string>; risk_assessment: string };

		expect(result.approval_conditions).toBeDefined();
		expect(result.risk_assessment).toContain("RISK");
	});

	test("should throw error for invalid files_to_create type", async () => {
		await expect(async () => {
			await executeValidateImplementationSpec(
				{
					feature_name: "Test",
					files_to_create: "not-an-array",
				},
				requestId,
				userId,
			);
		}).toThrow("Parameter 'files_to_create' must be an array");
	});

	test("should throw error for invalid migrations type", async () => {
		await expect(async () => {
			await executeValidateImplementationSpec(
				{
					feature_name: "Test",
					migrations: "not-an-array",
				},
				requestId,
				userId,
			);
		}).toThrow("Parameter 'migrations' must be an array");
	});
});
