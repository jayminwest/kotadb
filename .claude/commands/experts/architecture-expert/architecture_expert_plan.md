---
description: Provide architecture analysis for planning
argument-hint: <issue-context>
---

# Architecture Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### KotaDB Architecture Knowledge Areas

**Path Alias Architecture:**
- `@api/*` → `src/api/*` - API layer (routes, queries, projects)
- `@auth/*` → `src/auth/*` - Authentication (middleware, validator, keys, rate-limit, context, cache)
- `@db/*` → `src/db/*` - Database (client, migrations)
- `@indexer/*` → `src/indexer/*` - Git indexer (repos, parsers, extractors)
- `@mcp/*` → `src/mcp/*` - MCP server (server, tools, impact-analysis, spec-validation)
- `@validation/*` → `src/validation/*` - Schema validation (schemas, types, common-schemas)
- `@queue/*` → `src/queue/*` - Job queue (client, config, types, workers, job-tracker)
- `@shared/*` → `../shared/*` - Cross-project types (auth, entities, api contracts, projects)
- `@github/*` → `src/github/*` - GitHub integration (workflows, installations) (added after #472)
- `@logging/*` → `src/logging/*` - Structured logging (logger, context, middleware) (added after #436)
- `@app-types/*` → `src/types/*` - App-specific types with runtime dependencies

**Component Boundaries:**
- Entry point: `app/src/index.ts` (Express server bootstrap, graceful shutdown)
- API Layer: `app/src/api/routes.ts` (middleware chain, endpoints)
- Auth Flow: Request → apiKeyAuth → rateLimit → handler
- Data Flow: Handler → Supabase client → RLS-enforced queries → Response

**Data Flow Patterns:**
1. REST endpoints: `/health`, `/index`, `/search`, `/files/recent`, `/validate-output`, `/api/projects/*` (added after #431)
2. MCP endpoint: `/mcp` (POST, StreamableHTTPServerTransport)
3. Auth context: `{ user, tier, organization, rateLimitResult }` passed to handlers
4. Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
5. Webhook endpoints: `/webhook/stripe` for subscription lifecycle (added after #345)
6. Feature flags: Billing feature flag for open-source fork (added after #472)
7. Health check endpoint: `/health` returns API version, queue metrics, job health status (added after #453)

**Anti-Patterns Discovered:**
- Relative imports instead of path aliases (causes refactoring brittleness)
- Direct `console.*` usage (violates logging standards, fails pre-commit) — Use `@logging/logger` instead
- Hardcoded Supabase URLs (breaks test/prod separation)
- Missing RLS policies on new tables (security vulnerability)
- Circular dependencies between @api and @auth modules
- Unbounded database queries without pagination (discovered in #473) — Use .range() for queries >1000 rows
- Missing error telemetry in try-catch blocks (discovered in ed4c4f9) — All errors must call Sentry.captureException()
- Insufficient ignored directories in indexer (discovered in #473) — Maintain comprehensive IGNORED_DIRECTORIES list

### Shared Types Strategy

**Use `@shared/types` for:**
- API request/response types (`IndexRequest`, `SearchResponse`)
- Database entity types (`Repository`, `IndexedFile`, `Symbol`)
- Authentication types (`AuthContext`, `Tier`, `ApiKey`)
- Rate limiting types (`RateLimitResult`, `RateLimitHeaders`)
- Project workspace types (`Project`, `CreateProjectRequest`, `UpdateProjectRequest`) (added after #431)

**Keep in `app/src/types` for:**
- App-specific types with runtime dependencies
- Internal implementation details not in API contract

### Observability Patterns (added after #436, ed4c4f9)

**Structured Logging:**
- Use `@logging/logger` factory: `createLogger({ module: "module-name" })`
- JSON output to stdout/stderr for log aggregation
- Correlation IDs: `request_id`, `user_id`, `job_id`, `key_id`
- Automatic sensitive data masking (API keys, tokens, passwords)
- Configurable via `LOG_LEVEL` environment variable (debug, info, warn, error)

**Error Tracking:**
- All try-catch blocks must call `Sentry.captureException(error)` with context
- Attach user context: `user_id`, `organization_id`, `tier`
- Attach operation context: repository names, job IDs, operation types
- Integration across: GitHub (24 captures), API (39), Indexer (9), Auth (11), Queue/DB (17), MCP (14), Validation (2)

**Request Logging:**
- Express middleware: `@logging/middleware` before CORS
- Auto-generated `request_id` for correlation
- Request/response logging with method, path, status, duration

### Multi-Pass Processing Patterns (added after #377)

**Two-Pass Storage for Dependency Extraction:**
- **Pass 1**: Store files and symbols to obtain database IDs
- **Pass 2**: Query stored data, extract references/dependencies using IDs, store relationships
- Solves chicken-and-egg problem where extractors require database IDs
- Pattern used in: `queue/workers/index-repo.ts` for dependency graph construction

**Pagination for Large Datasets:**
- Use `.range(start, end)` for queries >1000 rows (Supabase default limit)
- Process in batches (1000-row chunks recommended)
- Log pagination progress for observability
- Pattern used in: Pass 2 file queries in indexer (#473)

### MCP Tool Architecture (added after #470)

**MCP Tools as Thin Wrappers:**
- MCP tools delegate to existing API layer functions (e.g., `@api/projects`)
- Avoid duplicating business logic in MCP layer
- Parameter validation happens in MCP tools, business logic in API layer
- RLS enforcement via Supabase client passed through from API layer

**Identifier Resolution Patterns:**
- Support both UUID and human-readable names (case-insensitive)
- Example: `get_project` accepts project UUID or name
- Improves agent developer experience (names more memorable than UUIDs)

**Idempotency for Relationship Operations:**
- Add/remove operations should be idempotent
- Example: `add_repository_to_project` succeeds if already added
- Prevents agent retry failures on network issues

### Feature Flags Pattern (added after #472)

**Conditional Feature Toggling:**
- Use `ENABLE_BILLING` environment variable for self-hosted deployments
- Feature flags enable open-source self-hosted fork without billing infrastructure
- Guards Stripe endpoints, webhook handlers, and billing-related middleware
- Environment variables checked at initialization time for performance

**Self-Hosted Deployment Architecture:**
- Support both SaaS and self-hosted deployment modes
- Billing features disabled entirely for self-hosted (no billing UI, webhooks, or rate limits based on tier)
- Rate limiting simplified for open-source deployments
- API authentication optional/disabled in self-hosted mode when ENABLE_BILLING=false

### Sentry Error Tracking Pattern (added after #436, 7020d54)

**Sentry Integration Architecture:**
- Initialize in `app/src/instrument.ts` before all other imports
- Environment-specific sampling: 1.0 (dev), 0.1 (production) for tracesSampleRate
- Test environment guard: `NODE_ENV=test` disables Sentry entirely
- Privacy settings: `sendDefaultPii=false`, scrub sensitive headers (authorization, x-api-key)

**Express Middleware Integration:**
- `Sentry.Handlers.expressErrorHandler()` in middleware chain before custom error logging
- Auto-attaches request context to error spans
- Health check endpoint excluded from transaction tracking to reduce noise

**Error Context Requirements:**
- Attach user context: `user_id`, `organization_id`, `tier`
- Attach operation context: repository names, job IDs, operation types
- Use `Sentry.captureException(error, { contexts: { user, operation } })`

### API Versioning Pattern (added after #453)

**Version Caching and Health Check:**
- Cache API version at module load from `package.json` to avoid repeated file reads
- Dynamic import with assertion: `import("../../package.json", { with: { type: "json" } })`
- Fallback to "unknown" if version cannot be determined
- Include version in `/health` endpoint response for monitoring and debugging
- Queue metrics included in health response: queue depth, worker count, recent failures, oldest pending job age

**Version Availability:**
- Available at module initialization (non-blocking load with silent fallback)
- Cached value prevents performance impact on repeated health checks

## Workflow

1. **Parse Context**: Extract requirements from USER_PROMPT
2. **Identify Components**: Map to affected path alias domains
3. **Check Boundaries**: Verify changes respect component boundaries
4. **Assess Data Flow**: Trace request/response paths
5. **Pattern Match**: Compare against known patterns in Expertise
6. **Risk Assessment**: Identify architectural risks

## Report Format

### Architecture Perspective

**Affected Components:**
- [List path alias domains touched by this change]

**Data Flow Impact:**
- [How request/response paths are affected]

**Recommendations:**
1. [Prioritized recommendation with rationale]

**Risks:**
- [Architectural risk with severity: HIGH/MEDIUM/LOW]

**Pattern Compliance:**
- [Assessment of alignment with established patterns]
