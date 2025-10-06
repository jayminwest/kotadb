# KotaDB Vision & Implementation Plan

This directory contains the comprehensive vision and implementation roadmap for KotaDB.

## Core Documents

- **[VISION.md](./VISION.md)** - Complete product vision, technical decisions, and architecture

## Implementation Epics

The implementation is broken into 10 epics with clear dependencies:

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
