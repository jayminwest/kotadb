# Feature Plan: Structured Logging with JSON Format and Correlation IDs

## Overview

**Issue**: #436
**Title**: feat: implement structured logging with JSON format and correlation IDs
**Component**: component:observability
**Priority**: priority:medium
**Effort**: effort:small
**Status**: status:needs-investigation

### Problem
The application currently uses unstructured logging with basic `process.stdout.write()` and `process.stderr.write()` calls scattered throughout the codebase. This makes production debugging difficult:
- Logs are unstructured and cannot be easily queried or filtered
- No request tracing across the lifecycle of a single request
- No standardized context (user_id, job_id, request_id) to correlate related log entries
- Difficult to debug issues in production environments (Fly.io, Vercel)
- Cannot filter logs by user, job, or request context
- No configurable log levels for different environments

From `docs/vision/CURRENT_STATE.md:188-205`, Epic 8 (Monitoring & Operations) is only 15% complete, with structured logging being a foundational requirement.

### Desired Outcome
Implement a comprehensive structured logging system that:
- Outputs JSON-formatted logs to stdout/stderr for production log aggregation
- Attaches correlation IDs (`request_id`, `user_id`, `job_id`) to all log entries
- Supports configurable log levels (`debug`, `info`, `warn`, `error`) via environment variable
- Provides request/response logging middleware for Express
- Masks sensitive data (API keys, tokens, emails) automatically
- Integrates seamlessly with existing authentication, queue, webhook, and MCP subsystems
- Maintains zero `console.log/console.error` calls (enforced by pre-commit hooks)

### Non-Goals
- Third-party logging service integration (Datadog, Sentry) - future work
- Metrics collection or performance monitoring - separate feature
- Log aggregation infrastructure - relies on existing platform tools (Fly.io logs)
- Custom log rotation or retention policies - handled by platform

## Technical Approach

### Architecture Notes
Create a new `@logging/*` module with three core components:

1. **Logger Factory** (`app/src/logging/logger.ts`):
   - Creates logger instances with correlation context (`request_id`, `user_id`, `job_id`)
   - Supports configurable log levels via `LOG_LEVEL` environment variable
   - Outputs JSON-formatted logs to stdout (info/debug/warn) and stderr (error)
   - Automatically masks sensitive data in log metadata

2. **Request Logging Middleware** (`app/src/logging/middleware.ts`):
   - Express middleware that generates unique `request_id` per request
   - Attaches logger instance to `req.logger` with correlation context
   - Logs incoming requests (method, URL, headers) and outgoing responses (status, duration)
   - Captures and logs errors with stack traces

3. **Correlation Context Management** (`app/src/logging/context.ts`):
   - Manages propagation of correlation IDs across async boundaries
   - Provides utilities for creating child loggers with extended context
   - Supports nested contexts (e.g., request → job → sub-task)

### Key Modules to Touch
- **API Layer** (`app/src/api/routes.ts`): Integrate request logging middleware early in chain
- **Auth Middleware** (`app/src/auth/middleware.ts`): Replace existing logging with structured logger
- **MCP Server** (`app/src/mcp/server.ts`): Add structured logging for MCP requests/responses
- **Queue Workers** (`app/src/queue/workers/index-repo.ts`): Add job-scoped logging with `job_id`
- **Webhook Handlers** (`app/src/github/webhook-handler.ts`, `app/src/github/webhook-processor.ts`): Add structured event logging
- **Stripe Webhooks** (`app/src/api/webhooks.ts`): Add structured payment event logging

### Data/API Impacts
- **No database schema changes required**
- **No API contract changes** - purely internal logging infrastructure
- **New environment variable**: `LOG_LEVEL` (default: `info`, options: `debug|info|warn|error`)
- **Request object extension**: Attach `logger` instance to Express `Request` object

## Relevant Files

