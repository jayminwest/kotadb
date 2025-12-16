/**
 * @kotadb/core - Standalone TypeScript code intelligence library
 *
 * Provides AST parsing, symbol extraction, reference tracking,
 * dependency analysis, and circular dependency detection.
 *
 * @example
 * ```typescript
 * import { parseFile, extractSymbols, MemoryStorageAdapter } from '@kotadb/core';
 *
 * const content = await Bun.file('example.ts').text();
 * const ast = parseFile('example.ts', content);
 *
 * if (ast) {
 *   const symbols = extractSymbols(ast, 'example.ts');
 *   process.stdout.write(`Found ${symbols.length} symbols\n`);
 * }
 * ```
 */

// Re-export all public APIs
export * from "./parsers/index.js";
export * from "./analysis/index.js";
export * from "./storage/index.js";
export * from "./types/index.js";
