# Epic 8: Monitoring & Operations

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: 🟡 15% Complete (Minimal Progress)
**Priority**: Medium (Launch readiness)
**Estimated Duration**: 1 week
**Actual Progress**: Basic `/health` endpoint exists. Remaining: structured logging, metrics, alerts.

## Overview

Implement structured logging, health checks, and monitoring configuration. Use built-in tools (Fly.io, Supabase) to avoid new dependencies.

## Issues

### Issue #28: Set up structured logging with bun:logger

**Priority**: P1 (High)
**Depends on**: None (can start early)
**Blocks**: Debugging and observability

#### Description
Implement JSON-formatted structured logging with correlation IDs throughout the application.

#### Acceptance Criteria
- [ ] JSON log format to stdout/stderr
- [ ] Correlation IDs: `request_id`, `user_id`, `job_id`
- [ ] Log levels: debug, info, warn, error
- [ ] Request/response logging middleware
- [ ] Error logging with stack traces
- [ ] Configurable log level via environment variable
- [ ] No PII in logs (mask sensitive data)

#### Technical Notes
- Use Bun's built-in logger (lightweight, zero dependencies)
- Attach correlation ID to all log entries in a request
- Fly.io captures stdout/stderr automatically
- Query with `flyctl logs --app kotadb-prod`

#### Files to Create
- `src/logging/logger.ts` - Logger configuration
- `src/logging/middleware.ts` - Request logging middleware
- `src/logging/correlation.ts` - Correlation ID management

#### Example Implementation
```typescript
import { randomUUID } from 'crypto'

export interface LogContext {
  requestId?: string
  userId?: string
  jobId?: string
  [key: string]: any
}

export function createLogger(context: LogContext = {}) {
  return {
    debug: (message: string, meta?: any) => log('debug', message, { ...context, ...meta }),
    info: (message: string, meta?: any) => log('info', message, { ...context, ...meta }),
    warn: (message: string, meta?: any) => log('warn', message, { ...context, ...meta }),
    error: (message: string, error?: Error, meta?: any) => {
      log('error', message, {
        ...context,
        ...meta,
        error: error?.message,
        stack: error?.stack,
      })
    },
  }
}

function log(level: string, message: string, meta: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  }

  if (level === 'error') {
    console.error(JSON.stringify(logEntry))
  } else {
    console.log(JSON.stringify(logEntry))
  }
}

// Helper: wrap fetch handlers with logging
export async function withRequestLogging(
  request: Request,
  handler: (logger: ReturnType<typeof createLogger>) => Promise<Response>,
  context: { userId?: string } = {}
): Promise<Response> {
  const requestId = randomUUID()
  const startedAt = Date.now()
  const logger = createLogger({ requestId, ...context })

  logger.info('Incoming request', {
    method: request.method,
    url: request.url,
  })

  try {
    const response = await handler(logger)
    logger.info('Request completed', {
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    })
    return response
  } catch (error) {
    logger.error('Request failed', error as Error, {
      durationMs: Date.now() - startedAt,
    })
    throw error
  }
}
```

---

### Issue #29: Enhanced health check endpoint

**Priority**: P1 (High)
**Depends on**: #2 (database), #12 (queue), #16 (GitHub)
**Blocks**: Deployment

#### Description
Build comprehensive health check endpoint that verifies all critical services.

#### Acceptance Criteria
- [ ] GET /health returns 200 if all checks pass
- [ ] Returns 503 if any check fails
- [ ] Check database connection
- [ ] Check job queue health
- [ ] Check GitHub API connectivity (optional)
- [ ] Return detailed status for debugging
- [ ] Fly.io polls this endpoint for instance health

#### Technical Notes
- Keep checks fast (< 500ms total)
- Cache check results briefly (10 seconds)
- Don't expose sensitive information in public endpoint
- Use separate `/health/detailed` for admin access

#### Files to Create
- `src/api/health.ts` - Health check handlers

#### Example Implementation
```typescript
export async function healthCheck(): Promise<Response> {
  const checks = {
    database: false,
    queue: false,
    github: false,
  }

  try {
    checks.database = await checkDatabaseHealth()
  } catch (error) {
    console.error('Database health check failed:', error)
  }

  try {
    checks.queue = await checkQueueHealth()
  } catch (error) {
    console.error('Queue health check failed:', error)
  }

  try {
    checks.github = await checkGitHubHealth()
  } catch (error) {
    console.warn('GitHub health check failed:', error)
  }

  const allHealthy = checks.database && checks.queue
  const statusCode = allHealthy ? 200 : 503

  return new Response(
    JSON.stringify({
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode,
      headers: { 'content-type': 'application/json' },
    }
  )
}

async function checkDatabaseHealth(): Promise<boolean> {
  const { error } = await supabase.from('repositories').select('count').limit(1)
  return !error
}

async function checkQueueHealth(): Promise<boolean> {
  try {
    await queue.getQueueSize('index-repo')
    return true
  } catch {
    return false
  }
}

async function checkGitHubHealth(): Promise<boolean> {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_APP_PRIVATE_KEY })
    await octokit.rest.meta.root()
    return true
  } catch {
    return false
  }
}
```

---

### Issue #30: Configure Fly.io metrics and alerts

**Priority**: P2 (Medium)
**Depends on**: #29 (health check)
**Blocks**: Production monitoring

#### Description
Set up Fly.io metrics dashboard and configure alerts for critical failures.

#### Acceptance Criteria
- [ ] Fly.io metrics enabled in dashboard
- [ ] Health check configured (polls `/health` every 30s)
- [ ] Alerts configured for:
  - Instance downtime (restarts)
  - High error rate (> 5% 5xx responses)
  - High latency (p95 > 2 seconds)
  - Failed health checks
- [ ] Alert destinations configured (email, Slack, or webhook)
- [ ] Documentation for viewing metrics

#### Technical Notes
- Fly.io dashboard: https://fly.io/apps/kotadb-prod/metrics
- Configure via `fly.toml` or Fly.io UI
- Metrics retained for 30 days (free tier)

#### Files to Update
- `fly.toml` - Health check configuration
- `docs/monitoring.md` - Monitoring guide

#### Example fly.toml
```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[checks]
  [checks.health]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/health"
    timeout = "5s"
    type = "http"

[metrics]
  port = 9091
  path = "/metrics"
```

---

## Success Criteria

- [ ] Structured logs are queryable with `flyctl logs`
- [ ] Correlation IDs trace requests end-to-end
- [ ] Health check accurately reflects service status
- [ ] Fly.io restarts unhealthy instances automatically
- [ ] Alerts notify team of critical issues
- [ ] Metrics dashboard shows latency, errors, throughput

## Dependencies for Other Epics

This epic supports:
- Debugging issues in all other epics
- Production deployment (Epic 9)
- Operational visibility
