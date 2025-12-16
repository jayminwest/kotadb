/**
 * AST type definitions for TypeScript/JavaScript parsing.
 *
 * Re-exports TSESTree types from @typescript-eslint/types and adds
 * parse result types for error handling.
 */

import type { TSESTree } from "@typescript-eslint/types";

// Re-export core TSESTree types
export type { TSESTree };

/**
 * Parse error details.
 */
export interface ParseError {
	/** Error message */
	message: string;
	/** File path where error occurred */
	filePath: string;
	/** Error location (if available) */
	location?: {
		line: number;
		column: number;
	};
}

/**
 * Parse result discriminated union.
 *
 * Either a successful parse (AST program) or an error.
 */
export type ParseResult =
	| { success: true; ast: TSESTree.Program }
	| { success: false; error: ParseError };
