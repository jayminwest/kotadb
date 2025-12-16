/**
 * Reference type definitions for code intelligence.
 *
 * Represents symbol usages (imports, calls, property access, type references)
 * extracted from AST with position information and metadata.
 */

/**
 * Reference metadata extracted from AST nodes.
 *
 * Represents a symbol usage (import, call, property access, type reference) with:
 * - Precise source location (line/column)
 * - Reference type classification
 * - Target symbol name (for later resolution)
 * - Optional metadata (import source, alias info, etc.)
 */
export interface Reference {
	/** Symbol name being referenced */
	targetName: string;
	/** Reference classification (import, call, property_access, type_reference) */
	referenceType: ReferenceType;
	/** Line number where reference occurs (1-indexed) */
	lineNumber: number;
	/** Column number where reference occurs (0-indexed) */
	columnNumber: number;
	/** Additional metadata (import source, alias info, etc.) */
	metadata: ReferenceMetadata;
}

/**
 * Reference classification types.
 *
 * Each type represents a distinct reference pattern.
 */
export type ReferenceType =
	| "import" // Import statement (named, default, namespace)
	| "call" // Function/method call expression
	| "property_access" // Member expression (property access)
	| "type_reference"; // TypeScript type reference

/**
 * Additional metadata for references.
 *
 * Flexible schema for storing context-specific information.
 */
export interface ReferenceMetadata {
	/** Import source path (for import references) */
	importSource?: string;
	/** Import alias (if imported with 'as' keyword) */
	importAlias?: string;
	/** Whether this is a namespace import (import * as foo) */
	isNamespaceImport?: boolean;
	/** Whether this is a default import */
	isDefaultImport?: boolean;
	/** Whether this is a side-effect import (import './module') */
	isSideEffectImport?: boolean;
	/** Property name for member expressions */
	propertyName?: string;
	/** Whether optional chaining was used (?.) */
	isOptionalChaining?: boolean;
	/** Callee expression for call expressions */
	calleeName?: string;
	/** Whether this is a method call (vs function call) */
	isMethodCall?: boolean;
}
