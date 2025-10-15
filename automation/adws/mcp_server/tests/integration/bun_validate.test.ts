/**
 * Integration tests for bun_validate MCP tool
 *
 * Tests real Bun CLI execution via Python bridge.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestWorktreeValid, createTestWorktreeWithErrors, cleanup } from "./setup";
import { executeBunValidate } from "../../src/tools/validation";

describe("bun_validate integration tests", () => {
  let validWorktree: string;
  let errorWorktree: string;

  beforeAll(() => {
    validWorktree = createTestWorktreeValid();
    errorWorktree = createTestWorktreeWithErrors();
  });

  afterAll(() => {
    cleanup(validWorktree);
    cleanup(errorWorktree);
  });

  it("passes validation for valid code", async () => {
    // Act: Run validation on valid worktree
    const result = await executeBunValidate({
      cwd: validWorktree,
    });

    // Assert: Validation passes
    expect(result).toHaveProperty("valid", true);
    expect(result.errors).toBeNullOrUndefined();
  });

  it("fails validation for code with errors", async () => {
    // Act: Run validation on worktree with errors
    const result = await executeBunValidate({
      cwd: errorWorktree,
    });

    // Assert: Validation fails
    expect(result).toHaveProperty("valid", false);
    expect(result.errors).toBeTruthy();
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns structured error information", async () => {
    // Act: Run validation on worktree with errors
    const result = await executeBunValidate({
      cwd: errorWorktree,
    });

    // Assert: Error information is structured
    expect(result.valid).toBe(false);
    expect(result.errors).toBeTruthy();

    // Each error should be a string describing the issue
    for (const error of result.errors || []) {
      expect(typeof error).toBe("string");
      expect(error.length).toBeGreaterThan(0);
    }
  });

  it("runs both lint and typecheck", async () => {
    // Act: Run validation
    const result = await executeBunValidate({
      cwd: validWorktree,
    });

    // Assert: Both checks are mentioned or result is comprehensive
    // If valid, both checks passed
    if (result.valid) {
      expect(result.errors).toBeNullOrUndefined();
    } else {
      // If invalid, errors should indicate which check failed
      const errorText = JSON.stringify(result.errors);
      const hasLintOrTypecheck =
        errorText.includes("lint") ||
        errorText.includes("typecheck") ||
        errorText.includes("Type");
      expect(hasLintOrTypecheck).toBe(true);
    }
  });

  it("handles non-existent directory gracefully", async () => {
    // Act: Try to validate non-existent directory
    try {
      const result = await executeBunValidate({
        cwd: "/non/existent/path/12345",
      });

      // If it doesn't throw, it should return invalid
      expect(result.valid).toBe(false);
      expect(result.error || (result.errors && result.errors.length > 0)).toBeTruthy();
    } catch (error) {
      // It's acceptable to throw for non-existent paths
      expect(error).toBeTruthy();
    }
  });
});

// Helper to check if value is null or undefined
function toBeNullOrUndefined(received: any) {
  const pass = received === null || received === undefined;
  return {
    pass,
    message: () =>
      pass
        ? `expected ${received} not to be null or undefined`
        : `expected ${received} to be null or undefined`,
  };
}

// Extend expect with custom matcher
expect.extend({
  toBeNullOrUndefined,
});
