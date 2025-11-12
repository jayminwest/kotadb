/**
 * AST parsing wrapper for TypeScript and JavaScript files.
 *
 * This module provides graceful AST parsing using @typescript-eslint/parser.
 * Parse errors are logged but do not throw, allowing indexing to continue.
 *
 * Key features:
 * - Full AST with source locations (line, column, range)
 * - Comment and token preservation for JSDoc extraction
 * - Graceful error handling (returns null on parse errors)
 * - Support for modern JavaScript/TypeScript syntax
 *
 * @see https://typescript-eslint.io/packages/parser
 */

import { parse } from "@typescript-eslint/parser";
import type { TSESTree } from "@typescript-eslint/types";
import { extname } from "node:path";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-ast-parser" });

/**
 * File extensions supported for AST parsing.
 *
 * JSON files are excluded because they are not valid JavaScript programs
 * and should be handled separately as data files.
 */
const SUPPORTED_EXTENSIONS = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".cjs",
	".mjs",
] as const;

/**
 * Check if a file should be parsed to AST based on its extension.
 *
 * @param filePath - Path to the file to check
 * @returns true if the file should be parsed, false otherwise
 *
 * @example
 * ```typescript
 * isSupportedForAST('src/index.ts')    // true
 * isSupportedForAST('config.json')     // false
 * isSupportedForAST('utils.js')        // true
 * ```
 */
export function isSupportedForAST(filePath: string): boolean {
	const ext = extname(filePath);
	return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}

/**
 * Parse a TypeScript or JavaScript file to an Abstract Syntax Tree.
 *
 * Configures the parser with:
 * - Modern syntax support (ecmaVersion: 'latest')
 * - ES module semantics (sourceType: 'module')
 * - Full location information (loc, range)
 * - Comment and token preservation (comment, tokens)
 *
 * On parse error:
 * - Logs error via structured logger with file path and message
 * - Returns null (does not throw)
 * - Allows indexing to continue for other files
 *
 * @param filePath - Path to the file being parsed (for error messages)
 * @param content - File content to parse
 * @returns Parsed AST program, or null if parsing failed
 *
 * @example
 * ```typescript
 * const ast = parseFile('example.ts', 'function foo() {}');
 * if (ast) {
 *   process.stdout.write('Function count:', ast.body.length);
 * }
 * ```
 */
export function parseFile(
	filePath: string,
	content: string,
): TSESTree.Program | null {
	try {
		const ast = parse(content, {
			ecmaVersion: "latest",
			sourceType: "module",
			loc: true,
			range: true,
			comment: true,
			tokens: true,
			filePath,
		});
		return ast;
	} catch (error) {
		// Extract location information from parser error if available
		const line =
			error &&
			typeof error === "object" &&
			"lineNumber" in error &&
			typeof error.lineNumber === "number"
				? error.lineNumber
				: undefined;

		const column =
			error &&
			typeof error === "object" &&
			"column" in error &&
			typeof error.column === "number"
				? error.column
				: undefined;

		// Log parse error for observability
		const message = error instanceof Error ? error.message : String(error);
		const location = line !== undefined ? ` at line ${line}` : "";

		logger.error(`Failed to parse ${filePath}${location}`, error instanceof Error ? error : undefined, {
			file_path: filePath,
			line_number: line,
			column_number: column,
			parse_error: message,
		});

		// Capture exception in Sentry
		if (error instanceof Error) {
			Sentry.captureException(error, {
				tags: {
					module: "ast-parser",
					operation: "parse",
				},
				contexts: {
					parse: {
						file_path: filePath,
						line_number: line,
						column_number: column,
					},
				},
			});
		}

		return null;
	}
}
