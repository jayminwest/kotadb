# AST Parsing Test Fixtures

This directory contains TypeScript fixtures for validating AST parsing, symbol extraction, and dependency graph analysis.

## Purpose

These fixtures provide known-good TypeScript codebases with documented symbol counts, dependency patterns, and edge cases. They enable TDD for the AST parsing pipeline (Epic #70) by providing baseline expectations for parser output.

## Fixture Structure

### Simple Fixture (`simple/`)

A minimal 5-file TypeScript project demonstrating basic symbol extraction patterns.

**Files:**
- `types.ts` - Type definitions and interfaces
- `utils.ts` - Helper functions with JSDoc
- `calculator.ts` - Class with methods
- `index.ts` - Entry point with imports and re-exports
- `package.json` - Package metadata

**Ground Truth - Symbol Counts:**

| File | Interfaces | Types | Classes | Functions | Exports |
|------|-----------|-------|---------|-----------|---------|
| types.ts | 1 (User) | 4 (Product, Result, Status) | 0 | 0 | 5 |
| utils.ts | 0 | 0 | 0 | 7 (formatUserName, isValidEmail, ok, err, doubleNumber, fetchUserById) | 7 |
| calculator.ts | 0 | 0 | 1 (Calculator) | 1 (createCalculator) | 2 |
| index.ts | 0 | 0 | 0 | 3 (main, processUser, helper/squareNumber) | 7 (mixed direct + re-exports) |

**Total Symbols:**
- 1 interface
- 4 type aliases
- 1 class (with 6 methods)
- 11 exported functions (includes class methods)
- 14 total exports

**Import/Export Graph:**
```
index.ts
  ├─> calculator.ts (imports: Calculator, createCalculator)
  ├─> utils.ts (imports: formatUserName, isValidEmail, ok, err, doubleNumber)
  └─> types.ts (imports: User, Product, Result, Status)

utils.ts
  └─> types.ts (imports: User, Result)
```

**JSDoc Coverage:**
- types.ts: 5/5 symbols documented
- utils.ts: 7/7 functions documented
- calculator.ts: 6/6 methods documented
- index.ts: 3/3 functions documented

**Edge Cases Covered:**
- Arrow functions (`doubleNumber`)
- Async functions (`fetchUserById`)
- Anonymous function expression (`helper`)
- Destructuring in parameters (`processUser({ name, email })`)
- Re-exports (`export { Calculator }`)
- Type-only imports (`import type { User }`)

### Complex Fixture (`complex/`)

A 15-20 file TypeScript project with realistic patterns, circular dependencies, and advanced edge cases.

**Structure:**
```
complex/
├── src/
│   ├── api/
│   │   ├── routes.ts
│   │   ├── handlers.ts (circular with routes.ts)
│   │   └── middleware.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── queries.ts
│   │   └── client.ts (re-exports from queries)
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── package.json
└── tsconfig.json
```

**Ground Truth - Symbol Counts:**

| File | Interfaces | Types | Classes | Functions | Exports |
|------|-----------|-------|---------|-----------|---------|
| api/middleware.ts | 0 | 4 (Request, Response, NextFunction, MiddlewareHandler) | 0 | 5 (loggingMiddleware, isAuthenticated, corsMiddleware, wrapAsync) + 1 const (authMiddleware) | 6 |
| api/handlers.ts | 1 (Handler) | 2 (HandlerResult, RouteConfig imported) | 3 (HealthCheckHandler, ListUsersHandler, CreateUserHandler) | 2 (createHandler, formatError) + 1 const (successResponse) + 1 const (handlerRegistry) | 7 |
| api/routes.ts | 1 (RouteConfig) | 1 (HttpMethod) | 2 (RouteRegistry, RouteBuilder) | 2 (createRouteRegistry, route) + 1 default export | 6 |
| db/schema.ts | 4 (User, Post, Comment, PaginationOptions, QueryOptions) | 8 (TableName enum, WhereClause, OrderBy, TableRow, InsertInput, UpdateInput) | 0 | 0 | 12 |
| db/queries.ts | 1 (DatabaseClient) | 1 (QueryResult) | 1 (Repository) | 5 (createUserRepository, createPostRepository, createCommentRepository, withTransaction, batchInsert) | 7 |
| db/client.ts | 1 (DatabaseConfig) | 0 | 1 (ConnectionPool) | 6 (initializeDatabase, getPool, getClient, releaseClient, closeDatabase, executeQuery) + re-exports from queries & schema | 8 + re-exports |
| utils/logger.ts | 2 (LogEntry, LoggerConfig) | 0 | 1 (Logger) | 2 (getLogger, createLogger) + 1 const (log with 4 methods) | 5 |
| utils/config.ts | 2 (ServerConfig, AppConfig) | 0 | 1 (ConfigLoader) | 3 (initConfig, getConfig) + 1 const (defaultConfig) + 1 const (config with 3 methods) | 6 |

**Total Symbols:**
- 12 interfaces
- 16 type aliases (including enums)
- 9 classes (with 50+ methods total)
- 26 exported functions
- 1 enum (TableName with 3 values)
- 57+ total exports (including re-exports)

**Circular Dependency:**
```
api/routes.ts ←──→ api/handlers.ts
  routes.ts: imports Handler, handlerRegistry, createHandler from handlers.ts
  handlers.ts: imports RouteConfig type from routes.ts
```

**Dependency Graph:**
```
api/routes.ts
  ├─> api/middleware.ts (imports: MiddlewareHandler, authMiddleware, loggingMiddleware)
  └─> api/handlers.ts (imports: Handler, handlerRegistry, createHandler) [CIRCULAR]

api/handlers.ts
  ├─> api/middleware.ts (imports: Request, Response)
  └─> api/routes.ts (imports: RouteConfig) [CIRCULAR]

db/client.ts
  ├─> db/queries.ts (re-exports: *)
  └─> db/schema.ts (re-exports: User, Post, Comment, TableName)

db/queries.ts
  └─> db/schema.ts (imports: all table types, query types)

utils/config.ts
  ├─> db/client.ts (imports: DatabaseConfig)
  └─> utils/logger.ts (imports: LoggerConfig)
```

**JSDoc Coverage:**
- api/middleware.ts: 6/6 exports documented
- api/handlers.ts: 6/7 exports documented
- api/routes.ts: 5/6 exports documented
- db/schema.ts: 12/12 types documented
- db/queries.ts: 7/7 exports documented
- db/client.ts: 8/8 functions documented
- utils/logger.ts: 5/5 exports documented
- utils/config.ts: 6/6 exports documented

**Edge Cases Covered:**
- Circular dependencies (routes.ts ↔ handlers.ts)
- Re-exports with `export *` (client.ts re-exports from queries.ts)
- Type-only imports (`import type { RouteConfig }`)
- Default exports (`export default createRouteRegistry`)
- Named const with type annotation (`const authMiddleware: MiddlewareHandler`)
- Anonymous function expressions (`const formatError = function(...)`)
- Arrow functions (`const successResponse = (...) => ...`)
- Generic classes (`Repository<T extends TableName>`)
- Conditional types (`TableRow<T>` with conditional type logic)
- Enum definitions (`enum LogLevel`, `enum TableName`)
- Fluent API builder pattern (`RouteBuilder` class)
- Factory functions (`createHandler`, `createLogger`)
- Global singleton pattern (`globalLogger`, `globalPool`)
- Higher-order functions (`wrapAsync` returning middleware)
- Method chaining (`route().path().method().build()`)

## Adding New Fixtures

When adding new fixtures:

1. **Create valid TypeScript** - All fixtures must compile with `bun build`
2. **Document ground truth** - Update this README with:
   - Symbol counts by type (interfaces, classes, functions)
   - Import/export graph
   - Known edge cases and their locations
3. **Follow naming conventions** - Use descriptive directory names (`simple`, `complex`, `edge-cases-*)
4. **Include package.json** - Minimal package metadata for context
5. **Test compilation** - Run `bun build <fixture>/index.ts` to verify

## Validation

To validate fixtures compile correctly:

```bash
# From app/ directory
cd tests/fixtures/parsing/simple
bun build index.ts --target=bun --format=esm

cd ../complex
bun build src/api/routes.ts --target=bun --format=esm
```

## Usage in Tests

See `app/tests/helpers/parsing.ts` for utilities that work with these fixtures:
- `assertSymbolEquals()` - Compare extracted symbols
- `assertReferencesInclude()` - Validate import references
- `buildDependencyMap()` - Generate dependency graphs
- `findCircularDeps()` - Detect circular imports

Example test pattern:
```typescript
import { buildDependencyMap, findCircularDeps } from "./helpers/parsing";

test("simple fixture has no circular dependencies", () => {
  const files = ["index.ts", "calculator.ts", "utils.ts", "types.ts"];
  const graph = buildDependencyMap(files);
  const cycles = findCircularDeps(graph);
  expect(cycles).toHaveLength(0);
});
```
