/**
 * Symbol extraction from AST for code intelligence features.
 *
 * This module traverses TypeScript/JavaScript AST nodes to extract symbols
 * (functions, classes, interfaces, types, etc.) with position information,
 * JSDoc comments, and export status. Extracted symbols are stored in the
 * database for reference tracking and code navigation.
 *
 * Key features:
 * - Visitor pattern for AST traversal
 * - JSDoc comment extraction based on position
 * - Export detection for public API tracking
 * - Position tracking (line/column) for editor navigation
 * - Batch extraction for performance
 *
 * @see app/src/indexer/ast-parser.ts - AST parsing wrapper
 * @see app/src/api/queries.ts - Database storage functions
 */

import type { TSESTree } from "@typescript-eslint/types";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-symbol-extractor" });

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
 * Maps to database enum values in `symbols.kind` column.
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

/**
 * Context passed through AST visitor during traversal.
 *
 * Tracks parent nodes and export context for accurate symbol classification.
 */
interface VisitorContext {
	/** All comments from AST (for JSDoc extraction) */
	comments: TSESTree.Comment[];
	/** Current parent node (for export detection) */
	parent: TSESTree.Node | null;
	/** Whether current context is exported */
	isExported: boolean;
}

/**
 * Extract all symbols from a parsed AST.
 *
 * Main entry point for symbol extraction. Traverses the AST and collects
 * all extractable symbols (functions, classes, types, etc.) with metadata.
 *
 * @param ast - Parsed AST program from ast-parser
 * @param filePath - File path (for context, not used in extraction)
 * @returns Array of extracted symbols (empty if none found)
 *
 * @example
 * ```typescript
 * const ast = parseFile('example.ts', content);
 * if (ast) {
 *   const symbols = extractSymbols(ast, 'example.ts');
 *   process.stdout.write(`Found ${symbols.length} symbols`);
 * }
 * ```
 */
export function extractSymbols(
	ast: TSESTree.Program,
	filePath: string,
): Symbol[] {
	const symbols: Symbol[] = [];
	const context: VisitorContext = {
		comments: ast.comments ?? [],
		parent: null,
		isExported: false,
	};

	// Visit each top-level statement
	for (const node of ast.body) {
		visitNode(node, symbols, context);
	}

	return symbols;
}

/**
 * Visit a single AST node and extract symbols.
 *
 * Dispatches to specialized extractors based on node type.
 * Recursively visits child nodes where needed.
 *
 * @param node - AST node to visit
 * @param symbols - Accumulated symbol array (mutated)
 * @param context - Visitor context with parent and export info
 */
function visitNode(
	node: TSESTree.Node,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	// Detect export context
	const isExported = isExportedNode(node, context.parent);

	// Update context for child visits
	const childContext: VisitorContext = {
		...context,
		parent: node,
		isExported,
	};

	// Dispatch based on node type
	switch (node.type) {
		case "FunctionDeclaration":
			extractFunctionDeclaration(node, symbols, context);
			break;
		case "ClassDeclaration":
			extractClassDeclaration(node, symbols, context);
			break;
		case "TSInterfaceDeclaration":
			extractInterfaceDeclaration(node, symbols, context);
			break;
		case "TSTypeAliasDeclaration":
			extractTypeAliasDeclaration(node, symbols, context);
			break;
		case "TSEnumDeclaration":
			extractEnumDeclaration(node, symbols, context);
			break;
		case "VariableDeclaration":
			extractVariableDeclaration(node, symbols, context);
			break;
		case "ExportNamedDeclaration":
			// Visit the declaration inside the export
			if (node.declaration) {
				visitNode(node.declaration, symbols, {
					...childContext,
					isExported: true,
				});
			}
			break;
		case "ExportDefaultDeclaration":
			// Visit the declaration inside the default export
			if (node.declaration) {
				visitNode(node.declaration, symbols, {
					...childContext,
					isExported: true,
				});
			}
			break;
		default:
			// Skip other node types
			break;
	}
}

