# KotaDB Vision

**Last Updated**: 2025-10-20
**Status**: ~60% complete - Foundation strong, critical gaps block MVP (see ROADMAP.md and CURRENT_STATE.md)

## Core Concept

KotaDB is an **intelligence layer** between Claude Code (and other MCP-compatible CLI agents) and codebases, providing high-quality, information-rich context that would be difficult or impossible to obtain through traditional search tools (grep/ripgrep/awk).

## Architecture

### System Components

- **kotadb (this repository)**: Backend indexing and query service
  - Bun + TypeScript runtime
  - PostgreSQL via Supabase (primary data store for all environments)
  - ~~SQLite for local development/testing only~~ (Removed: using Supabase Local for all testing)
  - MCP server implementation (**HTTP JSON-RPC transport** - see Technical Decisions below)
  - REST API for frontend UX
  - Webhook receivers for GitHub events (**Planned** - Epic 5, not yet implemented)
  - Job queue (pg-boss) for async indexing (**Planned** - Epic 4, not yet implemented)

**Current Status**: Database, auth, MCP server, and testing infrastructure are production-ready. AST parsing, job queue, and GitHub integration are critical gaps blocking MVP (see ROADMAP.md).

- **kotadb.io** (separate repository): SaaS frontend application
  - Hosted on Cloudflare
  - Shares Supabase database with backend
  - Handles user authentication, repository selection, API key management

