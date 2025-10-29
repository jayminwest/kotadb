# /dogfood-prime

Prime the KotaDB development environment for local dogfooding and testing. This command automates the complete setup workflow: starting Supabase, launching the API server, generating test credentials, and validating core functionality.

## Use Cases

- **Initial Setup**: First-time environment configuration for new developers or agents
- **Testing Sessions**: Prepare environment for manual API testing or MCP integration validation
- **Post-Reset**: Restore working state after database resets or configuration changes
- **Debugging**: Reproduce production-like environment locally for issue investigation

## Prerequisites

Ensure the following tools are installed and running:

1. **Docker Desktop**: Required for Supabase Local containers
2. **Supabase CLI**: `brew install supabase/tap/supabase`
3. **Bun**: JavaScript/TypeScript runtime (`curl -fsSL https://bun.sh/install | bash`)

Verify installations:
```bash
docker --version && docker info > /dev/null 2>&1 && echo "✅ Docker running"
supabase --version && echo "✅ Supabase CLI installed"
bun --version && echo "✅ Bun installed"
```

## Execution Steps

### 1. Sync Git State

```bash
cd /Users/jayminwest/Projects/kota-db-ts
git fetch --all --prune
git pull --rebase
git rev-parse --abbrev-ref HEAD  # Confirm branch (should be 'develop' or feature branch)
git status --short              # Verify clean working tree
```

**Expected**: Clean working tree on `develop` branch. Uncommitted changes are acceptable but note them for later.

### 2. Stop Conflicting Services

Supabase Local uses specific ports that may conflict with other projects:

```bash
# Stop any running Supabase instances
supabase stop --project-id geo-sync-monorepo 2>/dev/null || true
cd app && supabase stop 2>/dev/null || true

# Kill any processes on port 3000 (API server)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
```

**Port Inventory**:
- `5434`: PostgreSQL (Supabase Local database)
- `54322`: PostgREST API (Supabase JS client - used by app)
- `54324`: Mailpit (email testing)
- `54327`: Analytics (logflare)
- `54328`: Studio (Supabase dashboard)
- `3000`: KotaDB API server

### 3. Start Supabase Local

```bash
cd app
supabase start
```

**Expected Output**:
```
Started supabase local development setup.

         API URL: http://127.0.0.1:54322
     GraphQL URL: http://127.0.0.1:54322/graphql/v1
  S3 Storage URL: http://127.0.0.1:54322/storage/v1/s3
    Database URL: postgresql://postgres:postgres@127.0.0.1:5434/postgres
      Studio URL: http://127.0.0.1:54328
 Publishable key: sb_publishable_...
      Secret key: sb_secret_...
```

**Troubleshooting**:
- **Port conflict**: Use `lsof -ti:54322` to find conflicting process, kill it, retry
- **Docker not running**: Start Docker Desktop, wait for daemon, retry
- **Database migration errors**: Run `supabase db reset` to restore clean state

### 4. Verify .env Configuration

Check that `app/.env` contains correct Supabase credentials:

```bash
cat app/.env | grep -E "^SUPABASE_"
```

**Expected**:
```
SUPABASE_URL=http://127.0.0.1:54322
SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SUPABASE_SERVICE_KEY=sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:5434/postgres
```

If keys mismatch output from `supabase start`, regenerate `.env`:

```bash
# Manual regeneration (copy keys from supabase start output)
cat > app/.env <<EOF
PORT=3000
KOTA_GIT_BASE_URL=https://github.com

SUPABASE_URL=http://127.0.0.1:54322
SUPABASE_ANON_KEY=<paste Publishable key>
SUPABASE_SERVICE_KEY=<paste Secret key>
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:5434/postgres
EOF
```

### 5. Start API Server

```bash
cd app
bun run src/index.ts > .dev-api.log 2>&1 &
API_PID=$!
echo "API server started (PID: $API_PID)"
```

**Wait for startup** (queue initialization takes ~2-3 seconds):

```bash
sleep 3
curl -s http://localhost:3000/health
```

**Expected**: `{"status":"ok","timestamp":"2025-10-29T02:00:13.446Z"}`

**Troubleshooting**:
- **Port in use**: Kill process via `lsof -ti:3000 | xargs kill -9`, retry
- **Database connection error**: Check Supabase is running, verify `SUPABASE_URL` in `.env`
- **Queue initialization failed**: Check `SUPABASE_DB_URL` points to port 5434 (PostgreSQL, not 54322)

**Monitor logs**:
```bash
tail -f app/.dev-api.log
```

Look for:
- `✅ Job queue started successfully`
- `✅ Index-repo workers registered successfully`
- `KotaDB server listening on http://localhost:3000`

### 6. Generate Test API Key

