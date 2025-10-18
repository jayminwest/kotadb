/**
 * Unit tests for Python path resolution utility
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getPythonExecutable, validatePythonExecutable } from "../../src/utils/python.js";
import * as fs from "fs";

describe("getPythonExecutable", () => {
  let originalPythonPath: string | undefined;

  beforeEach(() => {
    // Save original PYTHON_PATH
    originalPythonPath = process.env.PYTHON_PATH;
  });

  afterEach(() => {
    // Restore original PYTHON_PATH
    if (originalPythonPath === undefined) {
      delete process.env.PYTHON_PATH;
    } else {
      process.env.PYTHON_PATH = originalPythonPath;
    }
  });

  test("returns PYTHON_PATH when environment variable is set", () => {
    process.env.PYTHON_PATH = "/usr/local/bin/python3";
    expect(getPythonExecutable()).toBe("/usr/local/bin/python3");
  });

  test("returns default 'python3' when PYTHON_PATH is not set", () => {
    delete process.env.PYTHON_PATH;
    expect(getPythonExecutable()).toBe("python3");
  });

  test("returns default 'python3' when PYTHON_PATH is empty string", () => {
    process.env.PYTHON_PATH = "";
    expect(getPythonExecutable()).toBe("python3");
  });

  test("trims whitespace from PYTHON_PATH", () => {
    process.env.PYTHON_PATH = "  /usr/bin/python3  ";
    expect(getPythonExecutable()).toBe("/usr/bin/python3");
  });

  test("supports uv-managed Python paths", () => {
    process.env.PYTHON_PATH = "/Users/user/.cache/uv/archive-v0/xiMReLFz9OH30qgJ1fKgO/bin/python3";
    expect(getPythonExecutable()).toBe("/Users/user/.cache/uv/archive-v0/xiMReLFz9OH30qgJ1fKgO/bin/python3");
  });

  test("supports pyenv Python paths", () => {
    process.env.PYTHON_PATH = "/Users/user/.pyenv/versions/3.12.0/bin/python3";
    expect(getPythonExecutable()).toBe("/Users/user/.pyenv/versions/3.12.0/bin/python3");
  });

  test("supports Homebrew Python paths", () => {
    process.env.PYTHON_PATH = "/opt/homebrew/bin/python3";
    expect(getPythonExecutable()).toBe("/opt/homebrew/bin/python3");
  });

  test("returns default when PYTHON_PATH is only whitespace", () => {
    process.env.PYTHON_PATH = "   ";
    expect(getPythonExecutable()).toBe("python3");
  });
});

describe("validatePythonExecutable", () => {
  let originalPythonPath: string | undefined;

  beforeEach(() => {
    // Save original PYTHON_PATH
    originalPythonPath = process.env.PYTHON_PATH;
  });

  afterEach(() => {
    // Restore original PYTHON_PATH
    if (originalPythonPath === undefined) {
      delete process.env.PYTHON_PATH;
    } else {
      process.env.PYTHON_PATH = originalPythonPath;
    }
  });

  test("validates relative path without file system check (trusts system PATH)", () => {
    delete process.env.PYTHON_PATH;
    const result = validatePythonExecutable();
    expect(result.valid).toBe(true);
    expect(result.path).toBe("python3");
    expect(result.error).toBeUndefined();
  });

  test("validates absolute path that exists and is executable", () => {
    // Use /bin/sh which is guaranteed to exist on Unix systems
    process.env.PYTHON_PATH = "/bin/sh";
    const result = validatePythonExecutable();
    expect(result.valid).toBe(true);
    expect(result.path).toBe("/bin/sh");
    expect(result.error).toBeUndefined();
  });

  test("returns error when absolute path does not exist", () => {
    const nonExistentPath = "/nonexistent/path/to/python3";
    process.env.PYTHON_PATH = nonExistentPath;
    const result = validatePythonExecutable();
    expect(result.valid).toBe(false);
    expect(result.path).toBe(nonExistentPath);
    expect(result.error).toContain("Python executable not found at path");
  });

  test("returns error when absolute path is not executable", () => {
    // Create temporary non-executable file
    const tempFile = "/tmp/test-python-nonexec";
    fs.writeFileSync(tempFile, "#!/usr/bin/env python3");
    fs.chmodSync(tempFile, 0o644); // Read/write, no execute

    try {
      process.env.PYTHON_PATH = tempFile;
      const result = validatePythonExecutable();
      expect(result.valid).toBe(false);
      expect(result.path).toBe(tempFile);
      expect(result.error).toContain("Python executable is not executable");
    } finally {
      // Cleanup
      fs.unlinkSync(tempFile);
    }
  });

  test("validates uv-managed Python path if it exists", () => {
    // This test only validates the logic, not actual uv paths
    const uvPath = "/Users/test/.cache/uv/archive-v0/test/bin/python3";
    process.env.PYTHON_PATH = uvPath;
    const result = validatePythonExecutable();
    // Will fail validation because path doesn't exist
    expect(result.valid).toBe(false);
    expect(result.path).toBe(uvPath);
  });

  test("handles file system errors gracefully", () => {
    // Use a path that triggers permission errors (if running without root)
    const restrictedPath = "/root/.hidden/python3";
    process.env.PYTHON_PATH = restrictedPath;
    const result = validatePythonExecutable();
    expect(result.valid).toBe(false);
    expect(result.path).toBe(restrictedPath);
    expect(result.error).toBeDefined();
  });
});
