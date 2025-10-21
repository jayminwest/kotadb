# KotaDB Current State & Gap Analysis

**Last Updated**: 2025-10-20
**Overall Progress**: ~60% complete
**Status**: Foundation strong, critical gaps block MVP

## Executive Summary

KotaDB has successfully implemented **database infrastructure**, **authentication**, **MCP server**, and **testing harness**. The codebase is production-ready for what exists, but **three critical gaps** block the SaaS platform MVP:

1. **AST-based code parsing** (Epic 3) - Currently using regex, need TypeScript parser
2. **Job queue for async indexing** (Epic 4) - All indexing blocks API requests
3. **GitHub integration** (Epic 5) - No auto-indexing on push events

**Good News**: The foundation is solid. Database schema, auth middleware, MCP server, and testing infrastructure are battle-tested and working well.

**Reality Check**: We're 60% done with infrastructure but 30% done with user-facing features. The remaining 40% is high-leverage work that unlocks the product's core value proposition.

---

## What's Working (What We've Built)

### ✅ Database Foundation (Epic 1: 95% complete)
**Reality**: Supabase schema is robust, migrations work, RLS is enforced

**Evidence**:
- 10 tables: `users`, `api_keys`, `organizations`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`, `rate_limit_counters`
- Row Level Security (RLS) policies isolate multi-tenant data
- Migration system works (`app/src/db/migrations/` synced to `app/supabase/migrations/`)
- `increment_rate_limit()` database function for atomic counter updates
- Integration tests use real Supabase Local (antimocking compliance)

**Files**:
- `app/src/db/client.ts` - Supabase client initialization
- `app/src/db/migrations/` - Up/down migrations (6 files)
- `app/supabase/migrations/` - Copy for Supabase CLI

**Remaining Work**:
- Index optimization for hot query paths (minor)
- Migration sync validation in CI (minor)

---

### ✅ Authentication & Rate Limiting (Epic 2: 90% complete)
**Reality**: API keys work, tier-based rate limiting enforced, multi-tenancy ready

**Evidence**:
- API key generation with bcrypt hashing (`kota_<env>_<random>` format)
- Authentication middleware validates keys and extracts user context
- Rate limiting: free (100/hr), solo (1000/hr), team (10000/hr)
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- In-memory caching for API key lookups (reduces database load)
- Test coverage: 317 tests passing, including auth/rate limit integration tests

**Files**:
- `app/src/auth/middleware.ts` - Authentication + rate limit enforcement
- `app/src/auth/validator.ts` - API key validation
- `app/src/auth/keys.ts` - Key generation
- `app/src/auth/rate-limit.ts` - Tier-based rate limiting logic
- `app/src/auth/cache.ts` - In-memory caching

**Remaining Work**:
- Organization management endpoints (team tier multi-tenancy) - medium priority
- Key rotation/revocation workflows - future enhancement

---

### ✅ MCP Server (Epic 7: 95% complete)
**Reality**: HTTP JSON-RPC implementation complete, 3 core tools working, production-ready

**Evidence**:
- Using official `@modelcontextprotocol/sdk` (v1.20+)
- HTTP transport via Express + `StreamableHTTPServerTransport` (not SSE - pragmatic decision)
- Three tools: `search_code`, `index_repository`, `list_recent_files`
- Per-request server isolation (stateless design)
- Rate limit headers set before SDK transport handles request
- 122/132 MCP tests passing (92.4% coverage)
- Integration guide: `docs/guides/mcp-claude-code-integration.md`

**Technical Decision Note**:
Vision document proposed SSE streaming, but implementation uses HTTP JSON-RPC for simplicity and better error handling. This matches real-world MCP usage patterns and reduces operational complexity.

**Files**:
- `app/src/mcp/server.ts` - MCP server factory
- `app/src/mcp/tools.ts` - Tool execution logic
- `app/tests/mcp/` - Comprehensive test suite (9 files, 100+ test cases)

**Remaining Work**:
- `search_dependencies` tool (blocked by Epic 3 AST parsing)
- `find_references` tool (blocked by Epic 3 symbol/reference tracking)
- Advanced tools: `analyze_impact`, `get_type_hierarchy` (future)

---

### ✅ REST API (Epic 6: 70% complete)
**Reality**: Core endpoints working, repository management incomplete

**Evidence**:
- `/health` - Database health check (returns 200 OK if DB connected)
- `/index` (POST) - Triggers repository indexing (currently synchronous, blocks until complete)
- `/search` (GET) - Full-text search across indexed files
- `/files/recent` (GET) - Recently indexed files
- `/validate-output` (POST) - Schema validation for slash commands
- Authentication middleware on all protected endpoints
- Rate limiting enforced on all authenticated endpoints

**Files**:
- `app/src/api/routes.ts` - Express app factory with middleware and route handlers
- `app/src/api/queries.ts` - Database query functions

**Remaining Work**:
- Repository management endpoints (list, add, remove, configure repos)
- Job status polling endpoints (for async indexing, blocked by Epic 4)
- Organization management (team tier multi-tenancy)
- Pagination for large result sets
- Sync OpenAPI spec (`docs/openapi.yaml`) with implementation

---

### ✅ Testing Infrastructure (Epic 10: 85% complete)
**Reality**: Strong test coverage, antimocking philosophy enforced, CI pipelines working

**Evidence**:
- 317 tests passing across application (TypeScript) and automation (Python) layers
- Integration tests use real Supabase Local (no mocks)
- MCP regression suite (122 tests, 9 files)
- GitHub Actions CI:
  - Application CI: lint, typecheck, full test suite against Supabase Docker
  - Automation CI: Python syntax checks, pytest suite
- Test helpers: `app/tests/helpers/` (db, auth, MCP utilities)
- Test fixtures: `app/tests/fixtures/mcp/sample-repository/`

**Files**:
- `app/tests/` - Test suite (27 test files)
- `.github/workflows/app-ci.yml` - Application CI pipeline
- `.github/workflows/automation-ci.yml` - Automation CI pipeline
- `app/scripts/setup-test-db.sh` - Supabase Local lifecycle management

**Remaining Work**:
- E2E tests (full indexing pipeline end-to-end)
- Performance regression tests (query latency benchmarks)
- Contract tests for OpenAPI spec validation
- Edge case coverage (concurrent requests, rate limit boundary conditions)

---

### ✅ CI/CD Infrastructure (Epic 9: 40% complete)
**Reality**: CI pipelines robust, Fly.io deployment not implemented

**Evidence**:
- GitHub Actions workflows running on every PR
- Docker Compose for local development
- Pre-commit hooks (typecheck + lint)
- Migration sync validation
- Supabase Local integration in CI (isolated project names prevent port conflicts)

**Files**:
- `.github/workflows/app-ci.yml`
- `.github/workflows/automation-ci.yml`
- `app/scripts/dev-start.sh` - Local development automation
- `app/.husky/` - Pre-commit hooks

**Remaining Work**:
- Fly.io app creation (`kotadb-staging`, `kotadb-prod`)
- Deployment automation (develop → staging, main → production)
- Environment-specific `fly.toml` configurations
- Secrets management scripts (`scripts/sync-secrets-*.sh`)
- Automated database migrations on deploy
- Rollback procedures

---

### 🟡 Monitoring & Operations (Epic 8: 15% complete)
**Reality**: Basic health checks exist, comprehensive observability missing

**Evidence**:
- `/health` endpoint with database connection check
- Basic error logging in API handlers

**Files**:
- `app/src/api/routes.ts` (health endpoint)

**Remaining Work**:
- JSON-formatted structured logging with correlation IDs (`request_id`, `user_id`, `job_id`)
- Request/response logging middleware
- Slow query detection
- Fly.io metrics dashboard setup (pending deployment)
- Alert configuration (downtime, error rate thresholds)
- Sentry integration for error tracking (optional, future)

---

## What's Blocking MVP (Critical Gaps)

### 🔴 Epic 3: Enhanced Code Parsing (30% complete) **[BLOCKER]**
**Gap**: AST-based parsing not implemented, currently using regex only

**Current State**:
- File discovery works (walks project tree, filters by extension)
- Regex-based dependency extraction (brittle, fails on complex syntax)
- Support for `.ts`, `.tsx`, `.js`, `.jsx`, `.json` files
- Gitignore compliance (skips `.git`, `node_modules`, `dist`)

**Critical Missing Features**:
- AST parsing with `@typescript-eslint/parser` (robust, production-grade)
- Symbol extraction (functions, classes, exports) with positions (file, line, column)
- Reference tracking (imports, calls, property accesses) with call sites
- Type relationship extraction (interfaces, type aliases, generics)
- Docstring/comment extraction (JSDoc, TSDoc)

**Why This Blocks MVP**:
Without AST parsing, MCP tools can only do basic text search. The "killer feature" (dependency analysis, impact assessment, "what breaks if I change X") is impossible. Users would get better results from `grep`.

**Impact on Product**:
- `search_dependencies` tool unusable (no dependency graph)
- `find_references` tool unusable (no symbol/reference tracking)
- Value proposition collapses to "text search with auth" (not differentiated)

**Estimated Effort**: 2-3 weeks

**Next Steps**:
1. Add `@typescript-eslint/parser` and `@typescript-eslint/types` dependencies
2. Implement `app/src/indexer/ast-parser.ts` with symbol visitor pattern
3. Store symbols in `symbols` table with positions
4. Store references in `references` table with call sites
5. Build dependency graph in `dependencies` table (file→file, symbol→symbol edges)
6. Integration tests with real TypeScript codebases

**Files to Create**:
- `app/src/indexer/ast-parser.ts` - AST visitor for symbol/reference extraction
- `app/src/indexer/dependency-graph.ts` - Dependency graph builder
- `app/tests/indexer/ast-parser.test.ts` - AST parsing tests

---

### 🔴 Epic 4: Job Queue & Background Processing (0% complete) **[BLOCKER]**
**Gap**: All indexing runs synchronously, blocking API requests

**Current State**:
- `/index` endpoint blocks until indexing completes (30s+ for large repos)
- No async workers for indexing
- No retry logic for failed indexing
- No job status tracking for frontend

**Critical Missing Features**:
- pg-boss queue setup (Postgres-backed, no external service needed)
- Worker processes for async indexing
- Retry logic with exponential backoff
- Dead letter queue for failed jobs
- Job status updates (pending → in_progress → completed/failed)
- Frontend polling endpoints for job status

**Why This Blocks MVP**:
Users trigger indexing via API and get timeouts on large repos. No webhook-triggered auto-indexing possible. Frontend can't show indexing progress. Single-threaded indexing can't scale.

**Impact on Product**:
- Poor UX (users wait 30s+ for API responses)
- No webhook integration possible (Epic 5 depends on this)
- Can't index multiple repos concurrently
- No resilience (if indexing fails, no retry)

**Estimated Effort**: 1-2 weeks

**Next Steps**:
1. Install `pg-boss` package
2. Create `app/src/queue/client.ts` (queue initialization)
3. Create `app/src/queue/workers.ts` (job handlers for indexing)
4. Update `/index` endpoint to enqueue job instead of blocking
5. Implement worker pools with concurrency limits
6. Add job status endpoints for frontend polling
7. Integration tests with real Supabase queue

**Files to Create**:
- `app/src/queue/client.ts` - pg-boss client initialization
- `app/src/queue/workers.ts` - Job handlers (indexing, webhook processing)
- `app/src/api/jobs.ts` - Job status endpoints
- `app/tests/queue/` - Queue integration tests

---

### 🔴 Epic 5: GitHub Integration (0% complete) **[BLOCKER]**
**Gap**: No GitHub App, no webhooks, no auto-indexing on push events

**Current State**:
- Users must manually trigger indexing via API
- No automatic re-indexing on code changes
- No access to private repositories (using public git clone currently)

**Critical Missing Features**:
- GitHub App registration (manual setup, one-time)
- Installation token generation for private repo access
- Webhook receiver (`POST /webhooks/github`)
- Webhook signature verification (HMAC-SHA256)
- Auto-indexing on push events (queues job via Epic 4)
- Frontend integration for app installation flow

**Why This Blocks MVP**:
Core value proposition is "always up-to-date code intelligence." Without webhooks, indexes go stale immediately after first push. Users must manually re-index after every change. Private repos are inaccessible.

**Impact on Product**:
- Stale indexes (context becomes outdated quickly)
- No private repo support (blocks majority of real-world use cases)
- Manual reindexing workflow (terrible UX)
- No competitive advantage over local file search

**Estimated Effort**: 2 weeks

**Next Steps**:
1. Register GitHub App (permissions: contents:read, webhooks:write)
2. Store `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` as secrets
3. Implement `app/src/github/app.ts` (installation token generation)
4. Implement `app/src/api/webhooks.ts` (webhook receiver)
5. Queue indexing jobs on push events (integrates with Epic 4)
6. Frontend: installation flow UI (out of scope for this repo, coordination needed)
7. Integration tests with mock GitHub webhook payloads

**Files to Create**:
- `app/src/github/app.ts` - GitHub App client (installation tokens)
- `app/src/api/webhooks.ts` - Webhook receiver and signature verification
- `app/tests/github/` - GitHub integration tests
- `app/tests/fixtures/github-webhooks/` - Mock webhook payloads

---

## Vision vs. Reality Comparison

| Component | Vision (VISION.md) | Reality (Current State) | Status |
|-----------|-------------------|-------------------------|--------|
| **Database** | PostgreSQL via Supabase, RLS for multi-tenancy | ✅ Implemented exactly as planned | Complete |
| **Auth** | API keys with tier-based rate limiting | ✅ Implemented exactly as planned | Complete |
| **MCP Transport** | SSE streaming | ⚠️ HTTP JSON-RPC (pragmatic decision) | Complete (different approach) |
| **MCP Tools** | 3 MVP tools: search_code, find_references, get_dependencies | 🟡 1 tool working (search_code), 2 blocked by AST parsing | Partial |
| **Code Parsing** | AST-based with @typescript-eslint/parser | 🔴 Regex-based (brittle, incomplete) | Critical gap |
| **Job Queue** | pg-boss for async indexing | 🔴 Not implemented (all indexing synchronous) | Critical gap |
| **GitHub Integration** | GitHub App with webhooks | 🔴 Not implemented (manual indexing only) | Critical gap |
| **REST API** | Full repository management + job status | 🟡 Core endpoints only, no repo management | Partial |
| **Monitoring** | Structured logging + Fly.io metrics | 🟡 Basic health checks only | Partial |
| **Deployment** | Fly.io with automated CI/CD | 🟡 CI pipelines only, no Fly.io deployment | Partial |
| **Testing** | 70% coverage with integration tests | ✅ 85% coverage, antimocking enforced | Exceeds expectations |

**Key Insights**:
- **Foundation is stronger than expected**: Database, auth, MCP server, testing exceed vision goals
- **Feature completeness lags**: AST parsing, job queue, GitHub integration not started
- **Pragmatic technical decisions**: HTTP JSON-RPC instead of SSE (simpler, more robust)
- **Strong engineering culture**: Antimocking philosophy, real integration tests, CI discipline

---

## Actionable Next Steps for Contributors

### Immediate Priorities (Sprint 1-2, Weeks 1-4)

#### 1. Implement AST-based Code Parsing (Epic 3)
**Owner**: Needs assignment
**Effort**: 2-3 weeks
**Dependencies**: None (foundation complete)

**Tasks**:
- [ ] Add `@typescript-eslint/parser` and `@typescript-eslint/types` dependencies
- [ ] Implement `app/src/indexer/ast-parser.ts` (symbol visitor pattern)
- [ ] Store symbols in `symbols` table (file, line, column, name, kind)
- [ ] Store references in `references` table (from_file, to_symbol, line, column)
- [ ] Build dependency graph in `dependencies` table (source_file → target_file edges)
- [ ] Integration tests with real TypeScript projects
- [ ] Update `search_dependencies` MCP tool to use dependency graph

**Success Criteria**:
- AST parsing extracts functions, classes, exports with positions
- Dependency graph query: "what imports this function" returns accurate results
- `search_dependencies` MCP tool returns transitive dependencies

---

#### 2. Implement Job Queue with pg-boss (Epic 4)
**Owner**: Needs assignment
**Effort**: 1-2 weeks
**Dependencies**: None (database ready)

**Tasks**:
- [ ] Install `pg-boss` package
- [ ] Create `app/src/queue/client.ts` (queue initialization using Supabase connection)
- [ ] Create `app/src/queue/workers.ts` (indexing job handler)
- [ ] Update `/index` endpoint to enqueue job instead of blocking
- [ ] Implement retry logic with exponential backoff (3 retries max)
- [ ] Add job status endpoints: `GET /jobs/:id` (poll status), `GET /jobs` (list jobs)
- [ ] Integration tests with real pg-boss queue
- [ ] Update frontend integration guide (job status polling)

**Success Criteria**:
- `/index` endpoint returns immediately with job ID
- Indexing runs in background worker
- Failed jobs retry automatically (max 3 attempts)
- Frontend can poll job status and show progress

---

#### 3. Implement GitHub Integration (Epic 5)
**Owner**: Needs assignment
**Effort**: 2 weeks
**Dependencies**: Epic 4 (job queue)

**Tasks**:
- [ ] Register GitHub App (permissions: contents:read, webhooks:write)
- [ ] Store `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` as environment secrets
- [ ] Implement `app/src/github/app.ts` (generate installation tokens using Octokit)
- [ ] Implement `app/src/api/webhooks.ts` (webhook receiver, signature verification)
- [ ] Queue indexing job on `push` events (use Epic 4 queue)
- [ ] Store `installation_id` in `repositories` table
- [ ] Integration tests with mock GitHub webhook payloads
- [ ] Documentation: GitHub App setup guide for self-hosted deployments

**Success Criteria**:
- GitHub App installation flow works (manual test with real GitHub account)
- Push to tracked repo triggers automatic re-indexing
- Webhook signature verification prevents unauthorized requests
- Private repos accessible via installation tokens

---

### Follow-Up Work (Sprint 3+, Weeks 5-10)

#### 4. Complete REST API (Epic 6)
**Tasks**:
- Repository management endpoints (list, add, remove, configure)
- Organization management (team tier multi-tenancy)
- Pagination for large result sets
- Sync OpenAPI spec with implementation

#### 5. Fly.io Deployment (Epic 9)
**Tasks**:
- Create `kotadb-staging` and `kotadb-prod` apps
- Environment-specific `fly.toml` configurations
- Deployment automation (GitHub Actions → Fly.io)
- Secrets management scripts
- Automated database migrations on deploy

#### 6. Observability Improvements (Epic 8)
**Tasks**:
- JSON-formatted structured logging with correlation IDs
- Request/response logging middleware
- Fly.io metrics dashboard setup
- Alert configuration (downtime, error rate thresholds)

---

## Resources for New Contributors

### Documentation
- **Architecture Overview**: `CLAUDE.md` (comprehensive project guide)
- **Testing Setup**: `docs/testing-setup.md` (antimocking philosophy, Supabase Local)
- **MCP Integration**: `docs/guides/mcp-claude-code-integration.md`
- **Automation Workflows**: `automation/adws/README.md` (ADW system)

### Key Files
- **Database**: `app/src/db/client.ts`, `app/src/db/migrations/`
- **Authentication**: `app/src/auth/middleware.ts`, `app/src/auth/keys.ts`
- **MCP Server**: `app/src/mcp/server.ts`, `app/src/mcp/tools.ts`
- **Indexing**: `app/src/indexer/parsers.ts`, `app/src/indexer/extractors.ts`
- **API**: `app/src/api/routes.ts`, `app/src/api/queries.ts`

### Development Workflow
1. **Local Setup**: Run `cd app && ./scripts/dev-start.sh` (starts Supabase + API server)
2. **Tests**: Run `cd app && bun test` (full suite against real Supabase Local)
3. **Validation**: Run `cd app && bun run lint && bunx tsc --noEmit`
4. **CI**: All PRs must pass `app-ci.yml` (lint, typecheck, test suite)

### Communication
- **GitHub Issues**: All work tracked via issues (see epic files for issue templates)
- **Pull Requests**: Follow conventional commit format, reference issue numbers
- **ADW Automation**: AI agents can pick up any issue where dependencies are satisfied

---

## Frequently Asked Questions

### Q: Why is the foundation so strong but features incomplete?
**A**: Engineering discipline prioritizes solid infrastructure over rushing features. Database, auth, and testing are production-ready because they're hard to change later. Features (AST parsing, job queue) are easier to add once foundation is stable.

### Q: Why use HTTP JSON-RPC instead of SSE for MCP?
**A**: Vision document proposed SSE, but implementation revealed HTTP is simpler, more debuggable, and matches real-world MCP usage patterns. SSE adds complexity (connection management, heartbeats, reconnection logic) without clear benefits for our use case.

### Q: What's the biggest risk to MVP timeline?
**A**: AST parsing complexity (Epic 3). TypeScript AST is notoriously complex (unions, generics, decorators). If this takes longer than 3 weeks, entire timeline slips. Mitigation: Start with basic symbol extraction (functions, classes), defer advanced features (generics, type inference).

### Q: Can I start Epic 4 (job queue) before Epic 3 (AST parsing) is done?
**A**: Yes! Epic 4 has no dependency on Epic 3. You can implement the job queue infrastructure using the current regex-based indexing, then swap in AST parsing later. This parallelizes work and de-risks the timeline.

### Q: What happens if we skip Epic 5 (GitHub integration) for MVP?
**A**: Product is usable but not competitive. Users can manually trigger indexing via API, but indexes go stale quickly. Private repos are inaccessible. This limits MVP to hobbyists and demo scenarios. Not recommended.

---

**Last Updated**: 2025-10-20
**Maintained By**: KotaDB core team
**Update Frequency**: Weekly during active development
