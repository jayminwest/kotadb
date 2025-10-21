# Epic 10: Comprehensive Testing

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: ✅ 88% Complete (Strong Coverage, Standardized Environment)
**Priority**: Critical (Enables autonomous development)
**Estimated Duration**: Ongoing (parallel with all other epics)
**Actual Progress**: 317 tests passing, antimocking philosophy enforced, MCP regression suite complete. Remaining: E2E tests, performance regression tests, OpenAPI contract tests.

## Overview

Build comprehensive test suite with 70%+ coverage. Critical for ADW workflows that implement features without human review until PR stage.

## Issues

### Issue #34: Unit tests for parsing and extraction

**Priority**: P0 (Critical)
**Depends on**: #7 (test infrastructure), #8-11 (parsing pipeline)
**Blocks**: #32 (CI/CD requires passing tests)

#### Description
Write unit tests for AST parsing, symbol extraction, reference extraction, and dependency graph building.

#### Acceptance Criteria
- [ ] Test AST parser with valid and invalid syntax
- [ ] Test symbol extraction for all symbol types
- [ ] Test reference extraction for imports, calls, property accesses
- [ ] Test dependency graph building and circular detection
- [ ] 70%+ code coverage for `src/indexer/` modules
- [ ] Tests use fixture repositories
- [ ] All tests pass in CI

#### Technical Notes
- Use Bun's built-in test runner
- Mock file system for parser tests
- Use known fixture repos with expected outputs
- Test edge cases: anonymous functions, default exports, type references

#### Files to Create
- `tests/indexer/ast-parser.test.ts`
- `tests/indexer/symbol-extractor.test.ts`
- `tests/indexer/reference-extractor.test.ts`
- `tests/indexer/dependency-extractor.test.ts`

#### Example Test
```typescript
import { describe, test, expect } from 'bun:test'
import { parseFile } from '@indexer/ast-parser'
import { extractSymbols } from '@indexer/symbol-extractor'

describe('Symbol Extraction', () => {
  test('extracts function declarations', () => {
    const code = `
      function hello(name: string): string {
        return 'Hello ' + name
      }
    `

    const ast = parseFile('test.ts', code)
    const symbols = extractSymbols(ast!, 'file-id')

    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('hello')
    expect(symbols[0].kind).toBe('function')
    expect(symbols[0].signature).toContain('name: string')
  })

  test('extracts class declarations with methods', () => {
    const code = `
      class User {
        constructor(public name: string) {}
        greet() { return 'Hello' }
      }
    `

    const ast = parseFile('test.ts', code)
    const symbols = extractSymbols(ast!, 'file-id')

    const classSymbol = symbols.find((s) => s.kind === 'class')
    expect(classSymbol?.name).toBe('User')
  })

  test('handles syntax errors gracefully', () => {
    const code = 'const x = {'  // Incomplete syntax

    const ast = parseFile('test.ts', code)
    expect(ast).toBeNull()  // Should not throw, just return null
  })
})
```

---

### Issue #35: Unit tests for API and auth

**Priority**: P0 (Critical)
**Depends on**: #7 (test infrastructure), #5-6 (auth), #20-22 (REST API)
**Blocks**: #32 (CI/CD)

#### Description
Write unit tests for authentication middleware, rate limiting, and API endpoints.

