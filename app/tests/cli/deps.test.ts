/**
 * Tests for KotaDB CLI deps command
 *
 * Following antimocking philosophy: tests real CLI processes and argument parsing
 *
 * Test Coverage:
 * - Argument parsing for deps command
 * - Required --file parameter validation
 * - Optional parameters (--format, --depth, --include-tests, --repository)
 * - Text and JSON output formats
 * - Error handling for missing files and repositories
 *
 * @module tests/cli/deps
 */

import { describe, expect, test } from "bun:test";
import { spawn } from "bun";
import { join } from "node:path";
import { parseDepsArgs, formatDepsText, formatDepsJson, type DepsResult } from "../../src/cli/deps";

const CLI_PATH = join(import.meta.dir, "..", "..", "src", "cli.ts");

/**
 * Helper to run CLI and capture output
 */
async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutStream = proc.stdout;
  const stderrStream = proc.stderr;

  const stdout = stdoutStream ? await new Response(stdoutStream).text() : "";
  const stderr = stderrStream ? await new Response(stderrStream).text() : "";
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

/**
 * Helper to extract JSON object from stdout that may have leading log lines.
 * Looks for the last complete JSON object block (starting with { and ending with }).
 */
function extractJson(stdout: string): unknown {
  // Find multi-line JSON object by looking for { followed by potential content and ending with }
  // The deps command outputs nicely formatted JSON that spans multiple lines
  const lines = (stdout || "").split('\n');
  
  // Find the start of a JSON object (line that is just "{")
  let jsonStartIndex = -1;
  let jsonEndIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim() ?? "";
    if (trimmed === '{') {
      jsonStartIndex = i;
    }
    if (jsonStartIndex !== -1 && trimmed === '}') {
      jsonEndIndex = i;
    }
  }
  
  if (jsonStartIndex === -1 || jsonEndIndex === -1) {
    throw new Error(`No JSON found in output: ${stdout}`);
  }
  
  const jsonText = lines.slice(jsonStartIndex, jsonEndIndex + 1).join('\n');
  return JSON.parse(jsonText);
}

describe("CLI deps command - argument parsing", () => {
  test("parseDepsArgs returns error when --file is missing", () => {
    const result = parseDepsArgs([]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("--file is required");
  });

  test("parseDepsArgs parses --file correctly", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts"]);
    expect(result).not.toHaveProperty("error");
    expect((result as any).file).toBe("src/db/client.ts");
  });

  test("parseDepsArgs parses --file= syntax", () => {
    const result = parseDepsArgs(["--file=src/db/client.ts"]);
    expect(result).not.toHaveProperty("error");
    expect((result as any).file).toBe("src/db/client.ts");
  });

  test("parseDepsArgs parses -f shorthand", () => {
    const result = parseDepsArgs(["-f", "src/db/client.ts"]);
    expect(result).not.toHaveProperty("error");
    expect((result as any).file).toBe("src/db/client.ts");
  });

  test("parseDepsArgs defaults format to text", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts"]);
    expect((result as any).format).toBe("text");
  });

  test("parseDepsArgs parses --format json", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--format", "json"]);
    expect((result as any).format).toBe("json");
  });

  test("parseDepsArgs parses --format=json syntax", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--format=json"]);
    expect((result as any).format).toBe("json");
  });

  test("parseDepsArgs rejects invalid format", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--format", "xml"]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("--format must be 'json' or 'text'");
  });

  test("parseDepsArgs defaults depth to 1", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts"]);
    expect((result as any).depth).toBe(1);
  });

  test("parseDepsArgs parses --depth", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--depth", "3"]);
    expect((result as any).depth).toBe(3);
  });

  test("parseDepsArgs parses -d shorthand", () => {
    const result = parseDepsArgs(["-f", "src/db/client.ts", "-d", "2"]);
    expect((result as any).depth).toBe(2);
  });

  test("parseDepsArgs rejects depth < 1", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--depth", "0"]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("--depth must be a number between 1 and 5");
  });

  test("parseDepsArgs rejects depth > 5", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--depth", "6"]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("--depth must be a number between 1 and 5");
  });

  test("parseDepsArgs defaults includeTests to false", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts"]);
    expect((result as any).includeTests).toBe(false);
  });

  test("parseDepsArgs parses --include-tests", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--include-tests"]);
    expect((result as any).includeTests).toBe(true);
  });

  test("parseDepsArgs parses --repository", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--repository", "local/kotadb"]);
    expect((result as any).repository).toBe("local/kotadb");
  });

  test("parseDepsArgs parses -r shorthand", () => {
    const result = parseDepsArgs(["-f", "src/db/client.ts", "-r", "local/kotadb"]);
    expect((result as any).repository).toBe("local/kotadb");
  });

  test("parseDepsArgs rejects unknown options", () => {
    const result = parseDepsArgs(["--file", "src/db/client.ts", "--unknown"]);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain("Unknown option: --unknown");
  });
});

