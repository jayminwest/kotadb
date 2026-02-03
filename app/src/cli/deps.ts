/**
 * CLI deps command implementation
 *
 * Queries dependency information for a given file.
 *
 * Usage:
 *   kotadb deps --file <path> [--format json|text] [--depth <n>] [--include-tests]
 *
 * @module cli/deps
 */

import { getGlobalDatabase } from "@db/sqlite/index.js";
import { resolveRepositoryIdentifierWithError } from "@mcp/repository-resolver";
import { queryDependents, queryDependencies, resolveFilePath } from "@api/queries";

export interface DepsOptions {
	file: string;
	format: "json" | "text";
	depth: number;
	includeTests: boolean;
	repository?: string;
	help?: boolean;
}

export interface DepsResult {
	file: string;
	dependents: string[];
	dependencies: string[];
	testFiles: string[];
	error?: string;
}

/**
 * Print deps command help
 */
function printDepsHelp(): void {
	process.stdout.write(`
kotadb deps - Query dependency information for a file

USAGE:
  kotadb deps --file <path> [OPTIONS]

OPTIONS:
  --file, -f <path>       Target file to analyze (required)
  --format json|text      Output format (default: text)
  --depth, -d <n>         Dependency traversal depth 1-5 (default: 1)
  --include-tests         Include test files in output
  --repository, -r <id>   Repository ID or full_name
  --help, -h              Show this help message

EXAMPLES:
  kotadb deps --file src/db/client.ts
  kotadb deps -f src/db/client.ts --format json
  kotadb deps -f src/api/routes.ts -d 2 --include-tests

OUTPUT (text format):
  ## Dependencies for src/db/client.ts

  Dependent files (12):
  - src/api/queries.ts
  - src/mcp/tools.ts
  ...

  Dependencies (3):
  - src/db/schema.ts
  - src/shared/types.ts
  ...

OUTPUT (JSON format):
  {
    "file": "src/db/client.ts",
    "dependents": ["src/api/queries.ts", ...],
    "dependencies": ["src/db/schema.ts", ...],
    "testFiles": ["tests/db/client.test.ts"]
  }

`);
}

/**
 * Parse deps command arguments
 */
export function parseDepsArgs(args: string[]): DepsOptions | { error: string } | { help: true } {
	const options: DepsOptions = {
		file: "",
		format: "text",
		depth: 1,
		includeTests: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--help" || arg === "-h") {
			return { help: true };
		} else if (arg === "--file" || arg === "-f") {
			const value = args[++i];
			if (!value || value.startsWith("-")) {
				return { error: "Error: --file requires a path value" };
			}
			options.file = value;
		} else if (arg.startsWith("--file=")) {
			const value = arg.split("=")[1];
			if (!value) {
				return { error: "Error: --file requires a path value" };
			}
			options.file = value;
		} else if (arg === "--format") {
			const value = args[++i];
			if (value !== "json" && value !== "text") {
				return { error: "Error: --format must be 'json' or 'text'" };
			}
			options.format = value;
		} else if (arg.startsWith("--format=")) {
			const value = arg.split("=")[1];
			if (value !== "json" && value !== "text") {
				return { error: "Error: --format must be 'json' or 'text'" };
			}
			options.format = value;
		} else if (arg === "--depth" || arg === "-d") {
			const value = args[++i];
			const depth = Number(value);
			if (Number.isNaN(depth) || depth < 1 || depth > 5) {
				return { error: "Error: --depth must be a number between 1 and 5" };
			}
			options.depth = depth;
		} else if (arg.startsWith("--depth=")) {
			const value = arg.split("=")[1];
			const depth = Number(value);
			if (Number.isNaN(depth) || depth < 1 || depth > 5) {
				return { error: "Error: --depth must be a number between 1 and 5" };
			}
			options.depth = depth;
		} else if (arg === "--include-tests") {
			options.includeTests = true;
		} else if (arg === "--repository" || arg === "-r") {
			const value = args[++i];
			if (!value || value.startsWith("-")) {
				return { error: "Error: --repository requires a value" };
			}
			options.repository = value;
		} else if (arg.startsWith("--repository=")) {
			const value = arg.split("=")[1];
			if (!value) {
				return { error: "Error: --repository requires a value" };
			}
			options.repository = value;
		} else if (arg.startsWith("-") && arg !== "-") {
			return { error: `Error: Unknown option: ${arg}` };
		}
	}

	if (!options.file) {
		return { error: "Error: --file is required" };
	}

	return options;
}

