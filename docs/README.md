# KotaDB Documentation

> Local-only code intelligence for CLI agents like Claude Code and Codex

This directory contains all documentation for KotaDB. Use this index to navigate to the right resource.

## Quick Links

| I want to... | Go to |
|--------------|-------|
| Understand the architecture | [Architecture](architecture.md) |
| Set up KotaDB with Claude Code | [MCP Integration Guide](mcp-integration.md) |
| See MCP tools and CLI commands | [API Reference](api-reference.md) |
| Understand the database schema | [Schema Reference](schema.md) |
| Contribute to KotaDB | [Contributing Guide](contributing.md) |
| Run or write tests | [Testing Setup](testing-setup.md) |

---

## Documentation by Category

### Getting Started

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | v2.0.0 local-first architecture. SQLite storage, MCP integration, directory structure, and data flow. |
| [MCP Integration Guide](mcp-integration.md) | How to integrate KotaDB with Claude Code using MCP. Covers stdio transport (recommended), HTTP transport, and `bunx` quick start. |
| [Contributing Guide](contributing.md) | Development setup, testing practices, code style, and PR workflow. |

### Reference

| Document | Description |
|----------|-------------|
| [API Reference](api-reference.md) | Complete MCP tools reference and CLI commands. All 8 tools with parameters, examples, and responses. |
| [Schema Reference](schema.md) | Complete SQLite schema documentation. Covers all 8 tables: repositories, indexed_files, indexed_symbols, indexed_references, dependency_graph, projects, project_repositories, and schema_migrations. |
| [Testing Setup](testing-setup.md) | How to run the test suite. Covers `bun test`, test structure, and running specific test files. |

### Guides

| Document | Description |
|----------|-------------|
| [Claude Config Guide](claude-config-guide.md) | Comprehensive guide to `.claude/` directory configuration. Covers CLAUDE.md, slash commands, agents, expert systems, hooks, and settings. |
| [Multi-Repo Guide](multi-repo-guide.md) | Best practices for working with multiple repositories. Explains project-local storage in `.kotadb/` directories and when to index external repos. |
| [Orchestrator Patterns](orchestrator-patterns.md) | Implementation patterns for multi-agent orchestration. Includes build agent prompt templates, spec file templates, git operations, and error handling. |
| [Security Scanning](security-scanning.md) | Security vulnerability scanning setup. Covers Dependabot configuration, CI security scanning with npm audit, and severity thresholds. |

### Agent Resources

| Directory | Description |
|-----------|-------------|
| [ai_docs/](ai_docs/) | Cached external documentation used by agents. Organized by service (claude-code, anthropic, validation/zod, etc.). See [ai_docs/README.md](ai_docs/README.md) for the full index. |
| [specs/](specs/) | Specification templates for feature development. Contains `_template-with-relationships.md` for creating new specs. |

---

## Directory Structure

```
docs/
├── README.md                 # This file - documentation index
│
├── architecture.md           # v2.0.0 local-first architecture
├── api-reference.md          # MCP tools and CLI commands
├── contributing.md           # Development setup and PR workflow
├── mcp-integration.md        # MCP setup with Claude Code
├── schema.md                 # SQLite database schema
├── testing-setup.md          # Test suite configuration
│
├── claude-config-guide.md    # .claude/ directory configuration
├── multi-repo-guide.md       # Multi-repository patterns
├── orchestrator-patterns.md  # Multi-agent orchestration
├── security-scanning.md      # Vulnerability scanning setup
│
├── ai_docs/                  # External documentation cache
│   ├── README.md             # Index of cached docs
│   ├── claude-code/          # Claude Code docs (MCP, hooks, skills)
│   ├── anthropic/            # Anthropic API docs
│   ├── validation/zod/       # Zod validation library
│   ├── development-tools/    # UV and other tools
│   └── frameworks/           # Next.js and other frameworks
│
└── specs/                    # Feature specifications
    └── _template-with-relationships.md
```

---

## Key Concepts

### Local-First Architecture

KotaDB stores all data locally in `.kotadb/kota.db` within your project directory. No cloud services, no authentication required for local use.

```
your-project/
├── .kotadb/
│   └── kota.db    # Your project's code index
├── src/
└── ...
```

### MCP Integration

KotaDB exposes tools via the Model Context Protocol (MCP):

- `search_code` - Full-text search across indexed files
- `index_repository` - Index a git repository
- `list_recent_files` - List recently indexed files
- `search_dependencies` - Query the dependency graph
- `analyze_change_impact` - Impact analysis for changes
- `validate_implementation_spec` - Validate specs against conventions
- `kota_sync_export` - Export database to JSONL
- `kota_sync_import` - Import JSONL to database

### Path Aliases

The codebase uses TypeScript path aliases for clean imports:

```typescript
import { db } from "@db/client";
import { searchCode } from "@mcp/tools/search";
import { IndexerService } from "@indexer/service";
```

Aliases: `@api/*`, `@db/*`, `@indexer/*`, `@mcp/*`, `@validation/*`, `@shared/*`

---

## Related Resources

- [Root README](../README.md) - Project overview and installation
- [CLAUDE.md](../CLAUDE.md) - Agent instructions and conventions

---

## Contributing to Docs

When adding or updating documentation:

1. Keep documents focused on a single topic
2. Use clear, descriptive filenames (lowercase, hyphens)
3. Update this README index when adding new docs
4. For agent-consumed docs, add to `ai_docs/` with appropriate structure
