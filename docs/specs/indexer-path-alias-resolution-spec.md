# TypeScript Path Alias Resolution Specification

**Issue:** #56  
**Domain:** Indexer  
**Type:** Feature Enhancement  
**Status:** Draft  
**Created:** 2026-01-29

## BLUF

Add TypeScript/JavaScript path alias resolution (`@api/*`, `@db/*`, etc.) to KotaDB's import resolver by parsing `tsconfig.json`/`jsconfig.json` configuration files at index time. This enables dependency tracking for ~80% of kotadb's internal imports that currently fail resolution.

## Problem Statement

### Current Behavior

The indexer's `resolveImport()` function (lines 68-76 in `app/src/indexer/import-resolver.ts`) returns `null` for ALL non-relative imports:

```typescript
// Current implementation
if (!importSource.startsWith(".")) {
    return null;  // Path aliases like "@api/routes" return null here
}
```

This breaks dependency tracking because KotaDB extensively uses TypeScript path aliases defined in `app/tsconfig.json`:
- `@api/*` → `src/api/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@shared/*` → `./shared/*`
- (8 more aliases)

### Impact

- **Dependency queries fail**: `search_dependencies` MCP tool returns incomplete results
- **Symbol resolution incomplete**: Cross-file references to aliased imports are lost
- **Code intelligence degraded**: "Find usages" cannot track alias-based imports
- **~80% import coverage lost**: Most internal kotadb imports use path aliases

### Root Cause

Import resolution only handles relative imports (`./`, `../`). Non-relative imports are assumed to be external packages and skipped, but this incorrectly includes TypeScript path aliases.

## Objectives

1. **Parse tsconfig.json dynamically** at index time to extract `compilerOptions.paths` and `compilerOptions.baseUrl`
2. **Support extends inheritance** for monorepo configurations (recursive parsing)
3. **Resolve path aliases** using first-match-wins strategy for multi-path mappings
4. **Maintain graceful failure** for unresolvable imports (return `null`, log warning)
5. **Zero performance regression** for relative import resolution
6. **Full test coverage** including monorepo edge cases

## Architecture

### Module Structure

```
app/src/indexer/
├── path-resolver.ts           # NEW: tsconfig.json parser
├── import-resolver.ts         # MODIFIED: integrate path mappings
└── (other modules unchanged)

app/tests/indexer/
└── path-resolver.test.ts      # NEW: path alias resolution tests
```

### Component Responsibilities

**path-resolver.ts** (New Module)
- Parse `tsconfig.json` and `jsconfig.json` files
- Handle `extends` inheritance recursively
- Extract `compilerOptions.paths` and `compilerOptions.baseUrl`
- Convert glob patterns (`@api/*`) to resolution rules
- Cache parsed configs for performance

**import-resolver.ts** (Modified Module)
- Accept optional `PathMappings` parameter
- Try path alias resolution before returning `null`
- Maintain existing relative import logic
- Preserve graceful error handling

## Technical Design

### 1. Path Resolver Module

**File:** `app/src/indexer/path-resolver.ts`

#### TypeScript Interfaces

```typescript
/**
 * Parsed TypeScript path mappings from tsconfig.json.
 * 
 * Maps path alias prefixes to resolution candidates.
 * Each alias can map to multiple paths (first match wins).
 * 
 * Example:
 * {
 *   "@api/*": ["src/api/*"],
 *   "@shared/*": ["./shared/*", "../shared/*"]
 * }
 */
export interface PathMappings {
    /** Base URL for relative path resolution (from compilerOptions.baseUrl) */
    baseUrl: string;
    /** Path alias mappings (key: alias pattern, value: resolution paths) */
    paths: Record<string, string[]>;
}

/**
 * Parsed tsconfig.json structure (subset used for resolution).
 */
interface TsConfig {
    extends?: string;
    compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
    };
}

/**
 * Resolution cache entry to avoid re-parsing configs.
 */
interface CacheEntry {
    mappings: PathMappings;
    timestamp: number;
}
```

#### Key Functions

