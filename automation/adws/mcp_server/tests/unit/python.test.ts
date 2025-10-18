/**
 * Unit tests for Python path resolution utility
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getPythonExecutable } from "../../src/utils/python.js";

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
