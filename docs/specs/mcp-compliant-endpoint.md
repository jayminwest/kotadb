# Feature Plan: MCP-Compliant HTTP Endpoint

## Overview

### Problem
KotaDB currently provides REST-style endpoints (`/index`, `/search`, `/files/recent`) but lacks an MCP (Model Context Protocol) compliant interface. This forces CLI agents like Claude Code to integrate via custom REST calls rather than using standardized MCP tooling. Without MCP support, agents cannot automatically discover KotaDB's capabilities or use it as a pluggable context provider.

### Desired Outcome
Expose a `/mcp` HTTP endpoint conforming to the MCP Streamable HTTP transport specification (rev 2025-06-18) that:
- Handles JSON-RPC 2.0 messages for initialization, capability discovery, and tool invocation
- Validates protocol-required headers (`Origin`, `Accept`, `MCP-Protocol-Version`)
- Supports both synchronous JSON responses and optional SSE streaming
- Enables CLI agents to index repositories and search code through standardized MCP tools
- Provides session management via `Mcp-Session-Id` for stateful interactions

### Non-Goals
- Full SSE streaming for long-running index operations (deferred to future iteration with feature flag)
- Persistent server-side session storage (initial implementation uses stateless validation)
- Complete MCP resource/prompt capabilities (focusing on tools: `search_code`, `index_repository`, `list_recent_files`)
- Authentication/authorization beyond Origin validation (documented as deployment concern)
- WebSocket or stdio transports (HTTP-only initially)

## Technical Approach

### Architecture Notes
The MCP endpoint will be a parallel transport layer alongside existing REST routes, reusing KotaDB's core indexing and search logic. We'll introduce a new `src/mcp/` module to isolate JSON-RPC concerns:

1. **JSON-RPC Dispatcher**: Maps incoming `method` fields to handler functions, validates request structure, and formats responses per JSON-RPC 2.0 spec
2. **Header Validation Middleware**: Checks `Origin`, `Accept`, and `MCP-Protocol-Version` headers before processing requests
3. **MCP Lifecycle Handlers**: Implements `initialize`, `initialized` notification, and capability advertisement
4. **Tool Adapters**: Wraps existing `searchFiles`, `listRecentFiles`, and indexing workflow into MCP tool definitions

The router in `src/api/routes.ts` will dispatch `/mcp` requests to the new handler, preserving existing REST behavior.

### Key Modules to Touch
- **src/api/routes.ts**: Add `/mcp` route that delegates to MCP handler
- **src/api/queries.ts**: Reuse existing DB query functions (no changes needed)
- **src/indexer/\***: Reuse repository indexing workflow via tool adapters
- **New: src/mcp/handler.ts**: Main entry point for MCP request handling
- **New: src/mcp/jsonrpc.ts**: JSON-RPC message types, validation, and response builders
- **New: src/mcp/lifecycle.ts**: Initialize handshake and capability negotiation
- **New: src/mcp/tools.ts**: Tool definitions and execution adapters for search/index/recent
- **New: src/mcp/headers.ts**: Header validation utilities (Origin, protocol version)
- **New: src/mcp/session.ts**: Session ID validation (stateless initial approach)

### Data/API Impacts
- **No schema changes**: Existing `files`, `index_runs` tables unchanged
- **New HTTP response codes**: 202 for notifications, 400/403 for header validation failures
- **JSON-RPC error codes**: Standard codes (-32600 Invalid Request, -32601 Method Not Found, -32602 Invalid Params, -32603 Internal Error)
- **Tool schemas**: Define input/output JSON schemas for `search_code`, `index_repository`, `list_recent_files`
- **Capability advertisement**: Server declares support for `tools` capability with specific tool list

## Relevant Files

### Existing Files
- **src/index.ts** — Bootstrap logic; no changes needed (router already plugs in)
- **src/api/routes.ts:19-58** — Router handle method; add `/mcp` route dispatch
- **src/api/queries.ts** — DB query functions for search, recent files, index runs; reused as-is
- **src/indexer/repos.ts** — Repository cloning and checkout; reused in `index_repository` tool
- **src/indexer/parsers.ts** — File discovery and parsing; reused in indexing workflow
- **src/indexer/extractors.ts** — Snippet generation; reused for search results
- **src/types/index.ts** — Shared types (`IndexRequest`, `IndexedFile`); imported by MCP tools
- **tests/smoke.test.ts** — Existing test pattern; reference for new MCP tests
- **package.json:8-16** — Scripts for `test`, `typecheck`, `lint`; used for validation
- **tsconfig.json:16-20** — Path aliases; add `@mcp/*` alias for new module

