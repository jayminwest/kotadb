# Stdio Transport Implementation Specification

**Issue:** #49 - Improve MCP server port handling for reliable auto-boot  
**Type:** HTTP Endpoint & MCP Tool Enhancement  
**Created:** 2026-01-29  
**Status:** Implementation Ready

## Purpose and Objectives

Add stdio (standard input/output) transport support to KotaDB's MCP server to enable reliable Claude Code integration without port conflicts. This eliminates the EADDRINUSE error when port 3000 is occupied and provides the recommended transport method for local MCP server integration.

**Key Benefits:**
- No port conflicts (stdio uses stdin/stdout, not TCP ports)
- Simpler configuration in .mcp.json (no URL needed)
- Better alignment with MCP best practices for local tools
- Automatic process lifecycle management by Claude Code
- Maintains backward compatibility with existing HTTP transport

## Decision: stdio vs HTTP Transport

### When to Use Stdio
- **Local development integration** (bunx kotadb, npx kotadb)
- **Claude Code .mcp.json configuration**
- **Single-user CLI workflows**

### When to Use HTTP
- **Multi-client scenarios** (web dashboard + CLI)
- **Remote access requirements**
- **Existing HTTP-based integrations**

Both transports will be supported. The CLI flag `--stdio` determines which mode to use.

## Architecture Overview

```
CLI Entry Point (cli.ts)
├── Parse --stdio flag
├── IF --stdio:
│   ├── Create StdioServerTransport
│   ├── Redirect ALL logs to stderr
│   ├── Connect MCP server to stdio
│   └── Keep process alive (server handles lifecycle)
└── ELSE (default HTTP mode):
    ├── Create Express app
    ├── Create StreamableHTTPServerTransport
    └── Listen on PORT
```

## Request Schema

**CLI Arguments:**
```bash
kotadb --stdio              # Run in stdio mode (no port needed)
kotadb                      # Run in HTTP mode (default port 3000)
kotadb --port 4000          # Run in HTTP mode (custom port)
kotadb --help               # Show help
kotadb --version            # Show version
```

**No HTTP endpoint changes** - this is a transport-level change.

## Response Schema

**Stdio Mode:**
- JSON-RPC messages via stdout (handled by SDK)
- Logs via stderr (CRITICAL: stdout is reserved for protocol)
- Process termination handled by transport.close()

**HTTP Mode (unchanged):**
- JSON responses on /mcp endpoint
- Logs via stdout (info/debug/warn) and stderr (error)
- Express server lifecycle

## Implementation Details

### 1. CLI Flag Handling (`app/src/cli.ts`)

**Current structure:**
```typescript
interface CliOptions {
  port: number;
  help: boolean;
  version: boolean;
}
```

**Updated structure:**
```typescript
interface CliOptions {
  port: number;
  help: boolean;
  version: boolean;
  stdio: boolean;  // NEW: stdio transport flag
}
```

**Parsing logic:**
```typescript
function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    port: Number(process.env.PORT ?? 3000),
    help: false,
    version: false,
    stdio: false,  // NEW
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--stdio") {  // NEW
      options.stdio = true;
    } else if (arg === "--port") {
      // ... existing port handling
    }
  }

  return options;
}
```

### 2. Stdio Mode Execution (`app/src/cli.ts`)

**New async function for stdio mode:**
```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, type McpServerContext } from "@mcp/server";

async function runStdioMode(): Promise<void> {
  // Redirect logger to stderr in stdio mode
  // This is CRITICAL - stdout is reserved for JSON-RPC protocol
  const logger = createLogger({ 
    module: "mcp-stdio",
    forceStderr: true  // NEW logger option (implementation below)
  });

  logger.info("KotaDB MCP server starting in stdio mode", {
    version: getVersion(),
  });

  // Create MCP server with local-only context
  const context: McpServerContext = {
    userId: "local",  // Local-only mode uses fixed user ID
  };
  const server = createMcpServer(context);

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  logger.info("KotaDB MCP server connected via stdio");

  // Server lifecycle is managed by the transport
  // Process will stay alive until stdin closes (when Claude Code terminates it)
}
```

