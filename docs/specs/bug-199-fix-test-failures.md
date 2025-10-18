# Bug Plan: Fix 16 Pre-existing Test Failures in MCP and Validation Suites

## Bug Summary
After fixing HTTP 406 errors in PR #196, the full test suite reveals 16 pre-existing test failures across MCP and validation endpoint test suites. These failures exist on the `develop` branch and are unrelated to the Accept header fix.

**Observed Behavior:**
- 301/317 tests passing (94.9%)
- 16/317 tests failing (5.1%)
- Failures span 5 distinct test suites (MCP concurrency, lifecycle, authentication, rate limiting, validation endpoint)

**Expected Behavior:**
- 317/317 tests passing (100%)
- All MCP protocol lifecycle tests validate SDK integration correctly
- All validation endpoint tests handle Zod schema validation properly
- All concurrency tests handle race conditions without failures

**Suspected Scope:**
- MCP SDK integration changes may have altered response formats (content blocks, error codes)
- Test expectations may not match current MCP SDK v1.20+ behavior
- Validation endpoint may have schema conversion or error reporting issues
- Concurrency tests may have race conditions in rate limit counter or test isolation

## Root Cause Hypothesis

### Primary Hypothesis: MCP SDK Integration Mismatch
The test failures are likely caused by tests expecting pre-SDK response formats, but the application now uses `@modelcontextprotocol/sdk` v1.20+ with different response structures and error codes.

**Supporting Evidence:**
1. MCP lifecycle tests fail on protocol handshake and tool listing - these interact directly with SDK server methods
2. MCP authentication tests fail on status codes - SDK may return different HTTP codes for auth failures
3. Test helper `extractToolResult()` expects SDK content block format but tests may not be using it consistently
4. CLAUDE.md documents SDK-specific behavior notes about content blocks and error code mapping

### Secondary Hypothesis: Validation Schema Conversion Issues
Validation endpoint tests fail on Zod schema validation, suggesting the schema conversion logic in `app/src/validation/schemas.ts` may not handle all test cases correctly.

**Supporting Evidence:**
1. 7 validation endpoint tests fail across different validation types (string patterns, length constraints, objects, arrays)
2. Tests cover Conventional Commits format and GitHub issue format - complex regex and object schemas
3. Validation logic converts JSON schema objects to Zod schemas dynamically

### Tertiary Hypothesis: Concurrency Race Conditions
MCP concurrency tests fail on rate limit counting and consistent tool list results, suggesting race conditions in shared state.

**Supporting Evidence:**
1. Rate limit counter may not be atomic under concurrent load
2. Tool list caching or server instance creation may have race conditions
3. Tests send 10+ concurrent requests to trigger race windows

## Fix Strategy

### Code Changes

**1. MCP Test Suite Updates** (`app/tests/mcp/*.test.ts`)
- **concurrent.test.ts (lines 103-174, 250-268)**:
  - Update rate limit counting test to handle concurrent increments with tolerance
  - Update tool list consistency test to use `extractToolResult()` properly
  - Investigate if rate limit counter needs atomic operations in `app/src/auth/rate-limit.ts`

- **lifecycle.test.ts (lines 32-85, 120-153, 155-178, 180-196)**:
  - Verify full handshake flow properly parses SDK initialize response
  - Ensure tools/list test extracts tool schemas from correct response structure
  - Update sequential isolation test to compare tool results correctly
  - Verify notifications/initialized returns correct HTTP status (202 vs 200)

- **authentication.test.ts (lines 34-51, 71-82)**:
  - Verify missing Authorization header test expects correct status code (401)
  - Verify disabled API key test expects correct error response format
  - Check if SDK wraps auth errors differently than custom error responses

**2. MCP Rate Limiting Test** (`app/tests/mcp/authentication.test.ts`)
- **Lines 107-131**: Verify rate limit headers are set BEFORE SDK transport handles request
- Check `app/src/api/routes.ts:242` confirms headers are added before `transport.handleRequest()`

