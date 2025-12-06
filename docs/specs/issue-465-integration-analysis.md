# Integration Expert Analysis: Issue #465

**MCP endpoint returns 406 for Claude Code clients**

**Analysis Date**: 2025-12-05
**Issue Category**: Integration Boundary - MCP SDK HTTP Contract
**Severity**: HIGH (Affects all Claude Code MCP clients)

---

## Executive Summary

Issue #465 identifies a critical integration failure where KotaDB's MCP endpoint returns HTTP 406 "Not Acceptable" to Claude Code clients. The root cause stems from MCP SDK v1.20+ (`@modelcontextprotocol/sdk`) requiring **both** `application/json` AND `text/event-stream` in the Accept header for `StreamableHTTPServerTransport` with `enableJsonResponse: true` configuration.

This breaking change in the MCP SDK affects **6 code intelligence tools** and **7 project management tools** (13 total MCP tools) that Claude Code clients depend on. The integration failure occurs at the HTTP transport boundary and requires explicit Accept header validation and documentation.

---

## External Systems & Boundary Points

### 1. Claude Code Client

**Integration Point**: `https://kotadb.fly.dev/mcp` (production) or `https://kotadb-staging.fly.dev/mcp` (staging)

**Protocol**: HTTP/1.1 with JSON-RPC 2.0 over MCP HTTP transport

**Current Failure Mode**:
- Claude Code sends POST request with missing or incomplete Accept header
- MCP SDK's `StreamableHTTPServerTransport` validates Accept header
- SDK returns HTTP 406 when Accept header lacks both required types
- Claude Code cannot establish MCP connection

**Client Configuration** (`.mcp.json`):
```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "https://kotadb.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer kota_solo_...",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18"
      }
    }
  }
}
```

### 2. Express/Bun HTTP Server

**Location**: `app/src/api/routes.ts:659-697` (POST /mcp endpoint)

**Current Implementation**:
```typescript
app.post("/mcp", async (req: AuthenticatedRequest, res: Response) => {
  // Creates per-request MCP server instance
  const server = createMcpServer({
    supabase,
    userId: context.userId,
  });

  // Creates StreamableHTTPServerTransport
  const transport = createMcpTransport();

  // Connects and delegates to SDK
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

**Transport Configuration** (`app/src/mcp/server.ts:252-256`):
```typescript
export function createMcpTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // Stateless mode
    enableJsonResponse: true,        // JSON mode (not SSE)
  });
}
```

**Issue**: No explicit Accept header validation before SDK processes request

### 3. MCP SDK (`@modelcontextprotocol/sdk` v1.20.0)

**SDK Location**: `/node_modules/@modelcontextprotocol/sdk/server/streamableHttp.js`

**Breaking Change**: v0.1.1+ of MCP SDK requires dual Accept header validation

**Current Behavior**:
- Validates incoming Accept header against `enableJsonResponse` configuration
- With `enableJsonResponse: true`, SDK expects **both**:
  - `application/json` (for JSON response mode)
  - `text/event-stream` (for SSE compatibility layer)
- Returns HTTP 406 if Accept header incomplete

**Why Both Types Required**:
- `application/json`: Indicates client accepts JSON-RPC responses in body
- `text/event-stream`: Indicates client can handle streaming if needed (even if JSON mode used)
- Dual requirement enables graceful degradation between JSON and SSE modes

### 4. Supabase Authentication Boundary

**Location**: `app/src/api/routes.ts:437-460` (authentication middleware)

**Integration Point**:
- Validates Authorization header before routing to /mcp
- Extracts user_id and tier from API key
- Enforces rate limits before transport handles request

**Related Code** (`app/src/api/routes.ts:663-664`):
```typescript
const context = req.authContext!;
addRateLimitHeaders(res, context.rateLimit);
```

**Consideration**: Authentication succeeds but transport fails on Accept header

---

## Client-Server Contract Analysis

### Required Headers (Accept Header Negotiation)

| Header | Required | Value | Purpose |
|--------|----------|-------|---------|
| `Accept` | **YES** | `application/json, text/event-stream` | MCP SDK validates dual format support |
| `MCP-Protocol-Version` | YES | `2025-06-18` | Protocol version negotiation (informational, not validated by SDK) |
| `Authorization` | YES | `Bearer kota_{tier}_...` | User authentication & tier validation |
| `Content-Type` | YES | `application/json` | JSON-RPC request body format |

### Current Failure Scenarios

**Scenario 1: Missing Accept Header**
```
Request:
POST /mcp HTTP/1.1
Authorization: Bearer kota_solo_...
Content-Type: application/json