```typescript
/**
 * Parse tsconfig.json from a directory.
 * 
 * Resolution logic:
 * 1. Look for tsconfig.json in projectRoot
 * 2. Look for jsconfig.json as fallback
 * 3. Parse extends recursively (up to 10 levels)
 * 4. Merge paths and baseUrl (child overrides parent)
 * 5. Return null on parse error (graceful failure)
 * 
 * @param projectRoot - Absolute path to project root directory
 * @returns PathMappings or null if no config found
 * 
 * @example
 * const mappings = parseTsConfig("/repo/app");
 * if (mappings) {
 *   // Use mappings in resolveImport()
 * }
 */
export function parseTsConfig(projectRoot: string): PathMappings | null;

/**
 * Resolve import source using path mappings.
 * 
 * Algorithm:
 * 1. Match import against each alias pattern
 * 2. For matching alias, try each resolution path
 * 3. Replace glob wildcard (*) with matched suffix
 * 4. Resolve relative to baseUrl
 * 5. Check if resolved file exists in files Set
 * 6. Return first match, null if none found
 * 
 * @param importSource - Import string (e.g., "@api/routes")
 * @param projectRoot - Project root directory (for baseUrl resolution)
 * @param files - Set of indexed file paths
 * @param mappings - Parsed path mappings from tsconfig
 * @returns Resolved absolute path or null
 * 
 * @example
 * resolvePathAlias("@api/routes", "/repo", files, mappings)
 * // Tries: /repo/src/api/routes.ts, /repo/src/api/routes.tsx, etc.
 * // Returns: "/repo/src/api/routes.ts" (if exists)
 */
export function resolvePathAlias(
    importSource: string,
    projectRoot: string,
    files: Set<string>,
    mappings: PathMappings,
): string | null;

/**
 * Parse tsconfig with extends support (recursive).
 * 
 * @internal - Used by parseTsConfig()
 */
function parseTsConfigWithExtends(
    configPath: string,
    depth: number,
    maxDepth: number,
): TsConfig | null;

/**
 * Merge child and parent tsconfig objects.
 * 
 * Rules:
 * - Child baseUrl overrides parent
 * - Child paths merge with parent (child takes precedence)
 * 
 * @internal - Used by parseTsConfigWithExtends()
 */
function mergeTsConfigs(child: TsConfig, parent: TsConfig): TsConfig;

/**
 * Check if import matches a path alias pattern.
 * 
 * @internal - Used by resolvePathAlias()
 */
function matchesPattern(importSource: string, pattern: string): string | null;
```

#### Error Handling

- **Missing tsconfig.json**: Return `null`, log debug message
- **JSON parse error**: Return `null`, log error with path
- **Circular extends**: Detect with depth limit (max 10), log warning
- **Invalid baseUrl**: Use project root as fallback
- **Missing path target**: Try next path option, log debug

#### Performance Considerations

- **Parse caching**: Cache parsed configs by project root path
- **TTL eviction**: Clear cache entries older than 5 minutes (for live reload)
- **Lazy parsing**: Only parse tsconfig when non-relative import encountered
- **Early return**: Return after first successful resolution

### 2. Import Resolver Integration

**File:** `app/src/indexer/import-resolver.ts` (Modified)

#### Function Signature Changes

```typescript
/**
 * Resolve an import path to an absolute file path.
 * 
 * Enhanced with path alias support. Resolution order:
 * 1. Skip if not relative and no path mappings
 * 2. Try relative import resolution (existing logic)
 * 3. Try path alias resolution (new)
 * 4. Return null if unresolved
 * 
 * @param importSource - Import path from source code
 * @param fromFilePath - Absolute path of importing file
 * @param files - Array of indexed files
 * @param pathMappings - Optional path mappings from tsconfig (NEW)
 * @returns Absolute file path or null
 */
export function resolveImport(
    importSource: string,
    fromFilePath: string,
    files: Array<{ path: string }>,
    pathMappings?: PathMappings | null,  // NEW PARAMETER
): string | null;
```

#### Modified Implementation

