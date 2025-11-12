# KotaDB Deployment Guide

This guide covers deploying KotaDB to Fly.io for staging and production environments.

## Automated Deployments

**Note**: KotaDB uses GitHub App integrations for automated deployments. Merges to `develop` and `main` automatically trigger:
- **Database migrations** via Supabase GitHub App
- **API deployments** via Fly.io GitHub App

See [Automated Deployments](../.claude/commands/docs/automated-deployments.md) for details on how this works.

**This guide documents manual deployment procedures** for initial setup, emergency hotfixes, or troubleshooting.

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

**Automated (Recommended)**: Migrations are automatically applied via the Supabase GitHub App on merges to `develop` and `main`. See [Automated Deployments](../.claude/commands/docs/automated-deployments.md).

**Manual (Initial Setup or Emergency)**: Use the Supabase CLI to apply migrations from `app/supabase/migrations/`:

```bash
# Link to your remote project
cd app
supabase link --project-ref your-project-id

# Push migrations
supabase db push
```

**Note**: Manual migrations should only be used for initial project setup or emergency hotfixes outside the normal git flow.

**Verify Migration Status:**

```bash
# Check that all tables exist
supabase db diff
```

Expected tables: `api_keys`, `organizations`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`, `rate_limits`, and related RLS policies.

**Post-Deployment Schema Validation:**

After deploying to staging or production, verify that critical schema elements exist:

```sql
-- Verify api_keys table has all required columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'api_keys'
ORDER BY ordinal_position;

-- Expected columns: id, user_id, key_id, secret_hash, tier, rate_limit_per_hour,
-- enabled, created_at, last_used_at, metadata, revoked_at

-- Verify critical indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'api_keys'
AND indexname IN ('idx_api_keys_key_id', 'idx_api_keys_revoked_at');

-- Check which migrations have been applied
SELECT name, applied_at
FROM migrations
ORDER BY applied_at DESC
LIMIT 10;
```

If any critical columns or indexes are missing, apply the missing migrations from `app/src/db/migrations/` using the Supabase SQL Editor or `bun run scripts/apply-migrations.ts`.

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

# Set allowed origins for CORS (comma-separated, for web app and MCP clients)
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://kota-db-web-staging.vercel.app,https://app.example.com" --app kota-db-staging
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

## Web Application Deployment (Next.js Frontend)

The KotaDB monorepo includes a Next.js web application (`web/`) that provides a user interface for the API. This section covers deployment strategies for the frontend, with Vercel as the recommended platform and Fly.io as an alternative.

**Prerequisites:**
- Backend API deployed and accessible (see sections above)
- Backend API URL available (e.g., `https://kota-db-staging.fly.dev`)
- API key generated for frontend authentication (see Authentication section)
- CORS configured on backend to allow frontend origin (see CORS Configuration below)

**Important:** Avoid deploying to Cloudflare Pages. Use Vercel (recommended) or Fly.io instead.

### Option A: Deploy to Vercel (Recommended)

Vercel provides zero-configuration deployment for Next.js applications with automatic optimizations, edge network distribution, and built-in PR previews.

**Benefits:**
- Zero-config Next.js deployment with automatic optimizations
- Automatic preview deployments for every pull request
- Global edge network for low-latency content delivery
- Free tier suitable for development and small production workloads
- Built-in analytics and monitoring

**1. Install Vercel CLI**

```bash
npm install -g vercel
vercel login
```

**2. Deploy Staging Environment**

From the `web/` directory:

```bash
cd web
vercel
```

Follow the prompts:
- Link to existing project or create new one
- Set project name: `kota-db-web-staging`
- Configure build settings (auto-detected for Next.js)

**3. Configure Environment Variables**

Set environment variables via Vercel CLI:

```bash
# API endpoint (staging backend)
vercel env add NEXT_PUBLIC_API_URL
# Enter: https://kota-db-staging.fly.dev

# API key for server-side requests (optional, for Next.js API routes)
vercel env add API_KEY
# Enter: your-api-key-here
```