### New Files
- **src/mcp/handler.ts** — Main entry point: receives Request, validates headers, dispatches JSON-RPC
- **src/mcp/jsonrpc.ts** — Types and utilities for JSON-RPC 2.0 (request/response/error/notification)
- **src/mcp/lifecycle.ts** — `initialize` request handler, capability object construction
- **src/mcp/tools.ts** — Tool definitions (schema + execution) for search/index/recent operations
- **src/mcp/headers.ts** — Header validation: `validateOrigin`, `validateProtocolVersion`, `parseAccept`
- **src/mcp/session.ts** — Session ID extraction and validation (stateless token approach)
- **tests/mcp/handshake.test.ts** — Tests for initialize flow and capability negotiation
- **tests/mcp/tools.test.ts** — Tests for tool invocation (search, index, list_recent)
- **tests/mcp/headers.test.ts** — Tests for header validation (bad Origin, missing version, etc.)
- **tests/mcp/errors.test.ts** — Tests for JSON-RPC error responses (invalid method, params, etc.)

## Task Breakdown

### Phase 1: Foundation (JSON-RPC + Header Validation)
- Set up `src/mcp/` directory and path alias in tsconfig.json
- Implement `src/mcp/jsonrpc.ts` with types for JSON-RPC 2.0 messages
- Implement `src/mcp/headers.ts` with validation functions for required headers
- Add `/mcp` route stub in `src/api/routes.ts` that returns 501 Not Implemented
- Write unit tests for JSON-RPC type guards and header validation in `tests/mcp/headers.test.ts`

### Phase 2: Lifecycle & Capability Advertisement
- Implement `src/mcp/lifecycle.ts` with `initialize` handler and capability object
- Implement `src/mcp/session.ts` with stateless session ID validation (optional header)
- Wire lifecycle handler into main MCP dispatcher in `src/mcp/handler.ts`
- Write integration tests for initialize handshake in `tests/mcp/handshake.test.ts`
- Update `/mcp` route stub to delegate to full handler

### Phase 3: Tool Implementation & Integration
- Implement `src/mcp/tools.ts` with tool definitions and adapters for:
  - `search_code`: wraps `searchFiles` from queries.ts
  - `list_recent_files`: wraps `listRecentFiles`
  - `index_repository`: wraps `handleIndexRequest` logic
- Wire tool dispatcher into MCP handler for `tools/call` method
- Write integration tests for tool invocation in `tests/mcp/tools.test.ts`
- Add error handling tests in `tests/mcp/errors.test.ts` (invalid params, missing tools, etc.)

### Phase 4: Documentation & Deployment Guidance
- Update README.md with MCP endpoint usage examples (cURL, Claude Code config)
- Document required headers and example JSON-RPC payloads
- Add security guidance: Origin whitelisting, localhost binding, auth recommendations
- Update Dockerfile/fly.io templates with MCP-specific environment variables (allowed origins)
- Document session management strategy and future SSE streaming plans

### Phase 5: Validation & Cleanup
- Run full test suite: `bun test`
- Run type-checking: `bunx tsc --noEmit`
- Run linter: `bunx biome lint`
- Manual smoke test: start server, send initialize + search tool call via cURL
- Review code coverage for MCP module (aim for >80% on critical paths)
- Clean up any TODOs or placeholder comments in MCP code

## Step by Step Tasks