```typescript
export function resolveImport(
    importSource: string,
    fromFilePath: string,
    files: Array<{ path: string }>,
    pathMappings?: PathMappings | null,
): string | null {
    // Relative imports - existing logic unchanged
    if (importSource.startsWith(".")) {
        const fromDir = path.dirname(fromFilePath);
        const resolvedPath = path.normalize(path.join(fromDir, importSource));
        const filePaths = new Set(files.map((f) => f.path));
        
        // Try with extension
        if (SUPPORTED_EXTENSIONS.some((ext) => resolvedPath.endsWith(ext))) {
            return filePaths.has(resolvedPath) ? resolvedPath : null;
        }
        
        // Try adding extensions
        const withExtension = resolveExtensions(resolvedPath, filePaths);
        if (withExtension) return withExtension;
        
        // Try index files
        const withIndex = handleIndexFiles(resolvedPath, filePaths);
        if (withIndex) return withIndex;
        
        return null;
    }
    
    // NEW: Path alias resolution
    if (pathMappings) {
        const projectRoot = determineProjectRoot(fromFilePath);
        const filePaths = new Set(files.map((f) => f.path));
        const resolved = resolvePathAlias(
            importSource,
            projectRoot,
            filePaths,
            pathMappings,
        );
        if (resolved) {
            logger.debug("Resolved path alias", {
                importSource,
                resolved,
                fromFile: fromFilePath,
            });
            return resolved;
        }
    }
    
    // External package or unresolvable
    return null;
}
```

#### Helper Functions

```typescript
/**
 * Determine project root from file path.
 * 
 * Walks up directory tree looking for:
 * - package.json
 * - tsconfig.json
 * - .git directory
 * 
 * Falls back to first two segments if not found.
 * 
 * @internal
 */
function determineProjectRoot(filePath: string): string;
```

### 3. API Integration

**File:** `app/src/api/queries.ts` (Modified)

#### Workflow Changes

```typescript
// Inside runIndexingWorkflow()

// 1. Parse tsconfig.json once at start of indexing
const pathMappings = parseTsConfig(localPath);
if (pathMappings) {
    logger.info("Loaded path mappings from tsconfig.json", {
        aliasCount: Object.keys(pathMappings.paths).length,
        baseUrl: pathMappings.baseUrl,
    });
}

// 2. Pass pathMappings to storeReferences()
const referenceCount = storeReferences(
    fileRecord.id,
    file.path,
    references,
    filesWithId,
    pathMappings,  // NEW PARAMETER
);
```

**storeReferences signature:**

```typescript
export function storeReferences(
    fileId: string,
    filePath: string,
    references: Reference[],
    allFiles: Array<{ path: string }>,
    pathMappings?: PathMappings | null,  // NEW PARAMETER
): number;
```

**Internal implementation:**

```typescript
// Line ~204: Pass pathMappings to resolveImport
if (ref.referenceType === 'import' && ref.metadata?.importSource) {
    const resolved = resolveImport(
        ref.metadata.importSource,
        filePath,
        allFiles,
        pathMappings,  // NEW: Forward path mappings
    );
    
    if (resolved) {
        targetFilePath = normalizePath(resolved);
    } else {
        logger.debug("Could not resolve import", {
            importSource: ref.metadata.importSource,
            fromFile: filePath,
        });
    }
}
```

## Test Strategy

### Unit Tests

**File:** `app/tests/indexer/path-resolver.test.ts` (New)

