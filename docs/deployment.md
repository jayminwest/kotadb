# KotaDB Deployment Guide

This guide covers deploying KotaDB to Fly.io for staging and production environments.

## Prerequisites

### Required Tools

- [Fly.io CLI](https://fly.io/docs/hands-on/install-flyctl/) (`flyctl`) installed and authenticated
- [Docker Desktop](https://www.docker.com/products/docker-desktop) for local build verification
- [Bun](https://bun.sh) v1.1+ for local development and testing

### Supabase Project Setup

Before deploying, you must have a Supabase project configured for your target environment.

**Create Supabase Project:**
1. Visit https://supabase.com/dashboard
2. Create a new project (use environment-specific naming: `kota-db-staging`, `kota-db-production`)
3. Note your project credentials from Settings > API:
   - `SUPABASE_URL` - Your project URL (e.g., `https://xxxxx.supabase.co`)
   - `SUPABASE_SERVICE_KEY` - Service role key (keep secret, never commit)
   - `SUPABASE_ANON_KEY` - Anonymous/public key

**Run Database Migrations:**

From your local development environment:

```bash
# Set environment variables for your target Supabase project
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"

# Apply migrations from app/src/db/migrations/
cd app
bun run scripts/apply-migrations.ts
```

Alternatively, use the Supabase CLI to apply migrations from `app/supabase/migrations/`:

```bash
# Link to your remote project
cd app
supabase link --project-ref your-project-id

# Push migrations
supabase db push
```

**Verify Migration Status:**

```bash
# Check that all tables exist
supabase db diff
```

Expected tables: `api_keys`, `organizations`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`, `rate_limits`, and related RLS policies.

## Staging Deployment

### 1. Authenticate with Fly.io

```bash
flyctl auth login
```

This opens a browser for authentication. Complete the OAuth flow and return to your terminal.

**Verify authentication:**
```bash
flyctl auth whoami
```

### 2. Create Fly.io App

The staging app is pre-configured in `app/fly.toml` with the name `kota-db-staging`.

**Create the app:**
```bash
cd app
flyctl apps create kota-db-staging
```

**Verify app creation:**
```bash
flyctl apps list | grep kota-db-staging
```

### 3. Configure Secrets

Fly.io secrets are environment variables that are encrypted and injected at runtime.

**Set Supabase credentials:**
```bash
cd app
flyctl secrets set \
  SUPABASE_URL="https://your-staging-project.supabase.co" \
  SUPABASE_SERVICE_KEY="your-staging-service-role-key" \
  SUPABASE_ANON_KEY="your-staging-anon-key" \
  --app kota-db-staging
```

**Optional configuration:**
```bash
# Set custom git base URL (defaults to https://github.com)
flyctl secrets set KOTA_GIT_BASE_URL="https://your-git-server.com" --app kota-db-staging

# Set allowed MCP origins (comma-separated, defaults to localhost)
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://app.example.com,https://staging.example.com" --app kota-db-staging
```

**Verify secrets:**
```bash
flyctl secrets list --app kota-db-staging
```

Note: Secret values are encrypted and not displayed. You'll only see secret names and timestamps.

### 4. Deploy to Fly.io

**Deploy the application:**
```bash
cd app
flyctl deploy --app kota-db-staging
```

This builds the Docker image locally and pushes it to Fly.io. The deployment process:
1. Builds the image from `app/Dockerfile` using Bun runtime
2. Pushes the image to Fly.io's registry
3. Creates/updates machines in the `iad` region (configurable in `fly.toml`)
4. Performs health checks on the `/health` endpoint
5. Routes traffic to healthy machines

**Monitor deployment:**
```bash
flyctl logs --app kota-db-staging
```

**Check deployment status:**
```bash
flyctl status --app kota-db-staging
```

### 5. Health Check Validation

**Test the health endpoint:**
```bash
curl https://kota-db-staging.fly.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-14T12:00:00.000Z"
}
```

**Test database connectivity:**
```bash
# The /health endpoint verifies Supabase connection
# Check logs for database connection errors
flyctl logs --app kota-db-staging | grep -i supabase
```

### 6. Generate Staging API Key

To use the staging environment, you need to generate an API key via the staging Supabase database.

**Option A: Using Supabase SQL Editor**

1. Navigate to your staging Supabase project > SQL Editor
2. Run the following SQL (replace placeholders):

```sql
-- Generate API key for staging environment
INSERT INTO api_keys (user_id, organization_id, key_hash, tier)
VALUES (
  'auth.uid()',  -- Replace with actual user UUID from auth.users table
  'your-org-uuid',  -- Replace with organization UUID from organizations table
  crypt('your-plaintext-key', gen_salt('bf')),  -- bcrypt hash of your key
  'solo'  -- or 'free', 'team'
);
```

3. Note the plaintext key you used (you won't be able to retrieve it later)

**Option B: Using KotaDB Key Generation Script**

If you have local access to a KotaDB instance connected to staging Supabase:

```bash
# Set staging Supabase credentials
export SUPABASE_URL="https://your-staging-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-staging-service-role-key"
export SUPABASE_ANON_KEY="your-staging-anon-key"

# Generate API key (requires script implementation)
cd app
bun run scripts/generate-api-key.ts --tier solo --user-id <user-uuid> --org-id <org-uuid>
```

**Save the API key securely** - you'll need it for MCP configuration and API requests.

### 7. MCP Integration Testing

Update your local `.mcp.json` to use the staging API key:

```json
{
  "mcpServers": {
    "kotadb-staging": {
      "type": "http",
      "url": "https://kota-db-staging.fly.dev/mcp",
      "headers": {
        "Authorization": "Bearer kota_solo_your_actual_key_here"
      }
    }
  }
}
```

**Test MCP connection:**

```bash
# Initialize handshake
curl -X POST https://kota-db-staging.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kota_solo_your_actual_key_here" \
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
```

**Test code search tool:**

```bash
curl -X POST https://kota-db-staging.fly.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kota_solo_your_actual_key_here" \
  -H "Origin: http://localhost:3000" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_code",
      "arguments": {"term": "Router"}
    }
  }'
