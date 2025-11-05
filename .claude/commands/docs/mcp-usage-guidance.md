# MCP Usage Guidance

Guidance for AI agents on when and how to use MCP tools versus direct file operations.

## When to Use MCP Tools

**Use MCP tools when:**

- Performing programmatic queries (`search_code`, `list_recent_files`)
- Querying dependency graphs (`search_dependencies`)
- Interacting with browser automation (playwright MCP tools)
- Operations requiring rate limiting and authentication
- Full-text search across repository
- Discovering files by content or dependencies

## When to Use Direct File Operations

**Use direct file operations when:**

- Reading specific known file paths (Read tool is faster)
- Editing files with exact changes (Edit tool is more precise)
- Writing new files (Write tool is straightforward)
- Single-file operations in current context
- No need for database queries or authentication

## Available MCP Servers

### kotadb MCP (`mcp__kotadb__*`)

Code search, indexing, dependency analysis:

- `search_code`: Full-text search across indexed repositories
- `index_repository`: Trigger repository indexing
- `list_recent_files`: List recently indexed files
- `search_dependencies`: Query dependency graph for impact analysis

### playwright MCP (`mcp__playwright__*`)

Browser automation, web testing:

- `browser_navigate`: Navigate to URL
- `browser_click`: Click elements
- `browser_type`: Type text into fields
- `browser_snapshot`: Capture page state
- `browser_take_screenshot`: Take screenshots

### sequential-thinking MCP (`mcp__sequential-thinking__*`)

Complex reasoning tasks requiring multi-step analysis.

## Usage Examples

### Code Search (MCP)

```typescript
// PREFER: MCP for code search across repository
const results = await mcp.call("kotadb__search_code", {
  term: "authenticateRequest",
  limit: 20
});
```

### Direct Read (Faster for Known Paths)

```typescript
// PREFER: Direct Read for known file paths
const content = await tools.Read({
  file_path: "app/src/auth/middleware.ts"
});
```

### Dependency Analysis (MCP)

```typescript
// PREFER: MCP for dependency analysis
const deps = await mcp.call("kotadb__search_dependencies", {
  file_path: "app/src/api/routes.ts",
  direction: "both",
  depth: 2
});
```

### Direct Edit (Precise Changes)

```typescript
// PREFER: Direct Edit for specific changes
await tools.Edit({
  file_path: "app/src/auth/middleware.ts",
  old_string: "return 429",
  new_string: "return 503"
});
```

## Performance Considerations

- **MCP calls have authentication overhead** (API key validation)
- **MCP search operations are rate-limited** per tier (free=100/hr, solo=1000/hr, team=10000/hr)
- **Direct file operations bypass rate limits** for known paths
- **Use MCP for discovery**, direct tools for execution

## Decision Matrix

| Task Type | Recommended Approach | Rationale |
|-----------|---------------------|-----------|
| Find files containing "AuthContext" | MCP `search_code` | Full-text search across repo |
| Read `app/src/auth/middleware.ts` | Direct `Read` | Known path, faster |
| Find all files importing middleware.ts | MCP `search_dependencies` | Dependency graph query |
| Update import statement in routes.ts | Direct `Edit` | Precise change |
| List recently indexed files | MCP `list_recent_files` | Database query |
| Create new file app/src/utils/helper.ts | Direct `Write` | Simple file creation |

## Rate Limiting Awareness

When using MCP tools:

- Each MCP call consumes user's hourly quota
- Monitor rate limit headers in responses:
  - `X-RateLimit-Limit`: Total requests allowed per hour
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Unix timestamp when limit resets
- If rate limited (429), wait until `Retry-After` seconds
- Direct file operations don't consume API quota

## Best Practices

1. **Prefer direct operations for known paths** - faster and no rate limits
2. **Use MCP for discovery** - finding files, searching content, analyzing dependencies
3. **Batch MCP calls when possible** - reduce round trips
4. **Cache MCP results** - avoid redundant searches
5. **Monitor rate limits** - track remaining quota
6. **Graceful degradation** - fall back to direct operations if rate limited

## Related Documentation

- [MCP Integration](./.claude/commands/docs/mcp-integration.md)
- [Architecture](./.claude/commands/docs/architecture.md)
- [API Workflow](./.claude/commands/docs/workflow.md)