describe("CLI deps command - output formatting", () => {
  const sampleResult: DepsResult = {
    file: "src/db/client.ts",
    dependents: ["src/api/queries.ts", "src/mcp/tools.ts"],
    dependencies: ["src/db/schema.ts", "src/shared/types.ts"],
    testFiles: ["tests/db/client.test.ts"],
  };

  test("formatDepsText outputs markdown header", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("## Dependencies for src/db/client.ts");
  });

  test("formatDepsText shows dependent files count", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("Dependent files (2):");
  });

  test("formatDepsText shows dependencies count", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("Dependencies (2):");
  });

  test("formatDepsText lists dependents", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("- src/api/queries.ts");
    expect(output).toContain("- src/mcp/tools.ts");
  });

  test("formatDepsText lists dependencies", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("- src/db/schema.ts");
    expect(output).toContain("- src/shared/types.ts");
  });

  test("formatDepsText shows test files when present", () => {
    const output = formatDepsText(sampleResult);
    expect(output).toContain("Test files (1):");
    expect(output).toContain("- tests/db/client.test.ts");
  });

  test("formatDepsText shows (none) for empty dependents", () => {
    const emptyResult: DepsResult = {
      file: "src/isolated.ts",
      dependents: [],
      dependencies: [],
      testFiles: [],
    };
    const output = formatDepsText(emptyResult);
    expect(output).toContain("Dependent files (0):");
    expect(output).toContain("(none)");
  });

  test("formatDepsText shows error when present", () => {
    const errorResult: DepsResult = {
      file: "src/missing.ts",
      dependents: [],
      dependencies: [],
      testFiles: [],
      error: "File not found",
    };
    const output = formatDepsText(errorResult);
    expect(output).toContain("Error: File not found");
  });

  test("formatDepsJson outputs valid JSON", () => {
    const output = formatDepsJson(sampleResult);
    const parsed = JSON.parse(output);
    expect(parsed.file).toBe("src/db/client.ts");
    expect(parsed.dependents).toEqual(["src/api/queries.ts", "src/mcp/tools.ts"]);
    expect(parsed.dependencies).toEqual(["src/db/schema.ts", "src/shared/types.ts"]);
    expect(parsed.testFiles).toEqual(["tests/db/client.test.ts"]);
  });
});

describe("CLI deps command - integration", () => {
  test("deps without --file shows error", async () => {
    const { stderr, exitCode } = await runCli(["deps"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--file is required");
    expect(stderr).toContain("Usage:");
  });

  test("deps --file with missing file shows error in output", async () => {
    const { stdout, exitCode } = await runCli(["deps", "--file", "nonexistent/file.ts"]);
    // Should exit with 1 due to error
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Error:");
    expect(stdout).toContain("File not found");
  });

  test("deps --file with missing file in JSON format shows error", async () => {
    const { stdout, exitCode } = await runCli(["deps", "--file", "nonexistent/file.ts", "--format", "json"]);
    expect(exitCode).toBe(1);
    // Extract JSON from stdout (may have log lines before)
    const result = extractJson(stdout) as DepsResult;
    expect(result.error).toContain("File not found");
  });

  test("--help shows deps command documentation", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("deps");
    expect(stdout).toContain("--file");
    expect(stdout).toContain("--format");
    expect(stdout).toContain("--depth");
    expect(stdout).toContain("--include-tests");
  });
});