```typescript
import { describe, it, expect } from "bun:test";
import { parseTsConfig, resolvePathAlias } from "@indexer/path-resolver";

describe("path-resolver", () => {
    describe("parseTsConfig", () => {
        it("parses simple tsconfig.json with baseUrl and paths", () => {
            // Test fixture: app/tests/fixtures/tsconfig/simple/
            const mappings = parseTsConfig("/fixtures/tsconfig/simple");
            expect(mappings).not.toBeNull();
            expect(mappings?.baseUrl).toBe(".");
            expect(mappings?.paths["@api/*"]).toEqual(["src/api/*"]);
        });
        
        it("handles missing tsconfig.json gracefully", () => {
            const mappings = parseTsConfig("/nonexistent");
            expect(mappings).toBeNull();
        });
        
        it("parses tsconfig.json with extends", () => {
            // Test fixture: child extends parent config
            const mappings = parseTsConfig("/fixtures/tsconfig/extends");
            expect(mappings?.paths["@base/*"]).toEqual(["lib/*"]); // From parent
            expect(mappings?.paths["@app/*"]).toEqual(["src/*"]); // From child
        });
        
        it("handles circular extends with depth limit", () => {
            // Test fixture: A extends B extends A (circular)
            const mappings = parseTsConfig("/fixtures/tsconfig/circular");
            expect(mappings).not.toBeNull(); // Should not infinite loop
        });
        
        it("falls back to jsconfig.json when tsconfig missing", () => {
            const mappings = parseTsConfig("/fixtures/jsconfig/only");
            expect(mappings).not.toBeNull();
            expect(mappings?.paths["@lib/*"]).toEqual(["lib/*"]);
        });
    });
    
    describe("resolvePathAlias", () => {
        it("resolves simple path alias", () => {
            const files = new Set(["/repo/src/api/routes.ts"]);
            const mappings = {
                baseUrl: ".",
                paths: { "@api/*": ["src/api/*"] },
            };
            
            const result = resolvePathAlias(
                "@api/routes",
                "/repo",
                files,
                mappings,
            );
            expect(result).toBe("/repo/src/api/routes.ts");
        });
        
        it("tries multiple paths and returns first match", () => {
            const files = new Set(["/repo/packages/shared/utils.ts"]);
            const mappings = {
                baseUrl: ".",
                paths: { "@shared/*": ["src/shared/*", "packages/shared/*"] },
            };
            
            const result = resolvePathAlias(
                "@shared/utils",
                "/repo",
                files,
                mappings,
            );
            expect(result).toBe("/repo/packages/shared/utils.ts");
        });
        
        it("returns null when no paths match", () => {
            const files = new Set(["/repo/src/api/routes.ts"]);
            const mappings = {
                baseUrl: ".",
                paths: { "@api/*": ["src/api/*"] },
            };
            
            const result = resolvePathAlias(
                "@db/schema",
                "/repo",
                files,
                mappings,
            );
            expect(result).toBeNull();
        });
        
        it("handles nested path aliases", () => {
            const files = new Set(["/repo/src/db/sqlite/index.ts"]);
            const mappings = {
                baseUrl: ".",
                paths: { "@db/*": ["src/db/*"] },
            };
            
            const result = resolvePathAlias(
                "@db/sqlite/index",
                "/repo",
                files,
                mappings,
            );
            expect(result).toBe("/repo/src/db/sqlite/index.ts");
        });
    });
});
```

### Integration Tests

**File:** `app/tests/indexer/import-resolver.test.ts` (Modified)

```typescript
describe("resolveImport with path aliases", () => {
    it("resolves path alias import", () => {
        const files: IndexedFile[] = [
            { path: "/repo/src/api/routes.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
            { path: "/repo/src/app.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
        ];
        
        const pathMappings: PathMappings = {
            baseUrl: ".",
            paths: { "@api/*": ["src/api/*"] },
        };
        
        const result = resolveImport("@api/routes", "/repo/src/app.ts", files, pathMappings);
        expect(result).toBe("/repo/src/api/routes.ts");
    });
    
    it("falls back to null for unresolved alias", () => {
        const files: IndexedFile[] = [
            { path: "/repo/src/app.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
        ];
        
        const pathMappings: PathMappings = {
            baseUrl: ".",
            paths: { "@api/*": ["src/api/*"] },
        };
        
        const result = resolveImport("@db/schema", "/repo/src/app.ts", files, pathMappings);
        expect(result).toBeNull();
    });
    
    it("prefers relative imports over path aliases", () => {
        const files: IndexedFile[] = [
            { path: "/repo/src/api/routes.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
            { path: "/repo/src/api/handlers.ts", content: "", dependencies: [], indexedAt: new Date(), projectRoot: "repo" },
        ];
        
        const pathMappings: PathMappings = {
            baseUrl: ".",
            paths: { "@api/*": ["src/api/*"] },
        };
        
        // Relative import should resolve first
        const result = resolveImport("./routes", "/repo/src/api/handlers.ts", files, pathMappings);
        expect(result).toBe("/repo/src/api/routes.ts");
    });
});
```

### End-to-End Test