**Updated main() function:**
```typescript
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Handle --version
  if (options.version) {
    printVersion();
    process.exit(0);
  }

  // Handle --help
  if (options.help) {
    printHelp();  // Updated to document --stdio flag
    process.exit(0);
  }

  // NEW: Handle stdio mode
  if (options.stdio) {
    await runStdioMode();
    return;  // runStdioMode() keeps process alive
  }

  // Existing HTTP mode logic
  const logger = createLogger();
  const envConfig = getEnvironmentConfig();
  
  // ... rest of HTTP server startup
}
```

### 3. Logger Modifications (`app/src/logging/logger.ts`)

**Update LogContext interface:**
```typescript
export interface LogContext {
  request_id?: string;
  user_id?: string;
  key_id?: string;
  job_id?: string;
  forceStderr?: boolean;  // NEW: force all logs to stderr
  [key: string]: unknown;
}
```

**Update createLogger() function:**
```typescript
export function createLogger(baseContext?: LogContext): Logger {
  const context = baseContext ? maskSensitiveData(baseContext) : {};
  const forceStderr = context.forceStderr === true;

  return {
    debug(message: string, additionalContext?: LogContext): void {
      if (!shouldLog("debug")) return;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "debug",
        message,
        context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
      };
      writeLog(entry, forceStderr);  // Pass forceStderr flag
    },

    info(message: string, additionalContext?: LogContext): void {
      if (!shouldLog("info")) return;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        message,
        context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
      };
      writeLog(entry, forceStderr);  // Pass forceStderr flag
    },

    warn(message: string, additionalContext?: LogContext): void {
      if (!shouldLog("warn")) return;

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "warn",
        message,
        context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
      };
      writeLog(entry, forceStderr);  // Pass forceStderr flag
    },

    error(message: string, errorOrContext?: Error | LogContext, additionalContext?: LogContext): void {
      if (!shouldLog("error")) return;

      // ... existing error handling logic ...
      writeLog(entry, forceStderr);  // Pass forceStderr flag
    },

    child(childContext: LogContext): Logger {
      return createLogger({ ...context, ...childContext });
    },
  };
}
```

**Update writeLog() function:**
```typescript
function writeLog(entry: LogEntry, forceStderr = false): void {
  const json = JSON.stringify(entry);
  const output = `${json}\n`;

  if (forceStderr || entry.level === "error") {
    process.stderr.write(output);
  } else {
    process.stdout.write(output);
  }
}
```

### 4. MCP Server Updates (`app/src/mcp/server.ts`)

**No changes required.** The `createMcpServer()` function is transport-agnostic - it returns a `Server` instance that can connect to any transport (stdio or HTTP).

**Validation:**
- `createMcpServer()` takes `McpServerContext` (no transport dependency)
- Tool handlers are pure functions (no I/O dependencies)
- `server.connect(transport)` works with both `StdioServerTransport` and `StreamableHTTPServerTransport`

### 5. Help Text Updates (`app/src/cli.ts`)

**Updated printHelp() function:**
```typescript
function printHelp(): void {
  const version = getVersion();
  process.stdout.write(`
kotadb v${version} - Local code intelligence for CLI agents

USAGE:
  kotadb [OPTIONS]

OPTIONS:
  --stdio           Use stdio transport (for Claude Code integration)
  --port <number>   Port to listen on (default: 3000, env: PORT)
  --version, -v     Show version number
  --help, -h        Show this help message

ENVIRONMENT VARIABLES:
  PORT              Server port (default: 3000, HTTP mode only)
  KOTA_DB_PATH      SQLite database path (default: ~/.kotadb/kotadb.sqlite)
  KOTA_ALLOWED_ORIGINS  Comma-separated allowed CORS origins
  LOG_LEVEL         Logging level: debug, info, warn, error (default: info)

