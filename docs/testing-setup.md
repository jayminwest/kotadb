# Testing Setup Guide

This document explains how to set up and run the KotaDB test suite.

## Overview

KotaDB uses SQLite for local testing with no external dependencies required.

## Prerequisites

- **Bun**: v1.1+ for running tests

## Quick Start

### Run Tests

```bash
cd app && bun test
```

Tests use an in-memory SQLite database by default, ensuring fast and isolated test execution.

### Run Specific Tests

```bash
# Run MCP tests only
cd app && bun test tests/mcp/

# Run a specific test file
cd app && bun test tests/mcp/lifecycle.test.ts
```

## Test Structure

```
app/tests/
  api/          # API endpoint tests
  indexer/      # Indexer tests
  mcp/          # MCP protocol tests
  helpers/      # Test utilities
```

## Writing Tests

### Example Test

```typescript
import { describe, expect, test, beforeAll, afterAll } from "bun:test";

describe("My Feature", () => {
  test("does something", async () => {
    const response = await fetch("http://localhost:3000/endpoint");
    expect(response.status).toBe(200);
  });
});
```

## MCP Testing

KotaDB provides comprehensive MCP (Model Context Protocol) integration testing.

### MCP Test Files

- `app/tests/mcp/lifecycle.test.ts` - Protocol handshake and tool discovery
- `app/tests/mcp/errors.test.ts` - JSON-RPC error handling
- `app/tests/mcp/tool-validation.test.ts` - Parameter validation for all tools
- `app/tests/mcp/tools.test.ts` - Tool execution tests
- `app/tests/mcp/integration.test.ts` - End-to-end workflows

### Running MCP Tests

```bash
# Run all MCP tests
cd app && bun test tests/mcp/

# Run specific MCP test file
cd app && bun test tests/mcp/lifecycle.test.ts
```

## Code Coverage

```bash
cd app && bun test --coverage
```

Bun generates coverage reports in multiple formats:
- Terminal output: Summary shown after test run
- HTML report: `app/coverage/index.html`

## Troubleshooting

### Tests Fail with "Connection Refused"

Ensure the test server is running or that tests are properly setting up their own server instance.

### Port Already in Use

```bash
# Check what's using the port
lsof -ti:3000

# Kill the process
kill $(lsof -ti:3000)
```

## CI/CD Integration

GitHub Actions CI runs tests automatically on push and pull requests. See `.github/workflows/app-ci.yml` for configuration.