**Test Scenario:** Real kotadb repository indexing

```typescript
describe("kotadb path alias integration", () => {
    it("resolves @api/* aliases in real codebase", async () => {
        // Index real kotadb app directory
        const result = await runIndexingWorkflow({
            repository: "kotadb",
            localPath: "/path/to/kotadb/app",
        });
        
        // Query dependencies for file that uses @api import
        const deps = queryDependencies(fileId, 1);
        
        // Verify @api/* imports are resolved
        expect(deps.direct).toContain("src/api/routes.ts");
    });
});
```

## Validation Criteria

### Acceptance Criteria (from Issue #56)

- [x] Parse `tsconfig.json` for `compilerOptions.paths` and `compilerOptions.baseUrl`
- [x] Parse `jsconfig.json` as fallback
- [x] Handle `extends` for inherited configs
- [x] Support glob patterns in path mappings (`@/*` → `./*`)
- [x] Support multiple path options (first match wins)
- [x] Integration test with real monorepo structure
- [x] `search_dependencies` returns correct results for aliased imports

### Functional Validation

1. **Basic Resolution**: Import `@api/routes` resolves to `src/api/routes.ts`
2. **Nested Paths**: Import `@db/sqlite/index` resolves correctly
3. **Monorepo Extends**: Child config inherits parent paths
4. **Multi-Path Fallback**: First matching path wins
5. **External Packages**: `react` still returns `null` (not a path alias)
6. **Missing Files**: `@api/missing` returns `null` gracefully
7. **Relative Priority**: `./foo` still resolves before path aliases
8. **Performance**: No regression for relative imports

### Non-Functional Validation

1. **Performance**: Path alias resolution adds <5ms overhead per import
2. **Memory**: Cache size limited to 100 parsed configs
3. **Error Handling**: No crashes on malformed tsconfig.json
4. **Logging**: Debug logs for all resolution attempts
5. **Compatibility**: Works with TypeScript 4.x and 5.x config formats

## Migration Path

### Phase 1: Core Implementation (Issue #56)

1. Create `path-resolver.ts` with tsconfig parsing
2. Modify `import-resolver.ts` to accept path mappings
3. Update `storeReferences()` to pass mappings
4. Add unit tests for both modules
5. Add integration test with test fixtures

### Phase 2: Production Integration

6. Update `runIndexingWorkflow()` to parse tsconfig
7. Add logging for path alias resolution success/failure
8. Deploy to local environment
9. Test with kotadb repository indexing
10. Validate `search_dependencies` MCP tool results

### Phase 3: Optimization (Future)

11. Add LRU cache for parsed configs
12. Optimize pattern matching algorithm
13. Consider precompiling path patterns to regex
14. Add telemetry for resolution hit rates

## Edge Cases

### Handled

- **Missing tsconfig.json**: Return `null`, log debug
- **Malformed JSON**: Catch parse error, log error, return `null`
- **Circular extends**: Depth limit prevents infinite loop
- **Wildcard-only imports**: `import "@api"` (no suffix) not supported, return `null`
- **Multiple wildcards**: Only one `*` per pattern supported
- **Case sensitivity**: Preserve OS-specific case handling
- **Absolute baseUrl**: Normalize to relative path

### Not Handled (Out of Scope)

- **Dynamic imports**: `import()` expressions (future enhancement)
- **Module resolution modes**: Only `bundler` mode supported
- **Exports field**: package.json exports not considered
- **Node modules**: Still return `null` for external packages
- **Conditional paths**: No support for environment-specific paths

## Performance Analysis

### Bottlenecks

1. **tsconfig parsing**: Synchronous file I/O (~5ms per file)
2. **Pattern matching**: String operations per import (~0.1ms)
3. **File existence checks**: Set lookups (~0.01ms)

### Optimizations

1. **Parse caching**: Parse tsconfig once per repository
2. **Lazy parsing**: Only parse on first non-relative import
3. **Pattern precompilation**: Convert `*` patterns to regex once
4. **Early returns**: Stop at first successful resolution

### Benchmarks (Expected)

- **Relative imports**: 0ms overhead (unchanged)
- **Path alias resolution**: 0.1-0.5ms per import
- **tsconfig parsing**: 5-10ms one-time cost
- **Total impact**: <1% increase in indexing time

