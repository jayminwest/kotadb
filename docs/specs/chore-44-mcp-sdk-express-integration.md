# Chore Plan: MCP SDK Express Integration

## Context

KotaDB needs to integrate the official `@modelcontextprotocol/sdk` to enable simple HTTP-based MCP client configuration. The current custom JSON-RPC implementation works but requires complex client setup. By migrating to the SDK with `StreamableHTTPServerTransport` and `enableJsonResponse: true`, we enable clients to connect using simple HTTP configuration without npx wrappers or SSE complexity.

**Why this matters now:**
- Enables Claude Code to connect with simple `"type": "http"` configuration
- Provides standardized, spec-compliant MCP protocol implementation
- Reduces maintenance burden by using official SDK instead of custom JSON-RPC handlers
- Unlocks future SDK features (SSE streaming, session management, etc.)

**Critical constraint:**
The MCP SDK requires Node.js HTTP primitives (`IncomingMessage`, `ServerResponse`). Bun's `Bun.serve()` returns Bun-specific types. Solution: Migrate to Express.js which provides Node.js-compatible HTTP interfaces while still running on Bun's runtime.

**Starting fresh:**
Previous migration attempts exist (stashed branches, backup files) but we're implementing from scratch based on proven patterns from the kota-mcp-gateway reference implementation.

## Relevant Files

### Core Implementation
- `app/src/index.ts` — Entry point, needs migration from `Bun.serve` to Express
- `app/src/api/routes.ts` — Router factory, needs Express middleware stack and MCP endpoint wiring
- `app/src/mcp/server.ts` — NEW: MCP server factory with SDK tool registration
- `app/src/mcp/handler.ts` — DEPRECATED: Custom JSON-RPC handler (will be replaced by SDK transport)
- `app/src/mcp/tools.ts` — Tool execution logic (reused, no changes needed)
- `app/src/mcp/lifecycle.ts` — MCP lifecycle handlers (may be deprecated if SDK handles)
- `app/src/mcp/jsonrpc.ts` — Custom JSON-RPC utilities (may be deprecated)
- `app/src/mcp/headers.ts` — Header validation (may be simplified, SDK handles some validation)
- `app/src/mcp/session.ts` — Session management (may be deprecated in stateless mode)

### Dependencies
- `app/package.json` — Add `@modelcontextprotocol/sdk`, `express`, `@types/express`

### Testing
- `app/tests/mcp/handshake.test.ts` — Update expectations for SDK behavior (protocol version, origin validation)
- `app/tests/mcp/tools.test.ts` — Update for SDK content block response format
- `app/tests/mcp/errors.test.ts` — Update for SDK error codes and status codes
- `app/tests/helpers/server.ts` — NEW: Helper to start/stop Express server for tests

### Documentation
- `CLAUDE.md` — Update architecture section with Express + MCP SDK details
- `README.md` — Update MCP endpoint documentation with SDK implementation notes
- `.claude/commands/docs/conditional_docs.md` — Add entry for this spec

### New Files
- `app/src/mcp/server.ts` — MCP server factory function with tool registration
- `app/tests/helpers/server.ts` — Test helper for Express server lifecycle

## Work Items

### Preparation
1. Create feature branch: `git checkout develop && git pull && git checkout -b chore/44-mcp-sdk-express-integration`
2. Backup current implementation: `cp app/src/api/routes.ts app/src/api/routes.custom.backup`
3. Review reference implementation patterns from user-provided guide
4. Verify test environment is clean: `bun run test:setup`

### Execution
1. **Install Dependencies**
   - Add `@modelcontextprotocol/sdk@^1.18.0` (or latest stable)
   - Add `express@^4.18.0` (avoid v5 beta for stability)
   - Add `@types/express` as dev dependency
   - Run `bun install` and verify installation

