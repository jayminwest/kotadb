# Bug Plan: Fix MCP Tool Validation Tests Failing with HTTP 406

## Bug Summary

All 15 tests in `app/tests/mcp/tool-validation.test.ts` fail with HTTP 406 (Not Acceptable) errors instead of expected HTTP 200 responses. This regression appeared after PR #188 merged on 2025-10-18 (commit e3fd538).

**Observed Behaviour:**
- MCP endpoint at POST `/mcp` returns HTTP 406 for all test requests
- Error message: "Not Acceptable: Client must accept both application/json and text/event-stream"
- Tests fail at status code assertion: `Expected: 200, Received: 406`
- 0/15 tests pass in tool validation suite

**Expected Behaviour:**
- MCP endpoint should return HTTP 200 for valid JSON-RPC requests
- Tool validation errors should return HTTP 200 with JSON-RPC error code -32603
- Tests should validate parameter types and required fields

**Suspected Scope:**
- MCP SDK `StreamableHTTPServerTransport` Accept header validation
- Test helper `sendMcpRequest()` missing Accept header
- Potential SDK version incompatibility introduced by PR #188

## Root Cause Hypothesis

**Leading Theory: MCP SDK enforces Accept header validation regardless of enableJsonResponse setting**

The `@modelcontextprotocol/sdk` v1.20.0 `StreamableHTTPServerTransport` class validates that POST requests include **both** `application/json` AND `text/event-stream` in the Accept header:

```javascript
// From node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js
async handlePostRequest(req, res, parsedBody) {
  const acceptHeader = req.headers.accept;
  if (!(acceptHeader?.includes('application/json')) || !acceptHeader.includes('text/event-stream')) {
    res.writeHead(406).end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Not Acceptable: Client must accept both...' }
    }));
    return;
  }
}
```

This validation occurs **before** checking `_enableJsonResponse` configuration, meaning all POST requests must advertise SSE support even when using pure JSON mode.

**Supporting Evidence:**
1. Tests use `fetch()` with `Content-Type: application/json` but no Accept header
2. Browsers default Accept header is `*/*` or `text/html,application/json,*/*` (missing `text/event-stream`)
3. SDK v1.20.0 introduced stricter header validation (potential breaking change)
4. PR #188 did not modify MCP code but may have triggered SDK dependency update
5. Server configured with `enableJsonResponse: true` in `app/src/mcp/server.ts:115-118`

## Fix Strategy

**Primary Fix: Add Accept header to all MCP test requests**

Update test helper `app/tests/helpers/mcp.ts` `sendMcpRequest()` function to include proper Accept header:

```typescript
// Before (missing Accept header)
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
}

// After (SDK-compliant Accept header)
headers: {
  "Content-Type": "application/json",
  "Accept": "application/json, text/event-stream",
  Authorization: `Bearer ${apiKey}`,
}
```

**Secondary Fix: Update raw fetch() calls in tests**

Several tests bypass `sendMcpRequest()` and use raw `fetch()` calls (lines 33-56, 60-78, etc.). These must also include the Accept header.

**Tertiary Consideration: SDK version validation**

Verify if PR #188's dependency changes affected MCP SDK version:
- Check if `@modelcontextprotocol/sdk` upgraded from previous version
- Review SDK changelog for breaking changes in v1.20.x
- Consider pinning SDK version if header validation is too strict

## Relevant Files

