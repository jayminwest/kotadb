# Contributing to KotaDB

This guide covers everything you need to contribute to KotaDB, a local-only code intelligence API built with Bun, TypeScript, and SQLite.

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Bun** v1.1.0 or later
  ```bash
  # Install Bun
  curl -fsSL https://bun.sh/install | bash
  
  # Verify installation
  bun --version
  ```

- **Git** v2.0 or later
  ```bash
  git --version
  ```

### Optional

- **Node.js** v18+ (for compatibility testing)
- **GitHub CLI** (`gh`) for issue and PR workflows

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/jayminwest/kotadb.git
cd kotadb
```

### 2. Install Dependencies

```bash
cd app
bun install
```

### 3. Start Development Server

```bash
bun run src/index.ts
```

Or use watch mode for auto-restart on changes:

```bash
bun run dev
```

### 4. Verify Setup

Run the test suite to confirm everything works:

```bash
bun test
```

## Project Structure

```
kotadb/
├── app/                    # Main application
│   ├── src/
│   │   ├── api/           # HTTP endpoints and Express routes
│   │   ├── auth/          # Authentication middleware
│   │   ├── config/        # Configuration and environment
│   │   ├── db/            # Database layer (SQLite)
│   │   ├── indexer/       # AST parsing and code analysis
│   │   ├── logging/       # Structured logging
│   │   ├── mcp/           # MCP server and tools
│   │   ├── sync/          # Git sync functionality
│   │   ├── types/         # TypeScript type definitions
│   │   └── validation/    # Zod schemas and validation
│   ├── tests/             # Test files
│   └── shared/            # Shared utilities
├── docs/                  # Documentation
└── .claude/               # Claude Code configuration
```

## Coding Conventions

### Path Aliases

Always use path aliases for internal imports. These are defined in `app/tsconfig.json`:

| Alias | Path |
|-------|------|
| `@api/*` | `src/api/*` |
| `@auth/*` | `src/auth/*` |
| `@config/*` | `src/config/*` |
| `@db/*` | `src/db/*` |
| `@indexer/*` | `src/indexer/*` |
| `@logging/*` | `src/logging/*` |
| `@mcp/*` | `src/mcp/*` |
| `@shared/*` | `shared/*` |
| `@sync/*` | `src/sync/*` |
| `@validation/*` | `src/validation/*` |
| `@app-types/*` | `src/types/*` |

**Example:**

```typescript
// Good - use path aliases
import { createDatabase } from "@db/sqlite/sqlite-client.js";
import { createLogger } from "@logging/logger.js";
import { SearchCodeSchema } from "@validation/schemas.js";

// Bad - relative paths for internal modules
import { createDatabase } from "../../db/sqlite/sqlite-client.js";
```

### Import Organization

Group imports in this order, separated by blank lines:

1. External packages (npm dependencies)
2. Internal imports by alias (alphabetically)

```typescript
// External
import { describe, expect, it } from "bun:test";
import { z } from "zod";

// Internal
import { createDatabase } from "@db/sqlite/sqlite-client.js";
import { buildSnippet } from "@indexer/extractors.js";
import { createLogger } from "@logging/logger.js";
```

### Logging Standards

**Never use `console.log`, `console.error`, or other console methods.**

Use the structured logger from `@logging/logger`:

```typescript
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ request_id: "req-123" });

logger.info("Processing request", { file_count: 42 });
logger.error("Failed to index", new Error("Parse error"), { path: "/src/file.ts" });
```

For simple output where structured logging is unnecessary, use `process.stdout.write()` or `process.stderr.write()`:

```typescript
// Direct output (no trailing newline added automatically)
process.stdout.write("Processing...\n");
process.stderr.write("Warning: deprecated feature\n");
```

**Why?** The logger outputs JSON to stdout/stderr, which integrates with MCP server stdio communication and log aggregation systems.

### TypeScript Guidelines

- Use strict mode (enabled in tsconfig.json)
- Prefer explicit types over `any`
- Use `unknown` for truly unknown types, then narrow with type guards
- Leverage Zod schemas for runtime validation

```typescript
// Good
function processFile(path: string): FileResult {
  // ...
}

// Bad
function processFile(path: any): any {
  // ...
}
```

## Testing Patterns

### Running Tests

```bash
# Run all tests
cd app && bun test

# Run specific test file
bun test tests/mcp/search-code.test.ts

# Run tests matching a pattern
bun test --grep "sqlite"

# Run with coverage (if configured)
bun test --coverage
```

### Antimocking Philosophy

KotaDB follows an **antimocking** approach to testing:

- **Use real SQLite databases** - Tests create actual in-memory or temp file databases
- **Avoid mocks** - Test real behavior, not mocked implementations
- **Isolated test databases** - Each test gets its own database instance

**Example test with real SQLite:**

```typescript
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDatabase, KotaDatabase } from "@db/sqlite/sqlite-client.js";

describe("MyFeature", () => {
  let tempDir: string;
  let db: KotaDatabase;

  beforeEach(() => {
    // Create isolated temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), "kota-test-"));
    db = createDatabase({ path: join(tempDir, "test.db") });
  });

  afterEach(() => {
    // Clean up
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should store and retrieve data", () => {
    db.exec("CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT)");
    db.run("INSERT INTO items VALUES (?, ?)", ["1", "test"]);
    
    const result = db.queryOne<{ value: string }>(
      "SELECT value FROM items WHERE id = ?",
      ["1"]
    );
    
    expect(result?.value).toBe("test");
  });
});
```

### Test File Organization

- `*.test.ts` - Unit and integration tests
- `*.integration.test.ts` - Tests requiring external resources
- Place tests in `__tests__/` directories alongside source, or in `tests/` at app root

```
app/
├── src/
│   └── db/
│       └── sqlite/
│           ├── sqlite-client.ts
│           └── __tests__/
│               └── sqlite-client.test.ts
└── tests/
    ├── mcp/
    │   ├── search-code.test.ts
    │   └── search-code.integration.test.ts
    └── setup.ts
```

### Test Setup

Tests use a preload script for global setup:

```bash
bun test --preload ./tests/setup.ts
```

This is configured in `package.json` as the default `test` script.

## Git Workflow

### Branch Naming

Use descriptive branch names with issue numbers:

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<issue>-<description>` | `feat/123-add-search-filters` |
| Bug fix | `bug/<issue>-<description>` | `bug/456-fix-null-pointer` |
| Maintenance | `chore/<issue>-<description>` | `chore/789-update-deps` |
| Refactor | `refactor/<issue>-<description>` | `refactor/101-simplify-parser` |

### Branch Flow

```
feature branches → develop → main
                     │
                     └── (releases)
```

1. Create feature branches from `develop`
2. Merge completed features into `develop`
3. Release from `develop` to `main`

### Commit Format

Follow conventional commit format:

```
{type}({scope}): {description}

{optional body}

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, no code change
- `refactor` - Code restructuring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples:**

```bash
feat(indexer): add TypeScript reference extraction

Parses import statements and extracts file dependencies
for the dependency graph.

Co-Authored-By: Claude <noreply@anthropic.com>
```

```bash
fix(mcp): handle empty search results gracefully

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Pre-commit Hooks

The project uses Husky for pre-commit hooks. These run automatically:

- **Lint-staged** - Runs linter on staged files
- **Type checking** - Ensures TypeScript compiles

If a hook fails, fix the issues and commit again.

## Pull Request Guidelines

### Before Submitting

1. **Update from develop** - Rebase or merge latest `develop`
2. **Run tests** - `bun test` passes
3. **Type check** - `bunx tsc --noEmit` passes
4. **Lint** - `bun run lint` passes
5. **Test your changes** - Manual verification works

### PR Description Template

```markdown
## Summary
Brief description of what this PR does.

## Changes
- Bullet points of specific changes
- Include file names for significant changes

## Testing
- How was this tested?
- Any new tests added?

## Related Issues
Closes #123
```

### Review Process

1. Create PR against `develop` branch
2. Ensure CI checks pass
3. Request review from maintainers
4. Address feedback
5. Squash and merge when approved

## Common Development Tasks

### Adding a New MCP Tool

1. Create tool handler in `src/mcp/tools/`
2. Add Zod schema in `src/validation/schemas.ts`
3. Register in `src/mcp/server.ts`
4. Add tests in `tests/mcp/`

### Adding a Database Migration

1. Create SQL file in `src/db/sqlite/migrations/`
2. Increment schema version
3. Add migration logic to `runMigrations()`
4. Test with fresh and existing databases

### Adding an API Endpoint

1. Create route handler in `src/api/`
2. Add validation schemas
3. Register route in Express app
4. Add OpenAPI documentation
5. Add integration tests

## Troubleshooting

### Common Issues

**Bun version mismatch:**
```bash
bun upgrade
```

**Dependency issues:**
```bash
rm -rf node_modules bun.lockb
bun install
```

**TypeScript errors after pulling:**
```bash
bunx tsc --noEmit
```

**Database locked errors:**
Ensure no other process has the SQLite database open. Tests use isolated temp directories to avoid conflicts.

### Getting Help

- Check existing [GitHub Issues](https://github.com/jayminwest/kotadb/issues)
- Read the [documentation](./README.md)
- Open a new issue with reproduction steps

## Code of Conduct

Be respectful and constructive in all interactions. Focus on the code and ideas, not individuals.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
