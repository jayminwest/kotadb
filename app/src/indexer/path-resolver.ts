/**
 * TypeScript/JavaScript path alias resolution.
 *
 * Parses tsconfig.json and jsconfig.json to extract path mappings and resolve
 * path alias imports (e.g., @api/routes → src/api/routes.ts).
 *
 * Key features:
 * - Parse tsconfig.json with compilerOptions.paths and baseUrl
 * - Support extends inheritance (recursive with depth limit)
 * - Fallback to jsconfig.json for JavaScript projects
 * - First-match-wins for multi-path mappings
 * - Graceful error handling for missing/malformed configs
 *
 * @see app/src/indexer/import-resolver.ts - Consumer of path mappings
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, isAbsolute } from "node:path";

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import { SUPPORTED_EXTENSIONS, INDEX_FILES } from "./constants.js";

const logger = createLogger({ module: "indexer-path-resolver" });

/**
 * Parsed TypeScript path mappings from tsconfig.json.
 *
 * Maps path alias prefixes to resolution candidates.
 * Each alias can map to multiple paths (first match wins).
 *
 * @example
 * ```typescript
 * {
 *   baseUrl: ".",
 *   paths: {
 *     "@api/*": ["src/api/*"],
 *     "@shared/*": ["./shared/*", "../shared/*"]
 *   }
 * }
 * ```
 */
export interface PathMappings {
	/** Base URL for relative path resolution (from compilerOptions.baseUrl) */
	baseUrl: string;
	/** Path alias mappings (key: alias pattern, value: resolution paths) */
	paths: Record<string, string[]>;
}

/**
 * Parsed tsconfig.json structure (subset used for resolution).
 *
 * @internal
 */
interface TsConfig {
	extends?: string;
	compilerOptions?: {
		baseUrl?: string;
		paths?: Record<string, string[]>;
	};
}

/**
 * Maximum depth for extends resolution to prevent infinite loops.
 */
const MAX_EXTENDS_DEPTH = 10;

/**
 * Parse tsconfig.json from a directory.
 *
 * Resolution logic:
 * 1. Look for tsconfig.json in projectRoot
 * 2. Look for jsconfig.json as fallback
 * 3. Parse extends recursively (up to 10 levels)
 * 4. Merge paths and baseUrl (child overrides parent)
 * 5. Return null on parse error (graceful failure)
 *
 * @param projectRoot - Absolute path to project root directory
 * @returns PathMappings or null if no config found
 *
 * @example
 * ```typescript
 * const mappings = parseTsConfig("/repo/app");
 * if (mappings) {
 *   // Use mappings in resolveImport()
 * }
 * ```
 */
export function parseTsConfig(projectRoot: string): PathMappings | null {
	// Try tsconfig.json first
	const tsconfigPath = join(projectRoot, "tsconfig.json");
	if (existsSync(tsconfigPath)) {
		const config = parseTsConfigWithExtends(tsconfigPath, 0, MAX_EXTENDS_DEPTH);
		if (config?.compilerOptions?.paths) {
			return {
				baseUrl: config.compilerOptions.baseUrl || ".",
				paths: config.compilerOptions.paths,
			};
		}
	}

	// Fallback to jsconfig.json
	const jsconfigPath = join(projectRoot, "jsconfig.json");
	if (existsSync(jsconfigPath)) {
		const config = parseTsConfigWithExtends(jsconfigPath, 0, MAX_EXTENDS_DEPTH);
		if (config?.compilerOptions?.paths) {
			return {
				baseUrl: config.compilerOptions.baseUrl || ".",
				paths: config.compilerOptions.paths,
			};
		}
	}

	logger.debug("No tsconfig.json or jsconfig.json found", { projectRoot });
	return null;
}

/**
 * Parse tsconfig with extends support (recursive).
 *
 * @internal - Used by parseTsConfig()
 */