Create a test user and API key for authentication:

```bash
cd app
bun run scripts/generate-test-key.ts team
```

**Expected Output**:
```
Created test user: 0d8353d1-5075-4b71-a884-e6b304dccf3a

=== API Key Generated ===
API Key: kota_team_L6EMaq3ba9SX_e704ea4f5b688057c70b7bece8a31e6e6792
Key ID: L6EMaq3ba9SX
Tier: team
Rate Limit: 10000 requests/hour
Created At: 2025-10-29T02:00:41.932Z

Save this API key - it won't be shown again!
```

**Save the API key** for use in subsequent tests. Store in environment variable:

```bash
export KOTA_API_KEY="kota_team_L6EMaq3ba9SX_e704ea4f5b688057c70b7bece8a31e6e6792"
```

**Tier Options**:
- `free`: 100 requests/hour
- `solo`: 1,000 requests/hour
- `team`: 10,000 requests/hour (recommended for testing)

### 7. Validate Core Functionality

Run comprehensive tests to verify all components:

#### 7.1 REST API - Health Check

```bash
curl -s http://localhost:3000/health | jq .
```

**Expected**: `{"status":"ok","timestamp":"..."}`

#### 7.2 REST API - Search

```bash
curl -s "http://localhost:3000/search?term=Hello&limit=5" \
  -H "Authorization: Bearer $KOTA_API_KEY" | jq .
```

**Expected**: Search results with seed data (if database seeded) or empty results

#### 7.3 REST API - Recent Files

```bash
curl -s "http://localhost:3000/files/recent?limit=5" \
  -H "Authorization: Bearer $KOTA_API_KEY" | jq .
```

**Expected**: List of recently indexed files

#### 7.4 REST API - Rate Limiting

```bash
curl -si "http://localhost:3000/search?term=test" \
  -H "Authorization: Bearer $KOTA_API_KEY" | grep -E "^(HTTP|X-RateLimit)"
```

**Expected**:
```
HTTP/1.1 200 OK
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9999
X-RateLimit-Reset: 1761706800
```

#### 7.5 MCP Protocol - Initialize

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $KOTA_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test-client", "version": "1.0"}
    }
  }' | jq .
```

**Expected**:
```json
{
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {"tools": {}},
    "serverInfo": {"name": "kotadb", "version": "0.1.0"}
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

#### 7.6 MCP Protocol - List Tools

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $KOTA_API_KEY" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '.result.tools[].name'
```

**Expected**: List of 6 tool names:
- `search_code`
- `index_repository`
- `list_recent_files`
- `search_dependencies`
- `get_adw_state`
- `list_adw_workflows`

#### 7.7 MCP Protocol - Call Tool

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $KOTA_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"term": "Hello", "limit": 5}
    }
  }' | jq '.result.content[0].text | fromjson'
```

**Expected**: Search results in JSON format within MCP content block

### 8. Database State Verification

Check indexed files and job status:

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" -c \
  "SELECT path, language, indexed_at FROM indexed_files ORDER BY indexed_at DESC LIMIT 5;"
```

**Expected**: Test seed data (2 files: `src/index.ts`, `README.md`) or empty table

Check index jobs:

```bash
psql "postgresql://postgres:postgres@localhost:5434/postgres" -c \
  "SELECT id, status, error_message FROM index_jobs ORDER BY started_at DESC LIMIT 3;"
```

**Expected**: No jobs initially, or pending/failed jobs from previous sessions

### 9. Test Repository Indexing (Optional)

Index a small test repository to verify full workflow:

```bash
curl -s -X POST http://localhost:3000/index \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KOTA_API_KEY" \
  -d '{
    "repository": "kotadb/kota-db-ts",
    "localPath": "/Users/jayminwest/Projects/kota-db-ts"
  }' | jq .
```

**Expected**: `{"jobId":"<uuid>","status":"pending"}`

**Monitor indexing progress**:

```bash
# Wait 10 seconds for indexing to complete
sleep 10

# Check job status
psql "postgresql://postgres:postgres@localhost:5434/postgres" -c \
  "SELECT status, stats FROM index_jobs ORDER BY started_at DESC LIMIT 1;"
```

**Known Issue**: Large repositories (>100 files) may timeout with error:
```
Failed to save indexed files: canceling statement due to statement timeout
```

**Workaround**: Use smaller test repositories (<50 files) or wait for batch processing implementation.

## Success Criteria

After completing all steps, verify:

✅ **Supabase Local running** (check Studio at http://127.0.0.1:54328)
✅ **API server responding** (`curl http://localhost:3000/health` returns 200)
✅ **Queue workers initialized** (check logs: `.dev-api.log`)
✅ **Test API key generated** (stored in `$KOTA_API_KEY`)
✅ **REST endpoints functional** (search, recent files, rate limiting)
✅ **MCP protocol working** (initialize, tools/list, tools/call)
✅ **Database accessible** (`psql` commands succeed)

