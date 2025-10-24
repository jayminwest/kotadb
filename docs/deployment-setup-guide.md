# Deployment Setup Guide

This guide provides step-by-step instructions for configuring preview/staging and production environments for KotaDB across multiple platforms: Vercel (web frontend), Fly.io (backend API), Supabase (database), GitHub Apps (OAuth/webhooks), and Stripe (billing).

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Architecture](#environment-architecture)
3. [Phase 1: Create GitHub Apps](#phase-1-create-github-apps)
4. [Phase 2: Create Fly.io Staging App](#phase-2-create-flyio-staging-app)
5. [Phase 3: Configure Supabase](#phase-3-configure-supabase)
6. [Phase 4: Configure Stripe](#phase-4-configure-stripe)
7. [Phase 5: Configure Vercel Environments](#phase-5-configure-vercel-environments)
8. [Phase 6: Configure Fly.io Secrets](#phase-6-configure-flyio-secrets)
9. [Validation and Testing](#validation-and-testing)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

Before beginning setup, ensure you have:

- **Accounts**:
  - [Supabase](https://supabase.com) account with production project and preview branch created
  - [Stripe](https://stripe.com) account (test mode and production mode access)
  - [Fly.io](https://fly.io) account with production app (`kotadb`) already deployed
  - [Vercel](https://vercel.com) account with project created for `web/` directory
  - [GitHub](https://github.com) account with admin access to your organization/repositories

- **CLI Tools Installed**:
  ```bash
  # Verify installations
  flyctl version    # Fly.io CLI
  vercel --version  # Vercel CLI
  gh --version      # GitHub CLI (optional, for automation)
  ```

- **Local Files**:
  - `.env.develop` and `.env.production` files created (see repository root)
  - Text editor for populating environment variables
  - Password manager for storing secrets (1Password, Bitwarden, etc.)

## Environment Architecture

KotaDB uses a **dual-environment** deployment strategy:

### Preview/Staging Environment
- **Frontend**: Vercel Preview (auto-deployed from `develop` branch)
- **Backend**: Fly.io staging app (`kotadb-staging`)
- **Database**: Supabase preview branch
- **GitHub App**: KotaDB Preview (separate app for isolation)
- **Stripe**: Test mode (sk_test_, pk_test_)

### Production Environment
- **Frontend**: Vercel Production (auto-deployed from `main` branch)
- **Backend**: Fly.io production app (`kotadb`)
- **Database**: Supabase production instance
- **GitHub App**: KotaDB Production (separate app for isolation)
- **Stripe**: Live mode (sk_live_, pk_live_)

**Benefits**:
- Environment isolation prevents staging changes from affecting production
- Separate GitHub Apps prevent webhook cross-contamination
- Stripe test mode allows safe billing testing without real charges
- Supabase preview branch allows schema migration testing

## Phase 1: Create GitHub Apps

GitHub Apps provide OAuth authentication and webhook integration for automated repository indexing.

### Create Preview GitHub App

1. **Navigate to GitHub Apps settings**:
   - Go to: https://github.com/settings/apps/new
   - Or: Settings → Developer settings → GitHub Apps → New GitHub App

2. **Configure basic information**:
   - **GitHub App name**: `KotaDB Preview` (or your preferred name)
   - **Homepage URL**: `https://kotadb-staging.fly.dev`
   - **Callback URL**: `https://kotadb-staging.fly.dev/auth/callback` (if using OAuth)
   - **Webhook URL**: `https://kotadb-staging.fly.dev/webhooks/github`
   - **Webhook secret**: Generate with `openssl rand -hex 32` and save this value

3. **Configure permissions**:
   - **Repository permissions**:
     - Contents: Read & Write
     - Metadata: Read-only
   - **Subscribe to events**:
     - `push`
     - `pull_request`
     - `repository`

4. **Save and note credentials**:
   - After creating, note the **App ID** (numeric, e.g., `123456`)
   - Scroll down to "Private keys" section
   - Click "Generate a private key" and download the PEM file
   - Save the PEM file securely (you'll need the contents later)

5. **Update `.env.develop`**:
   ```bash
   # In .env.develop, populate these values:
   GITHUB_APP_ID=123456
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
   GITHUB_WEBHOOK_SECRET=<your-generated-secret>
   ```

   **Note**: The private key must be on a single line with `\n` for newlines. To format:
   ```bash
   # Convert PEM file to single-line format
   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-private-key.pem
   ```

### Create Production GitHub App

Repeat the above steps with production-specific values:

1. **GitHub App name**: `KotaDB Production`
2. **Homepage URL**: `https://kotadb.fly.dev`
3. **Callback URL**: `https://kotadb.fly.dev/auth/callback`
4. **Webhook URL**: `https://kotadb.fly.dev/webhooks/github`
5. **Webhook secret**: Generate a **different** secret with `openssl rand -hex 32`
6. **Generate separate private key** (do NOT reuse preview key)
7. **Update `.env.production`** with production app credentials

**Security Note**: Use separate apps and secrets for each environment to prevent webhook event cross-contamination.

## Phase 2: Create Fly.io Staging App

The staging app (`kotadb-staging`) mirrors the production app configuration for testing before production deployment.

### Create Staging App

```bash
# Create new Fly.io app
flyctl apps create kotadb-staging --org personal

# Configure machine specs (match production)
flyctl scale vm shared-cpu-1x --memory 1024 --app kotadb-staging

# Set region (match production: iad = US East)
flyctl regions set iad --app kotadb-staging

# Verify configuration
flyctl config show --app kotadb-staging
```

### Configure Auto-Start/Stop (Optional)

To minimize costs, configure auto-stop for inactivity:

```bash
# Edit fly.toml for staging app (if deploying from code)
# Or configure via dashboard: fly.io/apps/kotadb-staging/settings
```

**Note**: You'll configure environment variables (secrets) in Phase 6 after gathering all credentials.

## Phase 3: Configure Supabase

Supabase provides the PostgreSQL database with Row Level Security (RLS) for multi-tenant isolation.

### Get Production Credentials

1. **Navigate to production project**:
   - Go to: https://supabase.com/dashboard/project/[your-project-id]

2. **Get API credentials**:
   - Settings → API
   - Copy **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - Copy **anon public** key (starts with `eyJ...`)
   - Copy **service_role** key (starts with `eyJ...`, keep secret)

3. **Get database connection string**:
   - Settings → Database
   - Scroll to "Connection string" section
   - Select **Session mode** (for pg-boss queue)
   - Copy connection string: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
   - Replace `[PASSWORD]` with your database password (Settings → Database → Database Password → Reset if needed)

4. **Update `.env.production`**:
   ```bash
   SUPABASE_URL=https://abcdefgh.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
   ```

### Get Preview Branch Credentials

1. **Navigate to preview branch**:
   - Supabase Dashboard → [Your Project] → Branches → [Preview Branch Name]

2. **Get API credentials** (same steps as production, but from preview branch)
3. **Update `.env.develop`** with preview branch credentials

**Migration Strategy**: Use Supabase CLI to sync schema between production and preview:
```bash
# Pull production schema
supabase db pull --linked

# Apply to preview branch
supabase db push --linked --branch [preview-branch-name]
```

## Phase 4: Configure Stripe

Stripe handles subscription billing with separate test and production modes.

### Configure Test Mode (Preview)

1. **Navigate to Stripe Dashboard (Test Mode)**:
   - Go to: https://dashboard.stripe.com/test
   - Ensure "Test mode" toggle is ON (top right)

2. **Create products and prices**:
   - Products → Create product
   - **Solo Tier**:
     - Name: "KotaDB Solo"
     - Pricing: Recurring, monthly (e.g., $9.99/month)
     - Save and copy **Price ID** (starts with `price_...`)
   - **Team Tier**:
     - Name: "KotaDB Team"
     - Pricing: Recurring, monthly (e.g., $29.99/month)
     - Save and copy **Price ID**

3. **Get API keys**:
   - Developers → API keys
   - Copy **Publishable key** (starts with `pk_test_...`)
   - Copy **Secret key** (starts with `sk_test_...`)

4. **Configure webhook**:
   - Developers → Webhooks → Add endpoint
   - **Endpoint URL**: `https://kotadb-staging.fly.dev/webhooks/stripe`
   - **Events to send**:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Click "Add endpoint"
   - Copy **Signing secret** (starts with `whsec_...`)

5. **Update `.env.develop`**:
   ```bash
   # Vercel section
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

   # Fly.io section
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_SOLO_PRICE_ID=price_...
   STRIPE_TEAM_PRICE_ID=price_...
   ```

### Configure Production Mode

Repeat the above steps in **production mode**:

1. **Switch to Live mode**: Toggle "Test mode" to OFF
2. **Create production products** (verify pricing before publishing)
3. **Get production API keys** (pk_live_, sk_live_)
4. **Configure production webhook** (`https://kotadb.fly.dev/webhooks/stripe`)
5. **Update `.env.production`** with production credentials

**Critical**: Double-check all pricing before going live. Production charges are real.

### Test Webhook Endpoint

Use Stripe CLI to verify webhook connectivity:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Test staging endpoint
stripe listen --forward-to https://kotadb-staging.fly.dev/webhooks/stripe

# Trigger test event
stripe trigger checkout.session.completed
```

## Phase 5: Configure Vercel Environments

Vercel hosts the Next.js web application with separate Preview and Production environments.

### Install Vercel CLI

```bash
# Install globally
npm install -g vercel

# Login to Vercel
vercel login

# Link project (run from web/ directory)
cd web
vercel link
```

### Configure Preview Environment

Set environment variables for Vercel Preview (deployed from `develop` branch):

```bash
# From web/ directory
cd web

# Set preview environment variables
vercel env add NEXT_PUBLIC_API_URL preview
# When prompted, enter: https://kotadb-staging.fly.dev

vercel env add NEXT_PUBLIC_SUPABASE_URL preview
# Enter Supabase preview branch URL

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
# Enter Supabase preview branch anon key

vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY preview
# Enter Stripe test mode publishable key (pk_test_...)

# Optional: Server-side API key
vercel env add API_KEY preview
# Leave empty or enter KotaDB API key for server-side calls
```

### Configure Production Environment

Set environment variables for Vercel Production (deployed from `main` branch):

```bash
# Set production environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://kotadb.fly.dev

vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Enter Supabase production URL

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Enter Supabase production anon key

vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
# Enter Stripe live mode publishable key (pk_live_...)

vercel env add API_KEY production
# Leave empty or enter production KotaDB API key
```

### Verify Configuration

```bash
# List all environment variables
vercel env ls

# Verify preview variables
vercel env pull .env.vercel.preview --environment=preview

# Verify production variables
vercel env pull .env.vercel.production --environment=production
```

## Phase 6: Configure Fly.io Secrets

Fly.io secrets are encrypted environment variables for the backend API.

### Configure Staging Secrets

Set all environment variables for `kotadb-staging` app:

```bash
# Server configuration
flyctl secrets set PORT=3000 --app kotadb-staging
flyctl secrets set KOTA_GIT_BASE_URL=https://github.com --app kotadb-staging

# Supabase (from .env.develop)
flyctl secrets set SUPABASE_URL=<preview-url> --app kotadb-staging
flyctl secrets set SUPABASE_ANON_KEY=<preview-anon-key> --app kotadb-staging
flyctl secrets set SUPABASE_SERVICE_KEY=<preview-service-key> --app kotadb-staging
flyctl secrets set SUPABASE_DB_URL=<preview-db-url> --app kotadb-staging

# GitHub App (from .env.develop)
flyctl secrets set GITHUB_APP_ID=<preview-app-id> --app kotadb-staging
flyctl secrets set GITHUB_APP_PRIVATE_KEY=<preview-private-key> --app kotadb-staging
flyctl secrets set GITHUB_WEBHOOK_SECRET=<preview-webhook-secret> --app kotadb-staging

# Stripe test mode (from .env.develop)
flyctl secrets set STRIPE_SECRET_KEY=<test-secret-key> --app kotadb-staging
flyctl secrets set STRIPE_WEBHOOK_SECRET=<test-webhook-secret> --app kotadb-staging
flyctl secrets set STRIPE_SOLO_PRICE_ID=<test-solo-price-id> --app kotadb-staging
flyctl secrets set STRIPE_TEAM_PRICE_ID=<test-team-price-id> --app kotadb-staging
```

**Tip**: Use a script to batch-set secrets:

```bash
#!/bin/bash
# set-staging-secrets.sh

source .env.develop

flyctl secrets set \
  PORT=3000 \
  KOTA_GIT_BASE_URL=https://github.com \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
  SUPABASE_DB_URL="$SUPABASE_DB_URL" \
  GITHUB_APP_ID="$GITHUB_APP_ID" \
  GITHUB_APP_PRIVATE_KEY="$GITHUB_APP_PRIVATE_KEY" \
  GITHUB_WEBHOOK_SECRET="$GITHUB_WEBHOOK_SECRET" \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  STRIPE_SOLO_PRICE_ID="$STRIPE_SOLO_PRICE_ID" \
  STRIPE_TEAM_PRICE_ID="$STRIPE_TEAM_PRICE_ID" \
  --app kotadb-staging
```

### Configure Production Secrets

Repeat for `kotadb` production app using values from `.env.production`:

```bash
# Use same commands as staging, but with --app kotadb and production values
flyctl secrets set SUPABASE_URL=<production-url> --app kotadb
# ... (continue for all secrets)
```

### Verify Secrets

```bash
# List secret names (values are encrypted and not shown)
flyctl secrets list --app kotadb-staging
flyctl secrets list --app kotadb

# Deploy to apply secrets (if app is already running)
flyctl deploy --app kotadb-staging
```

## Validation and Testing

### Validate Environment Configuration

**1. Verify Gitignore**:
```bash
# Ensure environment files are not tracked
git status | grep -E "\.env\.(develop|production)"
# Should return no results (files are ignored)
```

**2. Verify Vercel Deployment**:
```bash
# Trigger preview deployment
cd web
git checkout develop
git push origin develop
# Check Vercel dashboard for deployment status

# Verify environment variables loaded
# Open preview URL and check browser console for API_URL
```

**3. Verify Fly.io Deployment**:
```bash
# Check staging app health
flyctl status --app kotadb-staging

# View recent logs
flyctl logs --app kotadb-staging

# Test health endpoint
curl https://kotadb-staging.fly.dev/health
# Expected: {"status":"ok","timestamp":"..."}
```

**4. Verify Supabase Connection**:
```bash
# Test database connectivity (from staging app logs)
flyctl logs --app kotadb-staging | grep -i supabase
# Look for successful connection messages
```

**5. Verify GitHub Webhook**:
```bash
# Trigger webhook from GitHub App settings
# GitHub → Settings → Developer settings → GitHub Apps → [Your App] → Advanced → Recent Deliveries
# Click "Redeliver" on any recent webhook
# Check Fly.io logs for webhook receipt
```

**6. Verify Stripe Webhook**:
```bash
# Use Stripe CLI to send test event
stripe trigger checkout.session.completed --forward-to https://kotadb-staging.fly.dev/webhooks/stripe

# Check Fly.io logs for webhook processing
flyctl logs --app kotadb-staging | grep -i stripe
```

### End-to-End Testing

**Preview Environment**:
1. Open Vercel preview URL
2. Sign in with Supabase (preview branch)
3. Generate API key via web UI
4. Index a test repository
5. Verify repository appears in dashboard
6. Perform search query
7. Verify rate limit headers in network tab

**Production Environment**:
1. Repeat above steps with production URLs
2. Test Stripe checkout flow (use test card: `4242 4242 4242 4242`)
3. Verify subscription creation in Stripe dashboard
4. Verify tier upgrade reflected in KotaDB dashboard

## Troubleshooting

### Common Issues

**Issue**: Vercel deployment fails with "Missing environment variable"
- **Solution**: Verify all `NEXT_PUBLIC_*` variables are set for the correct environment (preview/production)
- **Check**: `vercel env ls` to list all configured variables

**Issue**: Fly.io app crashes with "Supabase connection failed"
- **Solution**: Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct
- **Check**: `flyctl secrets list --app kotadb-staging` and compare with Supabase dashboard

**Issue**: GitHub webhook returns 401 Unauthorized
- **Solution**: Verify `GITHUB_WEBHOOK_SECRET` matches the secret configured in GitHub App
- **Check**: `flyctl logs --app kotadb-staging | grep webhook` for error details

**Issue**: Stripe webhook returns 400 Bad Request
- **Solution**: Verify webhook endpoint URL is correct and reachable
- **Check**: Use Stripe CLI `stripe listen --forward-to [URL]` to test connectivity

**Issue**: CORS errors when frontend calls backend API
- **Solution**: Add CORS middleware to backend (see issue #186 for implementation)
- **Check**: Verify `NEXT_PUBLIC_API_URL` matches the backend URL

### Debugging Commands

```bash
# View Fly.io logs (staging)
flyctl logs --app kotadb-staging

# View Fly.io logs (production)
flyctl logs --app kotadb

# Check Fly.io app status
flyctl status --app kotadb-staging

# Check Vercel deployment logs
vercel logs [deployment-url]

# Test Supabase connection locally
psql [SUPABASE_DB_URL]

# Verify GitHub App permissions
gh api /app --jq '.permissions'
```

### Getting Help

- **Vercel**: https://vercel.com/docs
- **Fly.io**: https://fly.io/docs
- **Supabase**: https://supabase.com/docs
- **Stripe**: https://stripe.com/docs
- **GitHub Apps**: https://docs.github.com/en/apps

### Security Best Practices

1. **Rotate secrets quarterly**:
   - GitHub webhook secrets
   - Stripe webhook secrets
   - Supabase service role keys (when team members leave)

2. **Never expose secrets**:
   - Use `.gitignore` for environment files
   - Use Vercel/Fly.io secret management (not public env vars)
   - Store populated `.env.*` files in password manager, not git

3. **Monitor webhook deliveries**:
   - Check GitHub webhook delivery logs weekly
   - Check Stripe webhook logs for failures
   - Set up alerts for repeated webhook failures

4. **Use environment isolation**:
   - Separate GitHub Apps per environment
   - Separate Stripe test/live modes
   - Separate Supabase projects/branches

---

**Next Steps**: After completing this guide, your environments should be fully configured. Proceed with deploying your application to staging first, then production after validation.