function parseTsConfigWithExtends(
	configPath: string,
	depth: number,
	maxDepth: number,
): TsConfig | null {
	// Prevent infinite recursion
	if (depth >= maxDepth) {
		logger.warn("Circular extends detected in tsconfig", {
			configPath,
			depth,
			maxDepth,
		});
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const config: TsConfig = JSON.parse(content);

		// If no extends, return as-is
		if (!config.extends) {
			return config;
		}

		// Parse parent config
		const configDir = dirname(configPath);
		const extendsPath = isAbsolute(config.extends)
			? config.extends
			: join(configDir, config.extends);

		// Add .json if missing
		const resolvedExtendsPath = extendsPath.endsWith(".json")
			? extendsPath
			: `${extendsPath}.json`;

		const parentConfig = parseTsConfigWithExtends(
			resolvedExtendsPath,
			depth + 1,
			maxDepth,
		);

		if (!parentConfig) {
			return config;
		}

		// Merge parent and child configs
		return mergeTsConfigs(config, parentConfig);
	} catch (error) {
		logger.error(
			"Failed to parse tsconfig.json",
			error instanceof Error ? error : undefined,
			{
				configPath,
				parse_error: error instanceof Error ? error.message : String(error),
			},
		);

		if (error instanceof Error) {
			Sentry.captureException(error, {
				tags: { module: "path-resolver", operation: "parse" },
				contexts: { parse: { config_path: configPath } },
			});
		}

		return null;
	}
}

/**
 * Merge child and parent tsconfig objects.
 *
 * Rules:
 * - Child baseUrl overrides parent
 * - Child paths merge with parent (child takes precedence)
 *
 * @internal - Used by parseTsConfigWithExtends()
 */
function mergeTsConfigs(child: TsConfig, parent: TsConfig): TsConfig {
	const merged: TsConfig = {
		...parent,
		...child,
		compilerOptions: {
			...parent.compilerOptions,
			...child.compilerOptions,
		},
	};

	// Merge paths (child takes precedence for duplicate keys)
	if (parent.compilerOptions?.paths || child.compilerOptions?.paths) {
		merged.compilerOptions = merged.compilerOptions || {};
		merged.compilerOptions.paths = {
			...parent.compilerOptions?.paths,
			...child.compilerOptions?.paths,
		};
	}

	return merged;
}

/**
 * Resolve import source using path mappings.
 *
 * Algorithm:
 * 1. Match import against each alias pattern
 * 2. For matching alias, try each resolution path
 * 3. Replace glob wildcard (*) with matched suffix
 * 4. Resolve relative to baseUrl
 * 5. Check if resolved file exists in files Set
 * 6. Return first match, null if none found
 *
 * @param importSource - Import string (e.g., "@api/routes")
 * @param projectRoot - Project root directory (for baseUrl resolution)
 * @param files - Set of indexed file paths
 * @param mappings - Parsed path mappings from tsconfig
 * @returns Resolved absolute path or null
 *
 * @example
 * ```typescript
 * resolvePathAlias("@api/routes", "/repo", files, mappings)
 * // Tries: /repo/src/api/routes.ts, /repo/src/api/routes.tsx, etc.
 * // Returns: "/repo/src/api/routes.ts" (if exists)
 * ```
 */
export function resolvePathAlias(
	importSource: string,
	projectRoot: string,
	files: Set<string>,
	mappings: PathMappings,
): string | null {
	// Try each path alias pattern
	for (const [pattern, resolutionPaths] of Object.entries(mappings.paths)) {
		const suffix = matchesPattern(importSource, pattern);
		if (suffix === null) {
			continue; // Pattern didn't match
		}

		// Try each resolution path for this pattern
		for (const resolutionPath of resolutionPaths) {
			const substituted = substitutePath(resolutionPath, suffix);
			const basePath = join(projectRoot, mappings.baseUrl, substituted);
			const resolved = normalize(basePath);

			// Try with extension variants
			const withExtension = tryExtensions(resolved, files);
			if (withExtension) {
				logger.debug("Resolved path alias", {
					importSource,
					pattern,
					resolved: withExtension,
				});
				return withExtension;
			}

			// Try index files
			const withIndex = tryIndexFiles(resolved, files);
			if (withIndex) {
				logger.debug("Resolved path alias to index", {
					importSource,
					pattern,
					resolved: withIndex,
				});
				return withIndex;
			}
		}
	}

	// No match found
	logger.debug("Could not resolve path alias", {
		importSource,
		patterns: Object.keys(mappings.paths),
	});
	return null;
}