#### Acceptance Criteria
- [ ] Test API key validation (valid, invalid, expired)
- [ ] Test authentication middleware (401, 403 responses)
- [ ] Test rate limiting (within limit, exceeded)
- [ ] Test REST endpoints (success, error cases)
- [ ] Mock Supabase calls (don't hit real database)
- [ ] 70%+ code coverage for `src/auth/` and `src/api/`
- [ ] All tests pass in CI

#### Technical Notes
- Use Bun's test runner with mocking
- Mock Supabase client responses
- Test error handling and edge cases
- Verify response headers (rate limit headers, etc.)

#### Files to Create
- `tests/auth/keys.test.ts`
- `tests/auth/middleware.test.ts`
- `tests/auth/rate-limit.test.ts`
- `tests/api/search.test.ts`
- `tests/api/repositories.test.ts`
- `tests/api/jobs.test.ts`

#### Example Test
```typescript
import { describe, test, expect, mock } from 'bun:test'
import { validateApiKey } from '@auth/keys'
import { authenticateRequest } from '@auth/middleware'

describe('API Key Validation', () => {
  test('validates correct API key', async () => {
    const result = await validateApiKey('kota_dev_valid_key_123')

    expect(result).toBeTruthy()
    expect(result?.userId).toBeDefined()
    expect(result?.tier).toBe('free')
  })

  test('rejects invalid API key', async () => {
    const result = await validateApiKey('invalid_key')

    expect(result).toBeNull()
  })

  test('rejects disabled API key', async () => {
    const result = await validateApiKey('kota_dev_disabled_key')

    expect(result).toBeNull()
  })
})

describe('Authentication Helper', () => {
  test('returns context for valid key', async () => {
    const request = new Request('https://example.com/api', {
      headers: { Authorization: 'Bearer kota_dev_valid_key' },
    })

    const result = await authenticateRequest(request)

    expect(result.response).toBeUndefined()
    expect(result.context?.userId).toBeDefined()
  })

  test('returns 401 response for missing key', async () => {
    const request = new Request('https://example.com/api')
    const result = await authenticateRequest(request)

    expect(result.response?.status).toBe(401)
    expect(result.context).toBeUndefined()
  })
})
```

---

### Issue #36: Integration tests for indexing pipeline

**Priority**: P1 (High)
**Depends on**: #7 (test infrastructure), #14 (indexing worker), #18 (webhooks)
**Blocks**: Production deployment

#### Description
Write integration tests for the full indexing pipeline: webhook → queue → worker → database.

#### Acceptance Criteria
- [ ] Test full workflow with fixture repositories
- [ ] Verify GitHub webhook triggers job
- [ ] Verify job is queued and processed
- [ ] Verify data is stored correctly in database
- [ ] Test with real Supabase test database
- [ ] Test error handling and retries
- [ ] All tests pass in CI

#### Technical Notes
- Use Supabase test project (not production)
- Seed database before each test
- Clean up after each test
- Mock GitHub API calls
- Test with both simple and complex repos

#### Files to Create
- `tests/integration/indexing-pipeline.test.ts`
- `tests/integration/webhook-processing.test.ts`

#### Example Test
```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { handleWebhook } from '@github/webhook-handler'
import { startIndexWorker } from '@queue/workers/index-repo'

describe('Indexing Pipeline Integration', () => {
  beforeEach(async () => {
    await seedTestDatabase()
    await startIndexWorker()
  })

  afterEach(async () => {
    await cleanupTestDatabase()
  })

  test('indexes repository from webhook push', async () => {
    // Simulate GitHub push webhook
    const payload = {
      repository: { full_name: 'test-org/test-repo' },
      ref: 'refs/heads/main',
      after: 'abc123',
    }

    const req = mockWebhookRequest(payload)
    const res = mockResponse()

    await handleWebhook(req, res)

    // Wait for job to process
    await waitForJobCompletion('abc123', 30000)

    // Verify data was indexed
    const { data: files } = await supabase
      .from('indexed_files')
      .select('*')
      .eq('repositories.full_name', 'test-org/test-repo')

    expect(files.length).toBeGreaterThan(0)

    // Verify symbols were extracted
    const { data: symbols } = await supabase
      .from('symbols')
      .select('*')
      .eq('file_id', files[0].id)

    expect(symbols.length).toBeGreaterThan(0)
  })

  test('handles parsing errors gracefully', async () => {
    // Repository with invalid syntax files
    // Should index successfully but skip bad files
  })
})
```

---

### Issue #37: Integration tests for MCP protocol

**Priority**: P1 (High)
**Depends on**: #7 (test infrastructure), #23-27 (MCP server)
**Blocks**: Production deployment

#### Description
Write integration tests for MCP SSE connection, protocol handshake, and tool execution.

#### Acceptance Criteria
- [ ] Test SSE connection lifecycle
- [ ] Test MCP initialize handshake
- [ ] Test tool discovery (tools/list)
- [ ] Test each tool execution (search_code, find_references, get_dependencies)
- [ ] Test error handling
- [ ] Test authentication via API key
- [ ] All tests pass in CI

#### Technical Notes
- Use EventSource or SSE client library
- Test with real Supabase test database
- Seed database with known indexed data
- Verify response format matches MCP spec

#### Files to Create
- `tests/integration/mcp-protocol.test.ts`
- `tests/integration/mcp-tools.test.ts`
- `tests/utils/mcp-client.ts` - Test MCP client

#### Example Test
```typescript
import { describe, test, expect, beforeAll } from 'bun:test'
import { createMcpClient } from '@tests/utils/mcp-client'

describe('MCP Protocol Integration', () => {
  let client: McpClient

  beforeAll(async () => {
    await seedTestDatabase()
    client = await createMcpClient('kota_test_api_key')
  })

  test('establishes SSE connection', async () => {
    expect(client.isConnected()).toBe(true)
  })

  test('completes initialize handshake', async () => {
    const response = await client.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })

    expect(response.result.protocolVersion).toBe('2025-06-18')
    expect(response.result.serverInfo.name).toBe('KotaDB')
  })

  test('lists available tools', async () => {
    const response = await client.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })

    expect(response.result.tools).toHaveLength(3)
    expect(response.result.tools.map((t) => t.name)).toContain('search_code')
    expect(response.result.tools.map((t) => t.name)).toContain('find_references')
    expect(response.result.tools.map((t) => t.name)).toContain('get_dependencies')
  })

  test('executes search_code tool', async () => {
    const response = await client.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_code',
        arguments: { query: 'function hello' },
      },
    })

    expect(response.result.content).toBeDefined()
    expect(response.result.content[0].type).toBe('text')
    expect(response.result.content[0].text).toContain('hello')
  })
})
```

---

### Issue #38: E2E tests for critical workflows

**Priority**: P1 (High)
**Depends on**: All previous epics integrated
**Blocks**: Production launch

#### Description
Write end-to-end tests for complete user workflows from repository addition to MCP query.

#### Acceptance Criteria
- [ ] Test: User adds repo → indexing completes → MCP query returns results
- [ ] Test: Multiple users with data isolation (RLS)
- [ ] Test: Rate limiting enforcement
- [ ] Test: Error scenarios (repo not found, invalid API key, etc.)
- [ ] All tests pass in CI

#### Technical Notes
- Use real Supabase test environment
- Test full stack: REST API, MCP API, job queue, database
- Verify RLS prevents cross-user data access
- Test performance (query latency benchmarks)

#### Files to Create
- `tests/e2e/user-workflows.test.ts`
- `tests/e2e/multi-tenancy.test.ts`
- `tests/e2e/rate-limiting.test.ts`

#### Example Test
```typescript
import { describe, test, expect } from 'bun:test'

describe('E2E User Workflows', () => {
  test('complete user journey: add repo → index → query', async () => {
    // Step 1: Create user and API key
    const user = await createTestUser()
    const apiKey = await generateTestApiKey(user.id, 'free')

    // Step 2: Add repository
    const repoResponse = await fetch('http://localhost:3000/api/repositories', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fullName: 'test-org/test-repo',
        installationId: 12345,
      }),
    })

    expect(repoResponse.status).toBe(201)
    const { repository, jobId } = await repoResponse.json()

    // Step 3: Wait for indexing to complete
    await waitForJobCompletion(jobId, 60000)

    // Step 4: Query via MCP
    const mcpClient = await createMcpClient(apiKey)
    const searchResult = await mcpClient.callTool('search_code', {
      query: 'function',
      repository: 'test-org/test-repo',
    })

    expect(searchResult.content[0].text).toContain('function')
  })

  test('multi-user data isolation', async () => {
    const user1 = await createTestUser()
    const user2 = await createTestUser()

    const key1 = await generateTestApiKey(user1.id, 'free')
    const key2 = await generateTestApiKey(user2.id, 'free')

    // User 1 adds repo
    await addRepository(key1, 'user1/repo')

    // User 2 should not see User 1's repo
    const user2Repos = await listRepositories(key2)
    expect(user2Repos).not.toContainEqual(expect.objectContaining({ full_name: 'user1/repo' }))
  })
})
```

---

## Success Criteria

- [ ] 70%+ code coverage across all modules
- [ ] All unit tests pass in CI
- [ ] All integration tests pass in CI
- [ ] All E2E tests pass in CI
- [ ] Tests run in < 5 minutes total
- [ ] ADW-generated PRs pass tests 80%+ of the time

## Dependencies for Other Epics

This epic depends on:
- All other epics (tests validate implementations)

This epic enables:
- Epic 9 (CI/CD requires passing tests)
- Autonomous development (ADW confidence)
- Production deployment (quality gate)
