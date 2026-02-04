/**
 * CLI argument parsing utilities
 *
 * Extracted for testability. Used by main CLI entry point.
 *
 * @module cli/args
 */

/**
 * Valid toolset tiers for MCP tool selection
 * - default: 8 tools (core + sync)
 * - core: 6 tools
 * - memory: 14 tools (core + sync + memory)
 * - full: 20 tools (all)
 */
export type ToolsetTier = "default" | "core" | "memory" | "full";

const VALID_TOOLSET_TIERS: ToolsetTier[] = ["default", "core", "memory", "full"];

export interface CliOptions {
	port: number;
	help: boolean;
	version: boolean;
	stdio: boolean;
	toolset: ToolsetTier;
}

/**
 * Type guard for valid toolset tier
 */
export function isValidToolsetTier(value: string): value is ToolsetTier {
	return VALID_TOOLSET_TIERS.includes(value as ToolsetTier);
}

/**
 * Parse CLI arguments into options object
 */
export function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		port: Number(process.env.PORT ?? 3000),
		help: false,
		version: false,
		stdio: false,
		toolset: "default",
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--version" || arg === "-v") {
			options.version = true;
		} else if (arg === "--stdio") {
			options.stdio = true;
		} else if (arg === "--port") {
			const portStr = args[++i];
			if (!portStr || Number.isNaN(Number(portStr))) {
				process.stderr.write("Error: --port requires a valid number\n");
				process.exit(1);
			}
			options.port = Number(portStr);
		} else if (arg.startsWith("--port=")) {
			const portStr = arg.split("=")[1];
			if (portStr === undefined || Number.isNaN(Number(portStr))) {
				process.stderr.write("Error: --port requires a valid number\n");
				process.exit(1);
			}
			options.port = Number(portStr);
		} else if (arg === "--toolset") {
			const tierStr = args[++i];
			if (!tierStr) {
				process.stderr.write("Error: --toolset requires a tier value\n");
				process.stderr.write("Valid tiers: default, core, memory, full\n");
				process.exit(1);
			}
			if (!isValidToolsetTier(tierStr)) {
				process.stderr.write(`Error: Invalid toolset tier '${tierStr}'\n`);
				process.stderr.write("Valid tiers: default, core, memory, full\n");
				process.exit(1);
			}
			options.toolset = tierStr;
		} else if (arg.startsWith("--toolset=")) {
			const tierStr = arg.split("=")[1];
			if (tierStr === undefined || tierStr === "") {
				process.stderr.write("Error: --toolset requires a tier value\n");
				process.stderr.write("Valid tiers: default, core, memory, full\n");
				process.exit(1);
			}
			if (!isValidToolsetTier(tierStr)) {
				process.stderr.write(`Error: Invalid toolset tier '${tierStr}'\n`);
				process.stderr.write("Valid tiers: default, core, memory, full\n");
				process.exit(1);
			}
			options.toolset = tierStr;
		} else if (arg.startsWith("-") && arg !== "-") {
			process.stderr.write(`Unknown option: ${arg}\n`);
			process.stderr.write("Use --help for usage information\n");
			process.exit(1);
		}
	}

	return options;
}
