# KotaDB Automation Layer

Agentic automation layer for KotaDB development workflows using the Claude Agent SDK.

## Architecture

```
+-----------------------------------------------------+
|              AUTOMATION LAYER (outer)               |
|  - Claude Agent SDK (programmatic agent control)    |
|  - Triggers (webhooks, cron, GitHub events)         |
|  - Orchestration (issue -> PR workflow)             |
|  - Observability (metrics, success rates, costs)    |
+-----------------------------------------------------+
|              .claude/ INFRASTRUCTURE                |
|  - Expert domains, slash commands, agents           |
|  - /do, /commit, /pull_request, etc.                |
|  - MCP tools (KotaDB search, indexing)              |
+-----------------------------------------------------+
|              KOTADB CODEBASE (inner)                |
|  - app/src/* (the actual application)               |
|  - Database, API, indexer                           |
+-----------------------------------------------------+
```

## Quick Start

```bash
# Install dependencies
cd automation && bun install

# Run a workflow on a GitHub issue
bun run src/index.ts 123

# Dry run (no changes)
bun run src/index.ts 123 --dry-run

# View metrics
bun run src/index.ts --metrics
```

## CLI Options

| Option | Description |
|--------|-------------|
| `<issue>` | GitHub issue number (#123 or 123) |
| `--dry-run` | Preview workflow without executing changes |
| `--metrics` | Display recent workflow metrics |
| `--no-comment` | Skip posting GitHub comment |
| `--help` | Show help message |

## Structure

```
automation/
├── src/
│   ├── index.ts         # CLI entry point
│   ├── workflow.ts      # SDK query() integration and result handling
│   ├── orchestrator.ts  # Multi-phase workflow orchestration
│   ├── logger.ts        # Centralized logging system
│   ├── parser.ts        # Output parsing utilities
│   ├── metrics.ts       # SQLite metrics storage
│   └── github.ts        # GitHub issue commenting
├── tests/               # Test files
├── .data/               # SQLite database and logs storage
├── package.json
├── tsconfig.json
└── README.md
```

## Metrics

Metrics are stored in SQLite at `.data/metrics.db`:

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Auto-increment primary key |
| issue_number | INTEGER | GitHub issue being processed |
| started_at | TEXT | ISO timestamp of workflow start |
| completed_at | TEXT | ISO timestamp of workflow completion |
| success | INTEGER | 1 for success, 0 for failure |
| duration_ms | INTEGER | Execution time in milliseconds |
| input_tokens | INTEGER | Tokens consumed (input) |
| output_tokens | INTEGER | Tokens consumed (output) |
| total_cost_usd | REAL | Estimated API cost |
| pr_url | TEXT | Pull request URL if created |
| error_message | TEXT | Failure details (if any) |
| session_id | TEXT | Claude session identifier |

## Development

```bash
# Type check
cd automation && bun run typecheck

# Run tests
cd automation && bun test
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Claude API key | Yes (via SDK) |
| `GITHUB_TOKEN` | GitHub API token for `gh` CLI | Yes |

## How It Works

1. **Trigger**: CLI receives an issue number
2. **Execute**: Spawns Claude agent with `/do #<issue>` prompt
3. **Stream**: Captures real-time output and token usage
4. **Record**: Stores metrics in SQLite
5. **Report**: Comments on GitHub issue with results

## Cost Protection

The workflow includes a `maxBudgetUsd: 10.0` limit to prevent runaway costs.