## Monitoring

### Metrics

- `indexer.path_alias.parse_success` - tsconfig parse success count
- `indexer.path_alias.parse_failure` - tsconfig parse failure count
- `indexer.path_alias.resolution_success` - alias resolution success count
- `indexer.path_alias.resolution_failure` - alias resolution failure count
- `indexer.path_alias.cache_hits` - cache hit count
- `indexer.path_alias.cache_misses` - cache miss count

### Logging

```typescript
// Success
logger.info("Loaded path mappings from tsconfig.json", {
    projectRoot,
    aliasCount: Object.keys(mappings.paths).length,
    baseUrl: mappings.baseUrl,
});

// Resolution success
logger.debug("Resolved path alias", {
    importSource,
    resolved,
    fromFile,
    pattern,
});

// Resolution failure
logger.debug("Could not resolve path alias", {
    importSource,
    fromFile,
    patterns: Object.keys(mappings.paths),
});

// Parse error
logger.error("Failed to parse tsconfig.json", {
    configPath,
    error: error.message,
});
```

## Security Considerations

1. **Path traversal**: Reject imports that resolve outside project root
2. **Symlink attacks**: Use `fs.realpathSync()` to resolve symlinks
3. **Config injection**: Validate baseUrl doesn't escape project root
4. **DoS via extends**: Depth limit prevents circular reference attacks

## Dependencies

### Runtime Dependencies

- `node:fs` - File system operations (already available)
- `node:path` - Path manipulation (already available)
- No new external dependencies

### Dev Dependencies

- Bun test framework (already available)
- Test fixtures with sample tsconfig files

## Rollout Plan

### Development

1. Create feature branch `feat/issue-56-path-alias-resolution`
2. Implement `path-resolver.ts` with unit tests
3. Modify `import-resolver.ts` with integration tests
4. Update `queries.ts` with workflow changes
5. Create test fixtures for edge cases
6. Run full test suite

### Testing

7. Test with kotadb repository indexing
8. Validate `search_dependencies` results
9. Benchmark indexing performance
10. Test with external repository (e.g., Next.js app)

### Deployment

11. Code review and approval
12. Merge to `develop` branch
13. Deploy to local environment
14. Monitor error logs for parse failures
15. Collect usage metrics

### Validation

16. Verify dependency tracking for @api/* imports
17. Check MCP tool returns complete results
18. Confirm no regression in relative import resolution
19. Validate error handling for missing configs

## Documentation

### User-Facing

- No user-facing documentation changes (internal feature)

### Developer Documentation

- Add JSDoc comments to all public functions
- Update indexer expertise.yaml with path alias patterns
- Document tsconfig.json parsing algorithm
- Add examples to function signatures

### Code Comments

```typescript
/**
 * Resolve import path using TypeScript path mappings.
 * 
 * Algorithm:
 * 1. Match import source against path alias patterns
 * 2. For matching pattern, extract wildcard suffix
 * 3. Substitute suffix into resolution paths
 * 4. Try each resolution path with extension variants
 * 5. Return first match, or null if none found
 * 
 * Example:
 *   importSource: "@api/routes"
 *   pattern: "@api/*"
 *   paths: ["src/api/*"]
 *   suffix: "routes"
 *   candidates: ["src/api/routes.ts", "src/api/routes.tsx", ...]
 *   result: "/repo/src/api/routes.ts" (if exists)
 * 
 * @param importSource - Import string from source code
 * @param projectRoot - Absolute path to project root
 * @param files - Set of indexed file paths
 * @param mappings - Parsed path mappings from tsconfig
 * @returns Resolved file path or null
 */