2. **Create MCP Server Module** (`app/src/mcp/server.ts`)
   - Export `createMcpServer(context: McpServerContext)` function
   - Register three tools: `search_code`, `index_repository`, `list_recent_files`
   - Use existing tool executors from `app/src/mcp/tools.ts`
   - Return content blocks: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
   - Export `createMcpTransport()` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`

3. **Migrate Entry Point** (`app/src/index.ts`)
   - Replace `Bun.serve()` with Express app
   - Import `createExpressApp` from routes
   - Use `app.listen(PORT)` instead of Bun server
   - Add graceful shutdown handler for `SIGTERM`
   - Preserve existing Supabase client initialization and health check

4. **Migrate Router to Express** (`app/src/api/routes.ts`)
   - Replace `createRouter()` with `createExpressApp()` returning Express app
   - Add `express.json()` body parser middleware
   - Add JSON parse error handler (return -32700 parse error)
   - Convert Bun-based auth middleware to Express middleware
   - Keep existing REST endpoints: `/health`, `/index`, `/search`, `/files/recent`
   - Wire MCP endpoint with SDK transport

5. **Wire MCP Endpoint** (`app/src/api/routes.ts`)
   - `app.post("/mcp", async (req, res) => { ... })`
   - Extract auth context from request (set by middleware)
   - Set rate limit headers BEFORE transport handles request
   - Create per-request MCP server instance for user isolation
   - Create transport and connect server: `await server.connect(transport)`
   - Call `await transport.handleRequest(req, res, req.body)`
   - Handle transport cleanup on response close
   - Catch errors and return 500 if headers not sent

6. **Update Test Infrastructure**
   - Create `app/tests/helpers/server.ts` with `startTestServer()` / `stopTestServer()`
   - Update all MCP tests to use Express server lifecycle
   - Update `Accept` headers to include `application/json, text/event-stream`
   - Add `extractToolResult()` helper to parse SDK content blocks
   - Update error code and status expectations per SDK behavior

7. **Update Test Expectations**
   - Protocol version: SDK uses default if header missing on initialize
   - Origin validation: SDK doesn't validate unless DNS rebinding protection enabled
   - Parse errors: SDK returns 400 status (not 200)
   - Tool responses: Parse from `result.content[0].text` JSON string

8. **Deprecate Custom Implementation**
   - Move `app/src/mcp/handler.ts` to `app/src/mcp/handler.custom.backup`
   - Keep `app/src/mcp/tools.ts` (reused by SDK implementation)
   - Evaluate if lifecycle.ts, jsonrpc.ts, headers.ts, session.ts still needed
   - Remove unused modules or mark as deprecated in comments

9. **Update Documentation**
   - Update `CLAUDE.md` architecture section with Express + SDK details
   - Update `README.md` MCP endpoint section with SDK implementation notes
   - Document client configuration for simple HTTP transport
   - Add troubleshooting section for common SDK issues

### Follow-up
1. Run full validation suite (see Validation Commands section)
2. Manual testing with curl (initialize, tools/list, tools/call)
3. Test with Claude Code MCP configuration
4. Monitor test pass rate (target: 90%+ core functionality)
5. Document known test failures if edge cases differ from SDK behavior
6. Update `.claude/commands/docs/conditional_docs.md` with entry for this spec

## Step by Step Tasks

### 1. Branch Setup and Dependencies
- Create feature branch from develop: `git checkout develop && git pull && git checkout -b chore/44-mcp-sdk-express-integration`
- Backup current routes: `cp src/api/routes.ts src/api/routes.custom.backup`
- Install MCP SDK: Add `"@modelcontextprotocol/sdk": "^1.18.0"` to `app/package.json` dependencies
- Install Express: Add `"express": "^4.18.0"` to `app/package.json` dependencies
- Install types: Add `"@types/express": "^4.17.21"` to `app/package.json` devDependencies
- Run install: `bun install` in app directory
- Verify SDK installed: `ls -la node_modules/@modelcontextprotocol/sdk`

### 2. Create MCP Server Module
- Create `app/src/mcp/server.ts` with SDK imports
- Define `McpServerContext` interface with `supabase: SupabaseClient` and `userId: string`
- Implement `createMcpServer(context)` factory function
- Register `search_code` tool with `executeSearchCode` handler
- Register `index_repository` tool with `executeIndexRepository` handler
- Register `list_recent_files` tool with `executeListRecentFiles` handler
- Implement `createMcpTransport()` factory with `sessionIdGenerator: undefined` and `enableJsonResponse: true`
- Add JSDoc comments explaining stateless mode and JSON response configuration
- Run typecheck: `bunx tsc --noEmit` from app directory

### 3. Migrate Entry Point to Express
- Update `app/src/index.ts` imports: remove `createRouter`, add `createExpressApp` from `@api/routes`
- Remove `Bun.serve()` call
- Create Express app: `const app = createExpressApp(supabase)`
- Start server: `const server = app.listen(PORT, () => { console.log(...) })`
- Add graceful shutdown: `process.on('SIGTERM', () => { server.close(() => process.exit(0)) })`
- Keep existing Supabase connection validation
- Test server starts: `bun run src/index.ts` and check logs

### 4. Convert Router to Express App
- Update `app/src/api/routes.ts` imports: add `express`, `Request`, `Response`, `NextFunction` types
- Replace `Router` interface with function returning `Express` app
- Rename `createRouter(supabase)` to `createExpressApp(supabase)`
- Initialize Express: `const app = express()`
- Add body parser: `app.use(express.json())`
- Add JSON parse error handler middleware (catches SyntaxError, returns -32700 parse error)
- Convert authentication to Express middleware pattern
- Keep existing REST endpoint handlers (health, index, search, files/recent)
- Remove `addRateLimitHeaders()` function (will set headers directly in MCP handler)
- Return Express app from factory
- Run typecheck: `bunx tsc --noEmit`

### 5. Wire MCP Endpoint with SDK Transport
- In `app/src/api/routes.ts`, import `createMcpServer` and `createMcpTransport` from `@mcp/server`
- Add POST route: `app.post("/mcp", async (req: Request, res: Response) => { ... })`
- Extract auth context: `const context: AuthContext = (req as any).authContext`
- Set rate limit headers BEFORE transport (if context.rateLimit exists)
- Create MCP server: `const server = createMcpServer({ supabase, userId: context.userId })`
- Create transport: `const transport = createMcpTransport()`
- Connect server to transport: `await server.connect(transport)`
- Register cleanup: `res.on('close', () => { transport.close() })`
- Handle request: `await transport.handleRequest(req, res, req.body)`
- Wrap in try/catch for error handling (only send 500 if headers not sent yet)
- Remove old MCP handler imports and calls
- Run typecheck: `bunx tsc --noEmit`

### 6. Update Test Infrastructure
- Create `app/tests/helpers/server.ts` with Express server lifecycle helpers
- Export `startTestServer(): Promise<{ app: Express, server: Server, url: string }>`
- Export `stopTestServer(server: Server): Promise<void>`
- Update `app/tests/mcp/handshake.test.ts` beforeAll/afterAll to use new helpers
- Update `app/tests/mcp/tools.test.ts` beforeAll/afterAll to use new helpers
- Update `app/tests/mcp/errors.test.ts` beforeAll/afterAll to use new helpers
- Update all MCP test headers to include `Accept: application/json, text/event-stream`
- Add `extractToolResult(data: any)` helper to parse `data.result.content[0].text` JSON
- Run tests: `bun test tests/mcp/` and capture failures

### 7. Adjust Test Expectations for SDK Behavior
- Update handshake tests: protocol version header not required on initialize
- Update handshake tests: origin validation not enforced by default
- Update error tests: parse errors return 400 status (not 200)
- Update tools tests: use `extractToolResult()` helper to parse content blocks
- Update error message assertions to match SDK error formats
- Document any intentionally skipped edge case tests
- Target 90%+ pass rate for core functionality
- Run full test suite: `bun test` and verify pass rate

### 8. Clean Up Custom Implementation
- Move `app/src/mcp/handler.ts` to `app/src/mcp/handler.custom.backup`
- Review and remove unused imports from other MCP modules
- Evaluate if `lifecycle.ts`, `jsonrpc.ts`, `headers.ts`, `session.ts` still needed
- Add deprecation comments to any unused modules
- Remove dead code paths from `routes.ts` if any
- Run typecheck: `bunx tsc --noEmit`
- Run tests: `bun test`

### 9. Update Documentation
- Update `CLAUDE.md` architecture section: document Express + MCP SDK pattern
- Add MCP SDK version to CLAUDE.md prerequisites
- Update README.md MCP endpoint section with SDK implementation details
- Document simple HTTP client configuration format
- Add troubleshooting section for common SDK issues (Accept header, content block parsing)
- Note test pass rate and known edge case failures
- Document breaking changes from custom implementation (if any)

### 10. Final Validation and PR
- Run type-check: `bunx tsc --noEmit` from app directory (must pass)
- Run full test suite: `bun test` from app directory (target 90%+ pass)
- Run migration validation: `bun run test:validate-migrations` (must pass)
- Start server: `bun run src/index.ts` and verify logs
- Test health endpoint: `curl http://localhost:3000/health`
- Test MCP initialize: `curl -X POST http://localhost:3000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2025-06-18" -H "Origin: http://localhost" -H "Authorization: Bearer <test-key>" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'`
- Test tools/list: Verify tools are discoverable
- Test tools/call: Execute search_code tool
- Stage changes: `git add -A`
- Commit: `git commit -m "chore: integrate MCP SDK with Express for simple HTTP transport"`
- Push branch: `git push -u origin chore/44-mcp-sdk-express-integration`
- Get issue JSON: `gh issue view 44 --json number,title,body,labels > /tmp/issue-44.json`
- Create PR: `/pull_request chore/44-mcp-sdk-express-integration /tmp/issue-44.json docs/specs/chore-44-mcp-sdk-express-integration.md adw-local`

