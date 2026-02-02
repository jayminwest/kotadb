/**
 * Regex-based symbol extraction fallback for AST parsing failures.
 *
 * This module provides a last-resort symbol extraction mechanism when
 * @typescript-eslint/parser completely fails to parse a file. While less
 * accurate than AST-based extraction, it can still capture basic symbol
 * information from files with syntax errors or unsupported constructs.
 *
 * Key features:
 * - Extracts function, class, interface, type, and enum declarations
 * - Detects export and async modifiers
 * - Provides line number information
 * - Marks symbols with extractionMethod: "regex" metadata
 *
 * Limitations:
 * - Cannot determine end line (uses start line)
 * - Cannot extract JSDoc comments
 * - Cannot determine column positions accurately
 * - May miss complex or multi-line declarations
 * - May produce false positives in string literals or comments
 *
 * @see app/src/indexer/ast-parser.ts - Primary AST parsing
 * @see app/src/indexer/symbol-extractor.ts - AST-based symbol extraction
 */

import type { Symbol, SymbolKind } from "./symbol-extractor.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "indexer-regex-fallback" });

/**
 * Metadata for regex-extracted symbols.
 *
 * Indicates that a symbol was extracted via regex fallback
 * rather than AST parsing, for downstream processing awareness.
 */
export interface RegexExtractedSymbol extends Symbol {
	/** Metadata indicating extraction method */
	metadata?: {
		extractionMethod: "regex";
	};
}

// ============================================================================
// Regex Patterns for Symbol Extraction
// ============================================================================

/**
 * Pattern for function declarations.
 * Matches: [export] [async] function name
 * Groups: 1=export?, 2=async?, 3=name
 */
const FUNCTION_REGEX =
	/^[ \t]*(?:(export)\s+)?(?:(async)\s+)?function\s+(\w+)/gm;

/**
 * Pattern for class declarations.
 * Matches: [export] [abstract] class name
 * Groups: 1=export?, 2=abstract?, 3=name
 */
const CLASS_REGEX =
	/^[ \t]*(?:(export)\s+)?(?:(abstract)\s+)?class\s+(\w+)/gm;

/**
 * Pattern for interface declarations (TypeScript).
 * Matches: [export] interface name
 * Groups: 1=export?, 2=name
 */
const INTERFACE_REGEX = /^[ \t]*(?:(export)\s+)?interface\s+(\w+)/gm;

/**
 * Pattern for type alias declarations (TypeScript).
 * Matches: [export] type name =
 * Groups: 1=export?, 2=name
 */
const TYPE_REGEX = /^[ \t]*(?:(export)\s+)?type\s+(\w+)\s*=/gm;

/**
 * Pattern for enum declarations (TypeScript).
 * Matches: [export] [const] enum name
 * Groups: 1=export?, 2=const?, 3=name
 */
const ENUM_REGEX = /^[ \t]*(?:(export)\s+)?(?:(const)\s+)?enum\s+(\w+)/gm;

/**
 * Pattern for exported const/let/var declarations.
 * Only matches exported variables (most useful for public API).
 * Matches: export const/let/var name
 * Groups: 1=kind (const|let|var), 2=name
 */
const VARIABLE_REGEX = /^[ \t]*export\s+(const|let|var)\s+(\w+)/gm;

/**
 * Pattern for arrow function assigned to exported const.
 * Matches: export const name = [async] (...) =>
 * Groups: 1=name, 2=async?
 */
const ARROW_FUNCTION_REGEX =
	/^[ \t]*export\s+const\s+(\w+)\s*=\s*(?:(async)\s+)?(?:\([^)]*\)|[^=])\s*=>/gm;

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract symbols from source code using regex patterns.
 *
 * This is a fallback mechanism for when AST parsing fails completely.
 * It provides basic symbol extraction that is less accurate than AST
 * parsing but better than no extraction at all.
 *
 * @param content - Source code content to analyze
 * @param filePath - File path for logging context
 * @returns Array of extracted symbols with regex metadata
 *
 * @example
 * ```typescript
 * // When AST parsing fails
 * const ast = parseFile(filePath, content);
 * if (!ast) {
 *   const symbols = extractSymbolsWithRegex(content, filePath);
 *   // symbols will have metadata.extractionMethod = "regex"
 * }
 * ```
 */
export function extractSymbolsWithRegex(
	content: string,
	filePath: string,
): RegexExtractedSymbol[] {
	const symbols: RegexExtractedSymbol[] = [];

	// Pre-compute line start positions for line number calculation
	const lineStarts = computeLineStarts(content);

	// Extract each symbol type
	extractFunctions(content, lineStarts, symbols);
	extractClasses(content, lineStarts, symbols);
	extractInterfaces(content, lineStarts, symbols);
	extractTypes(content, lineStarts, symbols);
	extractEnums(content, lineStarts, symbols);
	extractVariables(content, lineStarts, symbols);
	extractArrowFunctions(content, lineStarts, symbols);

	logger.info(`Regex fallback extracted ${symbols.length} symbols`, {
		file_path: filePath,
		symbol_count: symbols.length,
	});

	return symbols;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute character positions where each line starts.
 *
 * @param content - Source code content
 * @returns Array of character offsets for line starts (0-indexed)
 */
function computeLineStarts(content: string): number[] {
	const lineStarts: number[] = [0];
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\n") {
			lineStarts.push(i + 1);
		}
	}
	return lineStarts;
}

