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
- Missing Sentry.captureException() in catch blocks (observability requirement since #436)
- Using console.log/console.error instead of structured logger (violates logging standards)

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
- [ ] Error responses use standard error format
- [ ] Parameter validation before execution

**Error Code Usage:**
- [ ] `-32603` for tool execution errors
- [ ] Clear error messages (no stack traces in production)
- [ ] Proper HTTP status code mapping

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

**Webhook-Specific Patterns (from #406, #408):**
- [ ] Signature verification before processing
- [ ] Graceful handling of missing metadata (warn + return 200)
- [ ] Stripe object property fallbacks (e.g., parent.subscription_details)
- [ ] Idempotency for duplicate webhook deliveries
- [ ] Proper error vs warning classification (prevent infinite retries)

### Integration Testing Expectations

**New MCP Tools:**
- Full request/response cycle test
- Error path testing
- Parameter validation tests

**New Endpoints:**
- Authentication integration
- Rate limiting integration
- Database query integration

**Queue Changes:**
- Job creation tests
- Job completion tests
- Retry behavior tests

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