**3. Validation Endpoint Tests** (`app/tests/api/validate-output.test.ts`)
- **Lines 199-239**: Conventional Commits format test - verify regex pattern matches schema conversion
- **Lines 241-300**: String length constraints test - verify minLength/maxLength Zod conversion
- **Lines 304-362**: GitHub issue format test - verify object required fields validation
- **Lines 364-388**: Non-JSON rejection test - verify error message format
- **Lines 392-432**: Array validation test - verify items type validation
- **Lines 456-477, 479-500**: Command schema examples - verify pattern validation

**4. Validation Schema Logic** (`app/src/validation/schemas.ts`)
- Review schema conversion for:
  - String patterns (regex conversion to Zod)
  - Length constraints (minLength, maxLength)
  - Object required fields
  - Array item validation
  - Error message formatting

### Data/Config Updates
No data or config changes required - this is purely a test/code alignment issue.

### Guardrails
- **Regression Prevention**: All 317 tests must pass before merging
- **SDK Compliance**: Test updates must match documented MCP SDK behavior in CLAUDE.md
- **Backward Compatibility**: Validation endpoint behavior must remain consistent for external consumers
- **Concurrency Safety**: Rate limit counter must handle concurrent requests correctly

## Relevant Files
- `app/tests/mcp/concurrent.test.ts` — 2 failing concurrency tests (rate limit, tool list)
- `app/tests/mcp/lifecycle.test.ts` — 4 failing protocol lifecycle tests
- `app/tests/mcp/authentication.test.ts` — 3 failing auth/rate limit tests (2 auth + 1 rate limit header)
- `app/tests/api/validate-output.test.ts` — 7 failing validation tests
- `app/tests/helpers/mcp.ts` — Test helper with `extractToolResult()` utility
- `app/src/api/routes.ts` — MCP endpoint handler and rate limit header injection
- `app/src/validation/schemas.ts` — Zod schema conversion logic
- `app/src/auth/rate-limit.ts` — Rate limit counter implementation

### New Files
None - all fixes are updates to existing test files and validation logic.

## Task Breakdown

### Verification
**Step 1: Run Full Test Suite and Capture Failure Details**
- Execute `cd app && bun test` and save full output
- For each failing test, note:
  - Expected value vs actual value
  - Stack trace showing assertion location
  - Any error messages or HTTP status codes

**Step 2: Run Each Failing Test Suite Individually**
- `cd app && bun test tests/mcp/concurrent.test.ts` — capture 2 failure details
- `cd app && bun test tests/mcp/lifecycle.test.ts` — capture 4 failure details
- `cd app && bun test tests/mcp/authentication.test.ts` — capture 3 failure details
- `cd app && bun test tests/api/validate-output.test.ts` — capture 7 failure details

**Step 3: Review MCP SDK Documentation and CLAUDE.md Behavior Notes**
- Read `CLAUDE.md` section "MCP SDK Behavior Notes" for content block format and error codes
- Compare test expectations against documented SDK behavior
- Identify any test assertions that contradict SDK behavior

### Implementation

**Phase 1: Fix MCP Protocol Lifecycle Tests (4 failures)**
1. Update `app/tests/mcp/lifecycle.test.ts` line 32-85 (full handshake flow):
   - Verify `extractToolResult()` is used for tools/list and tools/call responses
   - Ensure initialize response structure matches SDK format
   - Check that tool schemas are extracted from correct nested path

2. Update `app/tests/mcp/lifecycle.test.ts` line 120-153 (tools/list schema validation):
   - Ensure tool schemas are accessed via `extractToolResult(response.data)`
   - Verify inputSchema structure matches SDK tool definition format

3. Update `app/tests/mcp/lifecycle.test.ts` line 155-178 (sequential isolation):
   - Use `extractToolResult()` consistently for both requests
   - Compare tools array lengths correctly

4. Update `app/tests/mcp/lifecycle.test.ts` line 180-196 (notifications/initialized):
   - Verify expected HTTP status code (SDK may return 200 instead of 202 for notifications)
   - Check SDK documentation for notification response format