```

## Open Questions

### Resolved

- **Q:** Should we cache parsed tsconfig files?  
  **A:** Yes, with 5-minute TTL for live reload support

- **Q:** How to handle monorepo workspace references?  
  **A:** Support `extends` for parent config inheritance

- **Q:** What if tsconfig has invalid baseUrl?  
  **A:** Fall back to project root, log warning

### Pending

- **Q:** Should we support jsconfig.json exclusively in JS projects?  
  **A:** Yes, check tsconfig first, then jsconfig

- **Q:** How to handle conditional paths (TypeScript 5.x feature)?  
  **A:** Out of scope for initial implementation

## References

- **Issue:** #56 - Add TypeScript path alias resolution
- **TypeScript Docs:** [Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)
- **TypeScript Docs:** [Path Mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)
- **Existing Code:**
  - `app/src/indexer/import-resolver.ts` - Current implementation
  - `app/tsconfig.json` - Real-world path mappings
  - `app/src/api/queries.ts` - Indexing workflow integration
- **Related Issues:** None
- **Related PRs:** None (new feature)

## Success Metrics

### Quantitative

- **Import resolution rate**: 80% → 95% (target)
- **Dependency tracking coverage**: 20% → 80% (target)
- **Parse success rate**: >95% for valid tsconfig files
- **Performance overhead**: <5ms per import resolution

### Qualitative

- `search_dependencies` returns complete results
- No false positives in dependency graph
- Graceful degradation for missing configs
- Clear error messages for parse failures

## Appendix A: Algorithm Details

### Path Pattern Matching

```typescript
function matchesPattern(importSource: string, pattern: string): string | null {
    // Exact match (no wildcard)
    if (!pattern.includes("*")) {
        return importSource === pattern ? "" : null;
    }
    
    // Wildcard match
    const [prefix, suffix] = pattern.split("*");
    if (!importSource.startsWith(prefix)) {
        return null;
    }
    if (suffix && !importSource.endsWith(suffix)) {
        return null;
    }
    
    // Extract matched suffix
    const matched = importSource.slice(prefix.length);
    if (suffix) {
        return matched.slice(0, -suffix.length);
    }
    return matched;
}
```

### Path Substitution

```typescript
function substitutePath(pathTemplate: string, suffix: string): string {
    return pathTemplate.replace("*", suffix);
}
```

### Extension Resolution

```typescript
// Reuse existing resolveExtensions() from import-resolver.ts
const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = basePath + ext;
    if (files.has(candidate)) {
        return candidate;
    }
}
```

## Appendix B: Test Fixtures

### Fixture Structure

```
app/tests/fixtures/tsconfig/
├── simple/
│   ├── tsconfig.json          # Basic paths + baseUrl
│   └── src/
│       └── api/
│           └── routes.ts
├── extends/
│   ├── tsconfig.json          # Extends base.json
│   ├── base.json              # Parent config
│   └── src/
│       └── app.ts
├── circular/
│   ├── a.json                 # Extends b.json
│   ├── b.json                 # Extends a.json (circular)
│   └── src/
│       └── index.ts
└── jsconfig/
    ├── jsconfig.json          # JavaScript project config
    └── lib/
        └── utils.js
```

### Sample tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@api/*": ["src/api/*"],
      "@db/*": ["src/db/*"],
      "@shared/*": ["./shared/*", "../shared/*"]
    }
  }
}
```

### Sample tsconfig with extends

```json
// base.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@base/*": ["lib/*"]
    }
  }
}

// tsconfig.json
{
  "extends": "./base.json",
  "compilerOptions": {
    "paths": {
      "@app/*": ["src/*"]
    }
  }
}
```

## Appendix C: Error Messages

### Parse Errors

```typescript
// Missing tsconfig.json
logger.debug("No tsconfig.json found", { projectRoot });
// Action: Return null, continue indexing

// JSON parse error
logger.error("Failed to parse tsconfig.json", {
    configPath,
    error: error.message,
    line: error.line,
});
// Action: Return null, continue indexing

// Circular extends
logger.warn("Circular extends detected in tsconfig", {
    configPath,
    depth,
    maxDepth,
});
// Action: Stop recursion, use partial config
```

### Resolution Errors

```typescript
// No matching pattern
logger.debug("No path alias pattern matched", {
    importSource,
    patterns: Object.keys(mappings.paths),
});
// Action: Return null (external package)

// Pattern matched but file not found
logger.debug("Path alias pattern matched but file not found", {
    importSource,
    pattern,
    candidates: triedPaths,
});
// Action: Return null, continue to next pattern
```

---

**End of Specification**
