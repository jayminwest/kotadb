/**
 * Symbol type definitions for code intelligence.
 *
 * Represents named code entities (functions, classes, interfaces, types, etc.)
 * extracted from AST with position information and metadata.
 */

/**
 * Symbol metadata extracted from AST nodes.
 *
 * Represents a named code entity (function, class, type, etc.) with:
 * - Precise source location (line/column)
 * - Optional function signature for callables
 * - JSDoc documentation if present
 * - Export status for public API tracking
 * - Async/access modifier metadata for TypeScript
 */
export interface Symbol {
	/** Symbol name (or <anonymous> for unnamed functions) */
	name: string;
	/** Symbol classification (function, class, interface, etc.) */
	kind: SymbolKind;
	/** Start line number (1-indexed) */
	lineStart: number;
	/** End line number (1-indexed) */
	lineEnd: number;
	/** Start column number (0-indexed) */
	columnStart: number;
	/** End column number (0-indexed) */
	columnEnd: number;
	/** Function signature with parameter names and return type */
	signature: string | null;
	/** JSDoc or TSDoc comment text (without delimiters) */
	documentation: string | null;
	/** Whether symbol is exported (part of public API) */
	isExported: boolean;
	/** Whether function is async (functions only) */
	isAsync?: boolean;
	/** Access modifier for class members (TypeScript) */
	accessModifier?: "public" | "private" | "protected";
}

/**
 * Symbol classification types.
 *
 * Each kind represents a distinct code entity type.
 */
export type SymbolKind =
	| "function" // Regular function declarations
	| "class" // Class declarations
	| "interface" // TypeScript interfaces
	| "type" // TypeScript type aliases
	| "variable" // Variable declarations (const, let, var)
	| "constant" // Exported const (treated as constant)
	| "method" // Class methods
	| "property" // Class properties
	| "enum"; // TypeScript enums
