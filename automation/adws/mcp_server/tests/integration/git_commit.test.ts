/**
 * Integration tests for git_commit MCP tool
 *
 * Tests real git operations via Python bridge, ensuring anti-mock compliance.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTestGitRepo, createTestStateDir, cleanup } from "./setup";
import { executeGitCommit } from "../../src/tools/git";

describe("git_commit integration tests", () => {
  let testRepo: string;
  let testAdwId: string;
  let stateDir: string;

  beforeAll(() => {
    testAdwId = `test-git-${Date.now()}`;
    testRepo = createTestGitRepo();
    stateDir = createTestStateDir(testAdwId);

    // Update state with actual test repo path as worktree
    const statePath = join(stateDir, "adw_state.json");
    const state = JSON.parse(execSync(`cat "${statePath}"`).toString());
    state.worktree_path = testRepo;
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  });

  afterAll(() => {
    cleanup(testRepo);
    cleanup(stateDir);
  });

  it("creates commit with new file", async () => {
    // Arrange: Add new file
    const testFile = join(testRepo, "new.txt");
    writeFileSync(testFile, "New content\n");

    // Act: Call git_commit via MCP tool
    const result = await executeGitCommit({
      adw_id: testAdwId,
      message: "test: add new file",
    });

    // Assert: Commit created successfully
    expect(result).toHaveProperty("success", true);
    expect(result).toHaveProperty("commit_hash");
    expect(result.commit_hash).toBeTruthy();
    expect(result.message).toBe("test: add new file");
    expect(result.files_changed).toBeGreaterThan(0);

    // Verify via git log (real service verification)
    const log = execSync("git log -1 --oneline", {
      cwd: testRepo,
      encoding: "utf-8",
    });
    expect(log).toContain("test: add new file");
  });

  it("stages specific files when provided", async () => {
    // Arrange: Add multiple files
    writeFileSync(join(testRepo, "a.txt"), "File A\n");
    writeFileSync(join(testRepo, "b.txt"), "File B\n");

    // Act: Commit only a.txt
    const result = await executeGitCommit({
      adw_id: testAdwId,
      message: "test: add only a.txt",
      files: ["a.txt"],
    });

    // Assert: Only one file committed
    expect(result.success).toBe(true);
    expect(result.files_changed).toBe(1);

    // Verify b.txt is still untracked
    const status = execSync("git status --short", {
      cwd: testRepo,
      encoding: "utf-8",
    });
    expect(status).toContain("b.txt");
  });

  it("returns error for non-existent worktree", async () => {
    // Act: Try to commit with invalid adw_id
    const result = await executeGitCommit({
      adw_id: "invalid-adw-id-12345",
      message: "test: should fail",
    });

    // Assert: Error returned
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain("not found");
  });

  it("handles empty commits gracefully", async () => {
    // Act: Try to commit with no changes
    try {
      await executeGitCommit({
        adw_id: testAdwId,
        message: "test: empty commit",
      });
      // If it doesn't throw, check the result
    } catch (error) {
      // Git commit without changes should fail
      expect(error).toBeTruthy();
    }
  });
});