EXAMPLES:
  kotadb --stdio            Start in stdio mode (for Claude Code)
  kotadb                    Start HTTP server on port 3000
  kotadb --port 4000        Start HTTP server on port 4000
  PORT=8080 kotadb          Start HTTP server on port 8080

MCP CONFIGURATION (stdio mode - RECOMMENDED):
  Add to your .mcp.json or Claude Code settings:

  {
    "mcpServers": {
      "kotadb": {
        "command": "bunx",
        "args": ["kotadb@next", "--stdio"]
      }
    }
  }

MCP CONFIGURATION (HTTP mode - legacy):
  Add to your .mcp.json or Claude Code settings:

  {
    "mcpServers": {
      "kotadb": {
        "type": "http",
        "url": "http://localhost:3000/mcp",
        "headers": {
          "Accept": "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18"
        }
      }
    }
  }

DOCUMENTATION:
  https://github.com/jayminwest/kotadb

`);
}
```

## Error Cases and Status Codes

### Stdio Mode Error Handling

| Error Condition | Behavior | User Experience |
|----------------|----------|-----------------|
| Stdin read error | Log error to stderr, throw exception | Claude Code shows "MCP server failed" |
| Invalid JSON-RPC | SDK handles via transport.onerror | Error message in Claude Code |
| Tool execution error | Logged to stderr, returned as JSON-RPC error | Tool call fails with error message |
| Database error | Logged to stderr, returned as JSON-RPC error | Tool call fails with error message |

### HTTP Mode Error Handling (unchanged)

| Error Condition | Status Code | Response |
|----------------|-------------|----------|
| Port in use | Process exit 1 | "Failed to start server. Is port 3000 in use?" |
| Invalid JSON | 400 | `{ "jsonrpc": "2.0", "error": { "code": -32700, "message": "Parse error" }, "id": null }` |
| Tool not found | 200 (JSON-RPC) | `{ "jsonrpc": "2.0", "error": { "code": -32601, "message": "Unknown tool: ..." }, "id": ... }` |

## OpenAPI Documentation

**No OpenAPI changes** - stdio is a transport-level concern, not an API endpoint.

The OpenAPI spec documents the HTTP endpoints only. Stdio mode provides the same MCP tools via a different transport.

## Testing Approach

### Unit Tests

**File:** `app/src/cli.test.ts` (new)

```typescript
import { describe, test, expect } from "bun:test";

describe("CLI argument parsing", () => {
  test("parseArgs detects --stdio flag", () => {
    const options = parseArgs(["--stdio"]);
    expect(options.stdio).toBe(true);
  });

  test("parseArgs combines --stdio with --port", () => {
    // Note: --port is ignored in stdio mode, but parsing should succeed
    const options = parseArgs(["--stdio", "--port", "4000"]);
    expect(options.stdio).toBe(true);
    expect(options.port).toBe(4000);
  });

  test("parseArgs defaults to HTTP mode", () => {
    const options = parseArgs([]);
    expect(options.stdio).toBe(false);
  });
});
```

### Integration Tests

**File:** `app/tests/integration/stdio-transport.integration.test.ts` (new)

```typescript
import { describe, test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { join } from "node:path";

describe("Stdio transport integration", () => {
  test("accepts initialize request via stdin", async () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli.ts");
    const child = spawn("bun", [cliPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const initRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0" },
      },
    };

    child.stdin.write(JSON.stringify(initRequest) + "\n");
    child.stdin.end();

    const stdout = await new Promise<string>((resolve) => {
      let data = "";
      child.stdout.on("data", (chunk) => {
        data += chunk.toString();
      });
      child.stdout.on("end", () => resolve(data));
    });

    const response = JSON.parse(stdout);
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    expect(response.result.protocolVersion).toBe("2025-06-18");
  });

  test("logs only to stderr in stdio mode", async () => {
    const cliPath = join(__dirname, "..", "..", "src", "cli.ts");
    const child = spawn("bun", [cliPath, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdin.end();  // Close stdin immediately

    const [stdout, stderr] = await Promise.all([
      new Promise<string>((resolve) => {
        let data = "";
        child.stdout.on("data", (chunk) => {
          data += chunk.toString();
        });
        child.stdout.on("end", () => resolve(data));
      }),
      new Promise<string>((resolve) => {
        let data = "";
        child.stderr.on("data", (chunk) => {
          data += chunk.toString();
        });
        child.stderr.on("end", () => resolve(data));
      }),
    ]);

    // Stdout should only contain JSON-RPC messages (or be empty if no requests)
    // Stderr should contain startup logs
    expect(stderr).toContain("KotaDB MCP server starting in stdio mode");
  });
});
```