Or configure via Vercel Dashboard:
1. Navigate to Project Settings → Environment Variables
2. Add variables for Production, Preview, and Development environments
3. Use `NEXT_PUBLIC_` prefix for browser-accessible variables

**Required Environment Variables:**

| Variable | Example Value | Scope | Description |
|----------|---------------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://kota-db-staging.fly.dev` | Browser | Backend API endpoint |
| `API_KEY` | `kota_sk_abc123...` | Server | API key for server-side calls (optional) |

**4. Deploy to Production**

```bash
cd web
vercel --prod
```

This deploys to the production domain (e.g., `kota-db-web.vercel.app`).

**5. Custom Domain Setup**

Configure custom domain via Vercel Dashboard:
1. Navigate to Project Settings → Domains
2. Add custom domain (e.g., `app.kotadb.com`)
3. Update DNS records as instructed by Vercel
4. SSL certificates are automatically provisioned

**6. Update Backend CORS Configuration**

After deploying, add the Vercel URL to backend's allowed origins:

```bash
# For staging backend
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://kota-db-web-staging.vercel.app" --app kota-db-staging

# For production backend (multiple origins)
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://kota-db-web.vercel.app,https://app.kotadb.com" --app kota-db-production
```

### Option B: Deploy to Fly.io (Alternative)

Fly.io can host both backend and frontend on the same platform with internal networking benefits, but requires manual Next.js optimization.

**Trade-offs:**
- Requires manual configuration for Next.js production optimizations
- Separate machines for frontend (higher cost vs Vercel free tier)
- Manual CDN setup needed for edge distribution
- Internal networking allows direct backend communication (bypasses public internet)

**1. Create Fly.io App for Frontend**

```bash
cd web
flyctl apps create kota-db-web-staging
```

**2. Create `web/fly.toml` Configuration**

```toml
app = "kota-db-web-staging"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory_mb = 512
  cpu_kind = "shared"
  cpus = 1
```

**3. Create `web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN npm install -g bun && bun install --frozen-lockfile

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g bun && bun run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

**4. Configure Secrets**

```bash
# Set backend API URL (can use internal .internal address for same-region apps)
flyctl secrets set NEXT_PUBLIC_API_URL="https://kota-db-staging.fly.dev" --app kota-db-web-staging

# Optional: Use internal networking for backend communication
flyctl secrets set NEXT_PUBLIC_API_URL="http://kota-db-staging.internal:3000" --app kota-db-web-staging
```

**5. Deploy**

```bash
cd web
flyctl deploy
```

**6. Verify Deployment**

```bash
flyctl status --app kota-db-web-staging
curl https://kota-db-web-staging.fly.dev
```

### CORS Configuration

The backend API must allow cross-origin requests from the frontend domain to enable browser-based API calls.

**1. Add CORS Middleware to Backend**

In `app/src/api/routes.ts`, add CORS middleware before route handlers:

```typescript
import type { Request, Response, NextFunction } from "express";

// CORS middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = process.env.KOTA_ALLOWED_ORIGINS?.split(",") || [];
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }

  next();
});
```

**2. Set Allowed Origins on Backend**

Configure `KOTA_ALLOWED_ORIGINS` environment variable on the backend API:

```bash
# Local development
export KOTA_ALLOWED_ORIGINS="http://localhost:3001"

# Staging (Vercel)
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://kota-db-web-staging.vercel.app" --app kota-db-staging

