/**
 * Barrel export for analysis modules.
 */

export { extractSymbols } from "./symbol-extractor.js";
export { extractReferences } from "./reference-extractor.js";
export { extractDependencies, buildFileDependencies, buildSymbolDependencies } from "./dependency-extractor.js";
export { resolveImport, resolveExtensions, handleIndexFiles } from "./import-resolver.js";
export type { IndexedFile } from "./import-resolver.js";
export { detectCircularDependencies, buildAdjacencyList, findCycles } from "./circular-detector.js";
