---
description: Review code changes from testing perspective
argument-hint: <pr-number-or-diff-context>
---

# Testing Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- New mock helpers (`createMock*`, `fake*`, manual spies)
- Hardcoded Supabase URLs in tests (should use env vars)
- Missing tests for new endpoints or tools
- Tests that skip Supabase setup (`bun test:setup`)
- Direct database manipulation without cleanup

**Important Concerns (COMMENT level):**
- Missing error path coverage
- Flaky test patterns (timing-dependent assertions)
- Overly broad test scope (testing multiple features in one test)
- Missing edge case coverage
- Unclear test descriptions

**Anti-Patterns to Flag:**
- Fixed `setTimeout()` delays instead of `waitForCondition()` polling (causes flaky tests in CI - 55d3018)
- Missing `afterEach` database cleanup leading to constraint violations (e79c11a)
- Queue tests without `startQueue()`/`stopQueue()` lifecycle management (#431)
- Hardcoded UUIDs for foreign keys instead of querying database (#431)
- Tests that rely on global state without cleanup (rate limits, sessions)

**Antimocking Checklist:**
- [ ] No `jest.mock()` or `bun.mock()` calls
- [ ] No `createMock*` helper functions
- [ ] No `fake*` implementations
- [ ] No manual spies on Supabase clients
- [ ] Real database connections used
- [ ] Failure scenarios use real config (revoked keys, timeouts)

### Test Quality Criteria

**Good Test Patterns:**
- Descriptive test names (behavior, not implementation)
- Single assertion focus (one concept per test)
- Proper setup/teardown isolation
- Use of test helpers from `app/tests/helpers/`
- Explicit cleanup of created data
- **Use `waitForCondition()` for async assertions** instead of fixed `setTimeout()` delays (prevents flaky tests - 55d3018)
- **Queue tests include lifecycle hooks**: `startQueue()` in `beforeAll`, `stopQueue()` in `afterAll` (#431)
- **Database cleanup in `afterEach`**: Delete created records to prevent constraint violations between tests (e79c11a)
- **Real database UUIDs for fixtures**: Query database for foreign key values instead of hardcoding (#431)

**Test Coverage Expectations:**
- New endpoints: 100% integration test coverage
- New MCP tools: Full request/response cycle tests
- Auth changes: Token validation and rate limit tests
- Database changes: Migration + query tests

**Timeout Management:**
- Default Bun test timeout: 5000ms
- Increase timeout for I/O-heavy tests (concurrent MCP, webhook delivery)
- Example: 10000ms for concurrent database operations in CI (3c2809a)
- Always prefer `waitForCondition()` over fixed delays to reduce timeout needs

### Evidence Requirements

**Real Service Validation:**
- Tests must show Supabase query logs when relevant
- Rate limit tests must show counter increments in database
- Auth tests must validate against real key storage

## Workflow

1. **Parse Diff**: Identify test files in REVIEW_CONTEXT
2. **Check Coverage**: Verify new code has corresponding tests
3. **Check Antimocking**: Scan for forbidden mock patterns
4. **Check Quality**: Assess test patterns against criteria
5. **Verify Evidence**: Ensure real-service validation present
6. **Synthesize**: Produce test quality assessment

## Output

### Testing Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Antimocking Violations:**
- [List any mock patterns found]

**Coverage Gaps:**
- [Untested code paths]

**Quality Issues:**
- [Test pattern problems]

**Evidence Check:**
- [Real-service validation status]

**Suggestions:**
- [Test improvements]

**Compliant Patterns:**
- [Good testing practices observed]
