/**
 * Shared constants for import and path resolution.
 *
 * These constants define the supported file types and index file names
 * used across the indexer subsystem for import resolution.
 *
 * IMPORTANT: Keep synchronized with ast-parser.ts SUPPORTED_EXTENSIONS
 * for consistency (though formats differ - array vs Set).
 */

/**
 * Supported file extensions in priority order.
 *
 * TypeScript extensions are checked first, followed by JavaScript variants.
 * This matches the TypeScript compiler's resolution behavior.
 *
 * Used by:
 * - import-resolver.ts (extension resolution)
 * - path-resolver.ts (path alias resolution)
 */
export const SUPPORTED_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
] as const;

/**
 * Index file basenames in priority order.
 *
 * TypeScript index files take precedence over JavaScript.
 *
 * Used by:
 * - import-resolver.ts (directory resolution)
 * - path-resolver.ts (path alias directory resolution)
 */
export const INDEX_FILES = [
	"index.ts",
	"index.tsx",
	"index.js",
	"index.jsx",
] as const;