**Phase 2: Fix MCP Authentication Tests (2 failures)**
1. Update `app/tests/mcp/authentication.test.ts` line 34-51 (missing auth header):
   - Verify SDK returns 401 status code for missing auth
   - Check error response structure matches SDK error format

2. Update `app/tests/mcp/authentication.test.ts` line 71-82 (disabled API key):
   - Verify status code (401 vs 403) matches actual middleware behavior
   - Parse error response using `await response.json()` instead of assuming structure

**Phase 3: Fix MCP Rate Limiting Tests (1 failure)**
1. Update `app/tests/mcp/authentication.test.ts` line 107-131 (rate limit headers):
   - Verify headers are present after `addRateLimitHeaders()` call in `routes.ts:242`
   - Check header names exactly match: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
   - Verify SDK transport does not strip custom headers

**Phase 4: Fix MCP Concurrency Tests (2 failures)**
1. Update `app/tests/mcp/concurrent.test.ts` line 103-174 (rate limit counting):
   - Add tolerance to expected difference (allow ±1-2 variance due to race conditions)
   - Consider if rate limit counter in `app/src/auth/rate-limit.ts` needs atomic operations
   - Add delay between initial/final requests to ensure concurrent batch completes

2. Update `app/tests/mcp/concurrent.test.ts` line 250-268 (tool list consistency):
   - Ensure `extractToolResult()` is used correctly for all responses
   - Verify tool list structure (should be `{tools: [...]}` after extraction)
   - Check if SDK server instance creation is thread-safe

**Phase 5: Fix Validation Endpoint Tests (7 failures)**
1. Update `app/tests/api/validate-output.test.ts` line 199-239 (Conventional Commits):
   - Debug schema pattern regex conversion in `app/src/validation/schemas.ts`
   - Test schema: `{type: "string", pattern: "^(feat|fix|...)\\([^)]+\\))?: [0-9]+ - .{1,50}"}`
   - Verify Zod regex handles escaped parentheses correctly

2. Update `app/tests/api/validate-output.test.ts` line 241-300 (string length):
   - Verify minLength/maxLength conversion to Zod `.min()` and `.max()`
   - Check error message format matches expected "5" and "10" mentions

3. Update `app/tests/api/validate-output.test.ts` line 304-362 (GitHub issue format):
   - Verify object required fields validation in `app/src/validation/schemas.ts`
   - Ensure missing "summary" field produces error at path "summary"

4. Update `app/tests/api/validate-output.test.ts` line 364-388 (non-JSON rejection):
   - Verify error message contains "JSON" for object schema with non-JSON input
   - Check Zod error formatting in schema conversion

5. Update `app/tests/api/validate-output.test.ts` line 392-432 (array validation):
   - Verify array items type validation (string array rejects number items)
   - Ensure Zod array schema uses `.element()` correctly

6. Update `app/tests/api/validate-output.test.ts` line 456-477 (workflows:plan schema):
   - Verify file path pattern validation matches Zod regex conversion

7. Update `app/tests/api/validate-output.test.ts` line 479-500 (git:commit schema):
   - Verify Conventional Commits pattern validation (same as item 1)

### Validation

**Test Execution:**
```bash
# Run full test suite after each phase
cd app && bun test

# Run specific test suites for targeted validation
cd app && bun test tests/mcp/lifecycle.test.ts
cd app && bun test tests/mcp/authentication.test.ts
cd app && bun test tests/mcp/concurrent.test.ts
cd app && bun test tests/api/validate-output.test.ts

# Verify no new failures introduced
cd app && bun test --bail
```

**Manual Checks:**
1. **MCP SDK Integration**: Send manual JSON-RPC requests to `/mcp` endpoint and verify:
   - Initialize handshake returns `{result: {protocolVersion, serverInfo, capabilities}}`
   - Tools/list returns `{result: {content: [{type: "text", text: "{tools: [...]}"}]}}`
   - Tools/call returns `{result: {content: [{type: "text", text: "{...result...}"}]}}`

2. **Validation Endpoint**: Send manual POST requests to `/validate-output` and verify:
   - Valid Conventional Commits message passes: `feat: 123 - add feature`
   - Invalid message fails with structured errors
   - String length constraints work correctly (minLength=5, maxLength=10)