# Production (multiple origins)
flyctl secrets set KOTA_ALLOWED_ORIGINS="https://kota-db-web.vercel.app,https://app.kotadb.com" --app kota-db-production
```

**Security Considerations:**

- **Origin Validation**: Always validate `Origin` header against allowlist to prevent unauthorized domains
- **Credentials**: Only set `Access-Control-Allow-Credentials: true` if using cookies or HTTP auth
- **Preflight Caching**: Add `Access-Control-Max-Age` header to reduce preflight request overhead
- **Sensitive Data**: Never expose API keys in `NEXT_PUBLIC_*` variables (use Next.js API routes for server-side calls)

**3. Test CORS Configuration**

Use curl to verify CORS headers:

```bash
# Test preflight request
curl -X OPTIONS \
  -H "Origin: https://kota-db-web-staging.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  https://kota-db-staging.fly.dev/api/search \
  -v

# Expected response headers:
# Access-Control-Allow-Origin: https://kota-db-web-staging.vercel.app
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization
```

### Multi-Environment Deployment Strategy

**Environment Matrix:**

| Environment | Backend URL | Frontend URL | Supabase URL | Use Case |
|-------------|-------------|--------------|--------------|----------|
| Local | `http://localhost:3000` | `http://localhost:3001` | `http://localhost:54322` | Local development |
| Staging | `https://kota-db-staging.fly.dev` | `https://kota-db-web-staging.vercel.app` | `https://[project].supabase.co` | QA testing, PR previews |
| Production | `https://kota-db-production.fly.dev` | `https://kota-db-web.vercel.app` | `https://[project].supabase.co` | Live production workloads |

**Environment Variable Matrix:**

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | `https://kota-db-staging.fly.dev` | `https://kota-db-production.fly.dev` |
| `SUPABASE_URL` | `http://localhost:54322` | `https://[staging-project].supabase.co` | `https://[prod-project].supabase.co` |
| `KOTA_ALLOWED_ORIGINS` (backend) | `http://localhost:3001` | `https://kota-db-web-staging.vercel.app` | `https://kota-db-web.vercel.app,https://app.kotadb.com` |
| `API_KEY` | Generated via CLI | Generated via staging API | Generated via production API |

**Best Practices:**

- Use `.env.local` for local development environment variables (not committed to git)
- Use Vercel Dashboard or `vercel env` CLI for remote environment configuration
- Use Fly.io secrets (`flyctl secrets set`) for backend environment variables
- Prefix browser-accessible variables with `NEXT_PUBLIC_` in Next.js
- Never commit API keys or secrets to version control
- Test environment-specific configurations in staging before deploying to production

### Web Application Health Check

After deploying the frontend, verify the deployment and API integration:

**1. Frontend Availability**

```bash
# Test frontend loads
curl -I https://kota-db-web-staging.vercel.app

# Expected: HTTP/2 200 OK
```

**2. API Integration Test**

From browser console or curl:

```bash
# Test API call from frontend origin
curl -X POST \
  -H "Origin: https://kota-db-web-staging.vercel.app" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kota_sk_your_api_key_here" \
  -d '{"query": "test", "limit": 5}' \
  https://kota-db-staging.fly.dev/api/search

# Expected: JSON response with search results and rate limit headers
```

**3. Verify Rate Limit Headers**

Check that rate limit headers are present in API responses:

```bash
curl -X GET \
  -H "Authorization: Bearer kota_sk_your_api_key_here" \
  https://kota-db-staging.fly.dev/api/health \
  -v

# Expected headers:
# X-RateLimit-Limit: 1000
# X-RateLimit-Remaining: 999
# X-RateLimit-Reset: 1672531200
```

**4. End-to-End Integration Test**

1. Navigate to frontend URL in browser
2. Trigger API call via UI (search, index, etc.)
3. Open browser DevTools → Network tab
4. Verify API request succeeds with rate limit headers
5. Check for CORS errors in console (should be none)

