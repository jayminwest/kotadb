# KotaDB Roadmap

**Last Updated**: 2025-11-10
**Current Phase**: Phase 1 (SaaS Platform MVP)
**Overall Progress**: ~90-92% complete

Quick-reference guide to KotaDB's development priorities and strategic direction. For detailed analysis and implementation plans, see the vision documentation.

## Navigation

**Practical → Aspirational:**
- [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) - What's working, what's missing, gap analysis with evidence
- [ROADMAP.md](docs/vision/ROADMAP.md) - Epic completion status and MVP blockers
- [VISION.md](docs/vision/VISION.md) - Long-term vision and architectural decisions
- [Epic Files](docs/vision/) - Detailed implementation plans (epic-1 through epic-14+)

## Current Status

**Foundation Complete** (~90-92% overall):
- ✅ Database infrastructure (PostgreSQL/Supabase, RLS, 10 tables)
- ✅ Authentication & rate limiting (API keys, dual hourly+daily limits, JWT + GitHub OAuth)
- ✅ MCP server (6 production tools: search, index, recent files, dependencies, impact analysis, spec validation)
- ✅ AST-based code parsing (symbol extraction, reference tracking, dependency graphs with circular detection)
- ✅ Job queue infrastructure (pg-boss, worker pipeline, two-pass storage, batch processing, 3 concurrent workers)
- ✅ GitHub webhooks (auto-indexing operational, HMAC-SHA256 verification, installation tokens with caching)
- ✅ Web frontend (7 pages, GitHub OAuth, Vercel deployment, liquid glass design, SF Pro typography)
- ✅ Stripe billing (3-tier pricing, subscription management, 4 webhook handlers, bugs #320/#327 FIXED)
- ✅ Testing infrastructure (50+ test files, Docker Compose, antimocking, Playwright helpers, dev-mode sessions)
- ✅ CI/CD (GitHub Actions, pre-commit hooks, migration validation, ADW daily metrics)
- ✅ ADW automation (auto-merge at 90%, observability, orchestrator, home server, API-driven phase tasks)

**Recent Progress** (Since 2025-10-29):
- ✅ **MVP LAUNCH** - Production release Nov 9 (PRs #414, #415)
- ✅ Rate limits increased 10x with daily quotas - Free: 1k/hr+5k/day, Solo: 5k/hr+25k/day, Team: 25k/hr+100k/day (#423, PR #426)
- ✅ Landing page redesign with SF Pro typography and liquid glass styling (#420, PR #424)
- ✅ Staging deployment crash fixed - Docker build context for shared types (#428, PR #429)
- ✅ API key lifecycle management - revocation tracking with `revoked_at` timestamp
- ✅ Indexer two-pass storage - Symbol extraction with database-driven ID resolution (PRs #377, #379, #382, #383)
- ✅ Stripe webhook maturity - 4 event handlers with comprehensive logging (PRs #406, #408)
- ✅ MCP structured analysis tools - Impact analysis and spec validation (#404)
- ✅ Web frontend simplification - Archived search/indexing/files pages (#399, PR #401)
- ✅ Queue observability - Real-time job status polling UI (#365, #392, PR #393)
- ✅ GitHub app authentication - Enhanced logging and error handling (#366, PR #367)

**Post-MVP Enhancements**:
- 🟡 Enhanced monitoring - Structured logging, metrics dashboard, alerting (~16 hours)
- 🟡 Repository management UI - Web interface for repository CRUD operations (~12 hours)
- 🟡 Queue monitoring dashboard - Web UI for job queue metrics and management (~12 hours)
- 🟡 E2E test expansion - Comprehensive test coverage for critical user flows (~16 hours)
- 🟡 Performance optimization - Caching, incremental indexing, query optimization (~24 hours)

See [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) for detailed gap analysis.

## Epic Status Overview

**Core Infrastructure** (Complete):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 1 | Database Foundation | 95% ✅ | Index optimization | [epic-1-database-foundation.md](docs/vision/epic-1-database-foundation.md) |
| Epic 2 | Authentication | 90% ✅ | Organization management | [epic-2-authentication.md](docs/vision/epic-2-authentication.md) |
| Epic 3 | Code Parsing | 70% ✅ | Type relationships, docstrings | [epic-3-code-parsing.md](docs/vision/epic-3-code-parsing.md) |
| Epic 7 | MCP Server | 85% ✅ | find_references tool | [epic-7-mcp-server.md](docs/vision/epic-7-mcp-server.md) |
| Epic 10 | Testing | 90% ✅ | E2E tests, performance benchmarks | [epic-10-testing.md](docs/vision/epic-10-testing.md) |

**Backend Services** (Near Complete):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 4 | Job Queue | 92% ✅ | Worker process lifecycle optimization | [epic-4-job-queue.md](docs/vision/epic-4-job-queue.md) |
| Epic 6 | REST API | 92% ✅ | Repository management endpoints, pagination | [epic-6-rest-api.md](docs/vision/epic-6-rest-api.md) |
| Epic 12 | GitHub Integration | 95% ✅ | Installation events, additional webhook types | New epic (webhooks operational) |

**Operations & Deployment**:

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 8 | Monitoring | 25% 🟡 | Structured logging, metrics dashboard, alerting | [epic-8-monitoring.md](docs/vision/epic-8-monitoring.md) |
| Epic 9 | CI/CD & Deployment | 75% 🟡 | Production Fly.io deployment automation | [epic-9-cicd-deployment.md](docs/vision/epic-9-cicd-deployment.md) |

**Frontend & Billing** (New Epics):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 11 | Web Frontend | 90% ✅ | E2E test coverage expansion | New epic (7 pages, Vercel, liquid glass) |
| Epic 13 | Billing & Monetization | 85% ✅ | Invoice history UI, per-seat pricing | New epic (Stripe integration, bugs FIXED) |

**Automation** (New Epic):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 14 | ADW Advanced Features | 82% ✅ | Agent-level metrics, automatic retry, dashboards | New epic (auto-merge, observability, orchestrator) |

**Immediate Priorities** (Post-MVP - Next 2-4 Weeks):

1. **Enhanced monitoring & observability** (~16 hours) - Epic 8 - Structured logging, metrics dashboard, alerting
2. **Production deployment automation** (~12 hours) - Epic 9 - Fly.io production app setup and CI integration
3. **Queue monitoring web dashboard** (~12 hours) - Epic 14 - Real-time job queue metrics and management UI
4. **E2E test coverage expansion** (~16 hours) - Epic 11 - OAuth → Checkout → Subscription → Dashboard flows
5. **Repository management UI** (~12 hours) - Epic 6 - Web interface for repository CRUD operations
6. **Performance optimization** (~24 hours) - Multiple epics - Caching, incremental indexing, query tuning
7. **ADW agent-level metrics** (~8 hours) - Epic 14 - Per-agent success tracking and analysis

**Progress Summary**: 90-92% complete, up from 88-90%. **MVP LAUNCHED Nov 9, 2025** (PRs #414, #415). Post-MVP enhancements include 10x rate limit increases, landing page redesign, and continued infrastructure hardening. 50+ test files with antimocking. All critical user flows operational: authentication, subscription checkout, API key management, repository indexing, code search.

**Dependencies Resolved**: Epic 3 ✅ → Epic 4 ✅ → Epic 12 ✅ → Epic 11 ✅ → Epic 13 ✅ → **MVP LAUNCHED**

## Medium-Term Goals

**Phase 2 (3-6 Months)** - Expansion:
- Multi-language support (Python, Go, Rust)
- Advanced semantic intelligence (type hierarchy, impact analysis)
- Frontend enhancements (analytics dashboard, mobile responsiveness, Liquid Glass design #281)
- Performance optimizations (caching, incremental indexing, query optimization)
- Enhanced monitoring (structured logging, metrics dashboard, alerting)

## Long-Term Vision

**Phase 3 (6+ Months)** - Strategic innovation:
- Real-time collaboration (multi-agent sync, live updates)
- Self-hosted & enterprise (on-premise, SSO, air-gapped)
- Advanced AI features (embeddings, pattern learning)
- Ecosystem integrations (IDE extensions, CI/CD, issue trackers)

See [VISION.md](docs/vision/VISION.md) for complete strategic vision.

## Key Architectural Decisions

**Database**: PostgreSQL via Supabase (RLS for multi-tenancy, pg-boss for job queue) ✅
**MCP**: HTTP JSON-RPC transport (6 production tools: search, index, recent files, dependencies, ADW state, ADW workflows) ✅
**Auth**: API key + JWT system with tier-based rate limiting (free/solo/team), GitHub OAuth via Supabase Auth ✅
**Billing**: Stripe integration with 3-tier pricing ($0/$29.99/$49.99), webhook-based subscription sync ✅
**Testing**: Antimocking philosophy (real Supabase Local, Docker Compose, 42 test files) ✅
**Deployment**: Fly.io (API backend), Vercel (web frontend), Docker Compose (local dev) ✅
**ADW**: 3-phase automation (plan → build → review), auto-merge, observability ✅

See [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) "Key Decisions" section for rationale and trade-offs.

## External Dependencies

**Manual Setup Required**:
- [x] Supabase projects (staging + prod) ✅
- [x] Stripe integration (backend complete, test mode active) ✅
- [x] Vercel deployment (web frontend) ✅
- [ ] GitHub App registration (permissions, webhook secrets) - 🟡 Partial (code ready, app registration pending)
- [ ] Fly.io apps (kotadb-staging, kotadb-prod) - 🟡 Partial (kotadb-staging exists, prod pending)
- [ ] Production Stripe keys (currently using test mode)

**Frontend Coordination** (Mostly Complete):
- [x] Supabase schema review ✅
- [x] API key management UI ✅
- [x] GitHub OAuth integration ✅
- [x] Pricing page with Stripe checkout ✅
- [ ] OpenAPI spec validation - 🟡 In progress
- [ ] GitHub App installation flow UX - Pending app registration

## Success Metrics

**Infrastructure** (Targets):
- Latency: p95 < 200ms (not yet measured)
- Reliability: 99.5% uptime for MCP endpoints (monitoring pending)
- Test Coverage: >90% for core features ✅ **Achieved** (42 test files)

**Features** (Targets):
- Accuracy: 95%+ precision on dependency analysis (validation pending)
- Dependency Graph: Circular detection operational ✅ **Achieved**
- MCP Tools: 4+ production tools ✅ **Exceeded** (6 tools)
- Auto-indexing: Webhook-triggered indexing ✅ **Achieved**

**Automation** (Targets):
- Autonomy: 80%+ ADW PR success rate (metrics exist, validation pending)
- ADW Observability: Daily metrics reports ✅ **Achieved**
- Auto-merge: >90% success rate (implemented, metrics pending)

**User Experience** (New):
- Frontend Pages: 7 pages operational ✅ **Achieved**
- Authentication: GitHub OAuth + JWT ✅ **Achieved**
- Subscription Tiers: 3-tier pricing ✅ **Achieved** (blocked by bugs #320, #327)

---

## New Epics Summary

**Epic 11: Web Frontend Application** (90% complete)
- 7 pages: landing (redesigned with liquid glass), login, dashboard, pricing, MCP, logout, OAuth callback
- GitHub OAuth via Supabase Auth
- Stripe checkout integration (fully operational)
- SF Pro typography system across all pages
- Liquid glass design effects (Navigation, Dashboard, Pricing, MCP pages)
- Deployed to Vercel with analytics and Speed Insights
- Dev-mode session endpoint for Playwright testing (#317)
- Authentication helpers for agent workflows (#318)
- **Gaps**: E2E test coverage expansion (only 1 test file), invoice history UI

**Epic 12: GitHub Integration** (95% complete)
- Webhook receiver with HMAC-SHA256 timing-safe verification (operational)
- Auto-indexing on push events (processing webhooks successfully)
- GitHub App authentication with installation token caching (55-min TTL, auto-eviction)
- Private repo support fully implemented (installation lookup, authenticated cloning)
- 1,263 lines of tests (40+ unit, 13+ integration) with antimocking
- Test-to-code ratio: 1.21:1 (excellent)
- **Gaps**: Installation/PR webhook events (push only), cache configurability

**Epic 13: Billing & Monetization** (85% complete)
- 3-tier pricing: Free ($0), Solo ($29.99), Team ($49.99)
- Stripe customer management and subscription tracking
- Webhook handlers for subscription lifecycle (invoice.paid, subscription.updated, subscription.deleted)
- **Bugs FIXED**: #320 (payment redirect) and #327 (JWT middleware) merged and operational
- **Gaps**: Mount webhook endpoint in routes.ts, expand test coverage, implement missing webhook events

**Epic 14: ADW Advanced Features** (82% complete)
- Auto-merge system with CI validation (90% - PR #312, analytics integrated)
- Observability & metrics with daily CI reporting (95% - analyze_logs.py, 560 lines)
- Orchestrator slash command with state persistence (100% - 1,500+ line spec)
- Home server trigger with Tailscale (90% - 700+ lines)
- API-driven phase tasks via MCP (85% - 400 lines each module)
- Logging standards enforcement (100% - PR #310)
- **Gaps**: Agent-level metrics, automatic retry on transient errors, real-time dashboards, task prioritization

---

**For Agents**: Read [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) for gap analysis, epic files for implementation details, [VISION.md](docs/vision/VISION.md) for strategic context.
