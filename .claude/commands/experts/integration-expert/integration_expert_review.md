---
description: Review code changes from integration perspective
argument-hint: <pr-number-or-diff-context>
---

# Integration Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- Missing error handling at external boundaries
- Hardcoded external URLs or credentials
- MCP tool response not in content block format
- Missing timeout configuration for HTTP calls
- Direct database queries without using client abstraction
- Queue jobs without proper error/retry handling
- Missing Sentry.captureException() in catch blocks (observability requirement since #436, expanded #ed4c4f9)
  - Requirement: All 96+ error capture points must include contextual metadata
  - Include: user_id, repository, operation_type, request_id in Sentry context
- Using console.log/console.error instead of structured logger (violates logging standards since #b7184bd)
- Project-scoped operations missing RLS isolation or project ownership validation

**Important Concerns (COMMENT level):**
- Inconsistent response format across endpoints
- Missing rate limit header propagation
- Overly aggressive retry policies
- Missing correlation IDs for debugging (should pass request_id, user_id, job_id)
- Insufficient logging at boundaries
- Missing Sentry context enrichment (user_id, operation metadata)
- Sensitive data in logs (should be masked automatically via logger)

### MCP Tool Compliance

**Response Format Checklist:**
- [ ] Result wrapped in content block: `{ content: [{ type: "text", text: ... }] }`
- [ ] JSON stringified in text field
- [ ] Error responses use standard error format with code/message
- [ ] Parameter validation before execution
- [ ] Sentry.captureException() on errors with tool name/args context

**Error Code Usage:**
- [ ] `-32603` for tool execution errors
- [ ] Clear error messages (no stack traces in production)
- [ ] Proper HTTP status code mapping to -32700/-32601/-32603
- [ ] Tool-specific error context in Sentry (tool name, parameter types, operation type)

**Project Management Tool Compliance (added #470):**
- [ ] `create_project` validates name required, optional description/repository_ids
- [ ] `list_projects` respects user RLS, supports optional limit parameter
- [ ] `get_project` accepts UUID or case-insensitive name, returns full repository list
- [ ] `update_project` validates project exists before modification, supports partial updates
- [ ] `delete_project` uses cascade delete (associations removed, repos remain indexed)
- [ ] `add_repository_to_project` is idempotent (no duplicate associations)
- [ ] `remove_repository_from_project` is idempotent (no error if already absent)

### Supabase Query Patterns

**Required Patterns:**
- [ ] Use `@db/client.ts` clients (no direct `createClient`)
- [ ] Error handling on all queries
- [ ] Proper null checks on results
- [ ] RLS-aware client selection (anon vs service)

**Anti-Patterns to Flag:**
- Raw SQL queries (use query builder)
- Missing error destructuring
- Ignoring query errors
- Service role when anon would suffice

### Boundary Error Handling

**Required at Each Boundary:**
- [ ] Try-catch wrapping external calls
- [ ] Meaningful error messages
- [ ] Appropriate error propagation
- [ ] Logging for debugging (via createLogger())
- [ ] Sentry error capture with context (Sentry.captureException())
- [ ] Correlation IDs attached to logs and errors

**Timeout Expectations:**
- HTTP clients: Explicit timeout set
- Database queries: Rely on connection pool settings
- Queue jobs: Expiration configured

**Webhook-Specific Patterns (from #406, #408, #27f2f8c):**
- [ ] Signature verification before processing
- [ ] Graceful handling of missing metadata (warn + return 200 to prevent retries)
- [ ] Stripe object property fallbacks (e.g., parent.subscription_details.subscription before top-level)
- [ ] Idempotency for duplicate webhook deliveries (use external_id or similar)
- [ ] Proper error vs warning classification (prevent infinite retries on unrecoverable errors)
- [ ] Subscription ID extraction from invoice.parent.subscription_details when direct field unavailable
- [ ] User ID validation from customer/subscription metadata before database operations

**Health Check Versioning (from #453, #599c780):**
- [ ] Include `api_version` in health check response
- [ ] Version information accessible before authentication
- [ ] Version matches deployment package version

### Integration Testing Expectations

**New MCP Tools:**
- Full request/response cycle test with content block format validation
- Error path testing with Sentry capture verification
- Parameter validation tests (required vs optional params)
- Tool execution with real external systems (antimocking requirement)

**New Project Management Tools (#470):**
- CRUD operations with RLS isolation tests
- Repository association idempotency
- Project ownership validation
- Cascade delete behavior (repositories remain, associations removed)
- UUID vs name lookup (case-insensitive)

**New Endpoints:**
- Authentication integration (API key validation, rate limiting)
- Rate limiting integration (hourly + daily dual limits since #423)
- Database query integration with RLS enforcement
- Structured logging with correlation IDs
- Sentry error capture at error boundaries

**Queue Changes:**
- Job creation tests with metadata validation
- Job completion tests with error handling
- Retry behavior tests (exponential backoff: 60s, 120s, 180s)
- Auto-reindex integration with queue lifecycle (#431)

## Workflow

1. **Parse Diff**: Identify integration-related changes in REVIEW_CONTEXT
2. **Check Boundaries**: Verify error handling at external touchpoints
3. **Check Formats**: Validate response format compliance
4. **Check Patterns**: Ensure established patterns followed
5. **Check Tests**: Verify integration test coverage
6. **Synthesize**: Produce integration quality assessment

## Output

### Integration Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Boundary Issues:**
- [Missing or incorrect error handling at boundaries]

**Format Violations:**
- [Response format non-compliance]

**Pattern Violations:**
- [Established pattern deviations]

**Test Coverage:**
- [Integration test assessment]

**Suggestions:**
- [Integration improvements]

**Compliant Patterns:**
- [Good integration practices observed]
