# KotaDB Roadmap

**Last Updated**: 2025-10-20
**Current Phase**: Phase 1 (SaaS Platform MVP)
**Overall Progress**: ~60% complete

Quick-reference guide to KotaDB's development priorities and strategic direction. For detailed analysis and implementation plans, see the vision documentation.

## Navigation

**Practical → Aspirational:**
- [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) - What's working, what's missing, gap analysis with evidence
- [ROADMAP.md](docs/vision/ROADMAP.md) - Epic completion status and MVP blockers
- [VISION.md](docs/vision/VISION.md) - Long-term vision and architectural decisions
- [Epic Files](docs/vision/) - Detailed implementation plans (epic-1 through epic-10)

## Current Status

**Foundation Complete** (~60% overall):
- ✅ Database infrastructure (PostgreSQL/Supabase, RLS, 10 tables)
- ✅ Authentication & rate limiting (API keys, tier-based limits)
- ✅ MCP server (4 production tools: search, index, recent files, dependencies)
- ✅ Testing infrastructure (133 tests, Docker Compose, antimocking)
- ✅ CI/CD (GitHub Actions, migration validation, ADW metrics)

**Critical Gaps Blocking MVP**:
- 🔴 AST-based parsing (Epic 3) - Currently using regex, need TypeScript parser
- 🔴 Job queue (Epic 4) - Async indexing required, all work currently blocks requests
- 🔴 GitHub integration (Epic 5) - No auto-indexing on push events

See [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) for detailed gap analysis.

## Immediate Priorities

**Phase 1 (Next 1-2 Months)** - Complete MVP blockers:

| Epic | Focus | Status | Details |
|------|-------|--------|---------|
| Epic 3 | Enhanced parsing | 30% | [epic-3-code-parsing.md](docs/vision/epic-3-code-parsing.md) |
| Epic 4 | Job queue | 0% | [epic-4-job-queue.md](docs/vision/epic-4-job-queue.md) |
| Epic 5 | GitHub integration | 0% | [epic-5-github-integration.md](docs/vision/epic-5-github-integration.md) |
| Epic 6 | REST API refinement | 70% | [epic-6-rest-api.md](docs/vision/epic-6-rest-api.md) |
| Epic 8 | Monitoring | 15% | [epic-8-monitoring.md](docs/vision/epic-8-monitoring.md) |
| Epic 9 | Deployment | 40% | [epic-9-cicd-deployment.md](docs/vision/epic-9-cicd-deployment.md) |

**Dependencies**: Epic 3 → Epic 4 → Epic 5 → MVP launch readiness

## Medium-Term Goals

**Phase 2 (3-6 Months)** - Expansion:
- Multi-language support (Python, Go, Rust)
- Advanced semantic intelligence (type hierarchy, impact analysis)
- Frontend application (kotadb.io SaaS dashboard)
- Performance optimizations (caching, incremental indexing)

## Long-Term Vision

**Phase 3 (6+ Months)** - Strategic innovation:
- Real-time collaboration (multi-agent sync, live updates)
- Self-hosted & enterprise (on-premise, SSO, air-gapped)
- Advanced AI features (embeddings, pattern learning)
- Ecosystem integrations (IDE extensions, CI/CD, issue trackers)

See [VISION.md](docs/vision/VISION.md) for complete strategic vision.

## Key Architectural Decisions

**Database**: PostgreSQL via Supabase (RLS for multi-tenancy, pg-boss for job queue)
**MCP**: HTTP JSON-RPC transport (SSE streaming planned for Epic 7)
**Auth**: API key system with tier-based rate limiting (free/solo/team)
**Testing**: Antimocking philosophy (real Supabase Local, Docker Compose)
**Deployment**: Fly.io hosting (staging/prod separation)
**ADW**: 3-phase automation (plan → build → review, isolated worktrees)

See [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) "Key Decisions" section for rationale and trade-offs.

## External Dependencies

**Manual Setup Required**:
- [ ] GitHub App registration (permissions, webhook secrets)
- [ ] Supabase projects (staging + prod)
- [ ] Fly.io apps (kotadb-staging, kotadb-prod)
- [ ] Stripe integration (frontend-owned)

**Frontend Coordination**:
- [ ] Supabase schema review
- [ ] OpenAPI spec validation
- [ ] GitHub App installation flow UX
- [ ] API key management UI

## Success Metrics

- Latency: p95 < 200ms
- Accuracy: 95%+ precision on dependency analysis
- Reliability: 99.5% uptime for MCP endpoints
- Autonomy: 80%+ ADW PR success rate
- User Adoption: MCP integration success rate

---

**For Agents**: Read [CURRENT_STATE.md](docs/vision/CURRENT_STATE.md) for gap analysis, epic files for implementation details, [VISION.md](docs/vision/VISION.md) for strategic context.