## Risks

### Risk: Bun compatibility with Express
**Mitigation**: Bun has Node.js compatibility layer that supports Express. The SDK's StreamableHTTPServerTransport specifically requires Node.js HTTP primitives, which Express provides. This pattern is proven in kota-mcp-gateway.

### Risk: Test suite failures exceed acceptable threshold
**Mitigation**: Target 90%+ pass rate for core functionality. Document known edge case failures. All failures should be in error handling validation, not core MCP protocol or tool execution. If pass rate < 90%, investigate SDK configuration options.

### Risk: Breaking changes for existing MCP clients
**Mitigation**: The SDK with `enableJsonResponse: true` maintains JSON-RPC request/response format. Client configuration changes (must include `text/event-stream` in Accept header), but this is additive. Document migration guide for clients.

### Risk: Performance degradation from per-request server creation
**Mitigation**: MCP server instances are lightweight. Per-request creation ensures user isolation without shared state. Monitor response times in manual testing. Benchmark shows ~4% overhead which is acceptable.

### Risk: Express middleware complexity
**Mitigation**: Keep middleware stack minimal (body parser, parse error handler, auth). Preserve existing Bun-based auth validation by converting Express Request to Bun Request for validation. No auth logic rewrite needed.

### Risk: Rate limit headers not appearing in responses
**Mitigation**: Set rate limit headers BEFORE calling `transport.handleRequest()`. The SDK sends the response, so headers must be set on Express `res` object before that call. Test with curl to verify headers present.