### Setup & Foundation
1. Create `src/mcp/` directory structure
2. Add `@mcp/*` path alias to tsconfig.json paths
3. Define JSON-RPC 2.0 types in `src/mcp/jsonrpc.ts`:
   - `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `JsonRpcNotification`
   - Type guards: `isRequest`, `isNotification`, `isValidVersion`
   - Response builders: `success`, `error`, `parseError`, `methodNotFound`, `invalidParams`, `internalError`
4. Implement header validation in `src/mcp/headers.ts`:
   - `validateOrigin(origin: string | null): boolean` — check against allowed list (default: localhost)
   - `validateProtocolVersion(version: string | null): boolean` — check for "2025-06-18"
   - `parseAccept(accept: string | null): { json: boolean, sse: boolean }` — parse Accept header
5. Write unit tests in `tests/mcp/headers.test.ts` covering valid/invalid headers
6. Add `/mcp` route stub in `src/api/routes.ts` returning `{ error: "Not Implemented" }` with 501

### Lifecycle Implementation
7. Define capability types in `src/mcp/lifecycle.ts`:
   - `InitializeRequest`, `InitializeResult`, `ServerCapabilities`, `ToolCapability`
8. Implement `handleInitialize(request: InitializeRequest): InitializeResult`:
   - Return protocol version "2025-06-18"
   - Advertise capabilities: `{ tools: { listChanged: false } }`
   - Return server info: `{ name: "kotadb", version: "0.1.0" }`
9. Implement session utilities in `src/mcp/session.ts`:
   - `extractSessionId(headers: Headers): string | null`
   - `validateSessionId(id: string | null): boolean` — stateless check (non-empty, reasonable length)
10. Create main dispatcher in `src/mcp/handler.ts`:
    - `handleMcpRequest(db: Database, request: Request): Promise<Response>`
    - Validate headers first (Origin, protocol version, Accept)
    - Parse JSON body into JSON-RPC message
    - Route `initialize` method to lifecycle handler
    - Return 202 for `initialized` notification
    - Return 404 for unsupported methods (until tools wired up)
11. Wire MCP handler into router at `src/api/routes.ts:58` (before 404 fallback)
12. Write integration tests in `tests/mcp/handshake.test.ts`:
    - Test successful initialize with valid headers
    - Test failure for missing `MCP-Protocol-Version` header
    - Test failure for invalid `Origin`
    - Test 202 response for `initialized` notification

### Tool Integration
13. Define tool schemas in `src/mcp/tools.ts`:
    - `SearchCodeTool`: input `{ term: string, project?: string, limit?: number }`, output `{ results: Array<{...}> }`
    - `IndexRepositoryTool`: input `{ repository: string, ref?: string, localPath?: string }`, output `{ runId: number }`
    - `ListRecentFilesTool`: input `{ limit?: number }`, output `{ results: Array<{...}> }`
14. Implement tool executor functions:
    - `executeSearchCode(db, params)` → calls `searchFiles`, maps to tool output format
    - `executeIndexRepository(db, params)` → calls indexing workflow (reuse routes.ts logic), returns runId
    - `executeListRecentFiles(db, params)` → calls `listRecentFiles`
15. Implement tool dispatcher in `src/mcp/tools.ts`:
    - `handleToolCall(db: Database, method: string, params: unknown): unknown`
    - Route `tools/call` with `name` param to appropriate executor
    - Validate params against tool schema, throw InvalidParams error if mismatch
    - Return tool result or throw InternalError on failure
16. Wire tool dispatcher into MCP handler (update `src/mcp/handler.ts`):
    - Handle `tools/list` method → return tool definitions
    - Handle `tools/call` method → delegate to `handleToolCall`
17. Write integration tests in `tests/mcp/tools.test.ts`:
    - Test `tools/list` returns correct tool definitions
    - Test `search_code` tool with valid term returns results
    - Test `index_repository` tool triggers indexing and returns runId
    - Test `list_recent_files` tool returns recent files
18. Write error tests in `tests/mcp/errors.test.ts`:
    - Test invalid JSON body returns -32700 Parse Error
    - Test unknown method returns -32601 Method Not Found
    - Test invalid params returns -32602 Invalid Params
    - Test tool execution failure returns -32603 Internal Error

### Documentation & Deployment
19. Add MCP usage section to README.md:
    - Endpoint: `POST http://localhost:3000/mcp`
    - Required headers: `Origin`, `MCP-Protocol-Version: 2025-06-18`, `Accept: application/json`
    - Example initialize request (cURL)
    - Example search tool call (cURL)
20. Document session management strategy:
    - `Mcp-Session-Id` header optional in initial implementation
    - Server validates presence but does not persist state
    - Future enhancement: server-side session store with TTL
21. Add security section:
    - Origin validation (default allows `http://localhost:*`)
    - Recommend environment variable `KOTA_ALLOWED_ORIGINS` for production
    - Note: no authentication in initial release; use reverse proxy or network policies
22. Update Docker/fly.io templates:
    - Add `KOTA_ALLOWED_ORIGINS` env var to docker-compose.yml and fly.toml
    - Document localhost binding for local development
23. Add SSE streaming note:
    - Current implementation returns JSON for all requests
    - Future enhancement: SSE streaming for long-running index operations
    - Placeholder for `handleSseStream` function in `src/mcp/handler.ts`

### Validation & Launch
24. Run `bun test` and verify all tests pass (foundation, lifecycle, tools, errors)
25. Run `bunx tsc --noEmit` and fix any type errors
26. Run `bunx biome lint` and address any linting issues
27. Manual smoke test sequence:
    - Start server: `bun run src/index.ts`
    - Send initialize request via cURL with valid headers
    - Verify initialize response contains capabilities
    - Send `initialized` notification, verify 202 response
    - Send `tools/list` request, verify tool definitions returned
    - Send `search_code` tool call with term, verify results
    - Send invalid request (bad headers, bad JSON, bad method), verify error responses
28. Review code coverage for MCP module (manual inspection or coverage tool)
29. Clean up TODOs, placeholders, and debug logging in MCP code
30. Final commit and branch push

