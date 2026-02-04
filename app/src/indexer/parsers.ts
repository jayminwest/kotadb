import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { IndexedFile } from "@shared/types";
import { extractDependencies } from "./extractors";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-parsers" });

const SUPPORTED_EXTENSIONS = new Set<string>([
	".ts",
	".tsx",
	".js",
	".jsx",
	".cjs",
	".mjs",
	".json",
	".sql",
]);

const IGNORED_DIRECTORIES = new Set<string>([
	// Version control
	".git",
	// Package managers
	"node_modules",
	"vendor", // Go, Ruby
	// Build output
	"build",
	"dist",
	"out",
	"target", // Rust, Java/Maven
	// Framework-specific build/cache directories
	".angular",
	".cache",
	".next", // Next.js
	".nuxt", // Nuxt.js
	".nx", // Nx monorepo
	".output", // Nuxt 3
	".parcel-cache",
	".svelte-kit", // SvelteKit
	".turbo", // Turborepo
	".vercel",
	".vite",
	// Test coverage
	"coverage",
	// Python
	"__pycache__",
	".pytest_cache",
	"venv",
	".venv",
	"env",
]);

export async function discoverSources(projectRoot: string): Promise<string[]> {
	const absoluteRoot = resolve(projectRoot);
	const pending = [absoluteRoot];
	const discovered: string[] = [];

	while (pending.length > 0) {
		const current = pending.pop()!;
		let entries: string[];

		try {
			entries = await readdir(current);
		} catch (error) {
			logger.warn("Failed to read directory during source discovery", {
				directory: current,
				error_message: error instanceof Error ? error.message : String(error),
			});

			if (error instanceof Error) {
				Sentry.captureException(error, {
					tags: {
						module: "parsers",
						operation: "discoverSources",
					},
					contexts: {
						discovery: {
							directory: current,
						},
					},
				});
			}
			continue;
		}

		for (const entry of entries) {
			if (IGNORED_DIRECTORIES.has(entry)) {
				continue;
			}

			const fullPath = join(current, entry);
			let stats;
			try {
				stats = await stat(fullPath);
			} catch (error) {
				logger.warn("Failed to stat file during source discovery", {
					file_path: fullPath,
					error_message: error instanceof Error ? error.message : String(error),
				});

				if (error instanceof Error) {
					Sentry.captureException(error, {
						tags: {
							module: "parsers",
							operation: "stat",
						},
						contexts: {
							discovery: {
								file_path: fullPath,
							},
						},
					});
				}
				continue;
			}

			if (stats.isDirectory()) {
				pending.push(fullPath);
				continue;
			}

			if (stats.isFile() && isSupportedSource(fullPath)) {
				discovered.push(fullPath);
			}
		}
	}

	return discovered.sort();
}

export async function parseSourceFile(
	path: string,
	projectRoot: string,
): Promise<IndexedFile | null> {
	if (!isSupportedSource(path)) {
		return null;
	}

	let content = "";
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		logger.error("Failed to read source file", error instanceof Error ? error : undefined, {
			file_path: path,
			error_message: error instanceof Error ? error.message : String(error),
		});

		if (error instanceof Error) {
			Sentry.captureException(error, {
				tags: {
					module: "parsers",
					operation: "readFile",
				},
				contexts: {
					file: {
						path,
					},
				},
			});
		}
		return null;
	}

	// Skip dependency extraction for SQL files
	const dependencies = extname(path) === ".sql" ? [] : extractDependencies(content);

	return {
		projectRoot: resolve(projectRoot),
		path: path.replace(resolve(projectRoot) + "/", ""),
		content,
		dependencies,
		indexedAt: new Date(),
	};
}

function isSupportedSource(filePath: string): boolean {
	return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}
