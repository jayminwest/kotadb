# CLAUDE.md

## BLUF (Bottom Line Up Front)

New here? Run `/workflows:prime` to build baseline context quickly.

KotaDB is a code intelligence API (Bun + TypeScript + Supabase) powering AI developer workflows. This file is your navigation gateway—detailed docs live in `.claude/commands/`.

## Quick Start

1. **Prime**: `/workflows:prime` — sync git, review docs, understand architecture
2. **Plan**: `/workflows:plan` — create spec files for features/bugs/chores
3. **Implement**: `/workflows:implement <spec-path>` — execute plan step by step
4. **Validate**: `/workflows:validate-implementation` — lint, typecheck, test

## Core Principles

| Principle | Description | Commands |
|-----------|-------------|----------|
| **Antimocking** | Real Supabase Local for tests | `/docs:anti-mock`, `/testing:testing-guide` |
| **Path Aliases** | Use `@api/*`, `@db/*`, etc. | `/docs:architecture` |
| **Migration Sync** | Two locations, keep in sync | `/docs:database` |
| **Logging Standards** | `process.stdout.write` only | `/testing:logging-standards` |
| **Branching Flow** | `feat/*` → `develop` → `main` | `/git:commit`, `/git:pull_request` |

## Command Navigation

### Workflows (SDLC Phases)
| Command | Purpose |
|---------|---------|
| `/workflows:prime` | Onboarding and context building |
| `/workflows:dogfood-prime` | Local env setup with test credentials |
| `/workflows:plan` | Create implementation specs |
| `/workflows:implement` | Execute spec step by step |
| `/workflows:build` | Build phase of ADW pipeline |
| `/workflows:review` | Code review phase |
| `/workflows:document` | Documentation updates |
| `/workflows:validate-implementation` | Validation levels (1-3) |
| `/workflows:patch` | Quick fixes without full spec |
| `/workflows:orchestrator` | ADW orchestration |
| `/workflows:adw-architecture` | ADW architecture and phases documentation |
| `/workflows:adw-observability` | ADW metrics analysis and logging |
| `/workflows:roadmap-update` | Sync ROADMAP.md with progress |

### Issues
| Command | Purpose |
|---------|---------|
| `/issues:feature` | New feature issue template |
| `/issues:bug` | Bug report template |
| `/issues:chore` | Maintenance task template |
| `/issues:refactor` | Refactoring issue template |
| `/issues:issue` | Generic issue creation |
| `/issues:classify_issue` | Determine issue type |
| `/issues:audit` | Clean up stale/duplicate issues |
| `/issues:prioritize` | Dependency-aware prioritization |

### Git Operations
| Command | Purpose |
|---------|---------|
| `/git:commit` | Conventional commit creation |
| `/git:pull_request` | PR with validation checklist |

### Testing
| Command | Purpose |
|---------|---------|
| `/testing:testing-guide` | Antimocking philosophy |
| `/testing:logging-standards` | Approved logging methods |

### Documentation
| Command | Purpose |
|---------|---------|
| `/docs:architecture` | Path aliases, core components |
| `/docs:database` | Schema, RLS, migrations |
| `/docs:workflow` | API auth flow, rate limiting |
| `/docs:mcp-integration` | MCP server architecture |
| `/docs:mcp-usage-guidance` | When MCP vs direct ops |
| `/docs:kotadb-agent-usage` | MCP tools in agent contexts |
| `/docs:anti-mock` | Testing without mocks |
| `/docs:test-lifecycle` | Test execution patterns |
| `/docs:docs-update` | Documentation maintenance |
| `/docs:issue-relationships` | Dependency types |
| `/docs:prompt-code-alignment` | Template-parser alignment |
| `/docs:conditional_docs` | Layer-specific doc routing |
| `/docs:automated-deployments` | GitHub App integrations |

### CI/CD
| Command | Purpose |
|---------|---------|
| `/ci:ci-configuration` | GitHub Actions setup |
| `/ci:ci-investigate` | Debug CI failures |
| `/ci:ci-update` | Modify CI workflows |
| `/ci:ci-audit` | CI health check |

### Tools
| Command | Purpose |
|---------|---------|
| `/tools:tools` | Available tool inventory |
| `/tools:pr-review` | PR review checklist |
| `/tools:install` | Dependency installation |
| `/tools:bun_install` | Bun-specific install |
| `/tools:all-proj-bulk-update` | Cascading bulk-update for .claude directory |
| `/tools:question` | Answer questions about project structure without coding |

