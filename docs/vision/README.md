# KotaDB Vision & Implementation Plan

This directory contains the comprehensive vision and implementation roadmap for KotaDB.

## Navigation Guidance

**New contributors**: Start with [ROADMAP.md](./ROADMAP.md) (practical roadmap with current priorities) → then [CURRENT_STATE.md](./CURRENT_STATE.md) (gap analysis with actionable next steps) → then [VISION.md](./VISION.md) (aspirational goals and technical decisions).

**For quick status**: See [ROADMAP.md Quick Status Overview](./ROADMAP.md#quick-status-overview) table.

**For prioritization**: See [CURRENT_STATE.md Actionable Next Steps](./CURRENT_STATE.md#actionable-next-steps-for-contributors).

**For strategic context**: See [2025-10-13-multi-agent-framework-investigation.md](./2025-10-13-multi-agent-framework-investigation.md) for Phase 2/3 vision (multi-agent framework).

## Core Documents

- **[ROADMAP.md](./ROADMAP.md)** - Practical roadmap with epic completion status, MVP blockers, and realistic timeline (**Start here**)
- **[CURRENT_STATE.md](./CURRENT_STATE.md)** - Gap analysis with "What's Working" vs. "What's Blocking MVP" sections
- **[VISION.md](./VISION.md)** - Complete product vision, technical decisions, and architecture (aspirational goals)

## Strategic Phasing

KotaDB follows a phased approach:

### Phase 1: SaaS Platform (Current Focus, Weeks 1-10)
**Goal**: Ship kotadb.io as a hosted service for MCP-compatible CLI agents

**Scope**:
- Public SaaS platform at kotadb.io
- Tier-based authentication (free/solo/team)
- Webhook-triggered auto-indexing
- MCP server with 3 core tools: `search_code`, `index_repository`, `list_recent_files`
- REST API for frontend dashboard

**Progress**: ~60% complete. **Three critical gaps block MVP**:
1. **Epic 3**: AST-based code parsing (30% complete) - **MVP BLOCKER**
2. **Epic 4**: Job queue for async indexing (0% complete) - **MVP BLOCKER**
3. **Epic 5**: GitHub integration with webhooks (0% complete) - **MVP BLOCKER**

See [ROADMAP.md](./ROADMAP.md) for detailed status and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

### Phase 2/3: Multi-Agent Framework (Future, Post-MVP)
**Goal**: Reposition KotaDB as infrastructure for autonomous software development

**Scope** (deferred to post-MVP):
- ADW framework productization (currently internal tooling)
- Agent registry and marketplace
- Cross-vendor agent collaboration (Anthropic + OpenAI + custom agents)
- Workflow orchestration primitives
- Self-hosted deployment option

**Why Deferred**: Multi-agent framework requires proven SaaS platform as foundation. Phase 1 validates product-market fit and builds revenue to fund Phase 2/3 development.

**Reference**: See [2025-10-13-multi-agent-framework-investigation.md](./2025-10-13-multi-agent-framework-investigation.md) for strategic vision and [archive/manifesto.md](./archive/manifesto.md) for Phase 2/3 marketing material.

## Implementation Epics

The implementation is broken into 10 epics with clear dependencies. **Note**: Epic files are reference documents from original planning. See ROADMAP.md for current completion status and priorities.

### Foundation & Infrastructure
1. **[Epic 1: Database Foundation & Schema](./epic-1-database-foundation.md)** - Supabase schema, migrations, RLS
2. **[Epic 2: Authentication Infrastructure](./epic-2-authentication.md)** - API keys, auth middleware, rate limiting
3. **[Epic 9: CI/CD & Deployment](./epic-9-cicd-deployment.md)** - Fly.io setup, CI pipeline, secrets management

### Core Services
4. **[Epic 3: Enhanced Code Parsing](./epic-3-code-parsing.md)** - AST parsing, symbol extraction, dependency graphs
5. **[Epic 4: Job Queue & Background Processing](./epic-4-job-queue.md)** - pg-boss queue, indexing worker
6. **[Epic 5: GitHub Integration](./epic-5-github-integration.md)** - GitHub App, webhooks, auto-indexing

### API Implementation
7. **[Epic 6: REST API Migration](./epic-6-rest-api.md)** - OpenAPI spec, repository management
8. **[Epic 7: MCP Server Implementation](./epic-7-mcp-server.md)** - SSE transport, MCP protocol, 3 MVP tools

### Operations & Quality
9. **[Epic 8: Monitoring & Operations](./epic-8-monitoring.md)** - Logging, health checks, metrics
10. **[Epic 10: Comprehensive Testing](./epic-10-testing.md)** - Unit, integration, E2E tests

## Dependency Overview

```
Epic 1 (Database) ──► Epic 2 (Auth)
       │                    │
       └────────► Epic 3 (Parsing) ──► Epic 4 (Queue) ──► Epic 5 (GitHub)
                                      │                    │
                                      └────────► Epic 6 (REST API) ──► Epic 7 (MCP)

Epics 1-7 ──► Epic 8 (Monitoring)
Epics 1-7 ──► Epic 10 (Testing) ──► Epic 9 (CI/CD)
```

## Implementation Timeline

- **Phase 1A (Weeks 1-2)**: Epics 1 & 2 (database + auth foundations); establish initial testing harness (Epic 10).
- **Phase 1B (Weeks 3-4)**: Epics 3 & 4 (parsing pipeline and queue) with continuous test coverage expansion.
- **Phase 1C (Weeks 5-6)**: Epics 5 & 6 (GitHub integration and REST API).
- **Phase 1D (Weeks 7-8)**: Epics 7 & 8 (MCP server and monitoring/operations).
- **Phase 1E (Week 9)**: Epics 9 & 10 (CI/CD automation and test hardening for launch).

## Working with ADW

Each epic file contains discrete GitHub issues with:
- Clear acceptance criteria
- Dependency tracking
- Technical specifications
- Test requirements

ADW agents can pick up any issue where dependencies are satisfied.