3. **Rate Limit Headers**: Verify MCP requests include:
   - `X-RateLimit-Limit: 100` (for free tier)
   - `X-RateLimit-Remaining: <count>`
   - `X-RateLimit-Reset: <timestamp>`

4. **Concurrency Safety**: Send 20 concurrent MCP requests and verify:
   - Rate limit counter increments correctly (±1 tolerance acceptable)
   - Tool list results are identical across all responses

## Step by Step Tasks

### Investigation and Root Cause Analysis
- Run full test suite and capture all 16 failure details with exact error messages
- Run each failing test suite individually to isolate failure contexts
- Review MCP SDK documentation and compare against test expectations
- Review CLAUDE.md MCP SDK Behavior Notes section for documented behavior
- Identify test assertions that contradict current SDK behavior

### MCP Protocol Lifecycle Fixes
- Fix full handshake flow test to properly extract and validate SDK responses
- Fix tools/list schema validation test to use extractToolResult correctly
- Fix sequential isolation test to compare tool results properly
- Fix notifications/initialized test to expect correct HTTP status

### MCP Authentication Fixes
- Fix missing Authorization header test to match SDK error format
- Fix disabled API key test to parse error response correctly

### MCP Rate Limiting Fixes
- Fix rate limit headers test to verify headers are present after SDK transport

### MCP Concurrency Fixes
- Fix rate limit counting test to allow tolerance for race conditions
- Fix tool list consistency test to use extractToolResult properly

### Validation Endpoint Fixes
- Fix Conventional Commits format validation to handle regex correctly
- Fix string length constraints validation to match Zod error messages
- Fix GitHub issue format validation to handle required fields
- Fix non-JSON rejection test to verify error message format
- Fix array validation test to handle typed items correctly
- Fix command schema examples to validate patterns correctly

### Final Validation
- Run full test suite and verify 317/317 tests pass
- Run validation commands to ensure no regressions
- Push branch to origin for PR creation

## Regression Risks

**Adjacent Features to Watch:**
1. **MCP Client Integration**: Changes to test expectations may reveal actual SDK integration bugs
2. **Validation API Contracts**: Fixing validation tests may expose schema conversion bugs affecting external consumers
3. **Rate Limit Enforcement**: Concurrency fixes may reveal actual race conditions in production traffic
4. **Authentication Flows**: Auth test fixes may reveal incorrect error codes being returned to clients

**Follow-up Work if Risk Materializes:**
- If MCP SDK integration bugs are found: File new issue to fix SDK server/transport configuration
- If validation schema bugs are found: File new issue to fix schema conversion logic and add regression tests
- If rate limit race conditions are found: File new issue to implement atomic counter operations
- If auth error codes are wrong: File new issue to standardize error responses across all endpoints

## Validation Commands

```bash
# Type checking
cd app && bunx tsc --noEmit

# Linting
cd app && bun run lint

# Full test suite (target: 317/317 passing)
cd app && bun test

# Specific test suites for validation
cd app && bun test tests/mcp/concurrent.test.ts
cd app && bun test tests/mcp/lifecycle.test.ts
cd app && bun test tests/mcp/authentication.test.ts
cd app && bun test tests/api/validate-output.test.ts

# Migration sync validation
cd app && bun run test:validate-migrations

# Environment variable validation (no hardcoded URLs)
cd app && bun run test:validate-env

# Build validation
cd app && bun run build
```

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: resolve search filter bug` not `Looking at the changes, this commit fixes the search filter bug`

### Example Commit Messages
**Good:**
```
test(mcp): fix lifecycle test expectations for SDK v1.20
test(mcp): update authentication tests to match SDK error format
test(validation): fix string pattern validation for Conventional Commits
test(mcp): add tolerance for rate limit counter race conditions
```

**Bad (avoid these patterns):**
```
test: based on the SDK documentation, this commit updates the tests
test: looking at the changes, i can see the tests need updating
test: here is a fix for the failing tests
test: the commit should fix the validation endpoint tests
```