### Existing Files to Modify
- `app/src/api/routes.ts` — Integrate request logging middleware at app initialization
- `app/src/auth/middleware.ts` — Replace existing logging calls with structured logger (lines 96-98, 128-130, 138-140, 170)
- `app/src/mcp/server.ts` — Add structured logging for MCP lifecycle and tool execution
- `app/src/queue/workers/index-repo.ts` — Replace logging with job-scoped logger instances
- `app/src/github/webhook-handler.ts` — Replace logging with structured logger (line 67)
- `app/src/github/webhook-processor.ts` — Replace logging with structured logger
- `app/src/api/webhooks.ts` — Add structured logging for Stripe webhook events
- `app/src/queue/client.ts` — Replace logging with structured logger
- `app/src/index.ts` — Add structured logging for server startup/shutdown

### New Files
- `app/src/logging/logger.ts` — Logger factory with JSON output and correlation context
- `app/src/logging/middleware.ts` — Express middleware for request/response logging
- `app/src/logging/context.ts` — Correlation ID management and context propagation
- `app/tests/logging/logger.test.ts` — Unit tests for logger factory (log levels, masking, JSON format)
- `app/tests/logging/middleware.test.ts` — Integration tests for request logging middleware
- `app/tests/logging/context.test.ts` — Unit tests for correlation context utilities

## Task Breakdown

### Phase 1: Foundation (Logger Factory & Context Management)
- Create `app/src/logging/logger.ts` with JSON output, log levels, and sensitive data masking
- Create `app/src/logging/context.ts` for correlation ID utilities
- Add unit tests for logger factory (JSON parsing, log level filtering, masking)
- Add TypeScript path alias `@logging/*` to `app/tsconfig.json`
- Document LOG_LEVEL environment variable in `.claude/commands/app/environment.md`

### Phase 2: Middleware Integration
- Create `app/src/logging/middleware.ts` for Express request/response logging
- Add integration tests for middleware (request_id generation, response logging, error handling)
- Integrate middleware into `app/src/api/routes.ts` (before authentication middleware)
- Verify middleware ordering: logging → CORS → auth → rate limit → routes

### Phase 3: Subsystem Integration
- Replace logging in `app/src/auth/middleware.ts` with structured logger
- Replace logging in `app/src/mcp/server.ts` with structured logger
- Replace logging in `app/src/queue/workers/index-repo.ts` with job-scoped logger
- Replace logging in `app/src/github/webhook-handler.ts` and `app/src/github/webhook-processor.ts`
- Replace logging in `app/src/api/webhooks.ts` with structured logger
- Replace logging in `app/src/queue/client.ts` with structured logger
- Replace logging in `app/src/index.ts` with structured logger

### Phase 4: Validation & Cleanup
- Run codebase-wide search for remaining `console.log`/`console.error` calls (exclude test fixtures)
- Verify pre-commit hooks catch any new console.* usage
- Run full test suite (`bun test`)
- Run integration tests (`bun test --filter integration`)
- Test with different LOG_LEVEL values (debug, info, warn, error)
- Verify JSON output is parseable and contains all required fields
- Update CLAUDE.md with link to new logging architecture documentation

## Step by Step Tasks

### Implementation Order

1. **Create TypeScript path alias**
   - Add `"@logging/*": ["./src/logging/*"]` to `app/tsconfig.json` paths

2. **Implement logger factory**
   - Create `app/src/logging/logger.ts` with `createLogger()`, JSON formatting, log levels, masking
   - Create `app/src/logging/context.ts` with correlation ID utilities
   - Write unit tests in `app/tests/logging/logger.test.ts`
   - Write unit tests in `app/tests/logging/context.test.ts`

3. **Implement request logging middleware**
   - Create `app/src/logging/middleware.ts` with Express middleware
   - Write integration tests in `app/tests/logging/middleware.test.ts`
   - Integrate into `app/src/api/routes.ts` at line 50 (before CORS)

4. **Replace logging in auth middleware**
   - Update `app/src/auth/middleware.ts` to use structured logger (lines 96-98, 128-130, 138-140, 170)
   - Verify auth tests pass with new logging

5. **Replace logging in queue workers**
   - Update `app/src/queue/workers/index-repo.ts` with job-scoped loggers
   - Update `app/src/queue/client.ts` with structured logger
   - Verify queue tests pass

