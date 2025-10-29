# KotaDB Roadmap

**Last Updated**: 2025-10-29
**Current Phase**: Phase 1 (SaaS Platform MVP)
**Overall Progress**: ~78-80% complete

Quick-reference guide to KotaDB's development priorities and strategic direction. For detailed analysis and implementation plans, see the vision documentation.

## Navigation

**Practical → Aspirational:**
- [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) - What's working, what's missing, gap analysis with evidence
- [ROADMAP.md](docs/vision/ROADMAP.md) - Epic completion status and MVP blockers
- [ROADMAP_INVESTIGATION_FINDINGS.md](ROADMAP_INVESTIGATION_FINDINGS.md) - Deep investigation report (2025-10-29) with subagent analysis
- [VISION.md](docs/vision/VISION.md) - Long-term vision and architectural decisions
- [Epic Files](docs/vision/) - Detailed implementation plans (epic-1 through epic-14+)

## Current Status

**Foundation Complete** (~78-80% overall):
- ✅ Database infrastructure (PostgreSQL/Supabase, RLS, 10 tables)
- ✅ Authentication & rate limiting (API keys, tier-based limits, JWT support)
- ✅ MCP server (6 production tools: search, index, recent files, dependencies, ADW state, ADW workflows)
- ✅ AST-based code parsing (symbol extraction, reference tracking, dependency graphs with circular detection)
- ✅ Job queue infrastructure (pg-boss, worker pipeline, batch processing, 3 concurrent workers)
- ✅ GitHub webhooks (auto-indexing on push, HMAC verification, installation tokens)
- ✅ Web frontend (7 pages, GitHub OAuth, Vercel deployment)
- ✅ Stripe billing (3-tier pricing, subscription management, webhook handlers)
- ✅ Testing infrastructure (42 test files, Docker Compose, antimocking, Playwright helpers)
- ✅ CI/CD (GitHub Actions, pre-commit hooks, migration validation, ADW metrics)

**Recent Progress** (2025-10-21 to 2025-10-29):
- ✅ Batch processing for large repository indexing (#313)
- ✅ Dev-mode session endpoint for agent testing (#317)
- ✅ Playwright authentication helpers for ADW workflows (#318)
- ✅ ADW integration examples (#319)
- ✅ Web frontend deployed to Vercel with analytics
- ✅ GitHub webhook auto-indexing operational
- ✅ pg-boss job queue infrastructure complete
- ✅ Test account session token generation (#316)

**Remaining Gaps for MVP**:
- 🟡 Job queue integration - POST /index uses `queueMicrotask()` instead of pg-boss (~4 hours to fix)
- 🟡 Reference & dependency extraction - Worker pipeline steps 5-6 deferred (~12 hours for two-phase storage)
- 🟡 Billing bugs - #320 (payment redirect), #327 (JWT middleware) blocking frontend checkout (~14 hours)
- 🟡 GitHub private repos - Installation tokens exist, Git integration needed (~8 hours)

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
| Epic 4 | Job Queue | 65-70% 🟡 | POST /index pg-boss integration, reference extraction | [epic-4-job-queue.md](docs/vision/epic-4-job-queue.md) |
| Epic 6 | REST API | 75% 🟡 | Repository management endpoints, pagination | [epic-6-rest-api.md](docs/vision/epic-6-rest-api.md) |
| Epic 12 | GitHub Integration | 85% 🟡 | Installation events, private repo Git ops | New epic (webhooks, auto-indexing) |

**Operations & Deployment**:

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 8 | Monitoring | 20% 🟡 | Structured logging, metrics dashboard | [epic-8-monitoring.md](docs/vision/epic-8-monitoring.md) |
| Epic 9 | CI/CD & Deployment | 70% 🟡 | Fly.io API deployment automation | [epic-9-cicd-deployment.md](docs/vision/epic-9-cicd-deployment.md) |

**Frontend & Billing** (New Epics):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 11 | Web Frontend | 95% 🟢 | Production deployment, E2E tests | New epic (7 pages, Vercel) |
| Epic 13 | Billing & Monetization | 60-70% 🟡 | Bugs #320, #327 blocking checkout | New epic (Stripe integration) |

**Automation** (New Epic):

| Epic | Focus | Status | Gaps | Details |
|------|-------|--------|------|---------|
| Epic 14 | ADW Advanced Features | 75-85% 🟢 | Queue monitoring dashboard | New epic (auto-merge, observability, orchestrator) |

**Immediate Priorities** (Next 2-4 Weeks):

1. **Fix POST /index pg-boss integration** (~4 hours) - Epic 4 gap
2. **Fix Bugs #320 and #327** (~14 hours) - Epic 13 blocker
3. **Implement two-phase reference extraction** (~12 hours) - Epic 4 gap
4. **GitHub private repo Git integration** (~8 hours) - Epic 12 gap
5. **Production Vercel deployment** (~3 hours) - Epic 11 gap

**Dependencies Resolved**: Epic 3 ✅ → Epic 4 🟡 → Epic 12 🟡 → MVP launch readiness

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
**ADW**: 3-phase automation (plan → build → review), auto-merge, observability, Beads integration ✅

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

**Epic 11: Web Frontend Application** (95% complete)
- 7 pages: landing, login, dashboard, pricing, search, repository-index, files
- GitHub OAuth via Supabase Auth
- Stripe checkout integration (blocked by bugs)
- Deployed to Vercel with analytics
- **Gaps**: Production deployment, E2E tests, bugs #320 and #327

**Epic 12: GitHub Integration** (85% complete)
- Webhook receiver with HMAC-SHA256 verification
- Auto-indexing on push events
- GitHub App authentication and installation tokens
- **Gaps**: Installation event handler, private repo Git integration

**Epic 13: Billing & Monetization** (60-70% complete)
- 3-tier pricing: Free ($0), Solo ($29.99), Team ($49.99)
- Stripe customer management and subscription tracking
- Webhook handlers for subscription lifecycle
- **Gaps**: Bugs #320 and #327 blocking checkout flow

**Epic 14: ADW Advanced Features** (75-85% complete)
- Auto-merge system with CI validation (95%)
- Observability & metrics with daily reporting (85%)
- Orchestrator slash command with state persistence (95%)
- Beads integration (30x faster than GitHub API) (80%)
- Home server trigger with Tailscale (90%)
- API-driven phase tasks via MCP (85%)
- **Gaps**: Queue monitoring dashboard

---

**For Agents**: Read [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) for gap analysis, epic files for implementation details, [VISION.md](docs/vision/VISION.md) for strategic context. See [ROADMAP_INVESTIGATION_FINDINGS.md](ROADMAP_INVESTIGATION_FINDINGS.md) for detailed investigation report (2025-10-29).
