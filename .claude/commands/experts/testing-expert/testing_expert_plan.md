---
description: Provide testing analysis for planning
argument-hint: <issue-context>
---

# Testing Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### Antimocking Philosophy

**Core Principle:** Exercise real integrations (Supabase, background jobs, HTTP boundaries) in tests. Never introduce mocks as shortcuts.

**Why Antimocking:**
- Mocks hide integration bugs that surface only in production
- Real service tests catch configuration drift early
- Fixture data in Supabase provides realistic test scenarios
- Failure injection via real configuration (timeouts, revoked keys) is more reliable than mock simulation

**Forbidden Patterns:**
- `createMock*` helper functions
- `fake*` client implementations
- Manual spies on database clients
- Jest/Bun mock functions for Supabase responses

**Successful Real-Service Patterns:**
- Stripe webhook testing with Stripe CLI for real webhook delivery (#346, #347)
- MCP project CRUD with real Supabase RLS enforcement and 21 integration tests (#470)
- Queue testing with real pg-boss instance and worker registration (#431)
- Auto-reindex testing with full database + queue integration (#431)

### Test Environment Requirements

**Supabase Local Stack:**
- Port 5434: PostgreSQL (migrations, psql)
- Port 54326: Kong gateway (test connections - use this!)
- Start: `cd app && bun test:setup`
- Stop: `cd app && bun test:teardown || true`

**Environment Loading:**
- `app/tests/setup.ts`: Preload script parses `.env.test`
- Tests read `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `process.env`
- Never hardcode URLs - always use environment variables

**Test Lifecycle Pattern:**
```bash
cd app && bun test:setup      # Start Supabase containers
cd app && bun test            # Run all tests
cd app && bun test:teardown   # Cleanup (CI required, local optional)
```

### Test Organization

**Directory Structure:**
- `app/tests/api/` - REST endpoint tests
- `app/tests/auth/` - Authentication and rate limiting tests
- `app/tests/mcp/` - MCP protocol and tool tests
- `app/tests/indexer/` - Git indexer tests
- `app/tests/validation/` - Schema validation tests
- `app/tests/queue/` - Job queue tests
- `app/tests/helpers/` - Test utilities (NOT mocks)
- `app/tests/fixtures/` - Test data and sample repositories

**Test Categories:**
- Integration tests: Real database connections, full request/response cycles
- Unit tests: Pure functions only (no I/O, no state)
- E2E tests: Full system validation with real services

### Test Data Strategies

**Fixture Seeding:**
- Use migrations for schema
- Seed scripts for test data in `app/scripts/`
- Test-specific data via helper functions with cleanup
- Real database UUID fetching: Query database for FK values instead of hardcoding (prevents constraint violations - #431)

**Cleanup Patterns:**
- Each test suite responsible for own cleanup
- Use `beforeAll`/`afterAll` for expensive setup
- Prefer isolated test data (unique IDs per test)
- **Database cleanup in `afterEach`**: Delete created records to prevent constraint violations (discovered in e79c11a)
- **Global rate limit cleanup**: `tests/setup.ts` includes `afterEach` hook to reset rate limit counters (added in #219)
- **Queue lifecycle management**: Tests using pg-boss must call `startQueue()`/`stopQueue()` (fixed in #431)
- **beforeEach project cleanup**: Truncate test projects and metadata for test isolation (#431)

### MCP Testing Patterns

**Test Helpers (`app/tests/helpers/mcp.ts`):**
- `sendMcpRequest()` - Send JSON-RPC requests
- `extractToolResult()` - Parse content block responses
- `assertToolResult()` - Validate successful responses
- `assertJsonRpcError()` - Validate error responses

**Async Assertion Helpers (`app/tests/helpers/async-assertions.ts`):**
- `waitForCondition()` - Poll for expected conditions instead of fixed delays (added in 55d3018)
  - Prevents flaky tests in CI environments with variable I/O performance
  - Default: 3000ms timeout, 50ms polling interval
  - Use for: database writes, job queue operations, external service calls

**SDK Behavior Notes:**
- Tool results wrapped in content blocks
- Extract from `response.result.content[0].text`
- Error code `-32603` for tool-level errors
- HTTP 400 for parse errors, HTTP 200 for method errors

**Queue Testing Patterns (pg-boss):**
- Call `startQueue()` in `beforeAll` and `stopQueue()` in `afterAll` (required for job enqueueing - #431)
- Register workers with `startIndexWorker(getQueue())` before enqueueing jobs
- Fetch real database UUIDs for foreign key fixtures to prevent constraint violations (#431)
- Use `beforeEach` cleanup to delete test data (projects, metadata) for isolation (#431)
- Test queue lifecycle includes both `startQueue()` and worker registration in correct order

**Async Polling Best Practices:**
- Use `waitForCondition()` instead of `setTimeout()` for deterministic async testing
- Prevents flaky tests in CI environments with variable I/O performance (32dcdf7)
- Supports custom timeout and polling interval options
- Provides meaningful error messages with elapsed time on timeout

## Workflow

1. **Parse Context**: Understand feature/bug from USER_PROMPT
2. **Identify Test Scope**: Determine which test categories needed
3. **Plan Test Data**: Define fixtures and seeding strategy
4. **Design Test Cases**: Cover success paths, error paths, edge cases
5. **Verify Antimocking**: Ensure no mock patterns introduced
6. **Plan Cleanup**: Define teardown strategy

## Report Format

### Testing Perspective

**Test Scope:**
- [Test categories required: integration/unit/e2e]

**Test Files to Create/Modify:**
- [List of test file paths]

**Test Data Requirements:**
- [Fixtures needed, seeding approach]

**Test Cases:**
1. [Test case description - success path]
2. [Test case description - error path]
3. [Test case description - edge case]

**Antimocking Compliance:**
- [Confirmation no mocks needed, or exception justification]

**Risks:**
- [Testing risks with mitigation]
