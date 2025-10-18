/**
 * Integration tests for adw_get_state and adw_list_workflows MCP tools
 *
 * Tests real filesystem state operations via Python bridge.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { createTestStateDir, cleanup, verifyEnvironmentSetup, ensurePythonAvailable } from "./setup";
import { executeGetState, executeListWorkflows } from "../../src/tools/workflow";

// Verify environment before running tests
verifyEnvironmentSetup();
ensurePythonAvailable();

describe("adw_get_state integration tests", () => {
  let testAdwId: string;
  let stateDir: string;

  beforeAll(() => {
    testAdwId = `test-state-${Date.now()}`;
    stateDir = createTestStateDir(testAdwId);
  });

  afterAll(() => {
    cleanup(stateDir);
  });

  it("retrieves valid state from filesystem", async () => {
    // Act: Get state via MCP tool
    const result = await executeGetState({
      adw_id: testAdwId,
    });

    // Assert: State loaded correctly
    expect(result).toHaveProperty("adw_id", testAdwId);
    expect(result).toHaveProperty("issue_number", "999");
    expect(result).toHaveProperty("current_phase", "plan");
    expect(result).toHaveProperty("status", "in_progress");
    expect(result).toHaveProperty("plan_file");
    expect(result).toHaveProperty("worktree_path");

    // Verify against actual file (real service verification)
    const statePath = join(stateDir, "adw_state.json");
    const fileContent = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(result.adw_id).toBe(fileContent.adw_id);
    expect(result.issue_number).toBe(fileContent.issue_number);
  });

  it("returns error for non-existent state", async () => {
    // Act: Try to get state for non-existent adw_id
    const result = await executeGetState({
      adw_id: "non-existent-id-12345",
    });

    // Assert: Error returned
    expect(result).toHaveProperty("success", false);
    expect(result).toHaveProperty("error");
  });

  it("validates state has required fields", async () => {
    // Act: Get state
    const result = await executeGetState({
      adw_id: testAdwId,
    });

    // Assert: All required fields present
    const requiredFields = [
      "adw_id",
      "issue_number",
      "current_phase",
      "status",
      "created_at",
      "updated_at",
    ];

    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
      expect(result[field]).toBeTruthy();
    }
  });
});

describe("adw_list_workflows integration tests", () => {
  let testAdwIds: string[];
  let stateDirs: string[];

  beforeAll(() => {
    // Create multiple test workflows
    testAdwIds = [
      `test-list-${Date.now()}-1`,
      `test-list-${Date.now()}-2`,
      `test-list-${Date.now()}-3`,
    ];
    stateDirs = testAdwIds.map((id) => createTestStateDir(id));
  });

  afterAll(() => {
    stateDirs.forEach((dir) => cleanup(dir));
  });

  it("lists all workflows", async () => {
    // Act: List workflows
    const result = await executeListWorkflows({});

    // Assert: Results include test workflows
    expect(result).toHaveProperty("workflows");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.workflows)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(testAdwIds.length);

    // Verify at least one of our test workflows is in the list
    const foundWorkflows = result.workflows.filter((w: any) =>
      testAdwIds.includes(w.adw_id)
    );
    expect(foundWorkflows.length).toBeGreaterThan(0);
  });

  it("filters workflows by adw_id", async () => {
    // Act: List workflows filtered by specific adw_id
    const targetId = testAdwIds[0];
    const result = await executeListWorkflows({
      adw_id: targetId,
    });

    // Assert: Only matching workflow returned
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].adw_id).toBe(targetId);
    expect(result.total).toBe(1);
  });

  it("returns empty list for non-existent filter", async () => {
    // Act: Filter by non-existent adw_id
    const result = await executeListWorkflows({
      adw_id: "non-existent-filter-12345",
    });

    // Assert: Empty results
    expect(result.workflows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
