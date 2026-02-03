# Multi-Repository Best Practices

## Overview

KotaDB v2.0.0 introduced project-local storage in `.kotadb/` directories,
providing automatic isolation between projects. This guide covers best
practices for working with multiple repositories.

## Project-Local Storage (Default)

### What is Project-Local Storage?

Since #592, KotaDB stores all indexed data in `.kotadb/` within each
project directory. Each project maintains its own database:

```
project-a/
  .kotadb/
    kota.db          # Project A's index
project-b/
  .kotadb/
    kota.db          # Project B's index (isolated)
```

### Benefits

- **Automatic Isolation**: No cross-project data contamination
- **Git-Friendly**: Add `.kotadb/` to `.gitignore`
- **Portable**: Move projects without database migration
- **Cleanup**: Delete `.kotadb/` to reset index

## When to Index External Repositories

### Use Cases

1. **Dependency Analysis**: Index libraries your project depends on
2. **Cross-Repo Refactoring**: Analyze changes across multiple repos
3. **Monorepo Support**: Index multiple logical repos in one workspace

### Example: Indexing External Library

```json
// .mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"],
      "env": {
        "KOTADB_PATH": ".kotadb/kota.db"
      }
    }
  }
}
```

Then use MCP tools:

```typescript
// Index external dependency
await mcp.tools.index_repository({
  repository: "external-org/dependency-lib",
  localPath: "../dependency-lib"
});

// Search across all indexed repos
await mcp.tools.search_code({
  term: "ApiClient"
  // No repository filter = search all
});

// Search only in external repo
await mcp.tools.search_code({
  term: "ApiClient",
  repository: "external-org/dependency-lib"
});
```

## Repository Filter Parameter

### Tools Supporting Repository Filter

All MCP tools support optional `repository` parameter:

- `search_code`: Filter search results by repository
- `list_recent_files`: Filter recent files by repository
- `search_dependencies`: Analyze dependencies within repository

### Usage Patterns

**List All Recent Files (Default):**

```typescript
await mcp.tools.list_recent_files({
  limit: 20
});
// Returns files from ALL indexed repositories
```

**Filter by Repository:**

```typescript
await mcp.tools.list_recent_files({
  limit: 20,
  repository: "your-org/your-repo"
});
// Returns only files from specified repository
```

## Configuration Examples

### Single Project (Default)

```json
// .mcp.json - Most common setup
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
    }
  }
}
```

No configuration needed. KotaDB automatically uses `.kotadb/kota.db`.

### Multiple Projects (Separate Instances)

```json
// project-a/.mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
      // Uses .kotadb/kota.db in project-a
    }
  }
}

// project-b/.mcp.json
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"]
      // Uses .kotadb/kota.db in project-b (isolated)
    }
  }
}
```

### Shared Database (Advanced)

```json
// Both projects point to shared database
{
  "mcpServers": {
    "kotadb": {
      "command": "bun",
      "args": ["run", "/Users/you/kotadb/app/src/index.ts"],
      "env": {
        "KOTADB_PATH": "/Users/you/shared-index/kota.db"
      }
    }
  }
}
```

Use when analyzing multiple repos together (monorepo style).

## Troubleshooting

### Problem: Search returns results from wrong repository

**Cause:** Multiple repositories indexed in same database.

**Solution:** Use `repository` filter parameter:

```typescript
await mcp.tools.search_code({
  term: "MyClass",
  repository: "your-org/your-repo"  // Filter to specific repo
});
```

### Problem: Can't find recently indexed files

**Cause:** Looking in wrong project's `.kotadb/` directory.

**Solution:** Check KOTADB_PATH environment variable:

```bash
echo $KOTADB_PATH
# Should point to current project's .kotadb/kota.db
```

### Problem: Old index data persists after git clone

**Cause:** `.kotadb/` not in `.gitignore`.

**Solution:**

```bash
# Add to .gitignore
echo ".kotadb/" >> .gitignore

# Remove from tracking
git rm -r --cached .kotadb/

# Commit
git add .gitignore
git commit -m "chore: ignore .kotadb/ directory"
```

## Best Practices Summary

1. **Default Setup**: Use project-local `.kotadb/` (no config needed)
2. **Gitignore**: Always add `.kotadb/` to `.gitignore`
3. **Filtering**: Use `repository` parameter for multi-repo scenarios
4. **Isolation**: Separate databases for separate projects (default)
5. **Cleanup**: Delete `.kotadb/` directory to reset index
6. **External Deps**: Index sparingly, filter aggressively
