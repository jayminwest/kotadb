# KotaDB - Self-Hosted Code Intelligence Engine

**Lightweight MCP server for code indexing and search, powered by Bun + PostgreSQL**

KotaDB is a production-ready code intelligence platform designed for AI developer workflows. It provides fast, semantic code search with dependency graph analysis through a standards-based MCP interface and REST API. Self-host KotaDB to power your own AI coding tools, or use it as a learning resource for building production LLM infrastructure.

## Features

- **Code Indexing**: Automated repository cloning and file extraction with batch processing
- **Semantic Search**: Fast full-text search with context snippets and project filtering
- **Dependency Analysis**: Impact analysis, test scope discovery, circular dependency detection
- **MCP Protocol**: Standards-based interface for Claude Code and other MCP clients
- **Multi-Tenant**: Row-level security with PostgreSQL RLS for user isolation
- **Rate Limiting**: Tier-based request limits with sliding window enforcement
- **Job Queue**: Asynchronous indexing with pg-boss for reliable background processing
- **AI Developer Workflows**: Autonomous development automation via Python agents

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/jayminwest/kotadb.git
cd kotadb

# Install dependencies
cd app && bun install

# Configure environment
cp .env.sample .env
# Edit .env with your Supabase credentials (see Self-Hosting guide below)

# Run database migrations
cd app && bunx supabase db push

# Start the server
cd app && bun run src/index.ts
```

The server listens on port `3000` by default. Override with `PORT=4000`.

## Self-Hosting Guide

KotaDB is designed to be self-hosted with minimal configuration. Follow these steps:

### 1. Supabase Setup

**Option A: Supabase Local (Development)**

```bash
# Start Supabase Local with Docker
cd app && bunx supabase start

# The CLI will output your local credentials:
# - API URL: http://localhost:54321
# - Service Role Key: eyJhbG...
```

**Option B: Supabase Cloud (Production)**

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
2. Go to Project Settings → API to get your credentials:
   - `SUPABASE_URL`: Your project URL
   - `SUPABASE_SERVICE_KEY`: Service role key (keep secret)
   - `SUPABASE_ANON_KEY`: Anonymous/public key

### 2. Environment Configuration

Copy `.env.sample` to `.env` and configure:

```bash
# Required: Supabase credentials
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Optional: Billing features (disabled by default)
ENABLE_BILLING=false

# Optional: GitHub integration (for webhook auto-indexing)
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here
```

### 3. Database Migrations

Apply migrations to set up tables, RLS policies, and indexes:

```bash
cd app && bunx supabase db push
```

Migrations are located in `app/supabase/migrations/`.

### 4. Start the Server

```bash
cd app && bun run src/index.ts
```

Verify the server is running:

```bash
curl http://localhost:3000/health
```

## Billing Features

**Note:** Billing features are **disabled by default** in self-hosted deployments. Set `ENABLE_BILLING=true` in your environment to enable Stripe subscription billing.

When billing is disabled:
- All billing endpoints return `501 Not Implemented`
- Rate limits default to free tier (100 requests/hour)
- Subscription management is unavailable

To enable billing, configure Stripe credentials in your `.env`:

```bash
ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SOLO_PRICE_ID=price_...
STRIPE_TEAM_PRICE_ID=price_...
```

See `app/.env.sample` for complete Stripe configuration documentation.

## MCP Integration

KotaDB implements the [Model Context Protocol](https://modelcontextprotocol.io) for seamless integration with AI coding tools like Claude Code.

### Using KotaDB with Claude Code

Add KotaDB as an MCP server in your Claude Code configuration:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["@modelcontextprotocol/server-http", "http://localhost:3000/mcp"],
      "env": {
        "KOTADB_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Available MCP Tools

- `search_code`: Search indexed files for a specific term
- `index_repository`: Index a git repository by cloning/updating it
- `list_recent_files`: List recently indexed files, ordered by timestamp
- `search_dependencies`: Find files that depend on or are depended on by a target file

See `docs/guides/mcp-claude-code-integration.md` for detailed integration instructions.

## Testing

KotaDB follows an **antimocking philosophy** - all tests use real Supabase Local database connections for production parity. No mocks, no stubs.

```bash
# First-time setup: Start Docker Compose services
cd app && bun run test:setup

# Run tests
cd app && bun test

# Stop services when done
cd app && bun run test:teardown
```

See `docs/testing-setup.md` for detailed testing documentation.

## API Endpoints

### REST API

- `GET /health` - Health check endpoint (includes queue metrics)
- `POST /index` - Queue a repository for indexing
- `GET /search?term=<query>` - Search indexed files
- `GET /files/recent` - List recently indexed files
- `POST /mcp` - MCP protocol endpoint for tool integration
- `POST /api/keys/generate` - Generate API key for authenticated user
- `GET /api/keys/validate` - Validate API key or JWT token

### Webhooks

- `POST /webhooks/github` - GitHub push event webhook (requires `GITHUB_WEBHOOK_SECRET`)
- `POST /webhooks/stripe` - Stripe subscription webhook (only if `ENABLE_BILLING=true`)

### Rate Limits

- **Free**: 100 requests/hour
- **Solo**: 1,000 requests/hour (requires billing enabled)
- **Team**: 10,000 requests/hour (requires billing enabled)

All authenticated endpoints include rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1728475200
```

## Project Structure

```
app/                   # Bun + TypeScript API service
  src/
    api/               # HTTP routes and database queries
    auth/              # Authentication and rate limiting
    db/                # Supabase client and migrations
    indexer/           # Repository crawling and code extraction
    mcp/               # Model Context Protocol implementation
    queue/             # pg-boss job queue for async indexing
  tests/               # Integration tests (133 tests)
  supabase/            # Database migrations and configuration

automation/            # Python AI developer workflows (ADW)
  adws/                # Autonomous development agents

shared/                # Shared TypeScript types (monorepo)
  types/               # API contracts, entities, auth types

.claude/commands/      # Claude Code slash commands and guides
```

## Documentation

- **Development**: `.claude/commands/app/dev-commands.md` - Quick start and testing
- **Architecture**: `.claude/commands/docs/architecture.md` - Path aliases, shared types
- **Database**: `.claude/commands/docs/database.md` - Schema, RLS policies, migrations
- **MCP Integration**: `docs/guides/mcp-claude-code-integration.md` - Claude Code setup
- **Testing**: `docs/testing-setup.md` - Antimocking philosophy and test infrastructure
- **AI Workflows**: `automation/adws/README.md` - Autonomous development automation

## Contributing

Contributions are welcome! This repository is maintained as an open source core fork, with changes synced from the private development repository.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, including:
- Development setup and testing requirements
- Git flow and branch strategy
- Code style and commit message conventions
- Antimocking testing philosophy

## Consulting & Support

**Need help integrating KotaDB into your AI workflow?**

I provide consulting services for:
- Custom MCP server development
- LLM-powered developer tooling
- Code intelligence infrastructure
- AI agent automation pipelines

**Contact:** Jaymin West
- GitHub: [@jayminwest](https://github.com/jayminwest)
- Email: jaymin@jayminwest.com

**Looking for a hosted solution?** The full-stack web application with authentication, billing, and dashboard is available at [kotadb.io](https://kotadb.io) (private repository).

## License

MIT License - see [LICENSE](LICENSE) for details.

Copyright (c) 2024 Jaymin West
