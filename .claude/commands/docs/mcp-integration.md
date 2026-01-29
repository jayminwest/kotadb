# MCP Integration

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)

Model Context Protocol (MCP) integration architecture, tools, SDK behavior, and testing guide for KotaDB.

## MCP Server Architecture

Location: `app/src/mcp/`

### Server Factory (server.ts)

MCP server factory using official `@modelcontextprotocol/sdk` (v1.20+):

- Creates per-request Server instances for user isolation (stateless mode)
- Registers 8 tools: `search_code`, `index_repository`, `list_recent_files`, `search_dependencies`, `analyze_change_impact`, `validate_implementation_spec`, `kota_sync_export`, `kota_sync_import`
- Uses `StreamableHTTPServerTransport` with `enableJsonResponse: true` for simple JSON-RPC over HTTP
- No SSE streaming or session management (stateless design)

### Tool Execution (tools.ts)

Tool execution logic and parameter validation:

- Reused by SDK server handlers
- Type guards for parameter validation
- Returns JSON results wrapped in SDK content blocks

### Integration with Express

- SDK requires Node.js HTTP primitives (`IncomingMessage`, `ServerResponse`)
- Express provides Node-compatible interfaces running on Bun runtime
- Per-request server creation ensures user context isolation
- Rate limit headers set before SDK transport handles request

## Available MCP Tools

### search_code

Search indexed code files for a specific term.

**Parameters:**
- `term` (required): Search term to find in code files
- `limit` (optional): Maximum results (default: 20, max: 100)
- `repository` (optional): Filter to specific repository ID

**Returns:** Matching files with context snippets

### index_repository

Index a git repository by cloning/updating and extracting code files.

**Parameters:**
- `repository` (required): Repository identifier (e.g., 'owner/repo' or full git URL)
- `ref` (optional): Git ref/branch to checkout (default: main/master)
- `localPath` (optional): Use local directory instead of cloning

**Returns:** Indexing result with file count and status

### list_recent_files

List recently indexed files, ordered by indexing timestamp.

**Parameters:**
- `limit` (optional): Maximum files to return (default: 10)
- `repository` (optional): Filter by repository ID

**Returns:** Recently indexed files with metadata

### search_dependencies

Search dependency graph to find files that depend on (dependents) or are depended on by (dependencies) a target file.

**Parameters:**
- `file_path` (required): Relative file path within repository
- `repository` (optional): Repository ID to search within
- `direction` (optional): Search direction ('dependents', 'dependencies', 'both')
- `depth` (optional): Recursion depth (1-5, default: 1)
- `include_tests` (optional): Include test files (default: true)

**Returns:** Dependency graph with related files

**Features:**
- Supports three search directions: dependents (reverse lookup), dependencies (forward lookup), both
- Recursive traversal with configurable depth
- Detects circular dependencies during graph traversal
- Optional test file filtering

### analyze_change_impact

Analyze the impact of proposed code changes.

**Parameters:**
- `change_type` (required): Type of change ('feature', 'refactor', 'fix', 'chore')
- `description` (required): Brief description of the proposed change
- `files_to_modify` (optional): List of files to be modified
- `files_to_create` (optional): List of files to be created
- `files_to_delete` (optional): List of files to be deleted
- `breaking_changes` (optional): Whether this includes breaking changes
- `repository` (optional): Repository ID

**Returns:** Impact analysis with affected files, test recommendations, and risk assessment

### validate_implementation_spec

Validate an implementation specification file.

**Parameters:**
- `spec_path` (required): Path to the specification file
- `repository` (optional): Repository ID for context

**Returns:** Validation result with errors and warnings

### kota_sync_export

Export the SQLite database to JSONL format for backup or transfer.

**Parameters:**
- `output_path` (required): Path for the output JSONL file
- `tables` (optional): Array of table names to export (default: all tables)

**Returns:** Export status with row counts

### kota_sync_import

Import JSONL data into the SQLite database.

**Parameters:**
- `input_path` (required): Path to the JSONL file to import
- `mode` (optional): Import mode - 'merge' or 'replace' (default: 'merge')

**Returns:** Import status with row counts

## MCP SDK Behavior Notes

### Content Block Response Format

Tool results are wrapped in content blocks by the SDK:

- Server returns: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- Tests must extract results from `response.result.content[0].text` and parse JSON
- Use `extractToolResult()` helper from `app/tests/helpers/mcp.ts` for consistent extraction

### Error Code Mapping

SDK error handling differs from custom implementations:

- **`-32700` (Parse Error)**: Invalid JSON or malformed JSON-RPC structure (returns HTTP 400)
- **`-32601` (Method Not Found)**: Unknown JSON-RPC method (returns HTTP 200)
- **`-32603` (Internal Error)**: Tool execution errors, validation failures, type errors (returns HTTP 200)
- SDK uses `-32603` for all tool-level errors (missing params, invalid types, unknown tools)
- SDK does NOT use `-32602` (Invalid Params) for tool validation (only for JSON-RPC structure)

### HTTP Status Codes

- **HTTP 400**: Parse errors and invalid JSON-RPC structure
- **HTTP 200**: Method-level errors (method not found, tool errors)

### Header Validation

DNS rebinding protection disabled by default in `StreamableHTTPServerTransport`:

- SDK does NOT enforce `Origin` or `MCP-Protocol-Version` headers unless explicitly configured
- Production deployments can enable via `allowedOrigins` transport option if needed

## Test Writing Guidelines

When writing MCP tests:

- Always use `extractToolResult(data)` helper to parse tool responses
- Expect `-32603` for tool-level validation errors (not `-32602`)
- Expect HTTP 400 for parse errors and invalid JSON-RPC (not HTTP 200)
- Do not test header enforcement unless DNS rebinding protection is enabled

## MCP Regression Testing

Issue #68, 9 test files, 100+ test cases:

- **Comprehensive test coverage**: lifecycle, errors, authentication, tool validation, integration, concurrency
- **Test helpers**: `sendMcpRequest()`, `extractToolResult()`, `assertToolResult()`, `assertJsonRpcError()`
- **Test fixtures**: `app/tests/fixtures/mcp/sample-repository/` for integration testing
- **Claude Code integration guide**: `docs/guides/mcp-claude-code-integration.md`

See `docs/testing-setup.md` "MCP Testing" section for complete testing guide.

## Related Documentation

- [MCP Usage Guidance](./.claude/commands/docs/mcp-usage-guidance.md)
- [API Workflow](./.claude/commands/docs/workflow.md)
- [Testing Guide](./.claude/commands/testing/testing-guide.md)
- [Architecture](./.claude/commands/docs/architecture.md)
