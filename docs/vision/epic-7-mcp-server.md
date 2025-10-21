# Epic 7: MCP Server Implementation

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: ✅ 98% Complete (Production-Ready)
**Priority**: Critical (Core value proposition)
**Estimated Duration**: 2 weeks
**Actual Duration**: ~3 weeks (completed October 2025)

**Completion Summary**: HTTP JSON-RPC implementation complete (using `@modelcontextprotocol/sdk` v1.20+). **Four tools working**: `search_code`, `index_repository`, `list_recent_files`, **`search_dependencies`** (#116, added 2025-10-20). 122/132 MCP tests passing (92.4% coverage). **Technical decision**: HTTP JSON-RPC instead of SSE for simpler error handling.

**Remaining Work**: `find_references` tool (requires symbol resolution from Epic 3, ~1 week).

## Overview

Implement Model Context Protocol (MCP) server with SSE transport. Build three MVP tools: `search_code`, `find_references`, `get_dependencies`.

## Current Status

**Completion**: 98% (updated 2025-10-20)
**Blockers**: None (production-ready)

### Completed (as of 2025-10-20)
- ✅ HTTP JSON-RPC transport (using `@modelcontextprotocol/sdk` v1.20+)
- ✅ Per-request server isolation (stateless design)
- ✅ Authentication integration (API keys + rate limiting)
- ✅ Four MCP tools operational:
  - `search_code` - Full-text search across indexed files
  - `index_repository` - Trigger repository indexing
  - `list_recent_files` - Query recently indexed files
  - **`search_dependencies`** (#116, merged PR #229) - NEW
    - Three search directions: dependents (reverse), dependencies (forward), both
    - Recursive traversal with depth 1-5
    - Circular dependency detection
    - Test file filtering
- ✅ 122/132 MCP tests passing (92.4% coverage)
- ✅ Integration guide (`docs/guides/mcp-claude-code-integration.md`)

### In Progress
- None

### Remaining Work (2%)
- `find_references` tool - requires symbol resolution (~1 week, Epic 3 dependency)
- Advanced tools (future): `analyze_impact`, `get_type_hierarchy`

## Issues

### Issue #23: Implement SSE transport layer

**Priority**: P0 (Critical)
**Depends on**: #5 (auth middleware)
**Blocks**: #24, #25, #26, #27

#### Description
Implement Server-Sent Events (SSE) transport for MCP protocol per specification. Handle connection lifecycle and event streaming.

#### Acceptance Criteria
- [ ] GET /mcp/ endpoint with SSE streaming
- [ ] Authentication via API key in query param or header
- [ ] Connection lifecycle: open → stream events → close
- [ ] Heartbeat events every 30 seconds
- [ ] Proper SSE formatting (`event:`, `data:`, `id:`)
- [ ] Handle client disconnections gracefully
- [ ] Support concurrent connections per user

#### Technical Notes
- SSE spec: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
- MCP SSE transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Send newline after each event block

#### Files to Create
- `src/mcp/transport/sse.ts` - SSE transport implementation
- `src/mcp/transport/connection.ts` - Connection management

#### Example Implementation
```typescript
const encoder = new TextEncoder()

export async function handleMcpSseConnection(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const bearer = request.headers.get('authorization')
  const apiKey = url.searchParams.get('apiKey') ?? bearer?.replace('Bearer ', '') ?? ''
  const auth = await validateApiKey(apiKey)

  if (!auth) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(':connected\n\n'))

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(':heartbeat\n\n'))
      }, 30_000)

      const close = () => {
        clearInterval(heartbeat)
        controller.close()
      }

      request.signal.addEventListener('abort', close)

      // TODO: wire MCP message pump (#24)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

---

### Issue #24: MCP protocol handlers

**Priority**: P0 (Critical)
**Depends on**: #23
**Blocks**: #25, #26, #27

#### Description
Implement MCP protocol message handling: initialization, tool discovery, tool execution, error handling.

#### Acceptance Criteria
- [ ] Handle `initialize` request (handshake)
- [ ] Handle `tools/list` request (tool discovery)
- [ ] Handle `tools/call` request (tool execution)
- [ ] Return proper MCP message format (JSON-RPC style)
- [ ] Include request IDs for correlation
- [ ] Handle invalid requests with error responses
- [ ] Log all MCP interactions

#### Technical Notes
- MCP spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/messages
- Messages are JSON objects sent as SSE `data:` payloads
- Each message has `jsonrpc: "2.0"`, `id`, `method`, `params`
- Responses have `jsonrpc: "2.0"`, `id`, `result` (or `error`)

#### Files to Create
- `src/mcp/protocol/handler.ts` - Protocol message router
- `src/mcp/protocol/types.ts` - MCP message types
- `src/mcp/protocol/messages.ts` - Message builders

#### Example Implementation
```typescript
export async function handleMcpMessage(message: any, userId: string): Promise<any> {
  const { jsonrpc, id, method, params } = message

  if (jsonrpc !== '2.0') {
    return buildError(id, -32600, 'Invalid JSON-RPC version')
  }

  switch (method) {
    case 'initialize':
      return buildResult(id, {
        protocolVersion: '2025-06-18',
        serverInfo: {
          name: 'KotaDB',
          version: '0.1.0',
        },
        capabilities: {
          tools: {},
        },
      })

    case 'tools/list':
      return buildResult(id, {
        tools: [
          {
            name: 'search_code',
            description: 'Search for code across indexed repositories',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                repository: { type: 'string' },
                limit: { type: 'number', default: 20 },
              },
              required: ['query'],
            },
          },
          // Additional tools from #25-27
        ],
      })

    case 'tools/call':
      return await executeTool(id, params, userId)

    default:
      return buildError(id, -32601, `Method not found: ${method}`)
  }
}