### Deployment Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     KotaDB Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐           ┌─────────────────┐          │
│  │  Next.js Web    │           │   Backend API   │          │
│  │  (Vercel/Fly)   │──HTTPS───▶│   (Fly.io)      │          │
│  │                 │           │                 │          │
│  │  Port: 3000     │◀──CORS────│  Port: 3000     │          │
│  └─────────────────┘           └─────────────────┘          │
│         │                              │                     │
│         │                              │                     │
│         ▼                              ▼                     │
│  ┌─────────────────┐           ┌─────────────────┐          │
│  │  User Browser   │           │  Supabase PG    │          │
│  │  (API calls)    │           │  (Database)     │          │
│  └─────────────────┘           └─────────────────┘          │
│                                                               │
│  Environment Variables:                                      │
│  - NEXT_PUBLIC_API_URL: Backend URL for browser calls       │
│  - KOTA_ALLOWED_ORIGINS: Frontend origin for CORS           │
│  - API_KEY: Authentication for server-side calls            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Troubleshooting Web Deployment

**Issue: CORS errors in browser console**

Error: `Access to fetch at 'https://kota-db-staging.fly.dev/api/search' from origin 'https://kota-db-web-staging.vercel.app' has been blocked by CORS policy`

**Solution:**
1. Verify `KOTA_ALLOWED_ORIGINS` is set correctly on backend:
   ```bash
   flyctl secrets list --app kota-db-staging
   ```
2. Ensure origin matches exactly (no trailing slash):
   ```bash
   # Wrong: https://kota-db-web-staging.vercel.app/
   # Right: https://kota-db-web-staging.vercel.app
   ```
3. Check CORS middleware is registered before route handlers in `app/src/api/routes.ts`
4. Test preflight request manually (see CORS Configuration section)

**Issue: Environment variables not loaded in browser**

Error: `NEXT_PUBLIC_API_URL is undefined`

**Solution:**
1. Verify variable is prefixed with `NEXT_PUBLIC_` for browser access:
   ```bash
   # Wrong: API_URL
   # Right: NEXT_PUBLIC_API_URL
   ```
2. Check Vercel environment variable configuration:
   ```bash
   vercel env ls
   ```
3. Rebuild and redeploy after adding environment variables:
   ```bash
   vercel --prod
   ```

**Issue: API key exposed in browser**

Security risk: API key visible in browser DevTools Network tab

**Solution:**
- Never use `NEXT_PUBLIC_` prefix for sensitive secrets
- Move API calls to Next.js API routes (`pages/api/`) for server-side execution:
  ```typescript
  // pages/api/search.ts
  export default async function handler(req, res) {
    const response = await fetch(`${process.env.API_URL}/search`, {
      headers: { Authorization: `Bearer ${process.env.API_KEY}` }
    });
    const data = await response.json();
    res.json(data);
  }
  ```
- Use API routes as proxy to hide backend URL and credentials

**Issue: 429 Too Many Requests errors from frontend**

Error: Rate limit exceeded for tier

**Solution:**
1. Check rate limit headers in API responses:
   ```bash
   curl -I -H "Authorization: Bearer kota_sk_your_api_key_here" \
     https://kota-db-staging.fly.dev/api/health
   ```
2. Verify correct API key is used (staging vs production):
   ```bash
   vercel env ls
   ```
3. Implement client-side rate limit handling:
   ```typescript
   const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
   const rateLimitReset = response.headers.get("X-RateLimit-Reset");
   // Show user warning when remaining < 10
   ```
4. Consider upgrading tier if legitimate usage exceeds limits

**Issue: Vercel deployment fails with build errors**

Error: `Build failed: Command "next build" exited with 1`

**Solution:**
1. Check build logs in Vercel Dashboard → Deployments → Build Logs
2. Verify dependencies are installed:
   ```bash
   cd web && bun install
   ```
3. Test build locally:
   ```bash
   cd web && bun run build
   ```
4. Ensure `next.config.js` has correct output configuration:
   ```javascript
   module.exports = {
     output: 'standalone', // For Docker/Fly.io deployments
   }
   ```

**Issue: Fly.io deployment timeout**

Error: `Error: failed to fetch an image or build from source: error building: context deadline exceeded`

**Solution:**
1. Increase Fly.io build timeout:
   ```bash
   flyctl deploy --remote-only --app kota-db-web-staging
   ```