Response:
HTTP 406 Not Acceptable
"Accept header missing or invalid"
```

**Scenario 2: Incomplete Accept Header (JSON only)**
```
Request:
Accept: application/json

Response:
HTTP 406 Not Acceptable
"Accept header must include both application/json and text/event-stream"
```

**Scenario 3: Correct Accept Header**
```
Request:
Accept: application/json, text/event-stream

Response:
HTTP 200 OK
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [...]
  }
}
```

### MCP Protocol Version Compatibility

**Current Server Version**: `2025-06-18` (defined in `app/src/mcp/lifecycle.ts:54`)

**Header Validation**:
- Parsed in `app/src/mcp/headers.ts:76-78`
- `validateProtocolVersion()` checks exact match against `2025-06-18`
- SDK transport does NOT enforce this header (informational only)

**Compatibility Matrix**:
| Version | Support | Notes |
|---------|---------|-------|
| `2025-06-18` | Full | Current production version |
| `2024-11-05` | Partial | GET /mcp endpoint returns this version (legacy) |
| Earlier versions | None | Rejected by strict validation |

**Issue**: Legacy version mismatch in GET /mcp endpoint (line 707) vs server version

---

## Integration Error Scenarios & Handling

### Error Path 1: Accept Header Validation (HTTP 406)

**Boundary**: MCP SDK `StreamableHTTPServerTransport.handleRequest()`

**Error Flow**:
```
Client sends incomplete Accept header
    ↓
SDK validates Accept header
    ↓
SDK finds missing format type
    ↓
SDK returns HTTP 406 Not Acceptable
    ↓
Client cannot parse response as valid MCP
    ↓
MCP connection fails (no retry attempted)
```

**Current Handling**: None - SDK throws directly

**Sentry Capture**: No (SDK error, not caught by our handlers)

**Recovery**: Manual header correction in `.mcp.json` configuration

### Error Path 2: Missing Protocol Version (Informational)

**Boundary**: Custom header validation (not enforced by SDK)

**Error Flow**:
```
Client omits MCP-Protocol-Version header
    ↓
validateProtocolVersion() returns false
    ↓
Logged as info (not error)
    ↓
Request continues (no blocking)
```

**Current Handling**: Logged via logger.info() (non-blocking)

**Sentry Capture**: No (informational only)

**Recommendation**: Upgrade to warn-level logging for backward compatibility tracking

### Error Path 3: Auth Boundary Before Transport

**Boundary**: Express authentication middleware vs SDK transport

**Error Flow**:
```
Valid auth context → rate limits applied
    ↓
Server instance created
    ↓
Transport instance created
    ↓
transport.handleRequest() called
    ↓
SDK validates Accept header
    ↓
Error returned (no Express error handler intercepts)
```

**Current Handling**: Express-level catch-all (line 686-695) - only catches thrown exceptions

**Sentry Capture**: No (SDK errors don't throw, return HTTP response)

**Issue**: SDK HTTP errors bypass Express catch blocks

### Error Path 4: Rate Limit Headers Before SDK Processes

**Boundary**: Rate limit header injection before SDK delegates response handling

**Current Code** (`routes.ts:664`):
```typescript
addRateLimitHeaders(res, context.rateLimit);
// ... headers set BEFORE SDK takes over response
await transport.handleRequest(req, res, req.body);
```

**Behavior**:
- Headers set successfully
- SDK may override with own headers
- Rate limit information preserved if SDK doesn't clear headers

**Risk**: Low (HTTP 406 response likely includes our headers)

---

## Timeout & Retry Strategy

### HTTP Request Timeout

**Configuration**: Not explicitly set in MCP endpoint

**Default Timeouts**:
- Express/Node.js: No default (infinite unless nginx/reverse proxy sets)
- Bun HTTP server: Depends on Bun runtime defaults
- Claude Code client: Implementation-specific (typically 30-60s)

**Current Behavior**: Requests hang if transport doesn't respond within client timeout

**Recommendation for Integration**:
```typescript
const TRANSPORT_TIMEOUT_MS = 30000; // 30 second timeout

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error("MCP transport timeout")), TRANSPORT_TIMEOUT_MS)
);

