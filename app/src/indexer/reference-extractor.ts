/**
 * Reference extraction from AST for code intelligence features.
 *
 * This module traverses TypeScript/JavaScript AST nodes to extract references
 * (imports, function calls, property access, type references) with precise
 * location information. Extracted references are stored in the database for
 * "find usages" queries and dependency tracking.
 *
 * Key features:
 * - Visitor pattern for AST traversal (consistent with symbol-extractor.ts)
 * - Import extraction with alias handling
 * - Call expression extraction (function calls, method calls)
 * - Property access extraction (member expressions)
 * - TypeScript type reference extraction
 * - Batch extraction for performance
 *
 * Non-goals (deferred to symbol resolution phase):
 * - Cross-file symbol resolution (requires import path resolution)
 * - Type inference (TypeScript language server features)
 * - Call graph construction (depends on resolved symbols)
 *
 * @see app/src/indexer/ast-parser.ts - AST parsing wrapper
 * @see app/src/indexer/symbol-extractor.ts - Symbol extraction (similar pattern)
 * @see app/src/api/queries.ts - Database storage functions
 */

import type { TSESTree } from "@typescript-eslint/types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-reference-extractor" });

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
 * Maps to database enum values in `references.reference_type` column.
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
 * Stored as JSONB in database for flexible schema evolution.
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

/**
 * Context passed through AST visitor during traversal.
 *
 * Tracks parent nodes for context-aware extraction.
 */
interface VisitorContext {
	/** Current parent node (for context) */
	parent: TSESTree.Node | null;
}

/**
 * Extract all references from a parsed AST.
 *
 * Main entry point for reference extraction. Traverses the AST and collects
 * all symbol references (imports, calls, property access, type references).
 *
 * @param ast - Parsed AST program from ast-parser
 * @param filePath - File path (for context, not used in extraction)
 * @returns Array of extracted references (empty if none found)
 *
 * @example
 * ```typescript
 * const ast = parseFile('example.ts', content);
 * if (ast) {
 *   const references = extractReferences(ast, 'example.ts');
 *   process.stdout.write(`Found ${references.length} references`);
 * }
 * ```
 */
export function extractReferences(
	ast: TSESTree.Program,
	filePath: string,
): Reference[] {
	const references: Reference[] = [];
	const context: VisitorContext = {
		parent: null,
	};

	// Visit each top-level statement
	for (const node of ast.body) {
		visitNode(node, references, context);
	}

	return references;
}

/**
 * Visit a single AST node and extract references.
 *
 * Dispatches to specialized extractors based on node type.
 * Recursively visits child nodes where needed.
 *
 * @param node - AST node to visit
 * @param references - Accumulated reference array (mutated)
 * @param context - Visitor context with parent info
 */
function visitNode(
	node: TSESTree.Node,
	references: Reference[],
	context: VisitorContext,
): void {
	// Update context for child visits
	const childContext: VisitorContext = {
		parent: node,
	};

	// Dispatch based on node type
	switch (node.type) {
		case "ImportDeclaration":
			extractImportDeclaration(node, references);
			break;
		case "CallExpression":
			extractCallExpression(node, references, childContext);
			break;
		case "MemberExpression":
			// Extract member expressions (property access)
			extractMemberExpression(node, references, childContext);
			break;
		case "TSTypeReference":
			extractTypeReference(node, references);
			break;
		default:
			// Recursively visit children for other node types
			visitChildren(node, references, childContext);
			break;
	}
}

/**
 * Recursively visit all child nodes.
 *
 * Used for node types that don't directly produce references but may
 * contain reference-producing children.
 *
 * @param node - Parent node to visit children of
 * @param references - Reference accumulator
 * @param context - Visitor context
 */
function visitChildren(
	node: TSESTree.Node,
	references: Reference[],
	context: VisitorContext,
): void {
	// Visit common child node locations
	const nodeAny = node as any;

	// Handle array properties (body, declarations, etc.)
	for (const key of Object.keys(nodeAny)) {
		const value = nodeAny[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				if (child && typeof child === "object" && "type" in child) {
					visitNode(child, references, context);
				}
			}
		} else if (
			value &&
			typeof value === "object" &&
			"type" in value &&
			key !== "parent"
		) {
			// Visit single child nodes (but skip parent references)
			visitNode(value, references, context);
		}
	}
}

/**
 * Extract import declaration references.
 *
 * Handles all import forms:
 * - Named imports: import { foo, bar } from './module'
 * - Default imports: import foo from './module'
 * - Namespace imports: import * as foo from './module'
 * - Aliased imports: import { foo as bar } from './module'
 * - Side-effect imports: import './module'
 *
 * @param node - ImportDeclaration AST node
 * @param references - Reference accumulator
 */
function extractImportDeclaration(
	node: TSESTree.ImportDeclaration,
	references: Reference[],
): void {
	if (!node.loc) return;

	const importSource = node.source.value as string;

	// Handle side-effect imports (no specifiers)
	if (node.specifiers.length === 0) {
		references.push({
			targetName: importSource,
			referenceType: "import",
			lineNumber: node.loc.start.line,
			columnNumber: node.loc.start.column,
			metadata: {
				importSource,
				isSideEffectImport: true,
			},
		});
		return;
	}

	// Process each import specifier
	for (const specifier of node.specifiers) {
		if (!specifier.loc) continue;

		let targetName: string;
		const metadata: ReferenceMetadata = { importSource };

		if (specifier.type === "ImportDefaultSpecifier") {
			// Default import: import foo from './module'
			targetName = specifier.local.name;
			metadata.isDefaultImport = true;
		} else if (specifier.type === "ImportNamespaceSpecifier") {
			// Namespace import: import * as foo from './module'
			targetName = specifier.local.name;
			metadata.isNamespaceImport = true;
		} else if (specifier.type === "ImportSpecifier") {
			// Named import: import { foo } from './module'
			// or aliased: import { foo as bar } from './module'
			const importedName =
				specifier.imported.type === "Identifier"
					? specifier.imported.name
					: specifier.imported.value;
			const localName = specifier.local.name;
			targetName = importedName;
			if (localName !== importedName) {
				metadata.importAlias = localName;
			}
		} else {
			// Unknown specifier type, skip
			continue;
		}

		references.push({
			targetName,
			referenceType: "import",
			lineNumber: specifier.loc.start.line,
			columnNumber: specifier.loc.start.column,
			metadata,
		});
	}
}

