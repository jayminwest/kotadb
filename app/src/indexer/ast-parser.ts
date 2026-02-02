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
 * - Error-tolerant parsing with partial AST recovery
 * - Support for modern JavaScript/TypeScript syntax
 *
 * @see https://typescript-eslint.io/packages/parser
 */

import { extname } from "node:path";
import { createLogger } from "@logging/logger.js";
import { parse } from "@typescript-eslint/parser";
import type { TSESTree } from "@typescript-eslint/types";
import { Sentry } from "../instrument.js";

const logger = createLogger({ module: "indexer-ast-parser" });

/**
 * File extensions supported for AST parsing.
 *
 * JSON files are excluded because they are not valid JavaScript programs
 * and should be handled separately as data files.
 */
const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"] as const;

/**
 * Represents a parse error with location information.
 */
export interface ParseError {
	/** Error message */
	message: string;
	/** Line number where the error occurred (1-indexed) */
	line?: number;
	/** Column number where the error occurred (0-indexed) */
	column?: number;
}

/**
 * Result of parsing a file, including partial AST recovery information.
 */
export interface ParseResult {
	/** Parsed AST, or null if parsing failed completely */
	ast: TSESTree.Program | null;
	/** List of errors encountered during parsing */
	errors: ParseError[];
	/** True if the AST was recovered with errors (partial parse) */
	partial: boolean;
}

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
 * Extract error location from a parser error object.
 */
function extractErrorLocation(error: unknown): { line?: number; column?: number } {
	const line =
		error &&
		typeof error === "object" &&
		"lineNumber" in error &&
		typeof error.lineNumber === "number"
			? error.lineNumber
			: undefined;

	const column =
		error && typeof error === "object" && "column" in error && typeof error.column === "number"
			? error.column
			: undefined;

	return { line, column };
}

/**
 * Create a ParseError from an error object.
 */
function createParseError(error: unknown): ParseError {
	const message = error instanceof Error ? error.message : String(error);
	const { line, column } = extractErrorLocation(error);
	return { message, line, column };
}

/**
 * Parse a file with error-tolerant options enabled.
 * Uses allowInvalidAST to attempt partial recovery.
 */
function parseWithRecoveryOptions(filePath: string, content: string): TSESTree.Program | null {
	try {
		const ast = parse(content, {
			ecmaVersion: "latest",
			sourceType: "module",
			loc: true,
			range: true,
			comment: true,
			tokens: true,
			filePath,
			// Error-tolerant options
			allowInvalidAST: true,
			errorOnUnknownASTType: false,
		});
		return ast;
	} catch {
		// Even with recovery options, parsing can still fail
		return null;
	}
}

/**
 * Parse a TypeScript or JavaScript file with error recovery support.
 *
 * Attempts normal parsing first. If that fails, tries error-tolerant
 * parsing to recover a partial AST when possible.
 *
 * @param filePath - Path to the file being parsed (for error messages)
 * @param content - File content to parse
 * @returns ParseResult with AST (possibly partial), errors, and recovery status
 *
 * @example
 * ```typescript
 * const result = parseFileWithRecovery('example.ts', 'function foo( {}');
 * if (result.ast) {
 *   if (result.partial) {
 *     process.stdout.write('Recovered partial AST with errors\n');
 *   }
 *   // Use result.ast for symbol extraction
 * }
 * ```
 */
export function parseFileWithRecovery(filePath: string, content: string): ParseResult {
	// First attempt: Normal parsing
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
		return {
			ast,
			errors: [],
			partial: false,
		};
	} catch (firstError) {
		const primaryError = createParseError(firstError);
		const { line, column } = extractErrorLocation(firstError);

		// Second attempt: Try error-tolerant parsing
		const recoveredAst = parseWithRecoveryOptions(filePath, content);

		if (recoveredAst) {
			// Successfully recovered partial AST
			const location = line !== undefined ? ` at line ${line}` : "";
			logger.warn(`Recovered partial AST for ${filePath}${location}`, {
				file_path: filePath,
				line_number: line,
				column_number: column,
				parse_error: primaryError.message,
				recovery: "partial",
			});

			return {
				ast: recoveredAst,
				errors: [primaryError],
				partial: true,
			};
		}

		// Complete failure - log error for observability
		const location = line !== undefined ? ` at line ${line}` : "";
		logger.error(
			`Failed to parse ${filePath}${location}`,
			firstError instanceof Error ? firstError : undefined,
			{
				file_path: filePath,
				line_number: line,
				column_number: column,
				parse_error: primaryError.message,
			},
		);

		// Capture exception in Sentry
		if (firstError instanceof Error) {
			Sentry.captureException(firstError, {
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

		return {
			ast: null,
			errors: [primaryError],
			partial: false,
		};
	}
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
 * - Attempts error-tolerant recovery for partial AST
 * - Logs error via structured logger with file path and message
 * - Returns AST if recovery succeeded, null otherwise
 * - Allows indexing to continue for other files
 *
 * @param filePath - Path to the file being parsed (for error messages)
 * @param content - File content to parse
 * @returns Parsed AST program (possibly recovered), or null if parsing failed completely
 *
 * @example
 * ```typescript
 * const ast = parseFile('example.ts', 'function foo() {}');
 * if (ast) {
 *   process.stdout.write('Function count:', ast.body.length);
 * }
 * ```
 */
export function parseFile(filePath: string, content: string): TSESTree.Program | null {
	const result = parseFileWithRecovery(filePath, content);
	return result.ast;
}