- `app/tests/helpers/mcp.ts` — Test helper with `sendMcpRequest()` function (primary fix location)
- `app/tests/mcp/tool-validation.test.ts` — 15 failing tests with raw fetch() calls
- `app/src/mcp/server.ts` — MCP server configuration with `enableJsonResponse: true`
- `app/src/api/routes.ts` — Express endpoint routing POST `/mcp` to transport handler
- `app/package.json` — Dependency declarations (check SDK version)
- `app/bun.lock` — Locked dependency versions (compare with pre-#188 state)

### New Files

None required (fix modifies existing test infrastructure only)

## Task Breakdown

### Verification

1. **Reproduce failure on develop branch**
   ```bash
   git checkout origin/develop  # commit e3fd538
   cd app
   bun test tests/mcp/tool-validation.test.ts
   # Expected: 0 pass, 15 fail, all HTTP 406 errors
   ```

2. **Confirm Accept header is missing**
   ```bash
   # Add debug logging to routes.ts before transport.handleRequest:
   console.log('MCP Request Headers:', req.headers);
   # Run test and verify Accept header is undefined or missing text/event-stream
   ```

3. **Test SDK Accept header requirement**
   ```bash
   # Send manual curl request with correct Accept header
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Authorization: Bearer kota_free_test..." \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   # Expected: HTTP 200 with tools list
   ```

### Implementation

1. **Update sendMcpRequest helper**
   - Edit `app/tests/helpers/mcp.ts`
   - Add Accept header to headers object: `"Accept": "application/json, text/event-stream"`
   - Ensure header is included for all tier types (free, solo, team)

2. **Update raw fetch() calls in tool-validation.test.ts**
   - Identify all direct `fetch()` calls (search for `fetch(\`\${baseUrl}/mcp\``)
   - Add Accept header to each fetch request headers object
   - Lines to update: 33-56, 60-78, 102-128, 169-193, 195-219, 221-247, 249-275, 311-336

3. **Remove debug logging**
   - Remove any temporary console.log statements added during verification
   - Ensure no debug code remains in routes.ts or server.ts

4. **Run full MCP test suite**
   ```bash
   cd app
   bun test tests/mcp/*.test.ts
   # Expected: All MCP tests pass (100+ tests)
   ```

### Validation

1. **Confirm tool-validation tests pass**
   ```bash
   cd app
   bun test tests/mcp/tool-validation.test.ts
   # Expected: 15 pass, 0 fail
   ```

2. **Verify other MCP tests remain passing**
   ```bash
   cd app
   bun test tests/mcp/lifecycle.test.ts
   bun test tests/mcp/authentication.test.ts
   bun test tests/mcp/integration.test.ts
   # All tests should pass without modification
   ```

3. **Run full application test suite**
   ```bash
   cd app
   bun test
   # Expected: 133+ tests pass (no regressions)
   ```

4. **Type-check and lint**
   ```bash
   cd app
   bunx tsc --noEmit  # No type errors
   bun run lint       # No lint errors
   ```

5. **Manual integration test**
   ```bash
   # Start server
   cd app
   bun run src/index.ts

   # In another terminal, test MCP endpoint
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Authorization: Bearer <valid-api-key>" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   # Expected: HTTP 200 with tools: [search_code, index_repository, list_recent_files]
   ```

## Step by Step Tasks

### 1. Environment Setup
- Clone worktree for bug fix branch `bug/194-fix-mcp-tool-validation-tests`
- Checkout develop branch (commit e3fd538) as base
- Verify reproduction of failure (15/15 tests fail with HTTP 406)

### 2. Root Cause Confirmation
- Add temporary debug logging to `app/src/api/routes.ts` POST `/mcp` handler
- Log incoming request headers to confirm Accept header value
- Run single test to capture logs
- Verify Accept header is missing or lacks `text/event-stream`
- Remove debug logging

### 3. Test Helper Fix
- Edit `app/tests/helpers/mcp.ts`
- Locate `sendMcpRequest()` function definition
- Add `"Accept": "application/json, text/event-stream"` to headers object
- Verify header applies to all code paths (free/solo/team tiers)

### 4. Raw Fetch Updates
- Open `app/tests/mcp/tool-validation.test.ts`
- Search for all `fetch(\`\${baseUrl}/mcp\`` patterns
- Add Accept header to each fetch call's headers object (8+ locations)
- Ensure consistency with test helper format

### 5. Local Validation
- Run `bun test tests/mcp/tool-validation.test.ts` (expect 15 pass)
- Run `bun test tests/mcp/*.test.ts` (expect 100+ pass)
- Run `bun test` (expect 133+ pass, full suite)
- Run `bunx tsc --noEmit` (expect no type errors)

### 6. Git Operations
- Stage changes: `git add app/tests/helpers/mcp.ts app/tests/mcp/tool-validation.test.ts`
- Commit with message:
  ```
  fix(mcp): add Accept header to test requests to resolve HTTP 406 errors

  MCP SDK v1.20.0 StreamableHTTPServerTransport enforces that POST
  requests include both 'application/json' and 'text/event-stream' in
  Accept header, regardless of enableJsonResponse configuration.

  Updated sendMcpRequest() helper and raw fetch() calls in
  tool-validation.test.ts to include SDK-compliant Accept header.

  Fixes #194

  🤖 Generated with Claude Code (https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- Push branch: `git push -u origin bug/194-fix-mcp-tool-validation-tests`

### 7. Pull Request Creation
- Create PR with title: `fix(mcp): add Accept header to test requests (#194)`
- Include PR description:
  - Link to issue #194
  - Explain root cause (SDK header validation)
  - List files changed (test helper + validation tests)
  - Confirm Application CI passes
  - Note: no production code changes (test-only fix)

## Regression Risks

**Adjacent features to watch:**

1. **MCP endpoint behavior with real clients**
   - Risk: Real MCP clients (Claude Desktop, VS Code) may also lack proper Accept header
   - Mitigation: Test with actual MCP client after deploy to verify header compatibility
   - Follow-up: If clients fail, consider SDK version downgrade or custom transport wrapper

2. **SSE streaming mode (if enabled in future)**
   - Risk: Accept header validation may conflict with pure SSE mode
   - Mitigation: Current config uses `enableJsonResponse: true` (JSON-only, no SSE)
   - Follow-up: Document Accept header requirement in MCP integration guide

3. **Browser-based MCP clients**
   - Risk: Browser fetch() may auto-set Accept header incompatible with SDK
   - Mitigation: Web app must explicitly set Accept header in fetch config
   - Follow-up: Add Accept header to `web/lib/api-client.ts` MCP methods (if applicable)

4. **SDK version upgrades**
   - Risk: Future SDK updates may change header validation logic
   - Mitigation: Pin `@modelcontextprotocol/sdk` version in package.json
   - Follow-up: Review SDK changelogs before upgrading, test against regression suite

**If risk materializes:**

- **Immediate action**: Revert to previous SDK version if header requirement breaks production
- **Short-term**: Wrap StreamableHTTPServerTransport to relax Accept header validation
- **Long-term**: File issue with MCP SDK maintainers about enableJsonResponse compatibility

## Validation Commands

```bash
# Type-check
cd app && bunx tsc --noEmit

# Lint
cd app && bun run lint

# Migration sync validation
cd app && bun run test:validate-migrations

# Environment variable validation
cd app && bun run test:validate-env

# MCP tool validation tests (primary target)
cd app && bun test tests/mcp/tool-validation.test.ts

# Full MCP regression suite
cd app && bun test tests/mcp/*.test.ts

# Full application test suite
cd app && bun test

# Application CI simulation (requires Docker)
cd app && docker compose up -d
cd app && .github/scripts/setup-supabase-ci.sh
cd app && bun test
cd app && docker compose down
```

**Level 2 Validation (Recommended):**

Since this bug affects test infrastructure and the MCP endpoint (critical for AI workflows), perform manual integration testing:

```bash
# Start local server
cd app && bun run src/index.ts

# Test tools/list endpoint
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test search_code tool (valid params)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_code","arguments":{"term":"function"}}}'

# Test search_code tool (missing required param)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <api-key>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_code","arguments":{}}}'
# Expected: HTTP 200 with JSON-RPC error code -32603
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(mcp): <subject>`
- Valid types: fix (primary), test (if only test changes)
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(mcp): add Accept header to test requests` not `Looking at the changes, this commit adds the Accept header`
- Include issue reference in footer: `Fixes #194`
- Include Claude Code attribution in footer

## Issue Relationships

- **Related To**: #188 (Next.js web app + shared types) — PR that triggered regression by potentially updating SDK version
- **Blocks**: #192 (Epic 70 audit) — CI failures prevent merge of subsequent PRs
- **Related To**: #68 (MCP regression testing) — Comprehensive MCP test coverage caught this regression
- **Child Of**: #194 (parent issue for this bug fix plan)
