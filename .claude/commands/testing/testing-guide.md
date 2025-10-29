# Testing Guide

Testing philosophy, antimocking principles, migration sync, and test commands for KotaDB.

## Testing Philosophy

**KotaDB follows an antimocking philosophy.** All tests use real Supabase Local database connections instead of mocks for production parity.

### Why Antimocking?

- **Production parity**: Tests run against real PostgreSQL with RLS enforcement
- **Catch integration bugs**: Real database interactions surface issues mocks hide
- **Confidence**: Tests passing means code works with real services
- **No mock drift**: Tests never drift from actual database behavior

See `.claude/commands/docs/anti-mock.md` for complete antimocking guidelines.

## Migration Sync Requirement

Database migrations exist in **two locations**:
1. `app/src/db/migrations/` - Source of truth
2. `app/supabase/migrations/` - Copy for Supabase CLI

**IMPORTANT**: Both directories must stay synchronized.

### Validation Command

```bash
cd app && bun run test:validate-migrations
```

This command checks for drift between directories. CI validates sync in setup job.

### When to Update

- After adding migration to `app/src/db/migrations/`
- After modifying existing migration
- Before committing schema changes

### Migration Naming Convention

All migration files must use timestamped format: `YYYYMMDDHHMMSS_description.sql`

Example: `20241024143000_add_rate_limiting.sql`

Generate timestamp: `date -u +%Y%m%d%H%M%S`

## Test Commands

```bash
cd app && bun test                          # Run test suite
DEBUG=1 cd app && bun test                  # Verbose test output (auth logs, setup details)
cd app && bunx tsc --noEmit                # Type-check without emitting files
cd app && bun run test:validate-migrations # Validate migration sync
cd app && bun run test:validate-env        # Detect hardcoded environment URLs in tests
```

### Test Database Management

```bash
./scripts/setup-test-db.sh       # Start Supabase Local test database
./scripts/reset-test-db.sh       # Reset test database to clean state
```

## Test Environment

### Environment Variable Loading

Tests automatically load `.env.test` via preload script:

- `app/tests/setup.ts`: Preload script that parses `.env.test` and loads into `process.env`
- `app/package.json`: Test script uses `bun test --preload ./tests/setup.ts`
- `app/tests/helpers/db.ts`: Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `process.env`

**DO NOT** hardcode environment variables in test files.

### Validation

Run `cd app && bun run test:validate-env` to detect hardcoded environment variable assignments in tests.

Violations look like:
```typescript
// INCORRECT - will fail validation
process.env.SUPABASE_URL = "http://localhost:54322"
```

## Stripe CLI Setup

**Stripe webhook tests require Stripe CLI** for real webhook testing following KotaDB's antimocking philosophy.

### Installation

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux (Ubuntu/Debian):**
```bash
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update
sudo apt install stripe
```

### Required Environment Variables

Configure these in your local environment or CI secrets:

```bash
# Required: Stripe test mode secret key
export STRIPE_SECRET_KEY=sk_test_...

# Required: Test price IDs from Stripe dashboard
export STRIPE_SOLO_PRICE_ID=price_...
export STRIPE_TEAM_PRICE_ID=price_...

# Auto-generated: Webhook secret (set by test setup script)
# STRIPE_WEBHOOK_SECRET=whsec_...  # Do not set manually
```

### How It Works

1. **Test Setup** (`bun test:setup`):
   - Starts Stripe CLI listener in background
   - Forwards webhooks to `http://localhost:<port>/webhooks/stripe`
   - Extracts webhook secret and adds to `.env.test`

2. **Test Execution**:
   - Tests create real Stripe resources (customers, subscriptions)
   - Stripe API operations trigger real webhooks
   - Webhooks delivered via Stripe CLI to local server
   - Tests verify async webhook handler updates database

3. **Test Teardown** (`bun test:teardown`):
   - Stops Stripe CLI listener process
   - Cleans up Stripe resources and local database

### Graceful Degradation

Stripe webhook tests skip gracefully when credentials not configured:
```bash
[SKIP] Stripe webhook tests require STRIPE_SECRET_KEY environment variable
```

This allows CI and local development to work without Stripe credentials (tests simply skip).

### Troubleshooting

**Stripe CLI not found:**
```bash
# Verify installation
stripe --version

# Check PATH
which stripe
```

**Webhook secret not auto-populated:**
```bash
# Check Stripe CLI is running
ps aux | grep stripe

# Check listener log
cat .stripe-listen.log

# Manually verify listener works
stripe listen --print-secret
```

**Tests timeout waiting for webhooks:**
- Ensure Stripe CLI listener is running (check `.stripe-test.pid`)
- Verify test server port matches Stripe CLI forward URL
- Check `.stripe-listen.log` for delivery errors

## MCP Testing

MCP integration has comprehensive test coverage (issue #68, 9 test files, 100+ test cases):

- **Test helpers**: `sendMcpRequest()`, `extractToolResult()`, `assertToolResult()`, `assertJsonRpcError()`
- **Test fixtures**: `app/tests/fixtures/mcp/sample-repository/` for integration testing
- **Claude Code integration guide**: `docs/guides/mcp-claude-code-integration.md`

See `docs/testing-setup.md` "MCP Testing" section for complete testing guide.

### MCP SDK Behavior Notes

- **Content Block Response Format**: Tool results wrapped in SDK content blocks
  - Use `extractToolResult()` helper from `app/tests/helpers/mcp.ts`
- **Error Code Mapping**: SDK error handling differs from custom implementations
  - `-32700` (Parse Error): Invalid JSON (returns HTTP 400)
  - `-32601` (Method Not Found): Unknown method (returns HTTP 200)
  - `-32603` (Internal Error): Tool errors, validation failures (returns HTTP 200)
- **Test Writing Guidelines**:
  - Always use `extractToolResult(data)` helper to parse tool responses
  - Expect `-32603` for tool-level validation errors (not `-32602`)
  - Expect HTTP 400 for parse errors (not HTTP 200)

## Queue Testing

All queue tests use real Supabase Local PostgreSQL (no mocks):

- Tests validate `pgboss` schema creation via `psql` queries
- Integration tests verify queue persistence across restart cycles

## Test Coverage

Current test suite: **133 tests**

- Unit tests: Authentication, rate limiting, validation
- Integration tests: MCP tools, API endpoints, database operations
- Regression tests: MCP SDK behavior, queue lifecycle

## Related Documentation

- [Anti-Mock Guidelines](./.claude/commands/docs/anti-mock.md)
- [Database Schema](./.claude/commands/docs/database.md)
- [MCP Integration](./.claude/commands/docs/mcp-integration.md)
- [Development Commands](./.claude/commands/app/dev-commands.md)
- [Logging Standards](./.claude/commands/testing/logging-standards.md)