```

**Use in Claude Code:**

If you have Claude Code configured to use MCP servers:

1. Restart Claude Code to pick up `.mcp.json` changes
2. Invoke tools via natural language: "Search for Router in kotadb-staging"
3. Claude Code will route requests to `https://kota-db-staging.fly.dev/mcp`

## Production Deployment

Production deployment follows the same process as staging with environment-specific configuration.

**Key Differences:**
- App name: `kota-db-production` (update `app/fly.toml` before deploying)
- Supabase project: Use production Supabase credentials
- Secrets: Set production-specific values
- Scaling: Adjust `min_machines_running` in `fly.toml` for availability requirements
- Monitoring: Configure Fly.io metrics and alerts

**Recommended Production Settings (`app/fly.toml`):**

```toml
app = "kota-db-production"

[http_service]
  min_machines_running = 2  # High availability
  auto_start_machines = true
  auto_stop_machines = false  # Keep machines running

[[vm]]
  memory_mb = 1024  # Increase for production load
```

## Troubleshooting

### Deployment Failures

**Issue: Docker build fails locally**

```bash
# Verify Docker is running
docker ps

# Test build from app/ directory
cd app
docker build -t kota-db-staging .

# Check Dockerfile syntax
cat Dockerfile
```

**Issue: Fly.io deployment fails with "failed to fetch an image or build from source"**

Check Fly.io build logs:
```bash
flyctl logs --app kota-db-staging
```

Common causes:
- Dockerfile errors (syntax, missing dependencies)
- Network issues during build
- Insufficient memory allocated to Fly.io builder

**Issue: Health checks failing**

```bash
# Check application logs
flyctl logs --app kota-db-staging

# Check machine status
flyctl status --app kota-db-staging

# SSH into machine for debugging
flyctl ssh console --app kota-db-staging
```

Common causes:
- Supabase credentials not set or incorrect
- Database migrations not applied
- Network connectivity issues between Fly.io and Supabase

### Database Connection Errors

**Issue: "Connection refused" or "Connection timeout"**