### App (Development)
| Command | Purpose |
|---------|---------|
| `/app:start` | Start development server |
| `/app:dev-commands` | Dev environment commands |
| `/app:environment` | Env vars and ports |
| `/app:pre-commit-hooks` | Hook troubleshooting |
| `/app:schema_plan` | Database schema planning |

### Automation (ADW)
| Command | Purpose |
|---------|---------|
| `/automation:generate_branch_name` | Branch naming from issue |
| `/automation:find_plan_file` | Locate spec for issue |

### Worktree
| Command | Purpose |
|---------|---------|
| `/worktree:init_worktree` | Initialize isolated worktree |
| `/worktree:make_worktree_name` | Generate worktree name |
| `/worktree:spawn_interactive` | Spawn interactive session |

### Release
| Command | Purpose |
|---------|---------|
| `/release:release` | Production release workflow |

### Validation
| Command | Purpose |
|---------|---------|
| `/validation:resolve_failed_validation` | Fix validation failures |

### Expert Orchestrators
| Command | Purpose |
|---------|---------|
| `/experts:orchestrators:orchestrator` | Multi-phase workflow (scout, plan, build, review, validate) |
| `/experts:orchestrators:planning_council` | Multi-expert planning analysis |
| `/experts:orchestrators:review_panel` | Multi-expert code review |

## Common Workflows

**New Feature**:
`/issues:feature` → `/issues:classify_issue` → `/workflows:plan` → `/workflows:implement` → `/workflows:validate-implementation` → `/git:commit` → `/git:pull_request`

**Bug Fix**:
`/issues:bug` → `/workflows:plan` → `/workflows:implement` → `/workflows:validate-implementation` → `/git:commit` → `/git:pull_request`

**Code Review**:
`/tools:pr-review` → `/workflows:validate-implementation` → `/workflows:review`

**Environment Setup**:
`/workflows:prime` → `/workflows:dogfood-prime` → `/app:start`

**CI Troubleshooting**:
`/ci:ci-investigate` → `/ci:ci-audit` → `/ci:ci-update`

## When Things Go Wrong

| Problem | Commands |
|---------|----------|
| Tests failing | `/testing:testing-guide`, `/docs:test-lifecycle`, `/docs:anti-mock` |
| Build failing | `/app:dev-commands`, `/app:environment`, `/app:pre-commit-hooks` |
| CI failing | `/ci:ci-investigate`, `/ci:ci-configuration` |
| Migration errors | `/docs:database`, `/docs:architecture` |
| Type errors | `/docs:architecture` (path aliases) |
| Lint failures | `/testing:logging-standards`, `/app:pre-commit-hooks` |
| Validation failures | `/validation:resolve_failed_validation` |

## Quick Reference

```bash
# Start development
cd app && ./scripts/dev-start.sh

# Run tests
cd app && bun test

# Type-check
cd app && bunx tsc --noEmit

# Validate migrations
cd app && bun run test:validate-migrations
```

## Critical Conventions

**Path Aliases**: Use `@api/*`, `@auth/*`, `@db/*`, `@indexer/*`, `@mcp/*`, `@validation/*`, `@queue/*`, `@shared/*`

**Migration Sync**: Keep `app/src/db/migrations/` and `app/supabase/migrations/` synchronized

**Logging**: TypeScript uses `process.stdout.write()` / `process.stderr.write()` (NEVER `console.*`)

**Testing**: Antimocking — real Supabase Local connections only

**Branching**: `feat/*`, `bug/*`, `chore/*` → `develop` → `main`

## MCP Servers

- **kotadb**: Code search, indexing, dependency analysis
- **playwright**: Browser automation
- **sequential-thinking**: Complex reasoning

See `/docs:mcp-usage-guidance` for decision matrix.

## Layer-Specific Documentation

- **Backend/API**: `.claude/commands/docs/conditional_docs/app.md`
- **Automation/ADW**: `.claude/commands/docs/conditional_docs/automation.md`
- **Web/Frontend**: `.claude/commands/docs/conditional_docs/web.md`

## Related Resources

- ADW architecture: `automation/adws/README.md`
- Testing setup: `docs/testing-setup.md`
- MCP integration guide: `docs/guides/mcp-claude-code-integration.md`