### Manual Testing

**Test stdio mode with bunx:**
```bash
# Start in stdio mode
bunx kotadb@next --stdio

# Send initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | bunx kotadb@next --stdio
```

**Test HTTP mode (unchanged):**
```bash
bunx kotadb@next --port 4000

curl http://localhost:4000/health
```

**Test with Claude Code:**
1. Update `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "kotadb": {
         "command": "bunx",
         "args": ["kotadb@next", "--stdio"]
       }
     }
   }
   ```
2. Restart Claude Code
3. Verify kotadb tools appear in `/mcp` output
4. Test `search_code` tool

## Documentation Updates

### Files to Update

1. **README.md** - Primary documentation
2. **.mcp.json** - Example configuration (project root)
3. **app/package.json** - Verify bin entry supports --stdio

### README.md Changes

**Section: "MCP Configuration"**

Replace existing HTTP-only examples with stdio-first approach:

```markdown
## MCP Configuration

### Stdio Transport (Recommended)

For Claude Code integration, use stdio transport to avoid port conflicts:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb@next", "--stdio"]
    }
  }
}
```

This is the recommended approach for local development. The `--stdio` flag tells kotadb to use standard input/output instead of HTTP, eliminating port conflicts.

### HTTP Transport (Legacy)

For multi-client scenarios or remote access:

```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18"
      }
    }
  }
}
```

You can customize the port with the `PORT` environment variable or `--port` flag:

```bash
kotadb --port 4000
```

### Why Stdio?

- **No port conflicts**: Uses stdin/stdout instead of TCP ports
- **Simpler setup**: No URL configuration needed
- **Better isolation**: Claude Code manages process lifecycle
- **Recommended by MCP**: Official pattern for local tools
```

### .mcp.json Update

```json
{
  "mcpServers": {
    "kotadb-bunx": {
      "command": "bunx",
      "args": ["kotadb@next", "--stdio"]
    }
  }
}
```

Remove the `PORT` environment variable (not needed in stdio mode).

## Acceptance Criteria from Issue #49

- [x] **Implementation that doesn't fail on port 3000 conflict**
  - Stdio mode uses stdin/stdout (no TCP port)
  - Flag-based mode selection (--stdio)
  
- [x] **Clear error messages when startup fails**
  - Stdio errors logged to stderr with context
  - HTTP mode errors unchanged (existing behavior)
  
- [x] **Updated documentation for MCP configuration**
  - README.md updated with stdio-first examples
  - .mcp.json updated with --stdio flag
  - Help text documents --stdio flag

## Implementation Checklist

### Code Changes
- [ ] Add `stdio: boolean` to `CliOptions` interface in `cli.ts`
- [ ] Update `parseArgs()` to handle `--stdio` flag in `cli.ts`
- [ ] Implement `runStdioMode()` function in `cli.ts`
- [ ] Update `main()` to route to stdio or HTTP mode in `cli.ts`
- [ ] Add `forceStderr?: boolean` to `LogContext` in `logger.ts`
- [ ] Update `createLogger()` to accept and pass `forceStderr` flag in `logger.ts`
- [ ] Update `writeLog()` to accept `forceStderr` parameter in `logger.ts`
- [ ] Update all logger method calls to pass `forceStderr` in `logger.ts`
- [ ] Update `printHelp()` with --stdio documentation in `cli.ts`

### Testing
- [ ] Create `app/src/cli.test.ts` with argument parsing tests
- [ ] Create `app/tests/integration/stdio-transport.integration.test.ts`
- [ ] Manual test: stdio mode with bunx
- [ ] Manual test: HTTP mode (regression)
- [ ] Manual test: Claude Code integration with --stdio

### Documentation
- [ ] Update README.md with stdio-first MCP configuration
- [ ] Update .mcp.json example with --stdio flag
- [ ] Verify app/package.json bin entry works with --stdio

### Validation
- [ ] `bun test` passes (all existing + new tests)
- [ ] `bunx tsc --noEmit` passes (type checking)
- [ ] `bun run lint` passes
- [ ] `bunx kotadb@next --stdio` starts successfully
- [ ] `bunx kotadb@next --help` shows --stdio flag
- [ ] Claude Code can connect using stdio transport

## Migration Path

### For Existing Users (HTTP mode)

**No breaking changes.** HTTP mode remains the default:

```bash
bunx kotadb            # Still starts HTTP server on port 3000
bunx kotadb --port 4000  # Still works
```

Existing `.mcp.json` configurations with HTTP transport continue to work.

### For New Users (stdio mode)

Recommended configuration in documentation:

```json
{
  "mcpServers": {
    "kotadb": {
      "command": "bunx",
      "args": ["kotadb@next", "--stdio"]
    }
  }
}
```

## Dependencies

**No new dependencies required.** The `@modelcontextprotocol/sdk` package (already installed at v1.25.0) includes `StdioServerTransport`.

**Import path:**
```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

