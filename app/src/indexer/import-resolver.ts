/**
 * Import path resolution utilities for dependency graph extraction.
 *
 * This module resolves import paths to absolute file paths using
 * TypeScript/Node.js module resolution rules. It handles:
 * - Relative imports (./foo, ../bar)
 * - Path aliases (@api/*, @db/*, etc.) via tsconfig.json
 * - Index file resolution (./dir → ./dir/index.ts)
 * - Extension variants (.ts, .tsx, .js, .jsx, .mjs, .cjs)
 * - Extension substitution (.js → .ts for TypeScript source resolution)
 * - Missing files (returns null)
 *
 * Non-goals (deferred or out of scope):
 * - node_modules resolution (external dependencies)
 * - Dynamic imports or require()
 *
 * @see app/src/indexer/dependency-extractor.ts - Consumer of resolution logic
 * @see app/src/indexer/path-resolver.ts - Path alias resolution
 */

import path from "node:path";
import { existsSync } from "node:fs";

import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";
import { resolvePathAlias, type PathMappings } from "./path-resolver.js";
import { SUPPORTED_EXTENSIONS, INDEX_FILES } from "./constants.js";

const logger = createLogger({ module: "indexer-import-resolver" });

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
 * Resolve an import path to an absolute file path.
 *
 * Main entry point for import resolution. Enhanced with path alias support.
 * Resolution order:
 * 1. Relative imports (existing logic)
 * 2. Path alias resolution (new)
 * 3. Return null if unresolved
 *
 * Handles all supported import patterns:
 * - Relative imports with explicit extensions: "./foo.ts"
 * - Relative imports without extensions: "./foo" → "./foo.ts"
 * - Directory imports: "./dir" → "./dir/index.ts"
 * - Parent directory imports: "../bar/baz"
 * - Path aliases: "@api/routes" → "src/api/routes.ts"
 * - Extension substitution: "./foo.js" → "./foo.ts"
 *
 * Returns null if the import cannot be resolved to an existing file.
 *
 * @param importSource - Import path from source code (e.g., "./foo", "@api/routes")
 * @param fromFilePath - Absolute path of file containing the import
 * @param files - Array of indexed files for existence checks
 * @param pathMappings - Optional path mappings from tsconfig
 * @param repoRoot - Optional explicit repo root (avoids heuristic detection)
 * @returns Absolute file path or null if not found
 *
 * @example
 * ```typescript
 * const files = [
 *   { path: '/repo/src/utils.ts' },
 *   { path: '/repo/src/api/routes.ts' }
 * ];
 * 
 * // Relative import
 * resolveImport('./utils', '/repo/src/api/routes.ts', files);
 * // => '/repo/src/utils.ts'
 * 
 * // Path alias
 * const mappings = { baseUrl: ".", paths: { "@api/*": ["src/api/*"] }, tsconfigDir: "" };
 * resolveImport('@api/routes', '/repo/src/index.ts', files, mappings);
 * // => '/repo/src/api/routes.ts'
 * ```
 */
export function resolveImport(
	importSource: string,
	fromFilePath: string,
	files: Array<{ path: string }>,
	pathMappings?: PathMappings | null,
	repoRoot?: string,
): string | null {
	// Relative imports - existing logic unchanged
	if (importSource.startsWith(".")) {
		const fromDir = path.dirname(fromFilePath);
		const resolvedPath = path.normalize(path.join(fromDir, importSource));
		const filePaths = new Set(files.map((f) => f.path));

		// If import already has an extension, check if file exists
		if (SUPPORTED_EXTENSIONS.some((ext) => resolvedPath.endsWith(ext))) {
			if (filePaths.has(resolvedPath)) return resolvedPath;

			// Try extension substitution (.js → .ts, .jsx → .tsx, etc.)
			const ext = SUPPORTED_EXTENSIONS.find((e) => resolvedPath.endsWith(e));
			if (ext) {
				const mapped = EXTENSION_MAP[ext];
				if (mapped) {
					const substituted = resolvedPath.slice(0, -ext.length) + mapped;
					if (filePaths.has(substituted)) return substituted;
				}
			}

			return null;
		}

		// Try adding extensions
		const withExtension = resolveExtensions(resolvedPath, filePaths);
		if (withExtension) {
			return withExtension;
		}

		// Try index file resolution
		const withIndex = handleIndexFiles(resolvedPath, filePaths);
		if (withIndex) {
			return withIndex;
		}

		return null;
	}

	// Path alias resolution
	if (pathMappings) {
		const root = repoRoot || determineProjectRoot(fromFilePath);
		const filePaths = new Set(files.map((f) => f.path));
		const resolved = resolvePathAlias(
			importSource,
			root,
			filePaths,
			pathMappings,
		);
		if (resolved) {
			logger.debug("Resolved path alias", {
				importSource,
				resolved,
				fromFile: fromFilePath,
			});
			return resolved;
		}
	}

	// External package or unresolvable
	return null;
}