await Promise.race([
  transport.handleRequest(req, res, req.body),
  timeoutPromise
]);
```

### Retry Strategy

**Client-Side (Claude Code)**:
- HTTP 406 errors typically NOT retried (client config error)
- Requires manual fix in `.mcp.json`
- No exponential backoff applicable

**Server-Side (KotaDB)**:
- No retry applicable (single HTTP request-response)
- Queue-based indexing handles retries separately

**Recommendation**: Document expected client-side configuration recovery

---

## Integration Requirements & Constraints

### 1. Accept Header Validation

**Constraint**: MCP SDK v1.20+ requires BOTH types in Accept header

**Validation Logic Needed**:
```typescript
// Parse incoming Accept header
const accept = req.get("Accept") || "";
const hasJson = accept.includes("application/json") || accept.includes("*/*");
const hasStream = accept.includes("text/event-stream");

// Validate based on transport configuration
if (enableJsonResponse && (!hasJson || !hasStream)) {
  return res.status(406).json({
    error: "Accept header must include both application/json and text/event-stream"
  });
}
```

**Current Status**: Parsed in `headers.ts:84-98` but not enforced before SDK

**Required Action**: Add middleware to validate Accept header before transport.handleRequest()

### 2. Protocol Version Negotiation

**Current Implementation** (`headers.ts:75-78`):
```typescript
export function validateProtocolVersion(version: string | null): boolean {
  return version === MCP_PROTOCOL_VERSION;
}
```

**Issue**: Version mismatch between:
- `lifecycle.ts:54`: Returns `"2025-06-18"` in initialize response
- `routes.ts:707`: GET /mcp returns `"2024-11-05"` (legacy, incorrect)

**Required Action**: Sync version strings across all endpoints

### 3. User Isolation in Stateless Mode

**Current Pattern** (`routes.ts:667-670`):
```typescript
const server = createMcpServer({
  supabase,
  userId: context.userId,  // From authentication middleware
});
```

**Boundary Concern**: Each request gets fresh server instance

**Verification Needed**: Confirm user_id properly flows from auth context to all tool handlers

**All 13 Tools Affected**:
- search_code (uses userId for RLS)
- index_repository (uses userId for repo ownership)
- list_recent_files (uses userId filtering)
- search_dependencies (uses userId filtering)
- analyze_change_impact (uses userId context)
- validate_implementation_spec (uses userId context)
- create_project (userId as owner)
- list_projects (userId filtering)
- get_project (userId ownership check)
- update_project (userId ownership check)
- delete_project (userId ownership check)
- add_repository_to_project (userId context)
- remove_repository_from_project (userId context)

### 4. Rate Limit Enforcement Across Boundary

**Current Implementation** (`routes.ts:663-664`):
```typescript
addRateLimitHeaders(res, context.rateLimit);
await transport.handleRequest(req, res, req.body);
```

**Boundary Concern**: Headers set before SDK takes control

**Verification Needed**:
1. Does SDK respect pre-set headers?
2. Does HTTP 406 response include rate limit headers?
3. Do clients check headers on error responses?

---

## Backwards Compatibility Analysis

### Breaking Change in MCP SDK v0.1.1

**What Changed**: Accept header validation added

**Who Affected**: Claude Code clients using HTTP MCP transport

**Versions Before Fix**:
- Older Claude Code versions may send incomplete Accept headers
- Would succeed with older MCP SDK versions
- Now fail with v1.20+

**Compatibility Window**:
- KotaDB uses `@modelcontextprotocol/sdk: ^1.20.0`
- This pins all v1.x versions (including future updates)
- Cannot downgrade SDK without reverting breaking change

**Migration Path**:
1. Document required headers in `.mcp.json` format
2. Provide `.mcp.json` template in documentation
3. Add validation error messages to help clients diagnose
4. Monitor failed connection attempts for patterns

---

## Architecture Integration Patterns

### Per-Request Server Isolation

**Pattern**: Create new MCP Server instance per HTTP request

**Location**: `routes.ts:667-670`

**Rationale**:
- Ensures user context isolation (userId from auth middleware)
- Prevents shared state across different users
- Enables graceful cleanup on request completion

**Integration Points**:
1. Authentication middleware extracts userId
2. Server created with userId in closure context
3. All tool handlers access userId from closure
4. Transport cleaned up on response close

**Verification Checklist**:
- [ ] userId properly passed to createMcpServer()
- [ ] All tools receive supabase + userId context
- [ ] RLS policies enforce user_id filtering
- [ ] Cleanup handler registered (res.on("close"))
- [ ] No shared server state between requests

### Transport Lifecycle

**Creation** (`routes.ts:673`): `const transport = createMcpTransport();`

**Connection** (`routes.ts:676`): `await server.connect(transport);`

**Request Handling** (`routes.ts:685`): `await transport.handleRequest(req, res, req.body);`

**Cleanup** (`routes.ts:679-681`):
```typescript
res.on("close", () => {
  transport.close();
});
```

**Integration Concern**: What if handleRequest() throws?

**Risk Assessment**:
- If transport.handleRequest() throws, catch block catches (line 686)
- res.on("close") still registers and fires
- transport.close() called regardless

**Improvement**: Explicit finally block to guarantee cleanup

```typescript
try {
  await transport.handleRequest(req, res, req.body);
} finally {
  transport.close();
}
```

### Error Boundary at Transport Level

**Current Catch Block** (`routes.ts:686-695`):
```typescript
catch (error) {
  if (!res.headersSent) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("MCP handler error", err, { userId: context.userId });
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
}
```

**Limitation**:
- Only catches thrown exceptions
- SDK HTTP errors (like 406) don't throw, return response directly
- Sentry doesn't capture HTTP-level errors

**Gap**: HTTP 406 errors not monitored in Sentry

**Improvement Needed**:
1. Add explicit Accept header validation BEFORE transport
2. Log validation failures separately (Sentry tag: "accept_header_validation")
3. Track failed MCP connections by error type

---

## Recommendations

### Recommendation 1: Explicit Accept Header Validation Middleware

**Priority**: HIGH (Blocks all Claude Code integration)

**Implementation**:
```typescript
app.post("/mcp", async (req: AuthenticatedRequest, res: Response) => {
  const context = req.authContext!;

  // Validate Accept header BEFORE transport processes
  const accept = req.get("Accept") || "";
  const acceptParsed = parseAccept(accept);

  if (!acceptParsed.json || !acceptParsed.sse) {
    logger.warn("MCP request rejected: invalid Accept header", {
      userId: context.userId,
      accept_header: accept,
      has_json: acceptParsed.json,
      has_sse: acceptParsed.sse,
    });

    Sentry.captureMessage("MCP Accept header validation failed", {
      level: "warning",
      tags: {
        feature: "mcp",
        error_type: "accept_header_validation"
      }
    });

    return res.status(406).json({
      error: "Not Acceptable",
      message: "Accept header must include both 'application/json' and 'text/event-stream'",
      documentation: "https://docs.kotadb.dev/mcp#required-headers"
    });
  }

  // ... rest of MCP handler
});
```

**Rationale**:
- Fails fast before SDK processes request
- Provides clear error message to client
- Enables Sentry monitoring of header issues
- Distinguishes SDK errors from config errors

**Verification**:
- Test with missing Accept header → 406
- Test with "application/json" only → 406
- Test with "text/event-stream" only → 406
- Test with both types → 200 (or appropriate MCP response)

### Recommendation 2: Sync Protocol Version Across Endpoints

**Priority**: MEDIUM (Compatibility concern)

**Current Mismatch**:
- `lifecycle.ts:54`: Returns `"2025-06-18"` in initialize response
- `routes.ts:707`: GET /mcp returns `"2024-11-05"` (incorrect)

**Action**:
```typescript
// In routes.ts, line 707, change:
version: "2024-11-05",
// To:
version: "2025-06-18",

