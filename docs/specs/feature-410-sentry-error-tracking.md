# Feature Plan: Sentry SDK Integration for Error Tracking and Performance Monitoring

## Metadata
- **Issue**: #410
- **Title**: Integrate Sentry SDK for error tracking and performance monitoring
- **Type**: Feature
- **Component**: Backend, Observability
- **Priority**: High
- **Effort**: Small
- **Status**: Needs Investigation

## Overview

### Problem
The Sentry integration for kotadb-staging has been provisioned via Fly.io and the `SENTRY_DSN` secret is configured, but the Sentry Node.js SDK (`@sentry/node@10.23.0`) is not yet initialized in the application code. This prevents error tracking and performance monitoring from being captured, reducing visibility into production issues.

**Current State:**
- ✅ `@sentry/node@10.23.0` dependency installed in `app/package.json`
- ✅ Sentry project created on Fly.io for `kotadb-staging`
- ✅ `SENTRY_DSN` secret configured: `https://30a0afb8a8c758cf13449adef99ed5e0@o4510336287703040.ingest.us.sentry.io/4510336287965184`
- ❌ SDK not initialized in application bootstrap
- ❌ Error handlers not integrated with Sentry
- ❌ Performance tracing not configured

### Desired Outcome
Implement complete Sentry integration following best practices for error tracking and performance monitoring with:
- Early SDK initialization via dedicated instrumentation file
- Global error handlers for unhandled rejections and uncaught exceptions
- Express middleware for request error capture
- Environment-specific configuration
- Privacy-compliant data handling (no PII)
- Integration with existing structured logging system

### Non-Goals
- Replacing existing structured logging system (`app/src/logging/logger.ts`)
- Implementing custom error boundaries in the frontend
- Migrating historical logs to Sentry
- Setting up Sentry alerts and dashboard configuration (operational task)
- Performance profiling (future enhancement)

## Technical Approach

### Architecture Notes
The implementation follows Sentry's recommended Node.js initialization pattern where instrumentation must occur **before** any other imports to ensure proper tracing and error capture. The integration will complement (not replace) the existing structured logging system at `app/src/logging/` (implemented in #437).