/**
 * Extract call expression references.
 *
 * Handles:
 * - Function calls: foo()
 * - Method calls: obj.method()
 * - Chained calls: obj.foo().bar()
 * - Optional chaining: obj?.method()
 *
 * @param node - CallExpression AST node
 * @param references - Reference accumulator
 * @param context - Visitor context
 */
function extractCallExpression(
	node: TSESTree.CallExpression,
	references: Reference[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	let targetName: string;
	const metadata: ReferenceMetadata = {};

	if (node.callee.type === "Identifier") {
		// Simple function call: foo()
		targetName = node.callee.name;
		metadata.calleeName = targetName;
		metadata.isMethodCall = false;
	} else if (node.callee.type === "MemberExpression") {
		// Method call: obj.method() or obj?.method()
		const propertyName = extractPropertyName(node.callee);
		if (!propertyName) {
			// Can't resolve property name (computed property), skip
			// But still visit children for nested references
			visitChildren(node, references, context);
			return;
		}

		targetName = propertyName;
		metadata.calleeName = propertyName;
		metadata.isMethodCall = true;
		metadata.isOptionalChaining = node.callee.optional;
	} else {
		// Complex callee expression (IIFE, etc.), skip but visit children
		visitChildren(node, references, context);
		return;
	}

	references.push({
		targetName,
		referenceType: "call",
		lineNumber: node.loc.start.line,
		columnNumber: node.loc.start.column,
		metadata,
	});

	// Visit children to extract nested references
	visitChildren(node, references, context);
}

/**
 * Extract member expression references (property access).
 *
 * Handles:
 * - Property access: obj.prop
 * - Chained access: obj.foo.bar
 * - Optional chaining: obj?.prop
 *
 * Skips:
 * - Computed properties: obj[key] (cannot resolve statically)
 * - Member expressions that are callees (handled by extractCallExpression)
 *
 * @param node - MemberExpression AST node
 * @param references - Reference accumulator
 * @param context - Visitor context
 */
function extractMemberExpression(
	node: TSESTree.MemberExpression,
	references: Reference[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	// Skip if this member expression is the callee of a call expression
	// (it will be handled as a method call instead)
	if (
		context.parent?.type === "CallExpression" &&
		(context.parent as TSESTree.CallExpression).callee === node
	) {
		// Still visit children (the object part might have references)
		visitChildren(node, references, context);
		return;
	}

	const propertyName = extractPropertyName(node);
	if (!propertyName) {
		// Can't resolve property name (computed), skip but visit children
		visitChildren(node, references, context);
		return;
	}

	references.push({
		targetName: propertyName,
		referenceType: "property_access",
		lineNumber: node.loc.start.line,
		columnNumber: node.loc.start.column,
		metadata: {
			propertyName,
			isOptionalChaining: node.optional,
		},
	});

	// Visit children to extract nested references
	visitChildren(node, references, context);
}

/**
 * Extract property name from member expression.
 *
 * Handles identifier properties only (skips computed properties).
 *
 * @param node - MemberExpression node
 * @returns Property name or null if computed
 */
function extractPropertyName(node: TSESTree.MemberExpression): string | null {
	if (node.computed) {
		// Computed property (obj[key]), cannot resolve statically
		return null;
	}

	if (node.property.type === "Identifier") {
		return node.property.name;
	}

	// Other property types (PrivateIdentifier, etc.)
	return null;
}

/**
 * Extract TypeScript type reference.
 *
 * Handles:
 * - Simple type references: Foo
 * - Generic type references: Foo<T>
 * - Qualified type names: namespace.Type
 * - typeof type queries: typeof foo
 *
 * @param node - TSTypeReference AST node
 * @param references - Reference accumulator
 */
function extractTypeReference(
	node: TSESTree.TSTypeReference,
	references: Reference[],
): void {
	if (!node.loc) return;

	// Extract type name from typeName identifier
	let targetName: string | undefined;

	if (node.typeName.type === "Identifier") {
		// Simple type reference: Foo
		targetName = node.typeName.name;
	} else if (node.typeName.type === "TSQualifiedName") {
		// Qualified type name: namespace.Type
		// Extract the rightmost identifier
		const current = node.typeName;
		while (current.type === "TSQualifiedName") {
			if (current.right.type === "Identifier") {
				targetName = current.right.name;
				break;
			}
			// This shouldn't happen, but handle it gracefully
			return;
		}
		if (!targetName) return;
	} else {
		// Unknown typeName type, skip
		return;
	}

	// Ensure targetName was successfully extracted
	if (!targetName) return;

	references.push({
		targetName,
		referenceType: "type_reference",
		lineNumber: node.loc.start.line,
		columnNumber: node.loc.start.column,
		metadata: {},
	});
}
