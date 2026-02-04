# Unified Search Tool Guide

> New in v2.2.0

## Overview

The Unified Search Tool (`mcp__kotadb-bunx__search_unified`) consolidates multiple search operations into a single, intelligent tool that automatically determines the best search strategy based on your query.

## How It Works

Instead of deciding between `search_code`, `search_dependencies`, `search_patterns`, `search_decisions`, or `search_failures`, the unified search tool:

1. **Analyzes your query** to understand intent
2. **Routes to appropriate search methods** automatically
3. **Combines results** from multiple sources when relevant
4. **Ranks results** by relevance and context

## Usage

### Basic Search

```json
{
  "query": "authentication middleware",
  "limit": 20
}
```

### Advanced Search with Filters

```json
{
  "query": "error handling patterns",
  "repository": "owner/repo",
  "search_types": ["code", "patterns", "decisions"],
  "limit": 15
}
```

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `query` | string | Search query (required) | - |
| `repository` | string | Filter to specific repository | Current repo |
| `search_types` | array | Limit search to specific types: `code`, `patterns`, `decisions`, `failures`, `dependencies` | All types |
| `limit` | number | Maximum results per search type | 20 |
| `include_context` | boolean | Include code context snippets | true |

## Search Types

### Automatic Detection

The unified search automatically detects query intent:

- **Code queries**: "async function", "React component", "database query"
- **Pattern queries**: "error handling", "logging pattern", "API design"
- **Decision queries**: "why did we choose", "architecture decision", "database choice"
- **Failure queries**: "what went wrong", "failed approach", "doesn't work"
- **Dependency queries**: "what depends on", "impact of changing", "who uses"

### Manual Override

Force specific search types using the `search_types` parameter:

```json
{
  "query": "authentication",
  "search_types": ["patterns", "decisions"],
  "limit": 10
}
```

## Integration Patterns

### With Claude Code

The unified search integrates seamlessly with Claude Code workflows:

```python
# Hook: pre-refactor-context.py
import subprocess
import json

def get_unified_context(query):
    result = subprocess.run([
        'bunx', 'kotadb', 'search-unified',
        '--query', query,
        '--include-context',
        '--limit', '10'
    ], capture_output=True, text=True)

    return json.loads(result.stdout)

# Usage in refactoring context
context = get_unified_context("authentication patterns")
```

### With MCP Clients

```json
{
  "tool": "mcp__kotadb-bunx__search_unified",
  "parameters": {
    "query": "database connection pooling",
    "search_types": ["code", "patterns", "decisions"],
    "limit": 15
  }
}
```

## Response Format

The unified search returns results grouped by type:

```json
{
  "query": "authentication middleware",
  "total_results": 23,
  "search_strategy": ["code", "patterns", "decisions"],
  "results": {
    "code": [
      {
        "type": "code",
        "file_path": "src/auth/middleware.ts",
        "line": 15,
        "snippet": "export const authMiddleware = async (req, res, next) => {",
        "score": 0.95,
        "context": "JWT authentication middleware with role-based access"
      }
    ],
    "patterns": [
      {
        "type": "pattern",
        "pattern_name": "JWT Auth Pattern",
        "description": "Standard JWT authentication with refresh tokens",
        "file_path": "src/auth/jwt.ts",
        "score": 0.88
      }
    ],
    "decisions": [
      {
        "type": "decision",
        "title": "Choose JWT over sessions",
        "context": "Need stateless auth for microservices",
        "decision": "Implement JWT with refresh token rotation",
        "score": 0.82
      }
    ]
  },
  "suggestions": [
    "Try searching for 'JWT implementation' for more specific results",
    "Consider reviewing 'auth middleware patterns' for similar approaches"
  ]
}
```

## Performance

- **Target response time**: <200ms for typical queries
- **Parallel execution**: Multiple search types run concurrently
- **Smart caching**: Frequently accessed results cached for faster retrieval
- **Result limiting**: Configurable limits prevent overwhelming responses

## Best Practices

### Query Construction

**Good queries:**
- "React component lifecycle" (specific domain)
- "database transaction handling" (specific operation)
- "error boundary implementation" (specific pattern)

**Avoid:**
- "component" (too generic)
- "function" (too broad)
- "code" (meaningless)

### Search Type Selection

- **Use all types** for exploration and discovery
- **Limit types** for focused searches
- **Include dependencies** when planning refactors
- **Include failures** when debugging similar issues

### Integration Tips

1. **Hook Integration**: Use in pre-edit hooks for automatic context
2. **Interactive Search**: Start broad, then narrow with specific types
3. **Result Filtering**: Use repository filters for multi-repo workspaces
4. **Context Inclusion**: Enable for code understanding, disable for speed

## Migration from Individual Tools

### Before (v2.1.x)
```javascript
// Multiple tool calls required
await searchCode("auth middleware");
await searchPatterns("auth");
await searchDecisions("authentication");
```

### After (v2.2.0+)
```javascript
// Single unified call
await searchUnified("auth middleware");
```

## Advanced Features

### Query Expansion

The unified search automatically expands queries with related terms:

- "auth" → "authentication", "authorize", "login", "jwt"
- "db" → "database", "query", "connection", "transaction"
- "test" → "testing", "spec", "unit test", "integration"

### Context Awareness

Results consider:
- **File relationships** (dependencies and dependents)
- **Recent changes** (prioritize recently modified files)
- **Usage patterns** (frequently accessed code)
- **Session context** (previous search queries)

### Learning

The unified search learns from usage:
- **Popular queries** get faster response times
- **Successful patterns** influence future routing decisions
- **User feedback** improves relevance scoring

## Troubleshooting

### No Results
- Check repository is indexed: `bunx kotadb status`
- Verify spelling and try broader terms
- Use manual search type selection

### Slow Performance
- Reduce limit parameter
- Limit search types to specific areas
- Check index staleness: `bunx kotadb index-status`

### Irrelevant Results
- Use more specific queries
- Filter by search type
- Add repository filters for focus

## Next Steps

- Integrate unified search into your development workflow
- Set up hooks for automatic context injection
- Explore advanced query patterns for better results
- Consider the Memory Layer Guide for persistent intelligence