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
 * - Discover tsconfig.json in subdirectories (monorepo support)
 * - .js → .ts extension substitution for TypeScript source resolution
 * - First-match-wins for multi-path mappings
 * - Graceful error handling for missing/malformed configs
 *
 * @see app/src/indexer/import-resolver.ts - Consumer of path mappings
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, isAbsolute } from "node:path";

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import { SUPPORTED_EXTENSIONS, INDEX_FILES } from "./constants.js";

const logger = createLogger({ module: "indexer-path-resolver" });

/**
 * Extension substitution map for .js → .ts resolution.
 *
 * When source files use .js extensions in imports (common with TypeScript's
 * moduleResolution: "node16" or "nodenext"), we try the corresponding
 * TypeScript extension.
 */
const EXTENSION_MAP: Record<string, string> = {
	".js": ".ts",
	".jsx": ".tsx",
	".mjs": ".mts",
	".cjs": ".cts",
};

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
 *   },
 *   tsconfigDir: "app"
 * }
 * ```
 */
export interface PathMappings {
	/** Base URL for relative path resolution (from compilerOptions.baseUrl) */
	baseUrl: string;
	/** Path alias mappings (key: alias pattern, value: resolution paths) */
	paths: Record<string, string[]>;
	/** Directory containing tsconfig.json, relative to repo root. Empty string if at root. */
	tsconfigDir: string;
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
 * Maximum directory depth to search for tsconfig.json in subdirectories.
 */
const MAX_DISCOVERY_DEPTH = 3;

/**
 * Parse tsconfig.json from a directory, with subdirectory discovery.
 *
 * Resolution logic:
 * 1. Look for tsconfig.json in projectRoot (fast path)
 * 2. Look for jsconfig.json in projectRoot
 * 3. Search subdirectories (up to 3 levels deep) for tsconfig.json/jsconfig.json
 * 4. Parse extends recursively (up to 10 levels)
 * 5. Merge paths and baseUrl (child overrides parent)
 * 6. Return null on parse error (graceful failure)
 *
 * @param projectRoot - Absolute path to project root directory
 * @returns PathMappings or null if no config found
 *
 * @example
 * ```typescript
 * const mappings = parseTsConfig("/repo");
 * // Finds /repo/app/tsconfig.json, returns tsconfigDir: "app"
 * if (mappings) {
 *   // Use mappings in resolveImport()
 * }
 * ```
 */
export function parseTsConfig(projectRoot: string): PathMappings | null {
	// Fast path: check projectRoot directly
	const rootResult = tryParseConfigInDir(projectRoot, "");
	if (rootResult) return rootResult;

	// Search subdirectories for tsconfig.json
	const found = discoverTsConfig(projectRoot, "", 1, MAX_DISCOVERY_DEPTH);
	if (found) return found;

	logger.debug("No tsconfig.json or jsconfig.json found", { projectRoot });
	return null;
}

/**
 * Try parsing tsconfig.json or jsconfig.json in a specific directory.
 *
 * @internal - Used by parseTsConfig() and discoverTsConfig()
 * @param dir - Absolute path to directory to check
 * @param tsconfigDir - Relative path from repo root to this directory
 * @returns PathMappings or null if no config found
 */
function tryParseConfigInDir(dir: string, tsconfigDir: string): PathMappings | null {
	// Try tsconfig.json first
	const tsconfigPath = join(dir, "tsconfig.json");
	if (existsSync(tsconfigPath)) {
		const config = parseTsConfigWithExtends(tsconfigPath, 0, MAX_EXTENDS_DEPTH);
		if (config?.compilerOptions?.paths) {
			return {
				baseUrl: config.compilerOptions.baseUrl || ".",
				paths: config.compilerOptions.paths,
				tsconfigDir,
			};
		}
	}

	// Fallback to jsconfig.json
	const jsconfigPath = join(dir, "jsconfig.json");
	if (existsSync(jsconfigPath)) {
		const config = parseTsConfigWithExtends(jsconfigPath, 0, MAX_EXTENDS_DEPTH);
		if (config?.compilerOptions?.paths) {
			return {
				baseUrl: config.compilerOptions.baseUrl || ".",
				paths: config.compilerOptions.paths,
				tsconfigDir,
			};
		}
	}

	return null;
}

/**
 * Recursively discover tsconfig.json in subdirectories.
 *
 * @internal - Used by parseTsConfig()
 * @param rootDir - Absolute path to repo root
 * @param currentRelative - Current relative path from root
 * @param currentDepth - Current search depth
 * @param maxDepth - Maximum search depth
 * @returns PathMappings or null if not found
 */
function discoverTsConfig(
	rootDir: string,
	currentRelative: string,
	currentDepth: number,
	maxDepth: number,
): PathMappings | null {
	if (currentDepth > maxDepth) return null;

	const currentDir = currentRelative ? join(rootDir, currentRelative) : rootDir;

	let entries: string[];
	try {
		entries = readdirSync(currentDir);
	} catch {
		return null;
	}

	// Check immediate subdirectories first (breadth-first at this level)
	const subdirs: string[] = [];
	for (const entry of entries) {
		// Skip common non-project directories
		if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "build" || entry === ".next") {
			continue;
		}

		const entryPath = join(currentDir, entry);
		try {
			if (!statSync(entryPath).isDirectory()) continue;
		} catch {
			continue;
		}

		const entryRelative = currentRelative ? join(currentRelative, entry) : entry;

		// Try parsing config in this subdirectory
		const result = tryParseConfigInDir(entryPath, entryRelative);
		if (result) return result;

		subdirs.push(entryRelative);
	}

	// Recurse into subdirectories
	for (const subdir of subdirs) {
		const result = discoverTsConfig(rootDir, subdir, currentDepth + 1, maxDepth);
		if (result) return result;
	}

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
 * 4. Resolve relative to tsconfig directory + baseUrl
 * 5. Convert to repo-root-relative path for files Set lookup
 * 6. Return first match, null if none found
 *
 * @param importSource - Import string (e.g., "@api/routes")
 * @param repoRoot - Repository root directory (absolute path)
 * @param files - Set of indexed file paths (repo-root-relative)
 * @param mappings - Parsed path mappings from tsconfig
 * @returns Resolved repo-root-relative path or null
 *
 * @example
 * ```typescript
 * resolvePathAlias("@api/routes", "/repo", files, mappings)
 * // With tsconfigDir: "app", resolves to "app/src/api/routes.ts"
 * ```
 */
export function resolvePathAlias(
	importSource: string,
	repoRoot: string,
	files: Set<string>,
	mappings: PathMappings,
): string | null {
	// Compute absolute path to tsconfig directory
	const tsconfigAbsDir = mappings.tsconfigDir
		? join(repoRoot, mappings.tsconfigDir)
		: repoRoot;

	// Try each path alias pattern
	for (const [pattern, resolutionPaths] of Object.entries(mappings.paths)) {
		const suffix = matchesPattern(importSource, pattern);
		if (suffix === null) {
			continue; // Pattern didn't match
		}

		// Try each resolution path for this pattern
		for (const resolutionPath of resolutionPaths) {
			const substituted = substitutePath(resolutionPath, suffix);
			const basePath = join(tsconfigAbsDir, mappings.baseUrl, substituted);
			const resolved = normalize(basePath);

			// Convert absolute path to repo-root-relative for files Set lookup
			const relativePath = resolved.startsWith(repoRoot)
				? resolved.slice(repoRoot.length + 1)
				: resolved;

			// Try with extension variants
			const withExtension = tryExtensions(relativePath, files);
			if (withExtension) {
				logger.debug("Resolved path alias", {
					importSource,
					pattern,
					resolved: withExtension,
				});
				return withExtension;
			}

			// Try index files
			const withIndex = tryIndexFiles(relativePath, files);
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
 * Handles extension substitution (.js → .ts, etc.) for TypeScript projects
 * that use .js extensions in imports.
 *
 * @internal - Used by resolvePathAlias()
 */
function tryExtensions(basePath: string, files: Set<string>): string | null {
	// If path already has extension, check as-is first
	if (SUPPORTED_EXTENSIONS.some((ext) => basePath.endsWith(ext))) {
		if (files.has(basePath)) return basePath;

		// Try extension substitution (.js → .ts, .jsx → .tsx, etc.)
		const ext = SUPPORTED_EXTENSIONS.find((e) => basePath.endsWith(e));
		if (ext) {
			const mapped = EXTENSION_MAP[ext];
			if (mapped) {
				const substituted = basePath.slice(0, -ext.length) + mapped;
				if (files.has(substituted)) return substituted;
			}
		}

		return null;
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
