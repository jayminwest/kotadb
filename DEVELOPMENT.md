# Development Guide

This guide covers local development setup for KotaDB, with a focus on testing MCP server changes with Claude Code.

## Prerequisites

- [Bun](https://bun.sh) v1.1+ installed
- Claude Code (for MCP integration testing)
- Git

## Quick Setup

```bash
# Clone the repository
git clone https://github.com/jayminwest/kotadb.git
cd kotadb

# Install dependencies
cd app && bun install
```

## Local MCP Testing Configuration

When developing KotaDB, you need to test your local changes with Claude Code instead of the published npm package. This section explains how to configure Claude Code to use your local development code.

### Step 1: Locate Your MCP Configuration

Claude Code uses a `.mcp.json` file for MCP server configuration. This file is typically located at:

- **macOS/Linux:** `~/.claude/.mcp.json`
- **Project-specific:** `.mcp.json` in your project root

### Step 2: Add Local Development Server

Add the `kotadb-local-dev` configuration to your `.mcp.json`:

```json
{
  "mcpServers": {
    "kotadb-local-dev": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/kotadb/app/src/cli.ts", "--stdio"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

**Important:** Replace `/absolute/path/to/kotadb` with the actual absolute path to your local kotadb repository.

Example paths:
- macOS: `/Users/yourname/Projects/kotadb/app/src/cli.ts`
- Linux: `/home/yourname/projects/kotadb/app/src/cli.ts`

### Step 3: Restart Claude Code

After modifying `.mcp.json`, you must restart Claude Code for changes to take effect:

1. Close all Claude Code windows/tabs
2. Quit Claude Code completely (not just close windows)
3. Reopen Claude Code

On macOS, you can use:
```bash
# Force quit Claude Code
pkill -f "Claude"

# Or use the menu: Claude Code > Quit Claude Code (Cmd+Q)
```

## Switching Between npm Package and Local Code

### Using npm Package (Production)

For normal usage with the published package:

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

### Using Local Development Code

For testing local changes:

```json
{
  "mcpServers": {
    "kotadb-local-dev": {
      "command": "bun",
      "args": ["run", "/path/to/kotadb/app/src/cli.ts", "--stdio"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Running Both Simultaneously

You can have both configurations active, but only one will be used at a time. To switch:

1. Keep both entries in your `.mcp.json`
2. Comment out the one you do not want to use
3. Restart Claude Code

Example with both (npm package disabled):

```json
{
  "mcpServers": {
    "kotadb-local-dev": {
      "command": "bun",
      "args": ["run", "/path/to/kotadb/app/src/cli.ts", "--stdio"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

## Verifying Local Code is Running

### Method 1: Check Logs

When `LOG_LEVEL` is set to `debug`, the local server outputs detailed logs to stderr. These logs appear in Claude Code's MCP output panel.

### Method 2: Add a Debug Marker

Temporarily add a version marker to your local code:

```typescript
// In app/src/cli.ts, add to runStdioMode():
logger.info("LOCAL DEV VERSION - " + new Date().toISOString());
```

Then check Claude Code's logs for this marker.

### Method 3: Check Process List

```bash
# See running kotadb processes
ps aux | grep cli.ts

# You should see your local path in the output
# e.g., bun run /Users/you/Projects/kotadb/app/src/cli.ts --stdio
```

### Method 4: Use MCP Tool Response

The server version is included in MCP responses. Compare the version in responses with your local `app/package.json` version.

## Environment Variables

The following environment variables can be set in the `env` block of your MCP configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` | `info` |
| `KOTA_DB_PATH` | SQLite database file path | `~/.kotadb/kotadb.sqlite` |
| `KOTA_ALLOWED_ORIGINS` | Comma-separated CORS origins (HTTP mode) | localhost only |

Example with custom database path:

```json
{
  "mcpServers": {
    "kotadb-local-dev": {
      "command": "bun",
      "args": ["run", "/path/to/kotadb/app/src/cli.ts", "--stdio"],
      "env": {
        "LOG_LEVEL": "debug",
        "KOTA_DB_PATH": "/tmp/kotadb-dev.sqlite"
      }
    }
  }
}
```

## Development Workflow

### 1. Make Code Changes

Edit files in `app/src/`. Common areas:
- `app/src/mcp/` - MCP server implementation
- `app/src/api/` - HTTP routes and handlers
- `app/src/indexer/` - Code indexing logic
- `app/src/db/` - Database operations

### 2. Run Tests Locally

```bash
cd app && bun test
```

### 3. Type Check

```bash
cd app && bunx tsc --noEmit
```

### 4. Lint

```bash
cd app && bun run lint
```

### 5. Test with Claude Code

After making changes, simply make a new request to Claude Code. The MCP server process is restarted for each session, so your latest code changes will be picked up automatically.

If Claude Code was already running when you made changes:
1. Make your code changes
2. Start a new conversation in Claude Code
3. The new conversation will use your updated code

## Troubleshooting

### MCP Server Not Starting

1. **Check path:** Ensure the path to `cli.ts` is absolute and correct
2. **Check Bun:** Verify Bun is installed: `bun --version`
3. **Check syntax:** Validate your `.mcp.json` is valid JSON
4. **Check logs:** Look for errors in Claude Code's MCP output

### Changes Not Taking Effect

1. **Restart Claude Code:** Close completely and reopen
2. **Check file path:** Confirm you are editing the correct repository
3. **Check for errors:** Run the server manually to see errors:
   ```bash
   bun run /path/to/kotadb/app/src/cli.ts --stdio
   ```

### "Module not found" Errors

Ensure dependencies are installed:
```bash
cd /path/to/kotadb/app && bun install
```

### Database Issues

Use a separate database for development:
```json
{
  "env": {
    "KOTA_DB_PATH": "/tmp/kotadb-dev.sqlite"
  }
}
```

## Sample Configuration File

A sample MCP configuration is provided at `.mcp.sample.json` in the repository root. Copy and modify it for your setup:

```bash
# Copy sample to your Claude config directory
cp .mcp.sample.json ~/.claude/.mcp.json

# Edit with your local path
# Replace /path/to/kotadb with your actual path
```

## Additional Resources

- [README.md](./README.md) - Project overview and API documentation
- [MCP Protocol](https://modelcontextprotocol.io) - MCP specification
- [Bun Documentation](https://bun.sh/docs) - Bun runtime documentation