/**
 * Check if import matches a path alias pattern.
 *
 * Returns the matched suffix if pattern matches, null otherwise.
 *
 * Supported patterns:
 * - Exact match: "@api" matches only "@api" (returns "")
 * - Prefix wildcard: "@api/star" matches "@api/routes" (returns "routes")
 * - Prefix + suffix: "@api/star.config" matches "@api/foo.config" (returns "foo")
 *
 * Unsupported patterns (returns null):
 * - Wildcard-only: "star" (no prefix)
 * - Wildcard prefix: "star/foo" (no prefix before wildcard)
 *
 * Note: "star" represents the asterisk wildcard character in path mappings.
 * These unsupported patterns are not used by TypeScript's path mapping
 * and are rejected gracefully.
 *
 * @internal - Used by resolvePathAlias()
 *
 * @param importSource - Import string to match (e.g., "@api/routes")
 * @param pattern - Path alias pattern (e.g., "@api/star")
 * @returns Matched suffix or null if no match
 *
 * @example
 * ```typescript
 * matchesPattern("@api/routes", "@api/star") // => "routes"
 * matchesPattern("@api", "@api") // => ""
 * matchesPattern("@api/routes", "@db/star") // => null
 * matchesPattern("foo", "star") // => null (unsupported pattern)
 * ```
 */
function matchesPattern(importSource: string, pattern: string): string | null {
	// Exact match (no wildcard)
	if (!pattern.includes("*")) {
		return importSource === pattern ? "" : null;
	}

	// Wildcard match
	const parts = pattern.split("*");
	const prefix = parts[0];
	const suffix = parts[1];
	
	// Reject wildcard-only patterns (e.g., "*" or "star/foo")
	// TypeScript path mappings don't use these patterns
	if (!prefix) {
		return null;
	}
	
	if (!importSource.startsWith(prefix)) {
		return null;
	}
	if (suffix && !importSource.endsWith(suffix)) {
		return null;
	}

	// Extract matched suffix
	const matched = importSource.slice(prefix.length);
	if (suffix) {
		return matched.slice(0, -suffix.length);
	}
	return matched;
}

/**
 * Substitute wildcard in path template with matched suffix.
 *
 * @internal - Used by resolvePathAlias()
 */
function substitutePath(pathTemplate: string, suffix: string): string {
	return pathTemplate.replace("*", suffix);
}

/**
 * Try adding supported extensions to a path.
 *
 * @internal - Used by resolvePathAlias()
 */
function tryExtensions(basePath: string, files: Set<string>): string | null {
	// If path already has extension, check as-is
	if (SUPPORTED_EXTENSIONS.some((ext) => basePath.endsWith(ext))) {
		return files.has(basePath) ? basePath : null;
	}

	// Try each extension
	for (const ext of SUPPORTED_EXTENSIONS) {
		const withExt = basePath + ext;
		if (files.has(withExt)) {
			return withExt;
		}
	}

	return null;
}

/**
 * Try resolving a directory to an index file.
 *
 * @internal - Used by resolvePathAlias()
 */
function tryIndexFiles(dirPath: string, files: Set<string>): string | null {
	for (const indexFile of INDEX_FILES) {
		const indexPath = join(dirPath, indexFile);
		if (files.has(indexPath)) {
			return indexPath;
		}
	}
	return null;
}