Verify Supabase credentials:
```bash
# Check secrets are set
flyctl secrets list --app kota-db-staging

# Test connection from local machine
export SUPABASE_URL="https://your-staging-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-staging-service-role-key"
cd app
bun run src/index.ts
```

**Issue: "Invalid API key" or "Unauthorized"**

- Verify `SUPABASE_SERVICE_KEY` is the service role key (not anon key)
- Check Supabase project API settings for key rotation
- Ensure RLS policies allow service role access

### API Key Issues

**Issue: "Invalid API key" in MCP requests**

- Verify API key exists in `api_keys` table
- Check bcrypt hash matches (regenerate if needed)
- Confirm API key format: `kota_{tier}_{uuid}_{secret}`

**Issue: Rate limit exceeded unexpectedly**

Check rate limit state:
```sql
SELECT * FROM rate_limits WHERE user_id = 'your-user-uuid';
```

Reset rate limit if needed:
```sql
DELETE FROM rate_limits WHERE user_id = 'your-user-uuid';
```

### Fly.io Configuration Issues

**Issue: `flyctl config validate` fails**

```bash
cd app
flyctl config validate
```

Common validation errors:
- Invalid `app` name (must be globally unique on Fly.io)
- Invalid region code (use `flyctl platform regions` to list valid regions)
- Invalid resource configuration (check `[[vm]]` section)

**Issue: App not accessible at expected URL**

```bash
# Check app info
flyctl info --app kota-db-staging

# Verify DNS
dig kota-db-staging.fly.dev

# Check TLS certificate
curl -vI https://kota-db-staging.fly.dev/health
```

### Migration Issues

**Issue: Migrations out of sync**

Verify migrations are identical in both locations:
```bash
cd app
bun run test:validate-migrations
```

If drift detected, sync migrations:
```bash
# Copy from source to Supabase CLI directory
cp src/db/migrations/* supabase/migrations/
```

## Monitoring and Maintenance

### Logs

**View real-time logs:**
```bash
flyctl logs --app kota-db-staging
```

**Filter logs by severity:**
```bash
flyctl logs --app kota-db-staging | grep -i error
```

### Metrics

**View app metrics:**
```bash
flyctl metrics --app kota-db-staging
```

**Monitor via Fly.io dashboard:**
https://fly.io/apps/kota-db-staging/metrics

### Scaling

**Horizontal scaling (add machines):**
```bash
flyctl scale count 3 --app kota-db-staging
```

**Vertical scaling (increase resources):**

Edit `app/fly.toml`:
```toml
[[vm]]
  memory_mb = 1024  # Increase from 512
  cpus = 2          # Increase from 1
```

Redeploy:
```bash
cd app
flyctl deploy --app kota-db-staging
```

### Updates and Rollbacks

**Deploy new version:**
```bash
cd app
git pull origin main
flyctl deploy --app kota-db-staging
```

**Rollback to previous version:**
```bash
# List releases
flyctl releases --app kota-db-staging

# Rollback to specific version
flyctl releases rollback v123 --app kota-db-staging
```

## Security Considerations

### Secrets Management

- **Never commit secrets to git** - use `flyctl secrets set` exclusively
- Rotate API keys and Supabase credentials regularly
- Use separate Supabase projects for staging and production
- Limit service role key exposure (use anon key with RLS where possible)

### Network Security

- Enable `force_https = true` in `fly.toml` (enabled by default)
- Configure `KOTA_ALLOWED_ORIGINS` to restrict MCP access
- Use Fly.io private networking for internal services
- Consider VPN or IP allowlisting for admin endpoints

### Database Security

- Enable Row Level Security (RLS) on all Supabase tables
- Use organization-scoped policies to isolate tenant data
- Audit `api_keys` table regularly for unused keys
- Set up Supabase logging and monitoring

## Support

For issues with:
- **KotaDB application**: Open issue at https://github.com/your-org/kota-db-ts/issues
- **Fly.io platform**: https://fly.io/docs or https://community.fly.io
- **Supabase platform**: https://supabase.com/docs or https://github.com/supabase/supabase/discussions