// Create constant for single source of truth
const MCP_PROTOCOL_VERSION = "2025-06-18";
```

**Rationale**:
- Prevents client confusion about supported protocol version
- Aligns with server's actual capabilities
- Enables future version negotiation

### Recommendation 3: Document Integration Requirements in Multiple Formats

**Priority**: HIGH (Reduces support burden)

**Deliverables**:
1. **`.mcp.json` Template** (user-facing)
   - Provided in docs and web UI
   - Ready-to-use configuration
   - Environment variable substitution guide

2. **Integration Guide** (developer-facing)
   - Required headers table
   - Error response codes and meanings
   - Troubleshooting section

3. **API Reference** (technical spec)
   - SDK version compatibility matrix
   - HTTP transport specification
   - Protocol version history

**Locations**:
- Docs: `/docs/guides/mcp-claude-code-integration.md` (update existing)
- Web UI: Add MCP integration guide page
- In-repo: `.claude/commands/docs/mcp-integration.md` (reference)

### Recommendation 4: Add MCP Connection Telemetry

**Priority**: MEDIUM (Operations insight)

**Metrics to Track**:
```typescript
// In MCP handler
app.post("/mcp", async (req: AuthenticatedRequest, res: Response) => {
  const context = req.authContext!;

  const telemetry = {
    timestamp: new Date().toISOString(),
    userId: context.userId,
    method: "MCP",
    accept_header: req.get("Accept"),
    has_accept_validation: true,
    protocol_version_header: req.get("MCP-Protocol-Version"),
  };

  // Validate and track
  const accept = parseAccept(req.get("Accept") || "");
  telemetry.accept_json = accept.json;
  telemetry.accept_sse = accept.sse;

  if (!accept.json || !accept.sse) {
    logger.warn("MCP connection failed: Accept header invalid", telemetry);
    Sentry.captureMessage("MCP Accept header validation failed", {
      level: "warning",
      contexts: { mcp: telemetry }
    });
  }

  // ... continue
});
```

**Benefits**:
- Identify patterns in failed connections
- Monitor adoption of correct configuration
- Track protocol version distribution
- Detect client library issues early

### Recommendation 5: Graceful Error Recovery for Known Failure Modes

**Priority**: MEDIUM (User experience improvement)

**Current State**: Clients must manually fix `.mcp.json`

**Enhancement**:
```typescript
// In error response, provide actionable guidance
return res.status(406).json({
  error: "Not Acceptable",
  message: "Accept header must include both 'application/json' and 'text/event-stream'",
  solution: {
    example_header: "Accept: application/json, text/event-stream",
    documentation_url: "https://docs.kotadb.dev/mcp#required-headers",
    fix_location: ".mcp.json - mcpServers[server_name].headers"
  },
  client_info: {
    sent_accept: req.get("Accept") || "(missing)",
    server_version: "2025-06-18"
  }
});
```

**Rationale**:
- Reduces time to diagnosis
- Self-documenting error response
- Improves developer experience

---

## Testing Requirements

### Integration Test Matrix

| Scenario | Accept Header | Auth | Expected | Verify |
|----------|---------------|------|----------|--------|
| Valid request | Both types | Valid | 200 (MCP response) | tools/list succeeds |
| Missing Accept | (none) | Valid | 406 | Error message clear |
| JSON only | application/json | Valid | 406 | Error message clear |
| SSE only | text/event-stream | Valid | 406 | Error message clear |
| Wildcard | */* | Valid | 406 | Wildcard insufficient |
| Invalid Auth | Both types | Missing | 401 | Auth error first |
| Rate limited | Both types | Valid | 429 | Rate limit headers present |

### Test Implementation

**File**: `app/tests/mcp/integration.test.ts`

```typescript
describe("MCP Accept Header Validation", () => {
  test("missing Accept header returns 406", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ...",
        // Accept: omitted
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(406);
    const data = await response.json();
    expect(data.error).toBe("Not Acceptable");
    expect(data.message).toContain("application/json");
    expect(data.message).toContain("text/event-stream");
  });

  test("Accept with both types succeeds", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ...",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.tools).toBeDefined();
  });
});
```

---

## Risks & Mitigation

### Risk 1: Claude Code Clients Cannot Connect (HIGH)

**Impact**: 6 code intelligence tools + 7 project management tools unavailable

**Mitigation**:
1. Clear documentation of required headers
2. Provide `.mcp.json` template ready to use
3. Explicit 406 error message with remediation steps
4. In-app support link for integration help

**Timeline**: Document immediately, implement validation next sprint

### Risk 2: Silent Failures During Upgrade (HIGH)

**Impact**: Existing Claude Code integrations stop working when SDK updates

**Mitigation**:
1. Pin SDK version in package.json to avoid automatic updates
2. Monitor for future SDK breaking changes
3. Add deprecation warnings when protocol version changes
4. Provide migration guide for future versions

**Timeline**: Implement version pinning immediately

### Risk 3: Rate Limits Not Enforced on 406 Errors (MEDIUM)

**Impact**: Malformed requests could bypass rate limiting

**Mitigation**:
1. Validate Accept header AFTER auth, BEFORE rate limits
2. Return 406 within rate limit check
3. Count 406 errors against user's quota
4. Log rate limit violations separately

**Timeline**: Implement in validation layer improvement

### Risk 4: Incomplete Documentation of Header Requirements (MEDIUM)

**Impact**: Support burden, client frustration

**Mitigation**:
1. Update existing guide (`docs/guides/mcp-claude-code-integration.md`)
2. Add header validation section to MCP integration docs
3. Provide troubleshooting guide for common errors
4. Link from error responses to documentation

**Timeline**: Implement with Recommendation 3

### Risk 5: Protocol Version Mismatch Confusion (LOW)

**Impact**: Clients may select wrong version, future compatibility issues

**Mitigation**:
1. Sync versions across all endpoints (Recommendation 2)
2. Define version change policy
3. Support 2+ versions simultaneously if breaking change
4. Provide version compatibility matrix

**Timeline**: Implement in next sprint

---

## Related Systems & Dependencies

### Supabase RLS Integration

**Boundary**: MCP tools → Supabase authenticated requests

**Current Status**: RLS policies enforce user_id filtering in all tools

**Risk**: If userId not passed to Supabase client, users could access other users' data

**Verification**:
- [ ] Confirm userId in McpServerContext flows to all queries
- [ ] Test RLS with tool execution for different users
- [ ] Verify project ownership checks work across tools

### Stripe Integration (Rate Limiting)

**Boundary**: User tier → MCP rate limits

**Current Status**: Rate limits enforced before SDK processes (line 664)

**Concern**: HTTP 406 errors bypass tool-level quota tracking

**Improvement**: Count all MCP endpoint requests (including 406s) against rate limit

### GitHub Integration (Indexing)

**Boundary**: index_repository tool → GitHub API calls

**Current Status**: Separate integration, not affected by HTTP 406

**Consideration**: Ensure integration tests cover end-to-end flow through MCP

---

## Integration Success Criteria

| Criterion | Current Status | Target Status | Acceptance |
|-----------|---------------|---------------|-----------|
| Accept header validation | Not enforced | Validated with 406 response | Test passes: missing Accept → 406 |
| Error messaging | Generic SDK errors | Specific, actionable messages | Error response includes remediation |
| Protocol version sync | Mismatched (2024-11-05 vs 2025-06-18) | Unified across endpoints | Both GET /mcp and POST /mcp return same version |
| Documentation completeness | Partial (headers mentioned) | Comprehensive guide | Clients can self-serve .mcp.json setup |
| Telemetry coverage | Basic logging | MCP-specific metrics | Sentry events track header validation |
| Test coverage | Some MCP tests | Complete integration matrix | All 9 scenarios in test matrix covered |
| Backwards compatibility | No version fallback | Support deprecation path | Document future version migration |

---

## Conclusion

Issue #465 represents a critical integration boundary failure at the HTTP Accept header validation level. The MCP SDK v1.20+ requires explicit Accept header configuration that Claude Code clients must provide, but current documentation and error handling provide insufficient guidance.

**Key Integration Insights**:
1. **Root Cause**: MCP SDK contract requires dual Accept header types (application/json + text/event-stream)
2. **Failure Mode**: HTTP 406 returned without actionable error message
3. **Impact Scope**: All 13 MCP tools (6 code intelligence + 7 project management)
4. **Fix Complexity**: Low (validation middleware + documentation)
5. **Risk Level**: HIGH (blocks entire Claude Code integration)

**Recommended Action Plan**:
1. **Immediate** (this sprint):
   - Implement explicit Accept header validation (Recommendation 1)
   - Update `.mcp.json` documentation template (Recommendation 3)
   - Sync protocol version mismatch (Recommendation 2)

2. **Short-term** (next sprint):
   - Add MCP telemetry tracking (Recommendation 4)
   - Expand error recovery messaging (Recommendation 5)
   - Complete integration test matrix (Testing Requirements)

3. **Ongoing**:
   - Monitor Sentry for Accept header failures
   - Track client adoption of correct configuration
   - Prepare deprecation path for future SDK versions

---

## Appendix: File Locations Reference

| Component | File Path |
|-----------|-----------|
| MCP Server Factory | `app/src/mcp/server.ts` |
| MCP Endpoint Route | `app/src/api/routes.ts:659-697` |
| Header Validation Utils | `app/src/mcp/headers.ts` |
| Lifecycle Negotiation | `app/src/mcp/lifecycle.ts` |
| Tool Execution | `app/src/mcp/tools.ts` |
| Test Helpers | `app/tests/helpers/mcp.ts` |
| Integration Guide | `docs/guides/mcp-claude-code-integration.md` |
| MCP Integration Docs | `.claude/commands/docs/mcp-integration.md` |
| Header Validation Tests | `app/tests/mcp/headers.test.ts` |
| Authentication Tests | `app/tests/mcp/authentication.test.ts` |

---

**Document Prepared By**: Integration Expert
**Review Status**: Ready for Implementation Spec
**Next Step**: Create detailed implementation specification with code changes

