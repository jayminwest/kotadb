/**
 * Import path resolution utilities for dependency graph extraction.
 *
 * This module resolves relative import paths to absolute file paths using
 * TypeScript/Node.js module resolution rules. It handles:
 * - Relative imports (./foo, ../bar)
 * - Index file resolution (./dir → ./dir/index.ts)
 * - Extension variants (.ts, .tsx, .js, .jsx, .mjs, .cjs)
 * - Missing files (returns null)
 *
 * Non-goals (deferred or out of scope):
 * - tsconfig.json path mapping (paths, baseUrl)
 * - node_modules resolution (external dependencies)
 * - Absolute imports (/, @scope)
 * - Dynamic imports or require()
 */

import path from "node:path";

/**
 * Simple file interface for import resolution.
 */
export interface IndexedFile {
	id: string;
	path: string;
}

/**
 * Supported file extensions in priority order.
 *
 * TypeScript extensions are checked first, followed by JavaScript variants.
 * This matches the TypeScript compiler's resolution behavior.
 */
const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * Index file basenames in priority order.
 *
 * TypeScript index files take precedence over JavaScript.
 */
const INDEX_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

export function resolveImport(
	importSource: string,
	fromFilePath: string,
	files: IndexedFile[],
): string | null {
	// Skip non-relative imports (node_modules, absolute paths, etc.)
	if (!importSource.startsWith(".")) {
		return null;
	}

	// Get directory of the importing file
	const fromDir = path.dirname(fromFilePath);

	// Resolve the import path relative to the importing file's directory
	// Use path.join + path.normalize to preserve relative paths (not convert to absolute)
	const resolvedPath = path.normalize(path.join(fromDir, importSource));

	// Create a Set of file paths for O(1) lookups
	const filePaths = new Set(files.map((f) => f.path));

	// If import already has an extension, check if file exists
	if (SUPPORTED_EXTENSIONS.some((ext) => resolvedPath.endsWith(ext))) {
		return filePaths.has(resolvedPath) ? resolvedPath : null;
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

	// Could not resolve
	return null;
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