## Risks & Mitigations

### Risk: Origin Header Spoofing
**Impact**: Malicious clients could bypass Origin validation by crafting headers.
**Mitigation**: Document that Origin validation is not a security boundary; recommend network-level controls (firewall, reverse proxy with auth) for production. Add environment variable `KOTA_ALLOWED_ORIGINS` for explicit whitelisting.

### Risk: JSON-RPC Protocol Drift
**Impact**: MCP spec evolves (new protocol versions, methods), requiring updates.
**Mitigation**: Hard-code protocol version "2025-06-18" initially; return error for unsupported versions. Add version negotiation logic when multiple versions needed. Monitor MCP spec changes via GitHub/docs.

### Risk: Session Management Complexity
**Impact**: Stateless session IDs may not support advanced use cases (connection pooling, mid-session config changes).
**Mitigation**: Start with stateless validation (just check header presence/format). Document limitation and plan server-side session store as Phase 2 (with TTL, cleanup). Defer until real-world usage demands it.

### Risk: SSE Streaming Overhead
**Impact**: Implementing SSE for long-running indexing adds complexity (connection management, error recovery, stream resumption).
**Mitigation**: Defer SSE to future iteration; initial implementation returns JSON for all requests (async indexing still uses queueMicrotask). Document SSE as roadmap item with feature flag plan. Validate demand before investing engineering time.

### Risk: Tool Schema Drift
**Impact**: KotaDB's internal APIs evolve (query signature changes, new filters), breaking MCP tool contracts.
**Mitigation**: Keep tool adapters thin (delegate to existing query functions). Add integration tests that exercise full stack (HTTP → MCP → DB). Version tool schemas if breaking changes needed (e.g., `search_code_v2`).

### Risk: Type Safety at JSON Boundary
**Impact**: JSON-RPC params are `unknown`; runtime validation errors could leak to clients as 500s.
**Mitigation**: Use TypeScript type guards in tool executors (`isSearchParams`, `isIndexParams`). Return JSON-RPC InvalidParams error (-32602) for schema violations. Add Zod or similar runtime validation library if complexity grows.

## Validation Strategy

### Automated Tests
- **Unit tests** (`tests/mcp/headers.test.ts`): Verify header validation logic in isolation
- **Unit tests** (`tests/mcp/jsonrpc.test.ts`): Verify JSON-RPC type guards and response builders
- **Integration tests** (`tests/mcp/handshake.test.ts`): Full initialize handshake via HTTP
- **Integration tests** (`tests/mcp/tools.test.ts`): Full tool invocation via HTTP (search, index, list_recent)
- **Error tests** (`tests/mcp/errors.test.ts`): Invalid inputs return correct JSON-RPC error codes
- **Coverage target**: >80% line coverage on `src/mcp/*` module

### Manual Checks
- **cURL smoke test**: Send initialize + tool call sequence, inspect JSON responses
- **Claude Code integration**: Configure Claude Code to use `http://localhost:3000/mcp`, verify tool discovery
- **Header validation**: Send requests with missing/invalid headers, verify 400/403 responses
- **Session ID handling**: Send requests with/without `Mcp-Session-Id`, verify acceptance
- **Database integrity**: Verify tool calls create expected DB records (`index_runs`, `files` tables)

### Release Guardrails
- **Type-checking gate**: `bunx tsc --noEmit` must pass before merge
- **Linting gate**: `bunx biome lint` must pass before merge
- **Test suite gate**: `bun test` must show 0 failures before merge
- **Manual review**: Code review checklist includes MCP spec conformance (headers, JSON-RPC format)
- **Rollout plan**: Deploy to staging environment first, validate with real agent before production
- **Rollback plan**: Feature is additive (new `/mcp` route); rollback = revert commit (existing REST endpoints unchanged)

## Validation Commands

Run in order to validate feature implementation:

```bash
# Type-check TypeScript (must have 0 errors)
bunx tsc --noEmit

# Lint code (must have 0 errors)
bunx biome lint

# Run test suite (must pass all tests)
bun test

# Start dev server (manual smoke test)
bun run src/index.ts

# In separate terminal: Test initialize handshake
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
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

# Test tools/list
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'

# Test search_code tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"term": "Router"}
    }
  }'

# Test invalid request (missing protocol version header)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "initialize",
    "params": {}
  }'
# Expected: 400 Bad Request with error about missing header

# Build check (runs typecheck)
bun run build
```

Domain-specific validation:
- Verify `data/kotadb.sqlite` exists after running server (DB initialization)
- Check `index_runs` table has new entries after tool-triggered indexing
- Verify search results include snippet highlighting (via `buildSnippet` call)
- Test with actual Claude Code MCP client configuration (end-to-end integration)