/**
 * Extract function declaration symbol.
 *
 * Handles:
 * - Regular function declarations
 * - Async functions
 * - Generator functions
 * - JSDoc comment extraction
 * - Function signature building
 *
 * @param node - FunctionDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractFunctionDeclaration(
	node: TSESTree.FunctionDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name = node.id?.name ?? "<anonymous>";
	const documentation = extractLeadingComment(node, context.comments);
	const signature = buildFunctionSignature(node);

	symbols.push({
		name,
		kind: "function",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature,
		documentation,
		isExported: context.isExported,
		isAsync: node.async,
	});
}

/**
 * Extract class declaration symbol and all methods/properties.
 *
 * Extracts:
 * - Class symbol itself
 * - Each method as separate symbol (with access modifiers)
 * - Each property as separate symbol
 *
 * @param node - ClassDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractClassDeclaration(
	node: TSESTree.ClassDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const className = node.id?.name ?? "<anonymous>";
	const documentation = extractLeadingComment(node, context.comments);

	// Extract class symbol
	symbols.push({
		name: className,
		kind: "class",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature: null,
		documentation,
		isExported: context.isExported,
	});

	// Extract methods and properties
	for (const member of node.body.body) {
		if (member.type === "MethodDefinition") {
			extractMethodDefinition(member, symbols, context);
		} else if (member.type === "PropertyDefinition") {
			extractPropertyDefinition(member, symbols, context);
		}
	}
}

/**
 * Extract method symbol from class.
 *
 * @param node - MethodDefinition AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractMethodDefinition(
	node: TSESTree.MethodDefinition,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name =
		node.key.type === "Identifier" ? node.key.name : "<computed>";
	const documentation = extractLeadingComment(node, context.comments);

	// Build signature for method if it's a function
	let signature: string | null = null;
	if (node.value.type === "FunctionExpression") {
		signature = buildFunctionSignature(node.value);
	}

	// Extract access modifier if present
	let accessModifier: "public" | "private" | "protected" | undefined;
	if (node.accessibility) {
		accessModifier = node.accessibility;
	}

	symbols.push({
		name,
		kind: "method",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature,
		documentation,
		isExported: context.isExported,
		isAsync: node.value.type === "FunctionExpression" && node.value.async,
		accessModifier,
	});
}

/**
 * Extract property symbol from class.
 *
 * @param node - PropertyDefinition AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractPropertyDefinition(
	node: TSESTree.PropertyDefinition,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name =
		node.key.type === "Identifier" ? node.key.name : "<computed>";
	const documentation = extractLeadingComment(node, context.comments);

	// Extract access modifier if present
	let accessModifier: "public" | "private" | "protected" | undefined;
	if (node.accessibility) {
		accessModifier = node.accessibility;
	}

	symbols.push({
		name,
		kind: "property",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature: null,
		documentation,
		isExported: context.isExported,
		accessModifier,
	});
}

/**
 * Extract interface declaration symbol (TypeScript).
 *
 * @param node - TSInterfaceDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractInterfaceDeclaration(
	node: TSESTree.TSInterfaceDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name = node.id.name;
	const documentation = extractLeadingComment(node, context.comments);

	symbols.push({
		name,
		kind: "interface",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature: null,
		documentation,
		isExported: context.isExported,
	});
}

/**
 * Extract type alias declaration symbol (TypeScript).
 *
 * @param node - TSTypeAliasDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractTypeAliasDeclaration(
	node: TSESTree.TSTypeAliasDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name = node.id.name;
	const documentation = extractLeadingComment(node, context.comments);

	symbols.push({
		name,
		kind: "type",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature: null,
		documentation,
		isExported: context.isExported,
	});
}

/**
 * Extract enum declaration symbol (TypeScript).
 *
 * @param node - TSEnumDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractEnumDeclaration(
	node: TSESTree.TSEnumDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	if (!node.loc) return;

	const name = node.id.name;
	const documentation = extractLeadingComment(node, context.comments);

	symbols.push({
		name,
		kind: "enum",
		lineStart: node.loc.start.line,
		lineEnd: node.loc.end.line,
		columnStart: node.loc.start.column,
		columnEnd: node.loc.end.column,
		signature: null,
		documentation,
		isExported: context.isExported,
	});
}

/**
 * Extract variable declaration symbols.
 *
 * Only extracts exported variables (const, let, var) at top level.
 * Handles arrow functions assigned to variables.
 *
 * @param node - VariableDeclaration AST node
 * @param symbols - Symbol accumulator
 * @param context - Visitor context
 */
