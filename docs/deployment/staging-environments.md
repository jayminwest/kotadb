# Staging Environment Configuration Guide

This guide documents how staging/preview environments work with Vercel preview deployments and the backend API configuration for the KotaDB web application.

## Table of Contents

1. [Overview](#overview)
2. [Environment Architecture](#environment-architecture)
3. [Vercel Preview Deployments](#vercel-preview-deployments)
4. [Backend URL Configuration](#backend-url-configuration)
5. [Environment Variables](#environment-variables)
6. [Development Workflow](#development-workflow)
7. [Testing Preview Deployments](#testing-preview-deployments)
8. [Troubleshooting](#troubleshooting)

## Overview

KotaDB uses **Vercel Preview Deployments** for staging environments, automatically deploying every push to the `develop` branch. Each preview deployment is isolated with its own URL and environment configuration, enabling safe testing before production releases.

### Key Benefits

- **Automatic Deployment**: Every push to `develop` triggers a preview deployment
- **Isolated Testing**: Preview environments don't affect production data or configuration
- **Branch-Specific URLs**: Each deployment gets a unique URL (e.g., `kotadb-web-git-develop-username.vercel.app`)
- **Environment Parity**: Preview environments mirror production configuration structure

## Environment Architecture

### Preview/Staging Stack

```
┌─────────────────────────────────────────────────────────┐
│ Vercel Preview Deployment (develop branch)              │
│ URL: kotadb-web-git-develop-username.vercel.app         │
│                                                          │
│ Environment Variables:                                  │
│ - NEXT_PUBLIC_API_URL=https://kotadb-staging.fly.dev   │
│ - NEXT_PUBLIC_SUPABASE_URL=https://szuaoii...supabase.co│
│ - NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...                  │
│ - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...       │
│ - SUPABASE_SERVICE_ROLE_KEY=eyJ... (server-side only)  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP Requests
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Fly.io Staging Backend (kotadb-staging)                 │
│ URL: https://kotadb-staging.fly.dev                     │
│                                                          │
│ Environment: VERCEL_ENV=preview                         │
│ Database: Supabase Preview Branch (szuaoiiwrwpuhdbruydr)│
│ Stripe: Test Mode (pk_test_, sk_test_)                  │
│ GitHub App: KotaDB Preview (separate app)               │
└─────────────────────────────────────────────────────────┘
```

### Production Stack

```
┌─────────────────────────────────────────────────────────┐
│ Vercel Production Deployment (main branch)              │
│ URL: kotadb.io (custom domain)                          │
│                                                          │
│ Environment Variables:                                  │
│ - NEXT_PUBLIC_API_URL=https://kotadb.fly.dev           │
│ - NEXT_PUBLIC_SUPABASE_URL=https://production.supabase  │
│ - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...       │
└─────────────────────────────────────────────────────────┘
                          │
                          │ HTTP Requests
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Fly.io Production Backend (kotadb)                      │
│ URL: https://kotadb.fly.dev                             │
│                                                          │
│ Environment: VERCEL_ENV=production                      │
│ Database: Supabase Production Instance                  │
│ Stripe: Live Mode (pk_live_, sk_live_)                  │
│ GitHub App: KotaDB Production                           │
└─────────────────────────────────────────────────────────┘
```

## Vercel Preview Deployments

### How Preview Deployments Work

1. **Trigger**: Push to `develop` branch or open/update a pull request
2. **Build**: Vercel builds the Next.js application with preview environment variables
3. **Deploy**: Application deployed to preview URL (format: `kotadb-web-git-[branch]-[username].vercel.app`)
4. **Status**: GitHub commit check shows deployment status and preview URL

### Preview URL Patterns

Vercel generates preview URLs based on branch names:

- **Develop Branch**: `kotadb-web-git-develop-jaymin-west.vercel.app`
- **Feature Branch**: `kotadb-web-git-feat-123-feature-name-jaymin-west.vercel.app`
- **Pull Request**: `kotadb-web-pr-123-jaymin-west.vercel.app`

### Environment Detection

The web application detects the environment using Vercel's built-in environment variables:

```typescript
// In web application code
const isProduction = process.env.NODE_ENV === 'production' &&
                     process.env.VERCEL_ENV === 'production'
const isPreview = process.env.VERCEL_ENV === 'preview'
const isDevelopment = process.env.NODE_ENV === 'development'
```

### Security Guards

Certain features are disabled in production but enabled in preview/development:

**Dev Session Endpoint** (`/auth/dev-session`):
- **Purpose**: Generate authenticated sessions for Playwright agents
- **Availability**: Only when `NODE_ENV !== 'production' || VERCEL_ENV !== 'production'`
- **Security**: Returns 403 Forbidden if both environment variables are set to 'production'
- **Use Case**: Automated testing workflows that cannot complete GitHub OAuth headlessly

```typescript
// From web/app/auth/dev-session/route.ts
function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV === 'production'
  )
}
```

## Backend URL Configuration

### Preview Environment Backend

Preview deployments connect to the **Fly.io staging backend** (`kotadb-staging`):

```bash
# Set via Vercel CLI or Dashboard
NEXT_PUBLIC_API_URL=https://kotadb-staging.fly.dev
```

**Important**: The backend URL MUST be set to the staging backend for preview deployments to avoid affecting production data.

### Production Environment Backend

Production deployments connect to the **Fly.io production backend** (`kotadb`):

```bash
# Set via Vercel CLI or Dashboard
NEXT_PUBLIC_API_URL=https://kotadb.fly.dev
```

### Backend URL Requirements

1. **Must include protocol**: `https://` (required for CORS and security)
2. **No trailing slash**: `https://kotadb-staging.fly.dev` (not `https://kotadb-staging.fly.dev/`)
3. **Valid DNS resolution**: URL must resolve to a reachable server
4. **CORS configuration**: Backend must allow requests from Vercel preview URLs

### How Backend URLs Are Used

The web application constructs API requests by combining the base URL with endpoint paths:

```typescript
// Example API client usage
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
const endpoint = '/api/keys/generate'
const response = await fetch(`${apiUrl}${endpoint}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  }
})
```

## Environment Variables

### Required Variables for Preview Deployments

Configure these in Vercel Dashboard → Project Settings → Environment Variables → **Preview** scope:

| Variable | Value (Preview) | Purpose |
|----------|-----------------|---------|
| `NEXT_PUBLIC_API_URL` | `https://kotadb-staging.fly.dev` | Backend API base URL for staging |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://szuaoiiwrwpuhdbruydr.supabase.co` | Supabase preview branch URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` (see `.env.vercel.preview`) | Supabase preview branch anon key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Stripe test mode publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` (server-side only) | Supabase service role for admin operations |

### Required Variables for Production Deployments

Configure these in Vercel Dashboard → Project Settings → Environment Variables → **Production** scope:

| Variable | Value (Production) | Purpose |
|----------|-------------------|---------|
| `NEXT_PUBLIC_API_URL` | `https://kotadb.fly.dev` | Backend API base URL for production |
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase URL | Supabase production instance URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key | Supabase production anon key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | Stripe live mode publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service key | Supabase production service role key |

### Environment Variable Precedence

Vercel resolves environment variables in the following order:

1. **Environment-specific** (Production, Preview, Development)
2. **All environments** (fallback if no environment-specific value)
3. **Local `.env.local`** (for local development only)

### Setting Variables via Vercel CLI

```bash
# From web/ directory
cd web

# Set preview environment variable
vercel env add NEXT_PUBLIC_API_URL preview
# When prompted, enter: https://kotadb-staging.fly.dev

# Set production environment variable
vercel env add NEXT_PUBLIC_API_URL production
# When prompted, enter: https://kotadb.fly.dev

# List all environment variables
vercel env ls

# Pull environment variables to local file
vercel env pull .env.vercel.preview --environment=preview
```

### Viewing Current Configuration

Check the current preview environment configuration:

```bash
# View web/.env.vercel.preview (tracked in git for documentation)
cat /Users/jayminwest/Projects/kota-db-ts/web/.env.vercel.preview
```

**Note**: This file is for **documentation purposes only**. Actual secrets are stored in Vercel's encrypted environment variable storage and NEVER committed to git.

## Development Workflow

### Local Development

When developing locally, use local backend and Supabase Local:

```bash
# web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54326
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-local-anon-key>
```

Start the full stack:

```bash
# Start backend API (from app/)
cd app && ./scripts/dev-start.sh

# Start web frontend (from web/)
cd web && bun run dev
```

Access at:
- **Web**: http://localhost:3001
- **API**: http://localhost:3000
- **Supabase Local**: http://localhost:54326

### Feature Branch Testing

1. **Create feature branch**:
   ```bash
   git checkout -b feat/328-staging-docs
   ```

2. **Make changes and commit**:
   ```bash
   git add docs/deployment/staging-environments.md
   git commit -m "docs: document staging environment configuration (#328)"
   ```

3. **Push to GitHub**:
   ```bash
   git push -u origin feat/328-staging-docs
   ```

4. **Open Pull Request**:
   - GitHub automatically creates preview deployment
   - Check deployment status in PR checks
   - Click "Visit Preview" to test changes

5. **Test preview deployment**:
   - Verify backend URL points to staging (`kotadb-staging.fly.dev`)
   - Test authentication flow (GitHub OAuth or dev session endpoint)
   - Verify API calls work correctly
   - Check rate limiting behavior

### Merging to Develop

After PR approval, merge to `develop`:

```bash
# Merge PR via GitHub UI or CLI
gh pr merge 123 --merge

# Pull latest develop
git checkout develop
git pull origin develop
```

This automatically triggers a new preview deployment for the `develop` branch.

### Promoting to Production

After testing on `develop` preview:

1. **Merge develop to main**:
   ```bash
   git checkout main
   git pull origin main
   git merge develop
   git push origin main
   ```

2. **Vercel automatically deploys to production**
3. **Monitor deployment in Vercel dashboard**
4. **Verify production environment variables loaded correctly**

## Testing Preview Deployments

### Automated Testing

**Playwright E2E Tests** (run against preview deployment):

```bash
# Set NEXT_PUBLIC_API_URL to preview backend
export NEXT_PUBLIC_API_URL=https://kotadb-staging.fly.dev

# Run E2E tests
cd web && bun test:e2e
```

### Manual Testing Checklist

- [ ] **Backend Connectivity**:
  - [ ] Navigate to preview URL
  - [ ] Open browser DevTools → Network tab
  - [ ] Perform an action that calls backend API (e.g., search)
  - [ ] Verify request URL shows `https://kotadb-staging.fly.dev`
  - [ ] Verify response status is 200 OK

- [ ] **Authentication Flow**:
  - [ ] Clear cookies and localStorage
  - [ ] Navigate to `/login`
  - [ ] Sign in with GitHub OAuth (uses preview Supabase instance)
  - [ ] Verify redirect to `/dashboard`
  - [ ] Verify session cookies set correctly
  - [ ] Verify API key generated successfully

- [ ] **Dev Session Endpoint** (preview only):
  - [ ] Open browser console
  - [ ] Test endpoint availability:
    ```javascript
    fetch('/auth/dev-session')
      .then(r => r.json())
      .then(console.log)
    // Expected: { available: true, environment: "production", vercelEnv: "preview" }
    ```
  - [ ] Create test session:
    ```javascript
    fetch('/auth/dev-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@preview.local', tier: 'free' })
    })
      .then(r => r.json())
      .then(console.log)
    // Expected: { userId: "...", session: {...}, apiKey: "kota_free_..." }
    ```

- [ ] **Environment Isolation**:
  - [ ] Verify preview data does NOT appear in production
  - [ ] Verify production data does NOT appear in preview
  - [ ] Test API keys from preview do NOT work in production

- [ ] **Rate Limiting**:
  - [ ] Make multiple API requests rapidly
  - [ ] Verify rate limit headers in responses
  - [ ] Verify 429 status when limit exceeded
  - [ ] Verify countdown timer displays correctly

### Debugging Preview Deployments

**View build logs**:
```bash
# Via Vercel CLI
vercel logs [deployment-url]

# Via Vercel Dashboard
# Navigate to: Deployments → [Click deployment] → Build Logs
```

**View runtime logs**:
```bash
# Via Vercel CLI (runtime logs)
vercel logs [deployment-url] --follow

# Via Vercel Dashboard
# Navigate to: Deployments → [Click deployment] → Functions → [Select route]
```

**Inspect environment variables**:
```bash
# Create debug endpoint (temporary, for troubleshooting only)
# web/app/api/debug-env/route.ts

export async function GET() {
  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    // DO NOT expose secrets (service role key, etc.)
  })
}
```

**Test backend connectivity**:
```bash
# From preview deployment console
curl https://kotadb-staging.fly.dev/health
# Expected: {"status":"ok","timestamp":"..."}
```

## Troubleshooting

### Issue: Preview Deployment Shows Wrong Backend URL

**Symptoms**: Preview deployment makes requests to production backend or localhost

**Diagnosis**:
```bash
# Check environment variables in Vercel Dashboard
vercel env ls

# Or pull current preview configuration
vercel env pull .env.vercel.preview --environment=preview
```

**Solution**:
```bash
# Set correct preview backend URL
vercel env add NEXT_PUBLIC_API_URL preview
# Enter: https://kotadb-staging.fly.dev

# Trigger new deployment
git commit --allow-empty -m "chore: trigger preview deployment"
git push origin develop
```

### Issue: Dev Session Endpoint Returns 403 in Preview

**Symptoms**: `/auth/dev-session` returns 403 Forbidden in preview deployment

**Root Cause**: Both `NODE_ENV` and `VERCEL_ENV` are set to 'production'

**Diagnosis**:
```bash
# Check preview environment variables
vercel env ls | grep -E "(NODE_ENV|VERCEL_ENV)"
```

**Solution**:
- `NODE_ENV` should be `production` (Next.js build requirement)
- `VERCEL_ENV` should be `preview` (Vercel sets this automatically)
- Environment guard checks **both** variables: endpoint is available unless BOTH are 'production'

**Verification**:
```bash
# Test endpoint availability
curl https://your-preview-url.vercel.app/auth/dev-session
# Expected: { "available": true, "vercelEnv": "preview" }
```

### Issue: CORS Errors When Calling Backend API

**Symptoms**: Browser console shows CORS errors for API requests

**Root Cause**: Backend API not configured to allow preview deployment URLs

**Solution** (on backend `kotadb-staging`):
```bash
# Add CORS middleware to backend (if not already present)
# See: app/src/api/middleware/cors.ts

# Configure allowed origins to include Vercel preview URLs
# Pattern: *.vercel.app
```

**Temporary Workaround**:
```bash
# Use server-side API calls via Next.js API routes
# Example: web/app/api/search/route.ts
export async function POST(request: NextRequest) {
  const { term } = await request.json()

  // Server-side fetch (no CORS restrictions)
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ term })
  })

  return NextResponse.json(await response.json())
}
```

### Issue: Supabase Session Cookies Not Persisting

**Symptoms**: User remains logged out after successful OAuth redirect

**Root Cause**: Cookie domain mismatch (preview URL vs Supabase URL)

**Diagnosis**:
```bash
# Check browser cookies (DevTools → Application → Cookies)
# Look for: sb-{project-ref}-auth-token
# Verify domain matches preview URL
```

**Solution**:
- Supabase sessions use project-specific cookies
- Preview deployments should use preview Supabase instance
- Verify `NEXT_PUBLIC_SUPABASE_URL` points to preview branch

**Verification**:
```bash
# Check Supabase configuration
echo $NEXT_PUBLIC_SUPABASE_URL
# Expected (preview): https://szuaoiiwrwpuhdbruydr.supabase.co
```

### Issue: Stripe Webhook Failures in Preview

**Symptoms**: Stripe webhooks return errors or are not received

**Root Cause**: Webhook endpoint configured for production URL only

**Solution**:
1. **Create separate Stripe webhook for preview**:
   - Dashboard → Webhooks → Add endpoint
   - URL: `https://kotadb-staging.fly.dev/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`
   - Copy webhook secret (starts with `whsec_test_...`)

2. **Configure webhook secret on backend**:
   ```bash
   flyctl secrets set STRIPE_WEBHOOK_SECRET=whsec_test_... --app kotadb-staging
   ```

3. **Use Stripe test mode**:
   - Verify `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_`
   - Verify backend uses `sk_test_` secret key

**Testing**:
```bash
# Use Stripe CLI to forward webhooks to preview
stripe listen --forward-to https://kotadb-staging.fly.dev/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed
```

## Additional Resources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Preview Deployments Documentation](https://vercel.com/docs/concepts/deployments/preview-deployments)
- [Complete Deployment Setup Guide](../deployment-setup-guide.md) - Multi-platform configuration guide
- [GitHub OAuth Staging Configuration](../github-oauth-staging-config-guide.md) - OAuth setup for preview
- [Web Application README](../../web/README.md) - Frontend development guide
- [Environment Variables Reference](./.claude/commands/app/environment.md) - Backend environment variables

## Security Notes

1. **Never commit secrets to git**:
   - `.env.local`, `.env.vercel.preview`, `.env.vercel.production` are for **documentation only**
   - Actual secrets stored in Vercel's encrypted environment variable storage
   - Use `.gitignore` to exclude populated environment files

2. **Service role keys**:
   - `SUPABASE_SERVICE_ROLE_KEY` is **server-side only**
   - Never expose in `NEXT_PUBLIC_*` variables
   - Only used in Next.js API routes and server components

3. **Preview environment isolation**:
   - Use separate GitHub Apps for preview vs production
   - Use Stripe test mode for preview deployments
   - Use Supabase preview branch (separate database)

4. **Production environment guards**:
   - Dev session endpoint blocked when both `NODE_ENV` and `VERCEL_ENV` are 'production'
   - Verify guards cannot be bypassed via environment variable manipulation
   - Monitor production logs for unauthorized dev session attempts (should always 403)

---

**Last Updated**: 2025-10-29
**Issue**: #328
**Maintainers**: @jayminwest