/**
 * Convert character offset to line number.
 *
 * @param offset - Character offset in content
 * @param lineStarts - Pre-computed line start positions
 * @returns Line number (1-indexed)
 */
function offsetToLine(offset: number, lineStarts: number[]): number {
	// Binary search for the line containing this offset
	let low = 0;
	let high = lineStarts.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midStart = lineStarts[mid];
		const nextStart = lineStarts[mid + 1];
		if (midStart !== undefined && midStart <= offset) {
			if (mid === lineStarts.length - 1 || (nextStart !== undefined && nextStart > offset)) {
				return mid + 1; // Convert to 1-indexed
			}
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return 1; // Fallback to line 1
}

/**
 * Create a base symbol with regex extraction metadata.
 *
 * @param name - Symbol name
 * @param kind - Symbol kind
 * @param lineNumber - Line number (1-indexed)
 * @param isExported - Whether symbol is exported
 * @param isAsync - Whether symbol is async (optional)
 * @returns Symbol with regex metadata
 */
function createSymbol(
	name: string,
	kind: SymbolKind,
	lineNumber: number,
	isExported: boolean,
	isAsync?: boolean,
): RegexExtractedSymbol {
	return {
		name,
		kind,
		lineStart: lineNumber,
		lineEnd: lineNumber, // Cannot determine end line with regex
		columnStart: 0, // Cannot determine column with regex
		columnEnd: 0,
		signature: null, // Cannot extract signature with regex
		documentation: null, // Cannot extract JSDoc with regex
		isExported,
		isAsync,
		metadata: {
			extractionMethod: "regex",
		},
	};
}

// ============================================================================
// Symbol Type Extractors
// ============================================================================

/**
 * Extract function declarations.
 */
function extractFunctions(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	FUNCTION_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = FUNCTION_REGEX.exec(content)) !== null) {
		const [, exportKeyword, asyncKeyword, name] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(
			createSymbol(
				name,
				"function",
				lineNumber,
				!!exportKeyword,
				!!asyncKeyword,
			),
		);
	}
}

/**
 * Extract class declarations.
 */
function extractClasses(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	CLASS_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = CLASS_REGEX.exec(content)) !== null) {
		const [, exportKeyword, , name] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(createSymbol(name, "class", lineNumber, !!exportKeyword));
	}
}

/**
 * Extract interface declarations.
 */
function extractInterfaces(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	INTERFACE_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = INTERFACE_REGEX.exec(content)) !== null) {
		const [, exportKeyword, name] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(
			createSymbol(name, "interface", lineNumber, !!exportKeyword),
		);
	}
}

/**
 * Extract type alias declarations.
 */
function extractTypes(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	TYPE_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = TYPE_REGEX.exec(content)) !== null) {
		const [, exportKeyword, name] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(createSymbol(name, "type", lineNumber, !!exportKeyword));
	}
}

/**
 * Extract enum declarations.
 */
function extractEnums(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	ENUM_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = ENUM_REGEX.exec(content)) !== null) {
		const [, exportKeyword, , name] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(createSymbol(name, "enum", lineNumber, !!exportKeyword));
	}
}

/**
 * Extract exported variable declarations.
 * Determines kind based on const/let/var keyword.
 */
function extractVariables(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	VARIABLE_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = VARIABLE_REGEX.exec(content)) !== null) {
		const [, declarationKind, name] = match;
		if (!name || !declarationKind) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		// Check if this is an arrow function (will be handled by extractArrowFunctions)
		// Skip if we detect => after the name on the same line
		const lineEnd = content.indexOf("\n", match.index);
		const lineContent =
			lineEnd === -1
				? content.slice(match.index)
				: content.slice(match.index, lineEnd);
		if (lineContent.includes("=>")) {
			continue; // Skip, will be handled as arrow function
		}

		// Determine symbol kind
		const kind: SymbolKind =
			declarationKind === "const" ? "constant" : "variable";

		symbols.push(createSymbol(name, kind, lineNumber, true)); // Always exported
	}
}

/**
 * Extract exported arrow function declarations.
 */
function extractArrowFunctions(
	content: string,
	lineStarts: number[],
	symbols: RegexExtractedSymbol[],
): void {
	ARROW_FUNCTION_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = ARROW_FUNCTION_REGEX.exec(content)) !== null) {
		const [, name, asyncKeyword] = match;
		if (!name) continue;
		const lineNumber = offsetToLine(match.index, lineStarts);

		symbols.push(
			createSymbol(name, "function", lineNumber, true, !!asyncKeyword),
		);
	}
}