/**
 * Determine project root from file path.
 *
 * Walks up directory tree looking for:
 * - package.json
 * - tsconfig.json
 * - .git directory
 *
 * Falls back to first two segments if not found.
 *
 * @internal
 */
function determineProjectRoot(filePath: string): string {
	let currentDir = path.dirname(filePath);
	const maxDepth = 10;
	let depth = 0;

	while (depth < maxDepth) {
		// Check for project markers
		if (
			existsSync(path.join(currentDir, "package.json")) ||
			existsSync(path.join(currentDir, "tsconfig.json")) ||
			existsSync(path.join(currentDir, ".git"))
		) {
			return currentDir;
		}

		const parent = path.dirname(currentDir);
		if (parent === currentDir) {
			// Reached filesystem root
			break;
		}

		currentDir = parent;
		depth++;
	}

	// Fallback: extract root segment from absolute path (e.g., /repo/src/app.ts -> /repo)
	const segments = filePath.split(path.sep).filter(Boolean);
	if (segments.length >= 1) {
		const seg0 = segments[0];
		if (seg0) {
			// Windows path with drive letter (C:\repo)
			if (seg0.includes(":") && segments.length >= 2) {
				return seg0 + path.sep + segments[1];
			}
			// Unix absolute path (/repo)
			return path.sep + seg0;
		}
	}

	return path.dirname(filePath);
}

/**
 * Try adding supported extensions to a path.
 *
 * Checks all supported extensions (.ts, .tsx, .js, .jsx, .mjs, .cjs) in order.
 * Returns the first path that exists in the file set.
 *
 * @param basePath - Path without extension
 * @param filePaths - Set of existing file paths
 * @returns Path with extension if found, null otherwise
 *
 * @example
 * ```typescript
 * const files = new Set(['/repo/src/utils.ts']);
 * resolveExtensions('/repo/src/utils', files); // => '/repo/src/utils.ts'
 * resolveExtensions('/repo/src/missing', files); // => null
 * ```
 */
export function resolveExtensions(
	basePath: string,
	filePaths: Set<string>,
): string | null {
	for (const ext of SUPPORTED_EXTENSIONS) {
		const withExt = basePath + ext;
		if (filePaths.has(withExt)) {
			return withExt;
		}
	}
	return null;
}

/**
 * Try resolving a directory import to an index file.
 *
 * Checks for index files (index.ts, index.tsx, index.js, index.jsx) in order.
 * Returns the first index file that exists in the directory.
 *
 * @param dirPath - Path to directory
 * @param filePaths - Set of existing file paths
 * @returns Path to index file if found, null otherwise
 *
 * @example
 * ```typescript
 * const files = new Set(['/repo/src/api/index.ts']);
 * handleIndexFiles('/repo/src/api', files); // => '/repo/src/api/index.ts'
 * handleIndexFiles('/repo/src/missing', files); // => null
 * ```
 */
export function handleIndexFiles(
	dirPath: string,
	filePaths: Set<string>,
): string | null {
	for (const indexFile of INDEX_FILES) {
		const indexPath = path.join(dirPath, indexFile);
		if (filePaths.has(indexPath)) {
			return indexPath;
		}
	}
	return null;
}
