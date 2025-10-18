# Feature Plan: MCP Regression Testing with Claude Code Integration

## Metadata
- **Issue**: #68
- **Title**: feat: add MCP regression testing with Claude Code as first-class use case
- **Labels**: component:api, component:testing, priority:high, effort:medium, status:needs-investigation
- **Branch**: feat/68-mcp-regression-testing

## Overview

### Problem
The MCP (Model Context Protocol) endpoint integration completed in issue #44 lacks comprehensive automated regression testing. Current testing coverage is minimal with only 4 test files (handshake, tools, headers, errors) providing basic protocol validation. There's no systematic testing of:
- MCP protocol lifecycle (initialize → tools/list → tools/call → close)
- Authentication and rate limiting enforcement on MCP endpoints
- JSON-RPC error code correctness per SDK behavior
- Integration with Claude Code as the reference client
- Failure scenarios and edge cases (malformed requests, concurrent calls, timeout handling)

This creates deployment risk as changes to the Express integration, authentication middleware, or MCP SDK version could break the protocol contract without detection.

### Desired Outcome
Comprehensive regression test suite that:
1. Validates full MCP protocol compliance using real Supabase stack (antimocking)
2. Tests all three MCP tools (search_code, index_repository, list_recent_files) with real database operations
3. Ensures authentication and rate limiting work correctly on MCP endpoints
4. Documents Claude Code integration patterns for developers
5. Runs automatically in CI to catch breaking changes before deployment
6. Achieves >90% test coverage on app/src/mcp/ modules

### Non-Goals
- Testing MCP SDK internals (delegated to @modelcontextprotocol/sdk test suite)
- Adding MCP server performance benchmarks (future work)
- Implementing MCP SSE streaming transport (feature uses JSON-RPC mode only)
- Creating end-to-end tests with real Claude Code CLI (integration tests with HTTP client sufficient)
- Adding new MCP tools (focus is testing existing tools: search_code, index_repository, list_recent_files)

## Technical Approach

### Architecture Notes
The MCP integration uses a **stateless, per-request server pattern** with StreamableHTTPServerTransport in JSON mode (enableJsonResponse: true). Each POST /mcp request:
1. Passes through authentication middleware (validates Bearer token, enforces rate limits)
2. Creates a new MCP Server instance with user-scoped context (supabase client, userId)
3. Registers tool handlers (search_code, index_repository, list_recent_files)
4. Connects transport to server
5. Delegates request handling to SDK transport
6. Returns JSON-RPC 2.0 response

Key testing challenges:
- SDK wraps tool results in content blocks: `{content: [{type: "text", text: JSON.stringify(result)}]}`
- SDK error codes differ from custom implementations: `-32603` for all tool-level errors (not `-32602`)
- SDK returns HTTP 400 for parse errors, HTTP 200 for method-level errors
- DNS rebinding protection disabled by default (no Origin/MCP-Protocol-Version enforcement)

### Key Modules to Touch

**Existing Modules (No Changes Required):**
- app/src/mcp/server.ts - MCP server factory and transport creation
- app/src/mcp/tools.ts - Tool definitions and execution logic
- app/src/api/routes.ts - Express route handler for POST /mcp
- app/tests/helpers/mcp.ts - Already has extractToolResult() helper
- app/tests/helpers/db.ts - Test database helpers (auth headers, test data)

**New Test Files (To Create):**
- app/tests/mcp/lifecycle.test.ts - Full protocol handshake flow
- app/tests/mcp/authentication.test.ts - Auth and rate limit enforcement
- app/tests/mcp/tool-validation.test.ts - Parameter validation and error handling
- app/tests/mcp/integration.test.ts - End-to-end workflows with real database
- app/tests/mcp/concurrent.test.ts - Concurrent request handling and isolation

**Documentation Updates:**
- docs/testing-setup.md - Add MCP testing section with Claude Code integration examples
- CLAUDE.md - Add MCP regression testing to "MCP SDK Behavior Notes" section

### Data/API Impacts
- No schema changes required (uses existing test database seed data)
- No API contract changes (testing existing endpoints)
- Reuses test fixtures from app/supabase/seed.sql (test users, API keys, repositories)
- May add additional seed data for edge case testing (rate limit exhaustion, concurrent indexing)

