# KotaDB Quickstart

**Ask Claude about your code, get instant answers.**

KotaDB gives Claude deep understanding of your codebase - dependencies, impact analysis, and semantic search - without manual setup.

## Install (2 minutes)

### 1. Add to Claude Code

Add this to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb", "--stdio"]
    }
  }
}
```

### 2. Restart Claude Code

That's it. No indexing commands, no configuration files.

## Your First Query

Open any project and ask Claude:

> "What files depend on src/api/routes.ts?"

KotaDB automatically indexes your codebase on first use. You'll see the dependency tree within seconds.

## Core Tools

### search_code
**Find code by meaning, not just text.**

Ask Claude:
- "Find all authentication logic"
- "Where do we handle rate limiting?"
- "Show me error handling patterns"

### search_dependencies
**Understand what depends on what.**

Ask Claude:
- "What files import this module?"
- "What would break if I delete this file?"
- "Show me the dependency tree for the auth system"

### analyze_change_impact
**Know the blast radius before you refactor.**

Ask Claude:
- "What's the risk of changing this interface?"
- "Which tests cover this code path?"
- "What files need updating if I rename this function?"

### record_decision
**Capture architectural decisions as you make them.**

Ask Claude:
- "Record that we chose SQLite for local-first storage"
- "Document why we avoided ORMs"
- "Save the decision to use path aliases"

### search_decisions
**Find past decisions when context matters.**

Ask Claude:
- "Why did we choose this database?"
- "What decisions affected the API design?"
- "Show me all architecture decisions from last month"

## How It Works

1. **Auto-indexing**: On first tool use, KotaDB scans your project and builds a local SQLite database
2. **File watching**: Changes are detected and indexed automatically
3. **Local-only**: Everything stays on your machine - no cloud, no uploads

## Tips

**Before refactoring**: Ask "What depends on [file]?" to understand impact

**Before PRs**: Ask "Analyze the impact of changing [files]" to catch issues early

**For code discovery**: Describe what you're looking for conceptually - KotaDB understands meaning, not just keywords

## Troubleshooting

**"Tool not found"**: Restart Claude Code after editing mcp.json

**Slow first query**: Initial indexing takes 10-30 seconds depending on project size

**Missing results**: KotaDB indexes TypeScript, JavaScript, Python, Go, and Rust by default

---

Questions? Issues? [github.com/jayminwest/kotadb](https://github.com/jayminwest/kotadb)