function extractVariableDeclaration(
	node: TSESTree.VariableDeclaration,
	symbols: Symbol[],
	context: VisitorContext,
): void {
	// Only extract exported variables
	if (!context.isExported) return;

	for (const declarator of node.declarations) {
		if (!declarator.loc) continue;

		// Only handle Identifier patterns (not destructuring)
		if (declarator.id.type !== "Identifier") continue;

		const name = declarator.id.name;
		const documentation = extractLeadingComment(node, context.comments);

		// Determine if this is a function expression
		const isFunction =
			declarator.init?.type === "ArrowFunctionExpression" ||
			declarator.init?.type === "FunctionExpression";

		// Build signature for function expressions
		let signature: string | null = null;
		let isAsync = false;
		if (
			isFunction &&
			(declarator.init?.type === "ArrowFunctionExpression" ||
				declarator.init?.type === "FunctionExpression")
		) {
			signature = buildFunctionSignature(declarator.init);
			isAsync = declarator.init.async;
		}

		// Determine kind based on declaration type and value
		let kind: SymbolKind = "variable";
		if (isFunction) {
			kind = "function";
		} else if (node.kind === "const") {
			kind = "constant";
		}

		symbols.push({
			name,
			kind,
			lineStart: declarator.loc.start.line,
			lineEnd: declarator.loc.end.line,
			columnStart: declarator.loc.start.column,
			columnEnd: declarator.loc.end.column,
			signature,
			documentation,
			isExported: context.isExported,
			isAsync,
		});
	}
}

/**
 * Check if a node is exported.
 *
 * Detects:
 * - Direct exports (export function, export class, etc.)
 * - Named exports (export { foo })
 * - Default exports (export default)
 *
 * @param node - AST node to check
 * @param parent - Parent node (for context)
 * @returns true if node is exported
 */
function isExportedNode(
	node: TSESTree.Node,
	parent: TSESTree.Node | null,
): boolean {
	// Check if parent is an export declaration
	if (
		parent?.type === "ExportNamedDeclaration" ||
		parent?.type === "ExportDefaultDeclaration"
	) {
		return true;
	}

	// Check if node itself is an export
	if (
		node.type === "ExportNamedDeclaration" ||
		node.type === "ExportDefaultDeclaration"
	) {
		return true;
	}

	return false;
}

/**
 * Extract leading JSDoc comment for a node.
 *
 * Finds the last block comment preceding the node within 5 lines.
 * Extracts comment text without delimiters (/** *\/).
 *
 * @param node - AST node to find comment for
 * @param comments - All comments from AST
 * @returns Comment text (without delimiters) or null
 */
function extractLeadingComment(
	node: TSESTree.Node,
	comments: TSESTree.Comment[],
): string | null {
	if (!node.loc) return null;

	const nodeStartLine = node.loc.start.line;

	// Find the last block comment before this node within 5 lines
	let leadingComment: TSESTree.Comment | null = null;
	for (const comment of comments) {
		if (!comment.loc) continue;

		const commentEndLine = comment.loc.end.line;

		// Comment must end before node starts
		if (commentEndLine >= nodeStartLine) continue;

		// Comment must be within 5 lines of node
		if (nodeStartLine - commentEndLine > 5) continue;

		// Only consider block comments (JSDoc style)
		if (comment.type !== "Block") continue;

		// Keep the closest comment
		if (
			!leadingComment ||
			commentEndLine > (leadingComment.loc?.end.line ?? 0)
		) {
			leadingComment = comment;
		}
	}

	if (!leadingComment) return null;

	// Strip comment delimiters and clean up
	let text = leadingComment.value;

	// Remove leading/trailing whitespace
	text = text.trim();

	// Remove leading * from each line (JSDoc style)
	text = text
		.split("\n")
		.map((line) => line.trim().replace(/^\*\s?/, ""))
		.join("\n")
		.trim();

	return text || null;
}

/**
 * Build function signature string.
 *
 * Extracts parameter names and return type (if present).
 * Format: (param1, param2) => returnType
 *
 * @param node - FunctionDeclaration or FunctionExpression node
 * @returns Signature string or null
 */
function buildFunctionSignature(
	node:
		| TSESTree.FunctionDeclaration
		| TSESTree.FunctionExpression
		| TSESTree.ArrowFunctionExpression,
): string | null {
	// Extract parameter names
	const params = node.params
		.map((param) => {
			if (param.type === "Identifier") {
				return param.name;
			}
			if (param.type === "RestElement") {
				if (param.argument.type === "Identifier") {
					return `...${param.argument.name}`;
				}
			}
			// Skip complex patterns (destructuring, etc.)
			return null;
		})
		.filter((p): p is string => p !== null);

	const paramStr = params.join(", ");

	// Extract return type if present (TypeScript)
	let returnType = "";
	if (node.returnType) {
		// Simplify return type extraction - just note it exists
		returnType = " => <return-type>";
	}

	return `(${paramStr})${returnType}`;
}