## Relevant Files

### Existing Implementation
- app/src/mcp/server.ts - MCP server factory with createMcpServer() and createMcpTransport()
- app/src/mcp/tools.ts - Tool definitions and execution adapters (executeSearchCode, executeIndexRepository, executeListRecentFiles)
- app/src/mcp/jsonrpc.ts - JSON-RPC error helpers (invalidParams, internalError, methodNotFound)
- app/src/mcp/headers.ts - Header validation utilities (currently unused due to SDK defaults)
- app/src/mcp/lifecycle.ts - Protocol lifecycle helpers
- app/src/mcp/session.ts - Session management (stateless mode, no active sessions)
- app/src/api/routes.ts:229-277 - POST /mcp and GET /mcp Express handlers
- app/tests/helpers/mcp.ts - extractToolResult() helper for parsing SDK content blocks
- app/tests/helpers/db.ts - createAuthHeader(), TEST_API_KEYS, TEST_USER_IDS
- app/tests/helpers/server.ts - startTestServer(), stopTestServer() for integration tests

### Existing Tests (To Enhance)
- app/tests/mcp/handshake.test.ts - Basic initialize/initialized flow (expand with lifecycle tests)
- app/tests/mcp/tools.test.ts - Tool execution tests (add parameter validation and edge cases)
- app/tests/mcp/headers.test.ts - Header validation (currently minimal due to SDK defaults)
- app/tests/mcp/errors.test.ts - Error handling (add comprehensive error code validation)

### New Files
- app/tests/mcp/lifecycle.test.ts - Full protocol lifecycle (initialize → tools/list → tools/call → notifications)
- app/tests/mcp/authentication.test.ts - Auth enforcement (401 without token, 429 rate limit, tier-based limits)
- app/tests/mcp/tool-validation.test.ts - Parameter validation (missing required fields, invalid types, boundary conditions)
- app/tests/mcp/integration.test.ts - End-to-end workflows (index repo → search code → verify results)
- app/tests/mcp/concurrent.test.ts - Concurrent request handling (user isolation, rate limit counting)
- docs/guides/mcp-claude-code-integration.md - Integration guide with .mcp.json config examples

## Task Breakdown

### Phase 1: Test Infrastructure Enhancement
**Goal:** Prepare test helpers and fixtures for comprehensive MCP testing

1. Enhance app/tests/helpers/mcp.ts with additional utilities:
   - sendMcpRequest(method, params, tier) - Standard MCP request builder
   - createMcpHeaders(tier) - Headers with auth and MCP protocol version
   - assertToolResult(response, expectedFields) - Content block extraction and validation
   - assertJsonRpcError(response, code, messagePattern) - Error response validation

2. Add MCP-specific seed data to app/supabase/seed.sql:
   - Additional test repositories for concurrent indexing tests
   - Rate limit test fixtures (user near limit, user at limit)
   - Edge case data (empty repository, large file count)

3. Create test fixture files under app/tests/fixtures/mcp/:
   - sample-repository/ - Minimal test repo for indexing tests
   - expected-responses/ - JSON files with expected tool results for comparison

### Phase 2: Core Protocol Testing
**Goal:** Validate MCP protocol compliance and SDK behavior

4. Create app/tests/mcp/lifecycle.test.ts:
   - Test: Full handshake flow (initialize → initialized notification → tools/list → tools/call → ping)
   - Test: Protocol version negotiation (client version matches server version)
   - Test: Capability advertising (server declares tools capability)
   - Test: Notification handling (notifications/initialized returns 202)
   - Test: Connection cleanup (transport closes on response end)

5. Enhance app/tests/mcp/errors.test.ts:
   - Test: Malformed JSON returns -32700 Parse Error (HTTP 400)
   - Test: Unknown method returns -32601 Method Not Found (HTTP 200)
   - Test: Missing required params returns -32603 Internal Error (HTTP 200)
   - Test: Invalid param types return -32603 Internal Error (HTTP 200)
   - Test: Unknown tool name returns -32603 with descriptive message
   - Test: Tool execution errors return -32603 with error details