6. **Replace logging in webhook handlers**
   - Update `app/src/github/webhook-handler.ts` (line 67)
   - Update `app/src/github/webhook-processor.ts`
   - Update `app/src/api/webhooks.ts`
   - Verify webhook tests pass

7. **Replace logging in MCP server**
   - Update `app/src/mcp/server.ts` with structured logger for lifecycle and tool execution
   - Verify MCP tests pass

8. **Replace logging in API server**
   - Update `app/src/index.ts` with structured logger for startup/shutdown

9. **Final validation**
   - Run `bun run lint` (verify no linting errors)
   - Run `bun run typecheck` (verify no type errors)
   - Run `bun test` (verify all tests pass)
   - Run `bun test --filter integration` (verify integration tests pass)
   - Run `bun run build` (verify production build succeeds)
   - Search codebase for remaining `console.log`/`console.error` (exclude test fixtures)
   - Test with `LOG_LEVEL=debug bun run dev` and verify debug logs appear
   - Test with `LOG_LEVEL=error bun run dev` and verify only errors appear

10. **Documentation updates**
    - Add LOG_LEVEL to `.claude/commands/app/environment.md`
    - Update CLAUDE.md with link to logging architecture (if needed)
    - Update `docs/vision/CURRENT_STATE.md` Epic 8 progress (15% → 25%)

11. **Git operations**
    - Run validation commands one final time
    - Stage all changes: `git add .`
    - Commit with message: `feat: implement structured logging with JSON format and correlation IDs (#436)`
    - Push branch: `git push -u origin feat/436-structured-logging`

## Risks & Mitigations

### Risk: Performance impact from JSON serialization on every log call
**Mitigation**:
- Implement log level filtering before JSON serialization
- Use microtask queue for non-critical async logging
- Benchmark logging overhead in production workload tests
- Document performance characteristics in logging module

### Risk: Breaking existing log parsing in production (Fly.io)
**Mitigation**:
- Ensure JSON output is always parseable with `JSON.parse()`
- Maintain backward compatibility for critical error logs
- Test log output with actual Fly.io log parsing (`flyctl logs`)
- Document migration guide for log query updates

### Risk: Sensitive data leakage in structured logs
**Mitigation**:
- Implement automatic masking for known sensitive keys (`apiKey`, `token`, `password`, etc.)
- Add unit tests specifically for sensitive data masking
- Code review all log call sites for PII exposure
- Document sensitive data handling in logger module

### Risk: Correlation ID propagation failures across async boundaries
**Mitigation**:
- Use AsyncLocalStorage (Node.js 12+) for context propagation
- Test correlation ID propagation in queue jobs, webhooks, and nested async flows
- Provide explicit logger instance passing as fallback
- Document context propagation patterns

### Risk: Log volume explosion with debug level in production
**Mitigation**:
- Default LOG_LEVEL to `info` in production
- Document recommended log levels per environment
- Add rate limiting for high-frequency debug logs (if needed)
- Monitor log volume after deployment

## Validation Strategy

### Automated Tests (Integration/E2E hitting Supabase per /anti-mock)
- **Logger Factory Tests** (`app/tests/logging/logger.test.ts`):
  - JSON output format validation (parseable by `JSON.parse()`)
  - Log level filtering (debug/info/warn/error)
  - Sensitive data masking (API keys, tokens, passwords)
  - Correlation context propagation
  - Error logging with stack traces

- **Middleware Tests** (`app/tests/logging/middleware.test.ts`):
  - Request ID generation uniqueness
  - Request/response logging with duration
  - Logger attachment to `req.logger`
  - Error logging with stack traces
  - Correlation context from auth middleware

- **Integration Tests** (existing test suites):
  - Auth middleware tests (`app/tests/auth/middleware.test.ts`) - verify structured logging
  - API route tests (`app/tests/api/authenticated-routes.test.ts`) - verify request logging
  - MCP tests (`app/tests/mcp/*.test.ts`) - verify structured logging in MCP workflows
  - Queue tests (`app/tests/queue/*.test.ts`) - verify job-scoped logging

