# KotaDB Agent Usage Guide

Agent-specific guidance for using KotaDB MCP tools during code discovery, dependency analysis, and impact assessment workflows.

## When to Use KotaDB MCP Tools

**PREFER KotaDB MCP tools for:**
- Code discovery across indexed repositories (finding implementations, patterns, examples)
- Dependency analysis before refactoring (understanding impact radius)
- Impact assessment for large changes (validating spec safety)
- Test scope discovery (finding related test files)

**Use direct file operations (Read/Edit/Write) for:**
- Reading specific known file paths
- Editing files with exact changes
- Writing new files

## Local vs Production MCP Server

**Local KotaDB instance** (use for KotaDB development):
- Available via `mcp__kotadb__*` tools in Claude Code
- Indexes your working directory automatically
- Real-time code intelligence during development
- Use when: working on KotaDB features, bugs, chores, or refactors

**Production KotaDB instance** (use for external projects):
- Available via `mcp__kotadb-production__*` or `mcp__kotadb-staging__*` tools
- Requires explicit repository indexing
- Use when: working on projects outside KotaDB codebase

**For KotaDB development, always use the local instance** to dogfood the service and validate improvements.

## Available MCP Tools

### search_code
Full-text search across indexed repository files.

**Usage:**
```typescript
const results = await mcp.call("kotadb__search_code", {
  term: "authenticateRequest",
  limit: 20
});
```

**Common patterns for KotaDB development:**
- Authentication code: `"authenticateRequest"`, `"validateApiKey"`, `"RLS policy"`
- Indexing logic: `"IndexerService"`, `"processRepository"`, `"extractDependencies"`
- Rate limiting: `"rate_limit"`, `"incrementCounter"`, `"tier_limits"`
- Validation: `"validateOutput"`, `"OutputSchema"`, `"zodSchema"`
- Error handling: `"try {", "ApiError", "ErrorCode"`

### search_dependencies
Query dependency graph to find files that depend on (dependents) or are depended on by (dependencies) a target file.

**Usage:**
```typescript
const deps = await mcp.call("kotadb__search_dependencies", {
  file_path: "app/src/auth/middleware.ts",
  direction: "both",  // "dependents" | "dependencies" | "both"
  depth: 2,           // 1-5, higher values find indirect relationships
  include_tests: true // Include test files in results
});
```

**Recommended depth by workflow:**
- Quick refactors (single file): `depth: 1`
- Module refactors (shared utilities): `depth: 2` (default, captures most impact)
- Architecture changes (core services): `depth: 3` (comprehensive)

**When to use:**
- Before refactoring shared modules: check dependents to understand impact
- Before modifying type definitions: find all consumers
- Test scope discovery: find test files that import target module
- Circular dependency detection: look for cycles in dependency chains

### analyze_change_impact
Analyze the impact of proposed code changes by examining dependency graphs, test scope, and potential conflicts.

**Usage:**
```typescript
const analysis = await mcp.call("kotadb__analyze_change_impact", {
  change_type: "refactor",  // "feature" | "refactor" | "fix" | "chore"
  description: "Extract rate limiting logic to shared middleware",
  files_to_modify: ["app/src/api/routes.ts", "app/src/auth/middleware.ts"],
  files_to_create: ["app/src/middleware/rate-limit.ts"],
  breaking_changes: false
});
```

**When to use:**
- Large features: validate spec before implementation
- Refactors: understand blast radius and test coverage needs
- Breaking changes: identify all affected consumers
- Architecture changes: surface architectural warnings

### validate_implementation_spec
Validate implementation specification against KotaDB conventions and repository state.

**Usage:**
```typescript
const validation = await mcp.call("kotadb__validate_implementation_spec", {
  feature_name: "Event Streaming API",
  files_to_create: [
    { path: "app/src/api/events.ts", purpose: "Event streaming endpoint" }
  ],
  files_to_modify: [
    { path: "app/src/api/routes.ts", purpose: "Register event routes" }
  ],
  dependencies_to_add: [
    { name: "ws", version: "^8.0.0" }
  ]
});
```

**When to use:**
- Before implementing features: catch spec issues early
- During planning phase: validate file paths, naming conventions
- New dependencies: check compatibility and conflicts

### list_recent_files
List recently indexed files for quick discovery.

**Usage:**
```typescript
const files = await mcp.call("kotadb__list_recent_files", {
  limit: 10
});
```

**When to use:**
- Quick context on recently changed files
- Discovering new modules or endpoints

## Workflow Integration Examples

### Planning Phase Discovery

**Goal**: Find relevant files for a new feature or bug fix.

**Pattern**:
1. Use `search_code` to find similar implementations
2. Use `search_dependencies` to understand module relationships
3. Use `analyze_change_impact` to validate approach
4. Fall back to Glob/Grep if MCP tools are unavailable

