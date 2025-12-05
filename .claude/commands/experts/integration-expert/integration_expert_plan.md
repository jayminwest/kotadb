---
description: Provide integration analysis for planning
argument-hint: <issue-context>
---

# Integration Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### MCP Server Patterns

**Server Architecture:**
- Location: `app/src/mcp/`
- SDK: `@modelcontextprotocol/sdk` (v1.20+)
- Transport: `StreamableHTTPServerTransport` with `enableJsonResponse: true`
- Mode: Stateless, per-request Server instances for user isolation

**Tool Registration Pattern:**
```typescript
// In server.ts
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // Dispatch to tool handlers
});
```

**Tool Response Format:**
```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify(result)
  }]
}
```

**Available Tools:**
- `search_code` - Search indexed files for terms (supports project filtering since #431)
- `index_repository` - Clone/update and index git repos
- `list_recent_files` - List recently indexed files
- `search_dependencies` - Dependency graph traversal
- `analyze_change_impact` - Impact analysis for changes
- `validate_implementation_spec` - Spec validation
- Project management: `create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`, `add_repository_to_project`, `remove_repository_from_project` (added #431, refined #470)

### Supabase Client Patterns

**Client Initialization (`@db/client.ts`):**
```typescript
// Service role - bypasses RLS
const serviceClient = createClient(url, serviceKey);

// Anon client - enforces RLS
const anonClient = createClient(url, anonKey);
```

**Connection Management:**
- Single client instance per request context
- Connection pooling handled by Supabase
- Graceful shutdown drains active connections

**Query Patterns:**
```typescript
// Select with RLS
const { data, error } = await client
  .from('table')
  .select('*')
  .eq('user_id', userId);

// Insert with returning
const { data, error } = await client
  .from('table')
  .insert({ ...record })
  .select()
  .single();
```

### External API Integration

**GitHub Integration:**
- Clone via git URL or `owner/repo` format
- Optional custom git base via `KOTA_GIT_BASE_URL`
- Ref/branch resolution with main/master fallback

**Fly.io Deployment:**
- Staging: Automatic on PR merge to develop
- Production: Automatic on release tag

**Queue Integration (pg-boss):**
- Connection: Supabase Postgres (port 5432)
- Schema: Separate `pgboss` schema
- Jobs: `IndexRepoJobPayload` for async indexing

**Stripe Integration:**
- Webhook signature verification with `STRIPE_WEBHOOK_SECRET`
- Checkout session handling for immediate tier sync (#406)
- Invoice.paid event processing for subscription renewal
- Resilient subscription ID extraction (parent.subscription_details fallback)
- Customer/subscription metadata for user_id tracking
- Graceful handling of missing metadata (log warning, return 200 to prevent retries)

### Error Handling at Boundaries

**MCP Error Codes:**
- `-32700` (Parse Error): Invalid JSON/malformed request → HTTP 400
- `-32601` (Method Not Found): Unknown method → HTTP 200
- `-32603` (Internal Error): Tool errors, validation → HTTP 200

**Retry Patterns:**
- Queue jobs: 3 retries with exponential backoff (60s, 120s, 180s)
- HTTP clients: Timeout configuration per request
- Database: Connection retry handled by client

**Timeout Configuration:**
- Job expiration: 24 hours
- Archive completed: 1 hour
- HTTP request: Configurable per endpoint

**Observability Integration (since #436):**
- Sentry error tracking at all boundaries (145 capture points across codebase)
- Structured logging with correlation IDs (request_id, user_id, job_id)
- Automatic sensitive data masking in logs (API keys, tokens, passwords)
- Log levels: debug, info, warn, error (configurable via LOG_LEVEL env var)
- Request/response logging middleware with auto-generated request_id

### Response Format Standards

**REST Endpoints:**
```typescript
// Success
{ data: result, meta?: { pagination } }

// Error
{ error: { code, message, details? } }
```

**MCP Tools:**
```typescript
// Success
{ content: [{ type: "text", text: JSON.stringify(result) }] }

// Error
{ error: { code: -32603, message: "Error description" } }
```

### Rate Limiting (updated #423)

**Tier Limits (Hourly/Daily):**
- Free: 1000/hour, 5000/day
- Solo: 5000/hour, 25000/day
- Team: 25000/hour, 100000/day

**Implementation:**
- Dual counter system: `rate_limit_counters` (hourly), `rate_limit_counters_daily` (daily)
- Database functions: `increment_rate_limit()`, `increment_rate_limit_daily()`
- Middleware enforces both limits before processing request
- Returns 429 with `Retry-After` header when limit exceeded

### Known Edge Cases

**Stripe Webhook Metadata Extraction:**
- **Issue**: Subscription ID location varies by Stripe API version (discovered in #406-#408)
- **Trigger**: Processing invoice.paid or checkout.session.completed events
- **Resolution**: Check parent.subscription_details.subscription first, fallback to top-level subscription field
- **Prevention**: Always implement fallback chains for Stripe object navigation

**Missing User Metadata in Webhooks:**
- **Issue**: user_id may be missing from subscription/customer metadata
- **Trigger**: Webhooks from old subscriptions or external checkout flows
- **Impact**: Cannot link payment to user account
- **Resolution**: Log warning with context (invoiceId, subscriptionId, customerId), return 200 to prevent retries
- **Prevention**: Validate metadata presence during checkout session creation

**Dual Rate Limit Enforcement:**
- **Issue**: Must check both hourly AND daily limits (since #423)
- **Trigger**: High-volume API usage within single hour
- **Impact**: Users could exceed daily quota via rapid hourly bursts
- **Resolution**: Increment both counters atomically, check both before allowing request
- **Prevention**: Always use paired limit checks in middleware

**Sentry in Error Handlers:**
- **Issue**: 97% of try-catch blocks weren't capturing to Sentry (pre-#436)
- **Trigger**: Production errors invisible in monitoring dashboard
- **Resolution**: Add Sentry.captureException() to every catch block with contextual metadata
- **Prevention**: Make Sentry capture part of code review checklist

## Workflow

1. **Parse Context**: Understand integration requirements from USER_PROMPT
2. **Identify Boundaries**: Map external system touchpoints
3. **Check Patterns**: Compare against established integration patterns
4. **Error Handling**: Define error paths at each boundary
5. **Timeout Strategy**: Determine appropriate timeouts
6. **Test Strategy**: Plan integration testing approach

## Report Format

### Integration Perspective

**External Systems:**
- [Systems this change integrates with]

**Boundary Points:**
- [API endpoints, MCP tools, database calls affected]

**Error Handling:**
- [Error scenarios and handling strategy]

**Timeout/Retry:**
- [Timeout and retry configuration needed]

**Recommendations:**
1. [Integration recommendation with rationale]

**Risks:**
- [Integration risk with severity: HIGH/MEDIUM/LOW]

**Testing Requirements:**
- [Integration tests needed to validate boundaries]