### Manual Checks (document data seeded and failure scenarios exercised)
- **Local Development**:
  1. Start dev server: `cd app && LOG_LEVEL=debug bun run dev`
  2. Make API request: `curl -H "Authorization: Bearer kota_free_..." http://localhost:3000/search?q=test`
  3. Verify JSON logs in terminal with `request_id`, `user_id`, `timestamp`, `level`, `message`
  4. Trigger error: `curl http://localhost:3000/search` (missing auth)
  5. Verify error logs include stack traces and correlation IDs

- **Authenticated Request Flow**:
  1. Make authenticated request with API key
  2. Verify `user_id` and `key_id` appear in logs
  3. Check rate limit headers logged correctly

- **Queue Job Flow**:
  1. Trigger indexing job via `/index` endpoint
  2. Verify `job_id` appears in worker logs
  3. Check job start/completion logs with duration

- **Webhook Flow**:
  1. Trigger GitHub webhook (push event)
  2. Verify webhook logs include event type, repository, and signature validation
  3. Trigger Stripe webhook (checkout.session.completed)
  4. Verify payment event logs include customer and subscription IDs

- **Sensitive Data Masking**:
  1. Make request with API key in header
  2. Verify API key is masked in logs (`[REDACTED]`)
  3. Test with various sensitive fields (token, password, secret)

- **Log Level Configuration**:
  1. Test with `LOG_LEVEL=debug` → verify debug logs appear
  2. Test with `LOG_LEVEL=info` → verify debug logs are filtered
  3. Test with `LOG_LEVEL=warn` → verify info logs are filtered
  4. Test with `LOG_LEVEL=error` → verify only errors appear

### Release Guardrails (monitoring, alerting, rollback) with real-service evidence
- **Pre-Production Validation**:
  - Deploy to staging environment (Fly.io staging app)
  - Query logs via `flyctl logs --app kotadb-staging`
  - Verify JSON logs are parseable by log aggregation tools
  - Test log queries by `request_id`, `user_id`, `job_id`

- **Production Rollout**:
  - Deploy during low-traffic window
  - Monitor log volume and query performance
  - Verify no PII leaks in production logs
  - Test log queries in Fly.io production dashboard

- **Monitoring**:
  - Track log volume per severity level (error/warn/info/debug)
  - Monitor error rate for correlation ID failures
  - Alert on sensitive data patterns in logs (API keys, emails)

- **Rollback Plan**:
  - If log volume explodes: set `LOG_LEVEL=error` via Fly.io secrets
  - If JSON parsing fails: revert to previous deployment
  - If PII leaks detected: immediate rollback and audit

## Validation Commands

```bash
# Linting
bun run lint

# Type checking
bun run typecheck

# Integration tests
bun test --filter integration

# All tests
bun test

# Production build
bun run build

# Verify no console.log/console.error (excluding test fixtures)
rg "console\.(log|error)" app/src/

# Test with different log levels
LOG_LEVEL=debug bun run dev
LOG_LEVEL=info bun run dev
LOG_LEVEL=error bun run dev

# Verify JSON output is parseable
bun run dev 2>&1 | grep '{"timestamp"' | head -1 | jq .

# Migration sync validation
bun run test:validate-migrations
```

## Issue Relationships

### Child Of
- Epic 8 (Monitoring & Operations) - Issue #28 from original epic planning (`docs/vision/epic-8-monitoring.md`)

### Blocks
- #339 (pg-boss queue monitoring dashboard) - Requires structured logs for debugging queue issues
- #411 (Stripe webhook monitoring) - Requires error tracking and structured logging

### Enables
- Future work: Integration with log aggregation tools (Fly.io logs, Datadog, Sentry)
- Future work: Metrics dashboard for observability
- Future work: Alerting and anomaly detection
- Future work: Performance analysis and slow query detection

### Related To
- Epic 8 overall completion tracking
- Production debugging workflows
- Security audit trails
- Compliance requirements