## Security Considerations

### Stdio Mode
- **Input validation:** SDK handles JSON-RPC validation
- **Process isolation:** Each client gets its own process
- **No network exposure:** Stdio is process-local (no TCP)
- **Same authentication model:** Local-only mode (userId: "local")

### HTTP Mode (unchanged)
- **CORS:** Allows all origins (local development)
- **No authentication:** Local-only mode
- **Rate limiting headers:** Included in responses

## Performance Considerations

### Stdio Mode
- **Lower latency:** No HTTP overhead (direct IPC)
- **Lower memory:** No Express stack loaded
- **Process per client:** Claude Code manages lifecycle
- **No connection pooling:** One process per client session

### HTTP Mode
- **Shared process:** All clients use same server
- **HTTP overhead:** JSON over TCP
- **Connection management:** Express handles keep-alive

**Recommendation:** Stdio for single-user CLI workflows, HTTP for multi-client scenarios.

## Example Requests/Responses

### Stdio Mode

**Initialize Request (stdin):**
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"1.0"}}}
```

**Initialize Response (stdout):**
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"kotadb","version":"2.0.0"}}}
```

**Tools List Request (stdin):**
```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

**Tools List Response (stdout):**
```json
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search_code","description":"Search indexed code files using SQLite FTS5...","inputSchema":{...}},...]}}
```

**Logs (stderr):**
```
{"timestamp":"2026-01-29T12:00:00.000Z","level":"info","message":"KotaDB MCP server starting in stdio mode","context":{"version":"2.0.1"}}
{"timestamp":"2026-01-29T12:00:00.100Z","level":"info","message":"KotaDB MCP server connected via stdio"}
```

### HTTP Mode (unchanged)

Same JSON-RPC over HTTP POST to `/mcp` endpoint. See existing documentation.

## Next Steps After Implementation

1. **Monitor adoption metrics** - Track stdio vs HTTP usage
2. **Gather user feedback** - Identify any edge cases
3. **Consider deprecating HTTP mode** - If stdio adoption is high
4. **Update blog posts** - Announce improved Claude Code integration
5. **Create video tutorial** - Show .mcp.json configuration

## References

- Issue #49: https://github.com/jayminwest/kotadb/issues/49
- MCP Specification: https://modelcontextprotocol.io
- MCP SDK Documentation: https://github.com/modelcontextprotocol/sdk
- Claude Code MCP Docs: https://code.claude.com/docs/en/mcp.md
- Existing HTTP transport: `app/src/api/routes.ts` (POST /mcp)
- Existing MCP server: `app/src/mcp/server.ts`
