/**
 * Tests for KotaDB CLI entry point
 *
 * Following antimocking philosophy: spawns real CLI processes
 *
 * Test Coverage:
 * - --version and -v flags
 * - --help and -h flags
 * - Unknown option error handling
 * - --port validation
 *
 * @module tests/cli
 */

import { describe, expect, test } from "bun:test";
import { spawn } from "bun";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "src", "cli.ts");

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

describe("CLI", () => {
  test("--version returns version number", async () => {
    const { stdout, exitCode } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^kotadb v\d+\.\d+\.\d+/);
  });

  test("-v is alias for --version", async () => {
    const { stdout, exitCode } = await runCli(["-v"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^kotadb v\d+\.\d+\.\d+/);
  });

  test("--help shows usage information", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE:");
    expect(stdout).toContain("--port");
    expect(stdout).toContain("--version");
    expect(stdout).toContain("--help");
    expect(stdout).toContain("MCP CONFIGURATION:");
  });

  test("-h is alias for --help", async () => {
    const { stdout, exitCode } = await runCli(["-h"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE:");
  });

  test("unknown option exits with error", async () => {
    const { stderr, exitCode } = await runCli(["--unknown"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown option: --unknown");
    expect(stderr).toContain("Use --help for usage information");
  });

  test("--port without value exits with error", async () => {
    const { stderr, exitCode } = await runCli(["--port"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: --port requires a valid number");
  });

  test("--port with invalid value exits with error", async () => {
    const { stderr, exitCode } = await runCli(["--port", "abc"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: --port requires a valid number");
  });

  test("--port=invalid exits with error", async () => {
    const { stderr, exitCode } = await runCli(["--port=abc"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: --port requires a valid number");
  });
});
