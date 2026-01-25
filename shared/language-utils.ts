/**
 * Language detection utilities for KotaDB.
 *
 * This module provides helper functions for detecting programming languages
 * from file paths based on file extensions.
 *
 * @module @shared/language-utils
 */

/**
 * Map of file extensions to programming language names.
 * Used by detectLanguage for file classification.
 */
const LANGUAGE_MAP: Record<string, string> = {
	ts: "typescript",
	tsx: "typescript",
	js: "javascript",
	jsx: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	py: "python",
	go: "go",
	rs: "rust",
	java: "java",
	cpp: "cpp",
	c: "c",
	h: "c",
};

/**
 * Detect programming language from file path.
 *
 * Extracts the file extension and maps it to a known programming language.
 * Returns "unknown" for unrecognized extensions.
 *
 * @param path - The file path to analyze
 * @returns The detected language name (e.g., "typescript", "python") or "unknown"
 *
 * @example
 * detectLanguage("src/utils/helper.ts") // returns "typescript"
 * detectLanguage("main.py") // returns "python"
 * detectLanguage("README.md") // returns "unknown"
 */
export function detectLanguage(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase();
	return LANGUAGE_MAP[ext ?? ""] ?? "unknown";
}
