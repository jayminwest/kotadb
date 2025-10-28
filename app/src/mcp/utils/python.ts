/**
 * Python subprocess execution utilities for MCP tools
 *
 * This module provides utilities for spawning Python processes and parsing
 * their JSON output. Used by ADW MCP tools to query state via the Python bridge.
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";

/**
 * Subprocess execution result
 */
export interface SubprocessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	error?: Error;
}

/**
 * Options for subprocess execution
 */
export interface SubprocessOptions {
	cwd?: string;
	env?: Record<string, string>;
	timeout?: number; // Timeout in milliseconds
}

/**
 * Spawn a Python subprocess and capture stdout/stderr
 *
 * @param script - Path to Python script (relative to project root or absolute)
 * @param args - Command-line arguments for the script
 * @param options - Subprocess execution options
 * @returns Promise resolving to subprocess result
 */
export async function spawnPythonProcess(
	script: string,
	args: string[] = [],
	options: SubprocessOptions = {},
): Promise<SubprocessResult> {
	const {
		cwd = process.cwd(),
		env = {},
		timeout = 30000, // Default 30s timeout
	} = options;

	return new Promise((resolve, reject) => {
		const child = spawn("uv", ["run", script, ...args], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;

		// Set timeout
		const timeoutId = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeout);

		// Capture stdout
		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		// Capture stderr
		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		// Handle process exit
		child.on("close", (exitCode) => {
			clearTimeout(timeoutId);

			if (timedOut) {
				resolve({
					stdout,
					stderr,
					exitCode: exitCode ?? -1,
					error: new Error(`Process timed out after ${timeout}ms`),
				});
			} else {
				resolve({
					stdout,
					stderr,
					exitCode: exitCode ?? -1,
				});
			}
		});

		// Handle spawn errors
		child.on("error", (error) => {
			clearTimeout(timeoutId);
			resolve({
				stdout,
				stderr,
				exitCode: -1,
				error,
			});
		});
	});
}

/**
 * Parse JSON output from Python subprocess
 *
 * @param stdout - Raw stdout from subprocess
 * @returns Parsed JSON object
 * @throws Error if JSON parsing fails
 */
export function parsePythonOutput(stdout: string): unknown {
	const trimmed = stdout.trim();

	if (!trimmed) {
		throw new Error("Empty stdout from Python process");
	}

	try {
		return JSON.parse(trimmed);
	} catch (error) {
		throw new Error(
			`Failed to parse JSON from Python output: ${(error as Error).message}\nOutput: ${trimmed.slice(0, 500)}`,
		);
	}
}

/**
 * Execute Python bridge CLI command and parse JSON result
 *
 * @param command - Bridge command (e.g., "get_state", "list_workflows")
 * @param args - Command arguments
 * @param options - Subprocess execution options
 * @returns Parsed JSON result from Python bridge
 * @throws Error if subprocess fails or JSON parsing fails
 */
export async function executeBridgeCommand(
	command: string,
	args: string[] = [],
	options: SubprocessOptions = {},
): Promise<unknown> {
	// Resolve path to mcp_bridge.py relative to project root
	const projectRoot = resolve(__dirname, "../../../..");
	const bridgeScript = resolve(
		projectRoot,
		"automation/adws/adw_modules/mcp_bridge.py",
	);

	const result = await spawnPythonProcess(
		bridgeScript,
		[command, ...args],
		{
			...options,
			cwd: options.cwd || projectRoot,
		},
	);

	// Check for subprocess errors
	if (result.error) {
		throw new Error(
			`Python bridge subprocess failed: ${result.error.message}`,
		);
	}

	// Check for non-zero exit code
	if (result.exitCode !== 0) {
		throw new Error(
			`Python bridge exited with code ${result.exitCode}: ${result.stderr}`,
		);
	}

	// Parse JSON output
	return parsePythonOutput(result.stdout);
}
