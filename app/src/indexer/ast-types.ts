/**
 * Type definitions for AST parsing operations.
 *
 * This module provides type-safe wrappers for TypeScript ESLint parser results.
 * Re-exports commonly used types from @typescript-eslint/types for convenience.
 */

import type { TSESTree } from "@typescript-eslint/types";

/**
 * Structured metadata for parse errors.
 * Includes file path, error message, and optional source location.
 */
export interface ParseError {
	/** Path to the file that failed to parse */
	filePath: string;
	/** Human-readable error message from the parser */
	message: string;
	/** Line number where the error occurred (1-indexed, if available) */
	line?: number;
	/** Column number where the error occurred (0-indexed, if available) */
	column?: number;
}

/**
 * Discriminated union representing parse operation result.
 *
 * Success case includes the parsed AST tree.
 * Failure case includes structured error metadata.
 *
 * @example
 * ```typescript
 * const result = parseFile('example.ts', content);
 * if (result.success) {
 *   process.stdout.write('Parsed program with', result.ast.body.length, 'statements');
 * } else {
 *   process.stderr.write('Parse error:', result.error.message);
 * }
 * ```
 */
export type ParseResult =
	| { success: true; ast: TSESTree.Program }
	| { success: false; error: ParseError };

/**
 * Re-export TSESTree for convenient access to AST node types.
 *
 * Usage:
 * ```typescript
 * import { TSESTree } from '@indexer/ast-types';
 * const node: TSESTree.FunctionDeclaration = ...;
 * ```
 */
export type { TSESTree };