## Server Management

### Check Server Status

```bash
# Find API server PID
lsof -ti:3000

# Check process details
ps aux | grep "bun run src/index.ts" | grep -v grep

# Monitor logs
tail -f app/.dev-api.log
```

### Stop Services

```bash
# Stop API server
lsof -ti:3000 | xargs kill

# Stop Supabase
cd app && supabase stop

# Stop all (cleanup)
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
cd app && supabase stop
```

### Restart Services

```bash
# Quick restart (assumes Supabase already running)
lsof -ti:3000 | xargs kill
cd app && bun run src/index.ts > .dev-api.log 2>&1 &

# Full restart (Supabase + API)
cd app && ./scripts/dev-start.sh
```

## Troubleshooting

### Issue: "Port 3000 already in use"

**Cause**: Previous API server process still running
**Solution**:
```bash
lsof -ti:3000 | xargs kill -9
sleep 2
bun run src/index.ts > .dev-api.log 2>&1 &
```

### Issue: "Failed to connect to Supabase"

**Cause**: Supabase not running or wrong credentials in `.env`
**Solution**:
```bash
cd app && supabase start
# Copy Publishable key and Secret key to .env
# Restart API server
```

### Issue: "Indexing workflow failed: {}"

**Cause**: Error logging issue (fixed) or actual indexing error
**Solution**:
```bash
# Check logs for actual error message
tail -50 app/.dev-api.log | grep "Indexing workflow failed"

# Check database for error details
psql "postgresql://postgres:postgres@localhost:5434/postgres" -c \
  "SELECT error_message FROM index_jobs WHERE status='failed' ORDER BY started_at DESC LIMIT 1;"
```

### Issue: "Statement timeout" during indexing

**Cause**: Repository too large for default PostgreSQL timeout
**Solution**:
- Use smaller test repositories (<50 files)
- Wait for batch processing implementation (see issue in `.dogfooding-session.md`)
- Increase statement timeout in `app/src/db/client.ts` (temporary workaround)

### Issue: "API key invalid" errors

**Cause**: API key expired, revoked, or incorrect format
**Solution**:
```bash
# Generate new test key
cd app && bun run scripts/generate-test-key.ts team
export KOTA_API_KEY="<new key from output>"

# Verify key works
curl -s "http://localhost:3000/search?term=test" \
  -H "Authorization: Bearer $KOTA_API_KEY"
```

## Output Artifacts

After successful priming, you'll have:

1. **Running services**:
   - Supabase Local on ports 5434 (PostgreSQL), 54322 (API), 54328 (Studio)
   - KotaDB API on port 3000

2. **Test credentials**:
   - Test user: `test@kotadb.dev`
   - API key: `kota_team_<keyId>_<secret>` (stored in `$KOTA_API_KEY`)

3. **Log files**:
   - `app/.dev-api.log` - API server logs
   - Supabase logs in Docker containers (`docker logs <container>`)

4. **Database state**:
   - Test seed data (2 files) or empty tables
   - Generated API key in `api_keys` table
   - Test user in `auth.users` table

5. **Session documentation** (optional):
   - `app/.dogfooding-session.md` - Detailed test results and commands

## Next Steps

After successful priming:

1. **Test MCP integration with Claude Code**: Add KotaDB MCP server to Claude Code config
2. **Index real repositories**: Test with small codebases (<50 files initially)
3. **Test dependency graph**: Use `search_dependencies` tool after successful indexing
4. **Test ADW integration**: Validate `get_adw_state` and `list_adw_workflows` tools
5. **Test web app**: Start Next.js frontend with `cd ../web && bun run dev`

## Related Documentation

- **CLAUDE.md** - Complete project instructions and architecture overview
- **README.md** - Quick start guide and API examples
- **docs/testing-setup.md** - Antimocking philosophy and test environment setup
- **automation/adws/README.md** - ADW automation layer documentation
- **.claude/commands/workflows/prime.md** - Repository context building workflow
- **app/.dogfooding-session.md** - Example session output with test results

## Output Schema

This command produces a structured summary for automation:

```json
{
  "services": {
    "supabase": {"status": "running", "api_url": "http://127.0.0.1:54322"},
    "api_server": {"status": "running", "pid": 65618, "port": 3000}
  },
  "credentials": {
    "api_key": "kota_team_<keyId>_<secret>",
    "tier": "team",
    "rate_limit": 10000
  },
  "validation": {
    "rest_api": true,
    "mcp_protocol": true,
    "rate_limiting": true,
    "database": true
  }
}
```