**Key Design Decisions:**
1. **Instrumentation File Pattern**: Create `app/src/instrument.ts` and import first in `app/src/index.ts`
2. **Coexistence with Structured Logging**: Sentry captures errors for external monitoring; structured logs (JSON format with correlation IDs from #437) remain for local debugging and log aggregation
3. **Privacy First**: `sendDefaultPii: false` to prevent IP/user agent capture; scrub sensitive headers (aligns with existing `maskSensitiveData()` from `app/src/logging/logger.ts`)
4. **Environment Guards**: Disable in test environment to prevent test errors from polluting dashboard
5. **Express Integration**: Add Sentry error handler middleware **after** routes but **before** `errorLoggingMiddleware` (from #437) and 404 handler

### Key Modules to Touch
1. **New File**: `app/src/instrument.ts` — Sentry SDK initialization with DSN, environment, sampling rates
2. **Bootstrap**: `app/src/index.ts` — Import instrumentation first, add global error handlers (integrates with structured logger from #437)
3. **API Routes**: `app/src/api/routes.ts` — Add Sentry Express error middleware after routes, before `errorLoggingMiddleware` (line ~1001)
4. **Environment**: `app/.env.sample` — Document `SENTRY_DSN` configuration

### Data/API Impacts
- **No database changes**: This is purely an observability integration
- **No API contract changes**: Error responses remain unchanged
- **New Environment Variable**: `SENTRY_DSN` (already provisioned in staging)
- **HTTP Headers**: Sentry SDK may add `sentry-trace` and `baggage` headers for distributed tracing
- **Performance Overhead**: Minimal (~1-2ms per request with 10% sampling in production)

## Relevant Files

### Files to Modify
- `app/src/index.ts` — Import `./instrument.ts` first, add unhandled rejection/exception handlers (integrates with `createLogger()` from #437)
- `app/src/api/routes.ts` — Add Sentry error handler middleware after routes (line ~1000), before `errorLoggingMiddleware` (line 1001)
- `app/.env.sample` — Add `SENTRY_DSN` environment variable documentation
- `app/package.json` — Already has `@sentry/node@10.23.0` (no changes needed)

### New Files
- `app/src/instrument.ts` — Sentry SDK initialization with environment-specific configuration
- `app/tests/sentry/integration.test.ts` — Integration tests for Sentry initialization and error capture

## Task Breakdown

### Phase 1: Foundation (Instrumentation Setup)
- Create `app/src/instrument.ts` with Sentry SDK initialization
- Configure DSN loading from `process.env.SENTRY_DSN`
- Set environment tag from `NODE_ENV` or `VERCEL_ENV`
- Implement test environment guard (`NODE_ENV=test` disables Sentry)
- Configure privacy settings (`sendDefaultPii: false`)
- Add sensitive header scrubbing in `beforeSend` hook
- Set environment-specific `tracesSampleRate` (1.0 dev, 0.1 production)

### Phase 2: Application Integration
- Import `./instrument.ts` first in `app/src/index.ts` (before all other imports)
- Add global `unhandledRejection` handler in bootstrap function
- Add global `uncaughtException` handler in bootstrap function
- Add Sentry error handler middleware to Express app in `app/src/api/routes.ts`
- Ensure Sentry middleware is placed **before** custom error handler middleware
- Filter out health check endpoints from transaction tracking

### Phase 3: Documentation and Validation
- Update `app/.env.sample` with `SENTRY_DSN` configuration example
- Add validation test for Sentry initialization in test environment (should be disabled)
- Add integration test for error capture in non-test environments
- Document Sentry configuration in feature plan (this document)
- Verify Sentry dashboard receives test errors from staging deployment

## Step by Step Tasks

### Instrumentation Setup
1. Create `app/src/instrument.ts` with Sentry SDK initialization
2. Configure DSN from `process.env.SENTRY_DSN`
3. Set environment from `process.env.VERCEL_ENV` || `process.env.NODE_ENV` || `"development"`
4. Add test environment guard: `if (process.env.NODE_ENV === "test")` skip initialization
5. Configure `tracesSampleRate`: 1.0 for development, 0.1 for production
6. Set `sendDefaultPii: false` for privacy compliance
7. Implement `beforeSend` hook to:
   - Scrub `authorization` and `x-api-key` headers
   - Add `request_id` from Express request to Sentry tags for correlation with structured logs
8. Add `beforeSendTransaction` hook to filter out `/health` endpoint

### Application Bootstrap Integration
9. Import `./instrument.js` at the top of `app/src/index.ts` (before all other imports)
10. Add `process.on("unhandledRejection")` handler with `Sentry.captureException()`
11. Add `process.on("uncaughtException")` handler with `Sentry.captureException()` and `process.exit(1)`
12. Ensure handlers are registered after server starts listening

### Express Middleware Integration
13. Import `{ Sentry }` from `../instrument.js` in `app/src/api/routes.ts`
14. Add `app.use(Sentry.Handlers.errorHandler())` after all routes (around line 1000)
15. Ensure Sentry error handler is placed **before** `errorLoggingMiddleware` (currently line 1001 from #437)
16. Verify middleware order: routes → Sentry error handler → `errorLoggingMiddleware` → 404 handler
17. Note: `requestLoggingMiddleware` (line 53) will attach `req.logger` with `request_id` for correlation

### Environment and Documentation
17. Add `SENTRY_DSN=` entry to `app/.env.sample` with example DSN format
18. Add comment in `.env.sample` explaining Sentry DSN source (Fly.io Sentry extension)
19. Document that Sentry is disabled in test environment (`NODE_ENV=test`)

### Testing and Validation
20. Create `app/tests/sentry/integration.test.ts` with test environment validation
21. Test that Sentry is disabled when `NODE_ENV=test`
22. Test that initialization succeeds with valid `SENTRY_DSN` in non-test environment
23. Test that error handler middleware captures errors correctly
24. Verify existing structured logging remains functional
25. Run full test suite: `bun test`
26. Run type checking: `bun run typecheck`
27. Run linting: `bun run lint`

### Deployment and Verification
28. Deploy to `kotadb-staging` on Fly.io
29. Trigger test error via temporary endpoint or natural error
30. Verify error appears in Sentry dashboard with correct environment tag
31. Verify stack traces include source context
32. Verify sensitive headers are scrubbed from captured data
33. Remove test endpoint if created for validation
34. Push branch and ensure CI passes
35. Create pull request with title ending in `(#410)`

## Risks & Mitigations

### Risk: Sentry initialization failure breaks application startup
**Mitigation**: Wrap Sentry initialization in try-catch block. If initialization fails, log warning but continue startup. This ensures observability failures don't cause outages.

### Risk: Sensitive data leakage in error context
**Mitigation**:
- Set `sendDefaultPii: false` to prevent IP/user agent capture
- Implement `beforeSend` hook to scrub `authorization`, `x-api-key`, and other sensitive headers
- Review captured errors in staging before production deployment
- Leverage existing `maskSensitiveData()` function from `app/src/logging/logger.ts` as reference

### Risk: Performance degradation from tracing overhead
**Mitigation**:
- Set `tracesSampleRate: 0.1` (10%) in production to limit overhead
- Filter out high-frequency `/health` endpoint from transaction tracking
- Monitor application performance metrics before and after deployment

### Risk: Test errors polluting Sentry dashboard
**Mitigation**: Add strict test environment guard: `if (process.env.NODE_ENV === "test") return;` in `instrument.ts`. Validated in integration tests.

### Risk: Conflict with existing structured logging system
**Mitigation**: Sentry complements (not replaces) structured logging (implemented in #437). Middleware order ensures both systems capture errors independently:
- Sentry error handler (new, line ~1000) captures first for remote monitoring
- `errorLoggingMiddleware` (existing, line 1001) logs to stdout/stderr with correlation IDs
- No shared state or interference between systems

## Validation Strategy

### Automated Tests
Following antimocking philosophy, all tests use real Sentry SDK behavior:

1. **Test Environment Guard** (`app/tests/sentry/integration.test.ts`)
   - Verify Sentry is disabled when `NODE_ENV=test`
   - Verify no Sentry initialization logs appear in test runs
   - Verify `Sentry.getCurrentScope()` returns inactive scope in tests

2. **Initialization Tests** (with `NODE_ENV=development`)
   - Verify Sentry initializes with valid `SENTRY_DSN`
   - Verify environment tag is set correctly
   - Verify `tracesSampleRate` matches environment expectations

3. **Error Capture Tests**
   - Trigger test error via Express endpoint
   - Verify error is captured by Sentry (check in-memory transport or test DSN)
   - Verify sensitive headers are scrubbed from captured data
   - Verify stack traces are included

4. **Middleware Integration Tests**
   - Verify Sentry error handler is invoked before custom error handler
   - Verify 500 responses still return expected JSON format
   - Verify existing error logging behavior is unchanged

5. **Existing Test Suite**
   - Run full test suite to ensure no regressions: `bun test`
   - Verify structured logging tests pass unchanged
   - Verify API error handling tests pass

### Manual Checks
1. **Local Development Validation**
   - Set `SENTRY_DSN` in `.env` for local Supabase instance
   - Start server: `cd app && bun run dev`
   - Verify Sentry initialization log message appears
   - Create temporary test endpoint that throws an error
   - Trigger error and verify it appears in Sentry dashboard
   - Check captured error for correct environment tag, stack trace, and scrubbed headers
   - Remove test endpoint

2. **Staging Validation**
   - Deploy to `kotadb-staging` via `flyctl deploy -a kotadb-staging`
   - Monitor deployment logs for Sentry initialization message
   - Trigger natural error (e.g., invalid API request)
   - Verify error appears in Sentry dashboard with `staging` environment tag
   - Verify request context includes URL, method, headers (with sensitive data scrubbed)
   - Verify server context includes hostname, runtime version

3. **Structured Logging Coexistence**
   - Verify structured logs still appear in stdout/stderr with JSON format (from #437)
   - Verify `request_id` correlation IDs generated by `requestLoggingMiddleware` (middleware.ts:29)
   - Verify sensitive data masking still works (`maskSensitiveData()` from logger.ts:87-99)
   - Verify Sentry errors also trigger `errorLoggingMiddleware` logs (both systems active)
   - Check logs for both Sentry capture and structured error log for same error event

### Release Guardrails
1. **Staging Deployment First**
   - Deploy to `kotadb-staging` and monitor for 24-48 hours
   - Review Sentry error patterns and rates
   - Validate no false positives or excessive noise

2. **Production Deployment**
   - Set `SENTRY_DSN` secret on production app: `flyctl secrets set SENTRY_DSN="<production-dsn>" -a kotadb`
   - Deploy to production during low-traffic window
   - Monitor error rates and application performance
   - Compare pre/post metrics for latency and throughput

3. **Rollback Plan**
   - If Sentry causes issues, set `SENTRY_DSN=""` to disable without code changes
   - Redeploy previous version if needed
   - Sentry SDK is designed to fail gracefully if DSN is invalid or unreachable

## Validation Commands

**Level 2 Validation** (required for this feature):
```bash
bun run lint
bun run typecheck
bun test --filter integration
bun test
bun run build
```

**Domain-Specific Checks**:
```bash
# Verify migration sync (no schema changes, but good practice)
bun run test:validate-migrations

# Manual Sentry validation (staging only, not in CI)
# 1. Deploy to staging: flyctl deploy -a kotadb-staging
# 2. Trigger test error: curl -X POST https://kotadb-staging.fly.dev/test-sentry
# 3. Check Sentry dashboard for captured error
# 4. Remove test endpoint before merging
```

## Issue Relationships

**Related Issues:**
- #437 (open) — Structured logging implementation: This feature builds on the structured logging foundation (JSON logs, correlation IDs, sensitive data masking)
- #407 (open) — Webhook error logging enhancement: Sentry will provide better visibility into webhook handler failures with stack traces and request context
- #339 (open) — pg-boss queue monitoring dashboard: Could integrate Sentry for queue error tracking and alerting in future enhancement

**Depends On:**
- #437 must be merged before this feature to ensure correct middleware order and coexistence with `errorLoggingMiddleware`

**Enables:**
- Real-time error tracking in staging and production with full stack traces and breadcrumbs
- Performance monitoring for API endpoints and database queries
- Proactive alerting on error rate spikes or performance degradation
- Faster debugging with request context, server environment, and user correlation

**Blocked By:** None (all prerequisites complete)

## References

- **Sentry Node.js Documentation**: https://docs.sentry.io/platforms/javascript/guides/node/
- **Sentry Express Integration**: https://docs.sentry.io/platforms/javascript/guides/express/
- **Fly.io Sentry Extension**: https://fly.io/docs/reference/sentry/
- **Project DSN**: `https://30a0afb8a8c758cf13449adef99ed5e0@o4510336287703040.ingest.us.sentry.io/4510336287965184`
- **Sentry Dashboard**: https://sentry.io/organizations/o4510336287703040/projects/
- **Issue #407**: Webhook error logging (related)
- **Issue #339**: pg-boss monitoring dashboard (related)

## Additional Context

### Integration with Existing Structured Logging
KotaDB uses a comprehensive structured logging system (implemented in #437) at `app/src/logging/` that outputs JSON logs with correlation IDs (`request_id`, `user_id`, `job_id`), sensitive data masking, and configurable log levels. Sentry integration **complements** this system:

- **Structured Logs**: Remain the source of truth for local debugging, audit trails, and log aggregation
  - JSON format with correlation IDs for request tracing
  - `requestLoggingMiddleware` generates unique `request_id` per request (line 53 in routes.ts)
  - `errorLoggingMiddleware` logs unhandled errors with stack traces (line 1001 in routes.ts)
  - Sensitive data automatically masked via `maskSensitiveData()` (logger.ts:87-99)

- **Sentry**: Provides external error tracking, alerting, performance monitoring, and distributed tracing
  - Captures errors for external monitoring and dashboard visualization
  - Supports distributed tracing and performance sampling
  - Sends data to remote Sentry project for team-wide visibility

Both systems will operate concurrently. When an error occurs:
1. `requestLoggingMiddleware` attaches `req.logger` with `request_id` (middleware.ts:27-36)
2. Error bubbles up through Express middleware chain
3. **Sentry error handler** captures error to remote dashboard with stack trace and request context
4. `errorLoggingMiddleware` logs error to stdout/stderr with correlation IDs and masked sensitive data
5. Custom error handler returns 500 response to client
6. No interference between systems - each serves different observability needs

### TypeScript and ESM Configuration
KotaDB uses ESM (`"type": "module"` in `package.json`):
- Use `.js` extension in imports: `import "./instrument.js"`
- Sentry SDK automatically detects ESM mode
- No `require()` calls needed

### Environment-Specific Configuration

**Development** (`NODE_ENV=development`):
- `tracesSampleRate: 1.0` (100% of transactions sampled)
- `debug: true` (verbose Sentry SDK logging)
- Optional: Use separate dev Sentry project to avoid polluting staging data

**Staging** (`VERCEL_ENV=preview` or manual deploy):
- `tracesSampleRate: 1.0` (full sampling for validation)
- `environment: "staging"`
- Use provisioned DSN: `https://30a0afb8a8c758cf13449adef99ed5e0@o4510336287703040.ingest.us.sentry.io/4510336287965184`

**Production** (`VERCEL_ENV=production` or `NODE_ENV=production`):
- `tracesSampleRate: 0.1` (10% sampling to reduce costs and overhead)
- `environment: "production"`
- Use production Sentry DSN (to be provisioned separately)

**Test** (`NODE_ENV=test`):
- Sentry SDK **not initialized** (strict guard in `instrument.ts`)
- Prevents test errors from polluting dashboard
- Validated in integration tests

### Privacy and Compliance
- `sendDefaultPii: false` prevents automatic capture of IP addresses and user agents
- `beforeSend` hook scrubs sensitive headers: `authorization`, `x-api-key`
- User context (if added later) should use user ID only, not email or PII
- Aligns with existing sensitive data masking in structured logging system:
  - `maskSensitiveData()` function (logger.ts:87-99)
  - `SENSITIVE_KEYS` list (logger.ts:36-56) includes API keys, tokens, passwords, secrets
  - Use same scrubbing patterns in Sentry `beforeSend` hook for consistency

### Correlation ID Integration
Sentry errors should include `request_id` from structured logging for cross-system correlation:
- **Option 1 (Recommended)**: Add `request_id` to Sentry context in `beforeSend` hook
  ```typescript
  beforeSend(event, hint) {
    const req = hint.originalException?.req; // Express request object
    if (req?.requestId) {
      event.tags = { ...event.tags, request_id: req.requestId };
    }
    return event;
  }
  ```
- **Option 2**: Extend `requestLoggingMiddleware` to set Sentry scope (requires import of `Sentry` in middleware)
- This allows cross-referencing Sentry errors with structured logs via shared `request_id`
- Example workflow: Sentry alert → copy `request_id` → search structured logs for full request lifecycle

### Performance Considerations
- Sentry SDK adds ~1-2ms overhead per request with 10% sampling
- Health check endpoint (`/health`) excluded from transaction tracking to reduce noise
- Sampling rate can be tuned based on traffic volume and Sentry quota
- No impact on test suite performance (Sentry disabled in tests)

### Testing in CI
Sentry is disabled during test runs via `NODE_ENV=test` check in `instrument.ts`. This ensures:
- Test errors don't pollute Sentry dashboard
- No external network calls during tests (follows antimocking philosophy)
- No SENTRY_DSN required in CI environment variables
- Integration tests validate this behavior explicitly

### Migration Strategy
This is a **new feature** with no migration required. Existing error handling and logging remain unchanged. Sentry is purely additive.

**Rollout Plan:**
1. Deploy to staging (`kotadb-staging`) with provisioned DSN
2. Monitor for 24-48 hours to validate error patterns
3. Set production DSN: `flyctl secrets set SENTRY_DSN="<prod-dsn>" -a kotadb`
4. Deploy to production during low-traffic window
5. Monitor error rates and performance metrics

**Rollback:**
If issues arise, disable Sentry without code changes:
```bash
flyctl secrets set SENTRY_DSN="" -a kotadb-staging
# or
flyctl secrets unset SENTRY_DSN -a kotadb-staging
```

## Commit Message Validation
All commits for this feature must follow Conventional Commits format:
- `feat(observability): initialize Sentry SDK for error tracking`
- `feat(observability): add global error handlers with Sentry integration`
- `feat(observability): integrate Sentry Express middleware`
- `docs: add Sentry DSN to environment variable documentation`
- `test(sentry): add integration tests for SDK initialization`

**Avoid meta-commentary patterns**: "based on", "the commit should", "here is", "this commit"