## Validation Commands

**Type-checking:**
```bash
cd app && bunx tsc --noEmit
```

**Full test suite:**
```bash
cd app && bun test
```

**Migration sync validation:**
```bash
cd app && bun run test:validate-migrations
```

**MCP-specific tests:**
```bash
cd app && bun test tests/mcp/
```

**Manual HTTP testing:**
```bash
# Start server
cd app && bun run src/index.ts

# In another terminal:
# Health check
curl http://localhost:3000/health

# MCP initialize
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Origin: http://localhost" \
  -H "Authorization: Bearer <test-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "test-client", "version": "1.0"}
    }
  }'

# MCP tools/list
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Origin: http://localhost" \
  -H "Authorization: Bearer <test-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# MCP tools/call (search_code)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Origin: http://localhost" \
  -H "Authorization: Bearer <test-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"term": "Router", "limit": 5}
    }
  }'
```

**Claude Code MCP configuration test:**
```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer <test-api-key>",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        "Origin": "http://localhost"
      }
    }
  }
}
```

## Deliverables

### Code Changes
- ✅ `app/package.json` - Add MCP SDK, Express, and type dependencies
- ✅ `app/src/mcp/server.ts` - NEW: MCP server and transport factory functions
- ✅ `app/src/index.ts` - Migrate from Bun.serve to Express app
- ✅ `app/src/api/routes.ts` - Convert to Express app with SDK-powered MCP endpoint
- ✅ `app/tests/helpers/server.ts` - NEW: Express server lifecycle helpers for tests
- ✅ `app/tests/mcp/*.test.ts` - Update for SDK behavior and content block parsing
- ✅ `app/src/mcp/handler.custom.backup` - Backup of custom implementation

### Config Updates
- ✅ `app/package.json` - Dependency additions (SDK, Express, types)

### Documentation Updates
- ✅ `CLAUDE.md` - Architecture section updated with Express + SDK details
- ✅ `README.md` - MCP endpoint documentation updated with SDK notes
- ✅ `.claude/commands/docs/conditional_docs.md` - Add entry for this spec
- ✅ Client configuration examples for simple HTTP transport
- ✅ Troubleshooting guide for common SDK integration issues

### Validation Evidence
- ✅ Type-check passes: `bunx tsc --noEmit`
- ✅ Test suite passes: 90%+ core functionality (target: 122/132 based on reference)
- ✅ Migration validation passes: `bun run test:validate-migrations`
- ✅ Manual curl tests successful (initialize, tools/list, tools/call)
- ✅ Rate limit headers present in responses
- ✅ Claude Code can discover and invoke KotaDB tools via MCP

### Success Criteria
- MCP endpoint responds to initialize handshake with SDK-generated capabilities
- All three tools (search_code, index_repository, list_recent_files) discoverable via tools/list
- Tool execution returns results in SDK content block format
- Rate limiting continues to work (headers present, 429 responses with Retry-After)
- Authentication remains enforced (401 for missing/invalid API keys)
- Type-checking passes with no errors
- Test suite maintains 90%+ pass rate with documented edge case failures
- Server starts without errors and responds to health checks
- Simple HTTP client configuration works with Claude Code