**Example** (Planning authentication refactor):
```typescript
// Step 1: Find current authentication implementations
const authCode = await mcp.call("kotadb__search_code", {
  term: "authenticateRequest",
  limit: 10
});

// Step 2: Check dependencies for middleware.ts
const middlewareDeps = await mcp.call("kotadb__search_dependencies", {
  file_path: "app/src/auth/middleware.ts",
  direction: "dependents",
  depth: 2
});

// Step 3: Analyze refactor impact
const impact = await mcp.call("kotadb__analyze_change_impact", {
  change_type: "refactor",
  description: "Extract auth logic to separate service",
  files_to_modify: ["app/src/auth/middleware.ts"],
  files_to_create: ["app/src/auth/service.ts"]
});
```

### Pre-Implementation Dependency Check

**Goal**: Understand impact before modifying shared modules.

**Pattern**:
1. Use `search_dependencies` with `direction: "dependents"`
2. Review dependent files to identify potential breakage
3. Plan migration strategy for consumers

**Example** (Before refactoring shared types):
```typescript
// Check who depends on shared types
const typeDeps = await mcp.call("kotadb__search_dependencies", {
  file_path: "shared/types/index.ts",
  direction: "dependents",
  depth: 2,
  include_tests: true
});

// Review results:
// - 15 files import shared types
// - 8 test files need updates
// - Plan: update types, then update consumers, then update tests
```

### Test Scope Discovery

**Goal**: Find all tests related to a module before changes.

**Pattern**:
1. Use `search_dependencies` with `include_tests: true`
2. Filter results for `*.test.ts` or `*.spec.ts` files
3. Run identified tests after changes

**Example** (Finding tests for rate limiting):
```typescript
const rateLimitTests = await mcp.call("kotadb__search_dependencies", {
  file_path: "app/src/middleware/rate-limit.ts",
  direction: "dependents",
  depth: 1,
  include_tests: true  // Include test files
});

// Results show:
// - app/tests/api/rate-limit.test.ts (direct tests)
// - app/tests/api/routes.test.ts (integration tests)
// - app/tests/mcp/tools.test.ts (MCP tool tests)
```

### Impact Assessment for Large Changes

**Goal**: Validate feature spec and identify risks.

**Pattern**:
1. Use `validate_implementation_spec` to check conventions
2. Use `analyze_change_impact` to surface warnings
3. Review recommendations before implementation

**Example** (Validating event streaming feature):
```typescript
// Step 1: Validate spec
const specValidation = await mcp.call("kotadb__validate_implementation_spec", {
  feature_name: "Event Streaming API",
  files_to_create: [
    { path: "app/src/api/events.ts", purpose: "Event streaming endpoint" }
  ],
  dependencies_to_add: [
    { name: "ws", version: "^8.0.0" }
  ]
});

// Step 2: Analyze impact
const impact = await mcp.call("kotadb__analyze_change_impact", {
  change_type: "feature",
  description: "Add WebSocket-based event streaming",
  files_to_create: ["app/src/api/events.ts"],
  files_to_modify: ["app/src/api/routes.ts", "app/src/index.ts"]
});

// Review warnings:
// - New dependency 'ws' requires security review
// - WebSocket upgrade path affects server initialization
// - Consider rate limiting for event subscriptions
```

## Graceful Degradation

If KotaDB MCP tools are unavailable or fail:

1. **Fallback to Glob for pattern matching**:
   ```
   Glob: "**/*auth*.ts" to find authentication files
   Glob: "**/*.test.ts" to find test files
   ```

2. **Fallback to Grep for content search**:
   ```
   Grep: "authenticateRequest" to find function usage
   Grep: "import.*middleware" to find imports
   ```

3. **Manual dependency analysis**:
   - Read target file
   - Search for import statements
   - Grep for file path references

## Performance Considerations

- **MCP calls have authentication overhead** (API key validation, rate limiting)
- **Search operations are indexed and fast** (typically <100ms for local instance)
- **Dependency queries are graph-based** (efficient for moderate depth)
- **Use MCP for discovery, direct tools for execution** (minimize round trips)

## Common Pitfalls

1. **Over-relying on MCP tools for single-file operations**
   - ❌ Bad: Use `search_code` to find a specific known file path
   - ✅ Good: Use Read tool directly for known paths

2. **Not using dependency analysis before refactoring**
   - ❌ Bad: Modify shared module without checking dependents
   - ✅ Good: Run `search_dependencies` first to understand impact

3. **Forgetting fallback guidance**
   - ❌ Bad: Assume MCP tools are always available
   - ✅ Good: Document Glob/Grep fallback in command templates

4. **Using excessive depth in dependency queries**
   - ❌ Bad: Always use `depth: 5` (slow, noisy results)
   - ✅ Good: Start with `depth: 2`, increase if needed

## Related Documentation

- [MCP Usage Guidance](./.claude/commands/docs/mcp-usage-guidance.md) - General MCP tool decision matrix
- [MCP Integration](./.claude/commands/docs/mcp-integration.md) - MCP server architecture and tool implementation
- [Architecture](./.claude/commands/docs/architecture.md) - KotaDB architecture overview
- [Workflow](./.claude/commands/docs/workflow.md) - API workflow and authentication