6. Create app/tests/mcp/authentication.test.ts:
   - Test: Missing Authorization header returns 401 Unauthorized
   - Test: Invalid API key returns 401 with error message
   - Test: Disabled API key returns 401 Forbidden
   - Test: Valid API key allows request (free/solo/team tiers)
   - Test: Rate limit headers present on all responses (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
   - Test: Rate limit exceeded returns 429 with Retry-After header
   - Test: Rate limit counter increments per MCP request
   - Test: Rate limit resets after window expires

### Phase 3: Tool Execution Testing
**Goal:** Test all MCP tools with real database operations

7. Create app/tests/mcp/tool-validation.test.ts:
   - Test: search_code missing term parameter returns -32603
   - Test: search_code with invalid term type (number) returns -32603
   - Test: search_code with optional repository filter validates type
   - Test: search_code with optional limit validates number range (max 100)
   - Test: index_repository missing repository parameter returns -32603
   - Test: index_repository with invalid ref type returns -32603
   - Test: index_repository with invalid localPath type returns -32603
   - Test: list_recent_files with invalid limit type returns -32603
   - Test: list_recent_files with no parameters succeeds (defaults to limit=10)

8. Enhance app/tests/mcp/tools.test.ts:
   - Test: search_code finds indexed files with matching content
   - Test: search_code returns snippet with context around match
   - Test: search_code respects repository filter (only returns files from specified repo)
   - Test: search_code respects limit parameter (returns max N results)
   - Test: search_code with no matches returns empty results array
   - Test: index_repository queues indexing job and returns runId
   - Test: index_repository with localPath uses local directory
   - Test: index_repository with ref parameter checks out specified branch
   - Test: list_recent_files returns files ordered by indexedAt DESC
   - Test: list_recent_files respects limit parameter
   - Test: All tool results wrapped in SDK content blocks (extractToolResult validates)

### Phase 4: Integration and Concurrency Testing
**Goal:** Validate end-to-end workflows and concurrent request handling

9. Create app/tests/mcp/integration.test.ts:
   - Test: Full workflow - index repository → wait for completion → search code → verify results
   - Test: Multi-tool workflow - list recent files → search for term → index new repo → search again
   - Test: Repository cloning from GitHub (using KOTA_GIT_BASE_URL)
   - Test: Local path indexing (using test fixture directory)
   - Test: Large repository handling (timeout, partial indexing, progress tracking)
   - Test: Error recovery (failed indexing job status recorded, subsequent requests succeed)

10. Create app/tests/mcp/concurrent.test.ts:
    - Test: Concurrent requests from same user isolated (no state leakage)
    - Test: Concurrent requests from different users isolated (separate auth contexts)
    - Test: Rate limit counting accurate under concurrency (100 concurrent requests from free user → 429)
    - Test: Multiple index jobs queue correctly (no race conditions on repository_id)
    - Test: Search during indexing returns partial results (no locking issues)

### Phase 5: Documentation and CI Integration
**Goal:** Document MCP testing and integrate into CI pipeline

11. Create docs/guides/mcp-claude-code-integration.md:
    - Section: Registering KotaDB with Claude Code (claude mcp add command)
    - Section: .mcp.json configuration examples (local dev, production)
    - Section: Testing MCP tools from Claude Code CLI
    - Section: Troubleshooting connection issues (auth, rate limits, protocol version)
    - Section: Development workflow (local server + Claude Code integration)

12. Update docs/testing-setup.md:
    - Add "MCP Testing" section after "Writing Tests"
    - Document MCP test helpers and fixtures
    - Explain SDK content block response format
    - Reference docs/guides/mcp-claude-code-integration.md

13. Update CLAUDE.md:
    - Add test file count to "MCP SDK Behavior Notes" section (9 test files, 100+ test cases)
    - Document new test helpers in app/tests/helpers/mcp.ts
    - Reference MCP testing guide for developers

14. Verify CI integration:
    - Run full MCP test suite locally: bun test tests/mcp/
    - Ensure tests run in .github/workflows/app-ci.yml (no path filters needed, already runs all tests)
    - Validate test execution time (target: <20 seconds for MCP suite)
    - Check test coverage report (target: >90% for app/src/mcp/)

## Step by Step Tasks

### Phase 1: Test Infrastructure Enhancement
1. Read app/tests/helpers/mcp.ts to understand existing extractToolResult() implementation
2. Add sendMcpRequest(), createMcpHeaders(), assertToolResult(), assertJsonRpcError() helpers
3. Read app/supabase/seed.sql to understand existing test data structure
4. Add MCP-specific seed data (additional repos, rate limit fixtures)
5. Create app/tests/fixtures/mcp/sample-repository/ directory with minimal test files
6. Create app/tests/fixtures/mcp/expected-responses/ directory with JSON fixtures

### Phase 2: Core Protocol Testing
7. Create app/tests/mcp/lifecycle.test.ts and implement handshake flow tests
8. Enhance app/tests/mcp/errors.test.ts with comprehensive error code validation
9. Create app/tests/mcp/authentication.test.ts and implement auth/rate limit tests
10. Run tests to validate protocol compliance: bun test tests/mcp/lifecycle.test.ts tests/mcp/errors.test.ts tests/mcp/authentication.test.ts

### Phase 3: Tool Execution Testing
11. Create app/tests/mcp/tool-validation.test.ts and implement parameter validation tests
12. Enhance app/tests/mcp/tools.test.ts with comprehensive tool execution tests
13. Run tests to validate tool behavior: bun test tests/mcp/tool-validation.test.ts tests/mcp/tools.test.ts

### Phase 4: Integration and Concurrency Testing
14. Create app/tests/mcp/integration.test.ts and implement end-to-end workflow tests
15. Create app/tests/mcp/concurrent.test.ts and implement concurrency isolation tests
16. Run tests to validate integration: bun test tests/mcp/integration.test.ts tests/mcp/concurrent.test.ts

### Phase 5: Documentation and CI Integration
17. Create docs/guides/mcp-claude-code-integration.md with Claude Code registration guide
18. Update docs/testing-setup.md with MCP testing section
19. Update CLAUDE.md with test count and helper documentation
20. Run full test suite to validate all changes: bun test
21. Run type-check to ensure no TypeScript errors: bunx tsc --noEmit
22. Run linter to ensure code quality: bun run lint (if available)
23. Validate migration sync: bun run test:validate-migrations
24. Validate environment variable handling: bun run test:validate-env
25. Push branch to remote: git push -u origin feat/68-mcp-regression-testing

## Risks & Mitigations

### Risk: Test Suite Execution Time Exceeds Target (<20s for MCP suite)
**Impact:** Slow CI builds, developer friction
**Mitigation:**
- Use focused test suites (bun test --filter mcp) during development
- Optimize integration tests to reuse server instances across tests (beforeAll/afterAll)
- Parallelize independent test files with Bun's native parallel execution
- Skip slow tests (large repository indexing) in watch mode, run in CI only

### Risk: SDK Behavior Changes in Future Versions
**Impact:** Tests break on SDK upgrade, false negatives
**Mitigation:**
- Pin @modelcontextprotocol/sdk version in package.json
- Document SDK version compatibility in CLAUDE.md
- Add tests for SDK-specific behaviors (content block wrapping, error codes) to detect breaking changes
- Review SDK changelog before upgrades and update tests accordingly

### Risk: Test Database State Pollution Between Tests
**Impact:** Flaky tests, false failures due to shared state
**Mitigation:**
- Use unique test data IDs for each test file (e.g., repository IDs with test-specific prefixes)
- Implement cleanup in afterEach/afterAll hooks (delete test-created records)
- Consider transaction rollback pattern for isolated test runs (future enhancement)
- Document test data conventions in docs/testing-setup.md

### Risk: Rate Limit Tests Interfere with Other Tests
**Impact:** 429 errors in unrelated tests due to shared test users
**Mitigation:**
- Create dedicated rate-limit-test user with known limits
- Reset rate limit counters in beforeEach hook (direct database update)
- Use frozen time in rate limit tests to control window expiry (if possible)
- Document rate limit test isolation requirements

### Risk: Claude Code Integration Examples Become Outdated
**Impact:** Documentation drift, developer confusion
**Mitigation:**
- Test Claude Code registration steps manually before PR submission
- Add CI step to validate .mcp.json config syntax (JSON schema validation)
- Link to official Claude Code docs for canonical reference
- Add "last verified" timestamp to integration guide

## Validation Strategy

### Automated Tests (Primary Validation)
All tests follow antimocking principles with real Supabase stack integration:

1. **Protocol Compliance Tests** (app/tests/mcp/lifecycle.test.ts, errors.test.ts)
   - Validates JSON-RPC 2.0 message format
   - Tests SDK error code mapping (-32700, -32601, -32603)
   - Verifies protocol version negotiation and capability advertising
   - Evidence: Test output shows correct error codes and response structure

2. **Authentication & Rate Limiting Tests** (app/tests/mcp/authentication.test.ts)
   - Tests with real API keys from test database (free/solo/team tiers)
   - Validates rate limit counter increments via real database function (increment_rate_limit)
   - Tests 401 responses with invalid keys, 429 responses with exhausted limits
   - Evidence: Database queries show rate_limit_hourly increments, response headers match expected values

3. **Tool Execution Tests** (app/tests/mcp/tools.test.ts, tool-validation.test.ts)
   - Tests against real indexed files in test database
   - Validates parameter type checking and error handling
   - Tests search results, indexing jobs, file listings with real Supabase queries
   - Evidence: Database records created/updated, search results match indexed content

4. **Integration Tests** (app/tests/mcp/integration.test.ts)
   - Full workflow: index repository → search code → verify results
   - Uses real git clone operations (or local test fixtures)
   - Tests indexing job status transitions (pending → completed)
   - Evidence: Database shows index_jobs status, indexed_files records created

5. **Concurrency Tests** (app/tests/mcp/concurrent.test.ts)
   - Parallel requests from multiple users with real database isolation
   - Rate limit counting under concurrency (100 concurrent requests)
   - Tests for race conditions on repository creation
   - Evidence: Database rate_limit_hourly accurate, no duplicate repositories created

### Manual Checks (Secondary Validation)
**Claude Code Integration Testing:**
1. Start local server: `cd app && bun run src/index.ts`
2. Register with Claude Code: `claude mcp add kotadb http://localhost:3000/mcp -t http -H "Authorization: Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"`
3. Verify connection: `claude mcp list` shows "✓ Connected" status
4. Test tools from Claude Code session:
   - `Use the search_code tool to find "Router"` - verify results returned
   - `Use the index_repository tool to index test/repo` - verify runId returned
   - `Use the list_recent_files tool` - verify file list returned
5. Evidence: Claude Code successfully calls all three tools, results match test database

**Failure Scenario Testing:**
1. Test with invalid API key → 401 Unauthorized
2. Test with rate limit exhausted → 429 Too Many Requests with Retry-After header
3. Test with malformed JSON → 400 Bad Request with -32700 Parse Error
4. Test with unknown tool → -32603 Internal Error with "Unknown tool" message
5. Evidence: Error responses match expected codes and messages

### Release Guardrails
**CI/CD Validation:**
1. GitHub Actions workflow runs full test suite on every PR
2. Test coverage report shows >90% coverage on app/src/mcp/ modules
3. TypeScript type-check passes (bunx tsc --noEmit)
4. Linter passes (bun run lint)
5. Migration sync validation passes (bun run test:validate-migrations)
6. Environment variable validation passes (bun run test:validate-env)
7. Evidence: CI badge shows passing status, coverage report in PR comment

**Deployment Monitoring:**
1. Monitor MCP endpoint response times (<100ms p50, <500ms p95)
2. Track 401/429 error rates (should match expected auth/rate limit failures)
3. Alert on unexpected 500 errors (tool execution failures)
4. Evidence: Monitoring dashboard shows healthy MCP endpoint metrics

**Rollback Criteria:**
1. >5% increase in MCP endpoint 500 errors
2. >10% increase in response time p95
3. Claude Code integration breaks (cannot register or call tools)
4. Evidence: Metrics dashboard shows regression, rollback to previous version

## Validation Commands

Run these commands in order to validate the implementation:

```bash
# Type-check TypeScript without emitting files
cd app && bunx tsc --noEmit

# Run linter (if available)
cd app && bun run lint

# Validate migration sync between src/db/migrations and supabase/migrations
cd app && bun run test:validate-migrations

# Validate no hardcoded environment URLs in tests
cd app && bun run test:validate-env

# Run MCP test suite only (fast feedback during development)
cd app && bun test tests/mcp/

# Run integration tests (includes MCP tests)
cd app && bun test --filter integration

# Run full test suite (all 133+ tests)
cd app && bun test

# Check test coverage for MCP modules (target: >90%)
cd app && bun test --coverage tests/mcp/
```

**Domain-Specific Validation:**
```bash
# Verify MCP endpoint is running
curl -H "Authorization: Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef" \
  http://localhost:3000/mcp

# Test MCP tools/list via JSON-RPC
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Register with Claude Code (manual integration test)
claude mcp add kotadb http://localhost:3000/mcp -t http \
  -H "Authorization: Bearer kota_free_test1234567890ab_0123456789abcdef0123456789abcdef"

# Verify connection status
claude mcp list

# Test search_code tool from Claude Code session
# (Open Claude Code and ask: "Use the search_code tool to find Router")
```

## Issue Relationships

### Depends On
- Issue #44 (MCP SDK Express Integration) - ✅ Completed
  - Commit 9568867: Added GET /mcp health check endpoint
  - Commit feff659: Integrated MCP SDK with StreamableHTTPServerTransport
  - This issue provides the MCP endpoint implementation that needs regression testing

### Related To
- Issue #31 (Replace Test Mocks with Supabase Local) - Context for antimocking philosophy
  - Establishes pattern of using real Supabase stack in tests
  - Provides test database helpers and seed data infrastructure
  - MCP tests follow same antimocking approach

- Issue #40 (Migrate CI to Supabase Local) - Context for CI test infrastructure
  - Establishes CI pattern with Docker Compose and Supabase Local
  - Provides .github/scripts/setup-supabase-ci.sh for CI database setup
  - MCP tests run in same CI environment with real Supabase stack

- Issue #26 (Tier-Based Rate Limiting) - Related authentication concern
  - MCP endpoints enforce same rate limiting as REST endpoints
  - Authentication tests validate rate limit headers on MCP responses
  - Shares test fixtures for API keys and tier-based limits

### Blocks
None - This is a testing enhancement that doesn't block other features

### Follow-Up
- Future: MCP SSE streaming transport support (if Claude Code adopts SSE)
- Future: MCP server performance benchmarking and optimization
- Future: MCP protocol version upgrade testing (when new protocol versions released)
- Future: Transaction rollback pattern for isolated test runs (database cleanup optimization)

## Success Metrics

**Test Coverage:**
- ✅ 9 MCP test files created (lifecycle, authentication, tool-validation, integration, concurrent + enhanced existing 4)
- ✅ 100+ total test cases covering all MCP endpoints and tools
- ✅ >90% code coverage on app/src/mcp/ modules
- ✅ All tests pass locally and in CI (0 flaky tests)

**Documentation:**
- ✅ Claude Code integration guide created with .mcp.json examples
- ✅ MCP testing section added to docs/testing-setup.md
- ✅ CLAUDE.md updated with test count and helper documentation
- ✅ All documentation verified manually (Claude Code registration steps tested)

**CI/CD Integration:**
- ✅ MCP tests run automatically on every PR
- ✅ Test execution time <20 seconds for MCP suite alone
- ✅ CI workflow includes MCP regression tests in full suite (no separate job needed)
- ✅ Test coverage report shows >90% coverage on MCP modules

**Protocol Compliance:**
- ✅ JSON-RPC 2.0 message format validated
- ✅ SDK error code mapping tested (-32700, -32601, -32603)
- ✅ Protocol version negotiation tested (2025-06-18)
- ✅ All three tools (search_code, index_repository, list_recent_files) tested with real database

**Zero Breaking Changes:**
- ✅ All existing MCP endpoint behavior preserved (no API contract changes)
- ✅ Authentication and rate limiting work as expected
- ✅ Claude Code integration remains functional (manual test before PR merge)