/**
 * Execute deps command and return result
 */
export function executeDeps(options: DepsOptions): DepsResult {
	const db = getGlobalDatabase();

	// Resolve repository ID
	const repoResult = resolveRepositoryIdentifierWithError(options.repository);
	if ("error" in repoResult) {
		return {
			file: options.file,
			dependents: [],
			dependencies: [],
			testFiles: [],
			error: repoResult.error,
		};
	}
	const repositoryId = repoResult.id;

	// Resolve file path to file ID
	const fileId = resolveFilePath(options.file, repositoryId);

	if (!fileId) {
		return {
			file: options.file,
			dependents: [],
			dependencies: [],
			testFiles: [],
			error: `File not found: ${options.file}. Make sure the repository is indexed.`,
		};
	}

	// Query dependents and dependencies
	const referenceTypes = ["import", "re_export", "export_all"];
	const dependentsResult = queryDependents(fileId, options.depth, options.includeTests, referenceTypes);
	const dependenciesResult = queryDependencies(fileId, options.depth, referenceTypes);

	// Collect all dependents (direct + indirect)
	const allDependents = [
		...dependentsResult.direct,
		...Object.values(dependentsResult.indirect).flat(),
	];

	// Collect all dependencies (direct + indirect)
	const allDependencies = [
		...dependenciesResult.direct,
		...Object.values(dependenciesResult.indirect).flat(),
	];

	// Extract test files from dependents
	const testFiles = allDependents.filter(
		(path) => path.includes("test") || path.includes("spec")
	);

	// Remove test files from dependents if not including tests
	const filteredDependents = options.includeTests
		? allDependents
		: allDependents.filter((path) => !path.includes("test") && !path.includes("spec"));

	return {
		file: options.file,
		dependents: [...new Set(filteredDependents)].sort(),
		dependencies: [...new Set(allDependencies)].sort(),
		testFiles: [...new Set(testFiles)].sort(),
	};
}

/**
 * Format deps result as text
 */
export function formatDepsText(result: DepsResult): string {
	const lines: string[] = [];

	lines.push(`## Dependencies for ${result.file}`);
	lines.push("");

	if (result.error) {
		lines.push(`Error: ${result.error}`);
		return lines.join("\n");
	}

	lines.push(`Dependent files (${result.dependents.length}):`);
	if (result.dependents.length === 0) {
		lines.push("  (none)");
	} else {
		for (const dep of result.dependents) {
			lines.push(`- ${dep}`);
		}
	}
	lines.push("");

	lines.push(`Dependencies (${result.dependencies.length}):`);
	if (result.dependencies.length === 0) {
		lines.push("  (none)");
	} else {
		for (const dep of result.dependencies) {
			lines.push(`- ${dep}`);
		}
	}

	if (result.testFiles.length > 0) {
		lines.push("");
		lines.push(`Test files (${result.testFiles.length}):`);
		for (const test of result.testFiles) {
			lines.push(`- ${test}`);
		}
	}

	return lines.join("\n");
}

/**
 * Format deps result as JSON
 */
export function formatDepsJson(result: DepsResult): string {
	return JSON.stringify(result, null, 2);
}

/**
 * Run deps command
 */
export function runDepsCommand(args: string[]): void {
	const parseResult = parseDepsArgs(args);

	// Handle help request
	if ("help" in parseResult && parseResult.help) {
		printDepsHelp();
		process.exit(0);
	}

	if ("error" in parseResult) {
		process.stderr.write(parseResult.error + "\n");
		process.stderr.write("Usage: kotadb deps --file <path> [--format json|text] [--depth <n>] [--include-tests]\n");
		process.exit(1);
	}

	const result = executeDeps(parseResult);

	if (parseResult.format === "json") {
		process.stdout.write(formatDepsJson(result) + "\n");
	} else {
		process.stdout.write(formatDepsText(result) + "\n");
	}

	// Exit with error code if there was an error
	if (result.error) {
		process.exit(1);
	}
}