- **app.kotadb.io/mcp/**: MCP endpoint for CLI agent integration
  - Production: `app.kotadb.io/mcp/`
  - Staging: `app.develop.kotadb.io/mcp/`

### Data Flow

```
GitHub Repos → KotaDB Backend (indexing) → Supabase DB → MCP API → Claude Code → Developer
                       ↑                                      ↓
                       └──────────── Status Updates ──────────┘
                                   (for frontend UX)
```

## User Journey

1. **Authenticate**: User logs into kotadb.io with GitHub OAuth (via Supabase Auth)
2. **Select Repositories**: Dashboard displays available repos; user selects which to index
3. **Indexing**: KotaDB backend processes selected repositories
4. **Configuration**: User receives `.mcp.json` containing:
   - Endpoint: `app.kotadb.io/mcp/` (or staging equivalent)
   - Personal API key
5. **Integration**: User copies config into Claude Code settings
6. **Usage**: Claude Code queries KotaDB for intelligent context during development

## Value Proposition

### Problem

CLI agents need rich contextual understanding of codebases, but traditional search tools return verbose, low-signal results that are difficult to synthesize.

### Solution

KotaDB provides **semantic code intelligence**:
- Dependency analysis ("X function is used by A, B, C")
- Impact assessment ("Changing X will break these components")
- Relationship mapping ("This module depends on these interfaces")
- Symbol resolution and cross-reference tracking
- Clean, condensed, information-rich responses optimized for LLM consumption

### Example Use Case

**Developer**: "Update X function to do Y instead of Z"

**Claude Code** (queries KotaDB) → receives:
- "Function X is called by A, B, and C"
- "Modifying return type would break B's type assertions"
- "Module C expects current behavior for edge case handling"

## Technical Decisions

### Database Architecture

**Decision: Full PostgreSQL Migration**

- **Primary Store**: PostgreSQL via Supabase for all production/staging environments
- **Local Development**: SQLite for quick local testing
- **Migration Strategy**: Fresh Supabase schema (clean slate from previous version)

**Supabase Schema Design:**

```sql
-- Core tables
users                    -- Managed by Supabase Auth
api_keys                 -- Custom keys with tier field (free, solo, team)
organizations            -- For team tier multi-tenancy
user_organizations       -- Join table for team memberships

-- Repository management
repositories             -- Tracked repos per user, includes installation_id
index_jobs               -- Webhook-triggered jobs with status tracking

-- Code intelligence
indexed_files            -- File metadata, content, hash, indexed_at
symbols                  -- Functions, classes, types, exports with positions
references               -- Where symbols are imported/called (file, line, column)
dependencies             -- File→file and symbol→symbol edges
```

**Multi-tenancy & Security:**
- Every table includes `user_id` or `org_id` foreign keys
- Row Level Security (RLS) policies enforce data isolation
- API key validation extracts `user_id`, Supabase RLS handles access control automatically

### MCP Implementation

**Protocol Version**: MCP 2025-06-18 specification

**Transport**: HTTP JSON-RPC (Streamable HTTP)
- **Implementation Decision**: HTTP JSON-RPC via `@modelcontextprotocol/sdk` (v1.20+) instead of SSE streaming
- **Rationale**: Simpler error handling, better debugging, matches real-world MCP usage patterns
- **Trade-off**: No real-time streaming for long-running queries, but eliminates connection management complexity
- Endpoint: `/mcp` (POST only, JSON-RPC over HTTP)

**Current Status**: MCP server is production-ready with 3 tools (95% complete, 122/132 tests passing)

**MVP Tools (Phase 1)**: Three high-ROI tools for initial release

1. **`search_code`** (Foundation) ✅ **Implemented**
   - Full-text search across indexed files
   - Filters: repository, file path, language
   - Quick win, validates MCP integration end-to-end

2. **`index_repository`** (Core Workflow) ✅ **Implemented**
   - Triggers repository indexing (currently synchronous, Epic 4 will make async)
   - Returns job ID for status polling (once Epic 4 completes)

3. **`list_recent_files`** (Context Discovery) ✅ **Implemented**
   - Returns recently indexed files for a repository
   - Useful for understanding what's available to search

**Planned Tools** (blocked by Epic 3 AST parsing):
- **`search_dependencies`** - Dependency graph traversal (requires AST parsing)
- **`find_references`** - Symbol reference lookup (requires AST parsing)

**Future Tools**: `analyze_impact`, `find_similar`, `get_type_hierarchy`

### API Architecture

**Decision: Maintain Both REST and MCP APIs**

**REST API** (`/api/*`): For frontend UX
- Status polling for indexing jobs
- Dashboard metrics (repos indexed, query usage)
- Repository management (add, remove, configure)
- Pagination, sorting, aggregations optimized for UI

**MCP API** (`/mcp/`): For CLI agents
- Concise, LLM-optimized responses
- Streaming support for real-time workflows
- MCP protocol-specific formatting
- Long-lived API key authentication

**Shared Core**: Both APIs use same query logic (`src/indexer/`, `src/db/`), different presentation layers.

**Coordination**: OpenAPI spec (`docs/openapi.yaml`) defines REST API contract
- Frontend generates TypeScript types via `openapi-typescript`
- CI validates implementation matches spec
- Version-controlled for cross-repo coordination

### Authentication & Authorization

**API Key System:**

```sql
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  key_hash text NOT NULL UNIQUE,  -- bcrypt hash
  tier text NOT NULL CHECK (tier IN ('free', 'solo', 'team')),
  org_id uuid REFERENCES organizations,  -- nullable, team tier only
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz,
  rate_limit_per_hour int NOT NULL,  -- varies by tier
  enabled boolean DEFAULT true
);
```

**Key Format**: `kota_<env>_<random>` (e.g., `kota_prod_a1b2c3d4e5f6`)
- Easy to identify, revoke, and environment-scope
- Backend validates via hash lookup, extracts `user_id` and `tier`
- Frontend can check tier for UI features (shared Supabase access)

**Rate Limiting**: Enforced per tier (free: 100/hr, solo: 1000/hr, team: 10000/hr)

### GitHub Integration

**Decision: GitHub App** (not webhook secrets)

**Why:**
- Fine-grained permissions (contents:read, webhooks:write only)
- Per-installation tokens automatically scoped to authorized repos
- Better UX (one-click install, select repos)
- Revocable without password changes
- Higher rate limits

**Flow:**
1. User installs KotaDB GitHub App from kotadb.io
2. Selects repositories to grant access
3. Frontend receives `installation_id`, stores in Supabase
4. Backend generates installation tokens on-demand for cloning
5. Tokens auto-expire (1hr), regenerate as needed—never stored

**Setup Requirements**: Register GitHub App manually (store `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` as secrets)

### Indexing Strategy

**Extraction Depth (Phase 1)**: Deep indexing from day one

- 🔴 **Import/export statements** → dependency graphs (**Partial**: regex-based, needs AST - Epic 3)
- 🔴 **Function/class signatures** → symbol resolution (**Not Started** - Epic 3)
- 🔴 **Type definitions** (TS interfaces, types) → type relationships (**Not Started** - Epic 3)
- 🔴 **Docstrings/comments** (JSDoc, TSDoc) → semantic context (**Not Started** - Epic 3)
- 🔴 **Call graphs** (function invocations) → impact analysis (**Not Started** - Epic 3)

**Parser**: Migrate from regex to `@typescript-eslint/parser` for robust AST parsing (**In Progress** - Epic 3, 30% complete)
- ✅ File discovery and basic content extraction (regex-based)
- 🔴 Extract symbols with positions (file, line, column) - **Blocked on Epic 3**
- 🔴 Store call sites, type references, property accesses - **Blocked on Epic 3**
- 🔴 Index docstrings separately for future semantic search - **Blocked on Epic 3**

**Current Reality**: Using regex-based parsing for basic dependency extraction. Works for simple cases but fails on complex TypeScript syntax (JSX, destructuring, generics). **Epic 3 is the highest-priority gap blocking core value proposition.**

**Job Queue**: pg-boss (Postgres-backed queue) **[NOT IMPLEMENTED - Epic 4]**
- Uses Supabase as job store—no Redis/external service needed
- Handles retries, exponential backoff, dead letter queues
- Simple API: `queue.send('index-repo', { repoId })`
- Worker: `queue.work('index-repo', async (job) => { ... })`

**Current Reality**: All indexing runs synchronously in API handlers, blocking requests for 30s+ on large repos. **Epic 4 is critical for scalability and webhook support.**

**Webhook Flow** (Planned - Epic 5):
```
GitHub push → Webhook → pg-boss queue → Worker → Index repo → Update status → Notify frontend
```

**Current Status**: No webhook support. Users manually trigger indexing via API.

## Technical Requirements

### Real-Time Intelligence

- Agents work quickly and need current information
- Low-latency query responses (< 200ms p95)
- Fresh index data synchronized with repository state

### Auto-Indexing (Phase 1)

- **Webhook-triggered indexing** on every push to tracked repositories
- Incremental updates to minimize reprocessing
- Status visibility for users (indexing progress, last indexed commit, health metrics)
- Queue-based job processing for reliability

### Local Change Indexing (Future Phase)

- Stage and index uncommitted local changes
- Agent-made modifications reflected in same session
- Diff-based incremental updates
- Ephemeral workspace management

## Infrastructure & Deployment

### Hosting & Services

- **Backend (this repo)**: Fly.io container deployment
- **Frontend**: Cloudflare (kotadb.io, app.kotadb.io, develop.kotadb.io, app.develop.kotadb.io)
- **Database**: Supabase (shared between frontend and backend)
- **Authentication**: Supabase Auth
- **Payments**: Stripe
- **SMTP**: Resend

### Environments

| Environment | Branch   | Backend Host       | Frontend Hosts                              | Database           |
|-------------|----------|--------------------|--------------------------------------------|-------------------|
| Production  | `main`   | Fly.io (prod app)  | kotadb.io, app.kotadb.io                   | Supabase (prod)   |
| Staging     | `develop`| Fly.io (staging app)| develop.kotadb.io, app.develop.kotadb.io  | Supabase (staging)|
| Feature     | `feat/*` | Local/PR previews  | N/A                                        | Local SQLite      |

**Fly.io Setup**: Fresh deployment configuration
- Two separate apps: `kotadb-staging` (develop branch), `kotadb-prod` (main branch)
- Separate `fly.toml` configs per environment
- CI handles automated deployment on merge
- Health check endpoint (`/health`) for instance monitoring

### Git Flow

```
feat/* → develop (staging) → main (production)
```

- **Feature branches** (`feat/*`): Development work, tested locally
- **Develop branch**: Staging environment for integration testing
- **Main branch**: Production releases only

### CI/CD Requirements

**Day 1 Robustness**: CI must support autonomous development (ADW workflows) with minimal human intervention.

#### Pipeline Stages

1. **Validation** (all branches)
   - `bun run lint`
   - `bun run typecheck`
   - `bun test`
   - `bun run build`
   - Docker image build verification

2. **Database Migrations** (develop, main)
   - Automated migration application
   - Rollback scripts generated and tested
   - Migration history tracking in Supabase

3. **Deployment** (develop, main)
   - Fly.io deployment with health checks
   - Blue-green or rolling deployment strategy
   - Automatic rollback on health check failure

4. **Infrastructure Updates** (develop, main)
   - Environment variable synchronization
   - Secrets rotation support
   - DNS/routing updates (if needed)

#### Rollback Strategy

- Database migrations must be reversible (up/down migrations)
- Fly.io releases tagged and rollback-ready
- CI generates rollback runbook per deployment
- Manual approval gate for production migrations (optional, configurable)

### Secrets Management

**Approach**: Local SSOT with scripted sync (no secrets in CI)

**Process:**
1. Maintain local "single source of truth" files (gitignored):
   - `.env.local.secrets`
   - `.env.staging.secrets`
   - `.env.prod.secrets`

2. Sync scripts push secrets to services:
   - `scripts/sync-secrets-staging.sh` → Fly.io + Supabase
   - `scripts/sync-secrets-prod.sh` → Fly.io + Supabase
   - Uses `flyctl secrets import` and Supabase CLI

3. CI never accesses secrets—only deploys code

**Required Secrets per Environment:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (bypasses RLS for admin operations)
- `SUPABASE_ANON_KEY` (public, RLS-enforced)
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `STRIPE_SECRET_KEY` (frontend only, but documented here)
- `RESEND_API_KEY` (frontend only, but documented here)

### Monitoring & Observability

**Tools**: Use built-in services, avoid new dependencies

1. **Structured Logging** (bun:logger)
   - JSON-formatted logs to stdout/stderr
   - Include correlation IDs: `request_id`, `user_id`, `job_id`
   - Fly.io captures logs automatically
   - Query with `flyctl logs`

2. **Fly.io Metrics** (built-in dashboard)
   - Request latency (p50, p95, p99)
   - Error rates (4xx, 5xx)
   - Instance health and CPU/memory usage
   - Alerts for downtime or threshold breaches

3. **Supabase Logs** (built-in dashboard)
   - Slow query detection (> 1s)
   - Connection pool saturation
   - Database error rates

4. **Health Checks** (`/health` endpoint)
   - Returns 200 OK if service is healthy
   - Fly.io polls every 30s, restarts unhealthy instances
   - Checks: Database connection, job queue health

**Future**: Add Sentry (error tracking) or Grafana (custom dashboards) if needed, both have free tiers.

### Testing Strategy

**Critical for Autonomous Development**: ADW workflows will implement features without human review until PR stage.

#### Test Pyramid

1. **Unit Tests** (70% coverage minimum)
   - All indexer logic (parsers, extractors, dependency resolution)
   - API query functions
   - Database schema helpers
   - MCP server protocol handlers

2. **Integration Tests** (key workflows)
   - Full indexing pipeline (clone → parse → extract → store)
   - MCP request/response cycles
   - Webhook processing and job queuing
   - Supabase integration (auth, queries)

3. **E2E Tests** (smoke tests for critical paths)
   - Repository indexing end-to-end
   - MCP client queries returning correct results
   - Frontend → Backend status updates

4. **Contract Tests** (for MCP protocol)
   - Validate MCP spec compliance
   - Version compatibility checks

#### Test Data & Fixtures

- Curated test repositories with known dependency graphs
- Mock GitHub webhook payloads
- Supabase test database seeding scripts
- MCP client simulator for protocol validation

#### CI Test Enforcement

- All tests must pass before merge
- Coverage gates per test tier
- Performance regression detection (query latency benchmarks)

## Current Scope (Phase 1)

**Progress**: ~60% complete (see ROADMAP.md for detailed status)

### Infrastructure & Foundation
- [x] Supabase schema design and migration from SQLite **[Epic 1: 95% complete]**
  - [x] Core tables: users, api_keys, organizations, user_organizations
  - [x] Repository management: repositories, index_jobs
  - [x] Code intelligence: indexed_files, symbols, references, dependencies
  - [x] RLS policies for multi-tenancy
  - [x] Up/down migration scripts

- [ ] Fly.io deployment setup **[Epic 9: Not started]**
  - [ ] Create `kotadb-staging` and `kotadb-prod` apps
  - [ ] Environment-specific `fly.toml` configurations
  - [x] Health check endpoint integration
  - [ ] Secrets sync scripts (`scripts/sync-secrets-*.sh`)

- [x] CI/CD pipeline **[Epic 9: 40% complete]**
  - [x] GitHub Actions workflow (lint, typecheck, test, build)
  - [ ] Automated migrations on deploy (with rollback)
  - [x] Branch-based testing (feat → develop → main)
  - [x] Docker image build verification

### API & Authentication
- [x] API key system **[Epic 2: 90% complete]**
  - [x] Key generation and hashing (bcrypt)
  - [x] Tier-based rate limiting middleware
  - [x] Authentication middleware for REST and MCP

- [x] REST API refinements **[Epic 6: 70% complete]**
  - [x] OpenAPI spec (`docs/openapi.yaml`) - skeleton exists, needs sync
  - [x] Migrate existing endpoints to Supabase
  - [ ] Add repository management endpoints
  - [ ] Job status polling endpoints (blocked by Epic 4)

- [x] MCP server implementation **[Epic 7: 95% complete]**
  - [x] HTTP JSON-RPC transport layer (`/mcp`) - **Using HTTP instead of SSE**
  - [x] Protocol handlers (handshake, tool discovery, execution)
  - [x] Three MVP tools: `search_code`, `index_repository`, `list_recent_files`
  - [x] MCP authentication via API keys
  - [ ] `search_dependencies` tool (blocked by Epic 3)
  - [ ] `find_references` tool (blocked by Epic 3)

### Indexing & Intelligence
- [ ] GitHub App integration **[Epic 5: 0% complete - MVP BLOCKER]**
  - [ ] App registration documentation
  - [ ] Installation token generation
  - [ ] Webhook receiver (`POST /webhooks/github`)
  - [ ] Signature verification

- [ ] Job queue with pg-boss **[Epic 4: 0% complete - MVP BLOCKER]**
  - [ ] Queue setup and worker configuration
  - [ ] Retry logic and dead letter handling
  - [ ] Job status updates for frontend

- [ ] Deep indexing pipeline **[Epic 3: 30% complete - MVP BLOCKER]**
  - [ ] Migrate to `@typescript-eslint/parser` (currently regex-based)
  - [ ] Extract symbols (functions, classes, types, exports)
  - [ ] Extract references (imports, calls, property accesses)
  - [ ] Extract dependencies (file→file, symbol→symbol edges)
  - [ ] Extract docstrings/comments
  - [x] File discovery and basic content extraction (regex-based)

### Testing & Quality
- [x] Comprehensive test suite **[Epic 10: 85% complete]**
  - [x] Unit tests (85% coverage): indexer, API, parsers
  - [x] Integration tests: MCP protocol, API endpoints, auth/rate limiting
  - [ ] E2E tests: end-to-end indexing and query workflows
  - [ ] Contract tests: OpenAPI spec validation

- [x] Test infrastructure **[Epic 10: 85% complete]**
  - [x] Test repository fixtures with known graphs
  - [x] Mock GitHub webhook payloads (fixtures created)
  - [x] Supabase test database setup (Supabase Local, antimocking enforced)
  - [x] MCP test helpers and utilities

### Monitoring & Operations
- [ ] Structured logging with bun:logger **[Epic 8: 15% complete]**
  - [ ] JSON log format with correlation IDs
  - [ ] Request/response logging
  - [x] Error logging with context (basic)

- [x] Health monitoring **[Epic 8: Partially complete]**
  - [x] `/health` endpoint (DB connection check)
  - [ ] Fly.io metrics dashboard setup (pending deployment)
  - [ ] Alert configuration for critical failures

## Out of Scope (Future Phases)

- Local change staging/indexing
- Advanced AST analysis beyond dependencies
- Multi-language symbol resolution (start with TS/JS only)
- Real-time collaboration features
- Self-hosted deployment options
- Advanced caching strategies (CDN, query result caching)

## Success Metrics

- **Latency**: p95 query response time < 200ms
- **Accuracy**: 95%+ precision on dependency analysis
- **Reliability**: 99.5% uptime for MCP endpoints
- **Autonomy**: 80%+ of ADW-generated PRs pass CI without human intervention
- **User Adoption**: MCP integration success rate (users who configure and successfully use KotaDB)

## Implementation Priority

**Phase 1A: Foundation** (Weeks 1-2)
1. Supabase schema design and migration (Epic 1)
2. Authentication + API keys (Epic 2)
3. Establish baseline testing harness (Epic 10 kick-off)

**Phase 1B: Indexing Core** (Weeks 3-4)
1. Enhanced parsing pipeline (Epic 3)
2. Job queue + worker orchestration (Epic 4)
3. Expand unit tests around parsing/indexing (Epic 10)

**Phase 1C: Integrations & API** (Weeks 5-6)
1. GitHub App integration & webhook flow (Epic 5)
2. REST API migration + OpenAPI contract (Epic 6)

**Phase 1D: MCP & Operations** (Weeks 7-8)
1. MCP transport, protocol handlers, tools (Epic 7)
2. Monitoring & operational readiness (Epic 8)

**Phase 1E: Launch Readiness** (Week 9)
1. CI/CD automation and deployment scripts (Epic 9)
2. Test hardening + E2E coverage (Epic 10)

## Key Dependencies

**New Packages to Add:**
- `pg-boss` - PostgreSQL-backed job queue
- `@supabase/supabase-js` - Supabase client
- `@typescript-eslint/parser` - AST parsing for TS/JS
- `@typescript-eslint/types` - TypeScript AST type definitions
- `bcryptjs` - API key hashing
- `@octokit/rest` - GitHub API client
- `openapi-typescript` - OpenAPI type generation (dev dependency)

**MCP Protocol:**
- Implement SSE transport per [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- No external MCP SDK needed—build directly against spec

**Existing Stack (Keep):**
- Bun runtime
- TypeScript
- Biome (linting)

## Dependencies & Coordination

**Frontend Team**:
- Supabase schema review and approval
- OpenAPI spec review for REST endpoints
- GitHub App installation flow UX
- API key management UI
- Repository selection and status polling

**External Services Setup**:
- GitHub App registration (manual, one-time)
- Supabase project creation (staging + prod)
- Fly.io app creation (staging + prod)
- Stripe integration (frontend-owned, backend aware of tiers)

---

**Working Document**: This vision will evolve as we implement. Update this file when scope, architecture, or infrastructure decisions change.