2. Use remote builder instead of local Docker:
   ```bash
   flyctl deploy --remote-only
   ```
3. Check Dockerfile uses multi-stage builds to reduce image size
4. Verify network connectivity to Fly.io registry

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

## Web Application Deployment

The KotaDB web application is a Next.js frontend that provides GitHub OAuth authentication, API key management, and subscription billing. This section covers deploying the web app to Fly.io.

### Prerequisites

- Backend API deployed and accessible (e.g., `https://kotadb.fly.dev`)
- Supabase project configured with GitHub OAuth provider
- GitHub OAuth App created for authentication

### 1. Configure GitHub OAuth

**Create GitHub OAuth App:**

1. Navigate to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in application details:
   - **Application name**: KotaDB (Staging/Production)
   - **Homepage URL**: `https://kotadb-web-production.fly.dev` (or your staging URL)
   - **Authorization callback URL**: `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
4. Click "Register application"
5. Copy the **Client ID** and generate a **Client Secret**

**Enable GitHub Provider in Supabase:**

1. Navigate to your Supabase project dashboard
2. Go to Authentication > Providers > GitHub
3. Enable the GitHub provider
4. Paste your GitHub OAuth App **Client ID** and **Client Secret**
5. Save configuration

### 2. Create Fly.io Web App

The web app is pre-configured in `web/fly.toml` with the name `kotadb-web-production`.

**Create the app:**
```bash
cd web
flyctl apps create kotadb-web-production
```

**Verify app creation:**
```bash
flyctl apps list | grep kotadb-web-production
```

### 3. Configure Web App Secrets

Set environment variables for the web app:

```bash
cd web
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key" \
  NEXT_PUBLIC_API_URL="https://kotadb.fly.dev" \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_your_stripe_key" \
  --app kotadb-web-production
```

**Environment Variable Reference:**

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL (safe to expose)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (safe to expose, RLS enforces security)
- `NEXT_PUBLIC_API_URL` - Backend API URL for key generation and subscriptions
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key for checkout (optional, for paid tiers)

**Verify secrets:**
```bash
flyctl secrets list --app kotadb-web-production
```

### 4. Deploy Web App

```bash
cd web
flyctl deploy --app kotadb-web-production
```

**Monitor deployment progress:**
```bash
flyctl logs --app kotadb-web-production
```

### 5. Verify Web App Deployment

**Test health check:**
```bash
curl https://kotadb-web-production.fly.dev
```

**Test OAuth flow:**

1. Visit `https://kotadb-web-production.fly.dev/login`
2. Click "Sign in with GitHub"
3. Authorize the application
4. Verify redirect to dashboard
5. Verify API key is generated and displayed

**Check logs for errors:**
```bash
flyctl logs --app kotadb-web-production
```

### 6. Web App Updates and Rollbacks

**Deploy new version:**
```bash
cd web
git pull origin main
flyctl deploy --app kotadb-web-production
```

**Rollback to previous version:**
```bash
# List releases
flyctl releases --app kotadb-web-production

# Rollback to specific version
flyctl releases rollback v123 --app kotadb-web-production
```

### Troubleshooting Web App

**OAuth callback fails:**

- Verify GitHub OAuth App callback URL matches Supabase URL exactly
- Check Supabase logs for authentication errors
- Ensure GitHub provider is enabled in Supabase dashboard

**API key generation fails:**

- Verify `NEXT_PUBLIC_API_URL` points to deployed backend
- Check backend logs for API key generation errors
- Ensure user has valid Supabase session token

**Web app won't start:**

- Check for build errors in deployment logs
- Verify all `NEXT_PUBLIC_*` environment variables are set
- Ensure `web/fly.toml` has correct internal port (3000 for Next.js)

**MCP integration fails:**

- Verify generated API key is valid (test with curl)
- Check rate limits haven't been exceeded
- Ensure backend API is accessible from MCP client

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