function buildResult(id: any, result: any) {
  return { jsonrpc: '2.0', id, result }
}

function buildError(id: any, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
```

---

### Issue #25: Implement search_code tool

**Priority**: P1 (High)
**Depends on**: #24, #20 (search query logic)
**Blocks**: MVP launch

#### Description
Implement `search_code` MCP tool for full-text search across indexed files.

#### Acceptance Criteria
- [ ] Accept parameters: `query` (required), `repository` (optional), `limit` (optional)
- [ ] Query `indexed_files` with full-text search
- [ ] Filter by repository if specified
- [ ] Return results with context snippets
- [ ] Format results for LLM consumption (concise, structured)
- [ ] Enforce user's RLS (only search their repos)
- [ ] Handle errors gracefully

#### Technical Notes
- Reuse query logic from REST `/search` endpoint
- Return file path, line numbers, and surrounding context
- Limit to 20 results by default, max 100

#### Files to Create
- `src/mcp/tools/search-code.ts` - Search tool implementation

#### Example Implementation
```typescript
export async function searchCode(params: any, userId: string) {
  const { query, repository, limit = 20 } = params

  if (!query || typeof query !== 'string') {
    throw new Error('Parameter "query" is required and must be a string')
  }

  let dbQuery = supabase
    .from('indexed_files')
    .select('path, content, language, repositories(full_name)')
    .textSearch('content', query)
    .limit(Math.min(limit, 100))

  if (repository) {
    dbQuery = dbQuery.eq('repositories.full_name', repository)
  }

  const { data, error } = await dbQuery

  if (error) throw error

  // Format for LLM
  const results = data.map((file) => ({
    repository: file.repositories.full_name,
    path: file.path,
    language: file.language,
    snippet: extractSnippet(file.content, query), // 5 lines of context
  }))

  return {
    content: [
      {
        type: 'text',
        text: formatSearchResults(results),
      },
    ],
  }
}

function formatSearchResults(results: any[]): string {
  if (results.length === 0) {
    return 'No results found.'
  }

  return results.map((r, i) =>
    `${i + 1}. ${r.repository}/${r.path} (${r.language})\n${r.snippet}`
  ).join('\n\n')
}
```

---

### Issue #26: Implement find_references tool

**Priority**: P1 (High)
**Depends on**: #24, #10 (references extracted)
**Blocks**: MVP launch

#### Description
Implement `find_references` MCP tool to find all locations where a symbol is used.

#### Acceptance Criteria
- [ ] Accept parameters: `symbol` (required), `repository` (optional)
- [ ] Query `references` table for symbol name
- [ ] Join with `symbols` to get definition location
- [ ] Join with `indexed_files` to get file paths
- [ ] Return list of references with file, line, and context
- [ ] Format as "what will break if I change this" narrative
- [ ] Enforce user's RLS

#### Technical Notes
- Symbol lookup is case-sensitive (or configurable)
- Include reference type (import, call, property access)
- Group by file for readability

#### Files to Create
- `src/mcp/tools/find-references.ts` - Find references tool

#### Example Implementation
```typescript
export async function findReferences(params: any, userId: string) {
  const { symbol, repository } = params

  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Parameter "symbol" is required and must be a string')
  }

  let query = supabase
    .from('references')
    .select(`
      id,
      caller_line,
      reference_type,
      indexed_files!caller_file_id(path, content),
      symbols!symbol_id(name, file_id, line_start),
      repositories(full_name)
    `)
    .eq('symbols.name', symbol)

  if (repository) {
    query = query.eq('repositories.full_name', repository)
  }

  const { data, error } = await query

  if (error) throw error

  // Format for LLM
  const grouped = groupByFile(data)
  const summary = `Symbol "${symbol}" is referenced in ${grouped.length} file(s):`

  const details = grouped.map((group) => {
    const refs = group.references.map((r) =>
      `  Line ${r.caller_line}: ${r.reference_type}`
    ).join('\n')

    return `${group.file}\n${refs}`
  }).join('\n\n')

  return {
    content: [
      {
        type: 'text',
        text: `${summary}\n\n${details}`,
      },
    ],
  }
}
```

---

### Issue #27: Implement get_dependencies tool

**Priority**: P1 (High)
**Depends on**: #24, #11 (dependencies extracted)
**Blocks**: MVP launch

#### Description
Implement `get_dependencies` MCP tool to build dependency graph for a file or symbol.

#### Acceptance Criteria
- [ ] Accept parameters: `path` or `symbol` (one required), `repository` (optional), `recursive` (optional)
- [ ] Query `dependencies` table
- [ ] Build dependency tree (what this imports)
- [ ] Support recursive traversal (dependencies of dependencies)
- [ ] Detect and report circular dependencies
- [ ] Format as tree or list for LLM
- [ ] Enforce user's RLS

#### Technical Notes
- Limit recursion depth to 5 to prevent infinite loops
- Return both file-level and symbol-level dependencies
- Include import paths for clarity

#### Files to Create
- `src/mcp/tools/get-dependencies.ts` - Dependency graph tool

#### Example Implementation
```typescript
export async function getDependencies(params: any, userId: string) {
  const { path, symbol, repository, recursive = false } = params

  if (!path && !symbol) {
    throw new Error('Either "path" or "symbol" parameter is required')
  }

  let dependencies: Dependency[] = []

  if (path) {
    dependencies = await getFileDependencies(path, repository, recursive)
  } else {
    dependencies = await getSymbolDependencies(symbol, repository, recursive)
  }

  // Format as tree
  const tree = buildDependencyTree(dependencies)
  const circular = detectCircular(dependencies)

  let result = `Dependencies:\n${formatTree(tree)}`

  if (circular.length > 0) {
    result += `\n\nCircular dependencies detected:\n${formatCircular(circular)}`
  }

  return {
    content: [
      {
        type: 'text',
        text: result,
      },
    ],
  }
}

async function getFileDependencies(
  path: string,
  repository: string | undefined,
  recursive: boolean
): Promise<Dependency[]> {
  // Query dependencies table, optionally recurse
}
```

---

## Success Criteria

- [ ] SSE connection established and maintained
- [ ] MCP protocol handshake successful
- [ ] Tool discovery returns all three tools
- [ ] All three tools execute and return correct results
- [ ] Claude Code can connect and query successfully
- [ ] Error handling is robust and informative

## Dependencies for Other Epics

This epic is the culmination of:
- Epic 1 (database schema)
- Epic 2 (authentication)
- Epic 3 (extracted data)
- Epic 4 (indexed repositories)

This is the primary user-facing API for CLI agents.
