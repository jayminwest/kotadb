# Implementation Plan: Environment Configuration for Preview/Staging and Production

**ADW ID**: env-setup-preview-production
**Created**: 2025-10-24T17:06:39Z
**Worktree**: N/A (will be executed in main working directory)

## Objective

Create comprehensive root-level environment configuration files (`.env.develop` and `.env.production`) to manage multi-environment deployments across Vercel (web frontend), Fly.io (backend API), Supabase (database), GitHub Apps (OAuth/webhooks), and Stripe (billing). This establishes a single source of truth for environment-specific configuration values organized by platform, with preparation for future CI/CD automation.

## Issue Relationships

- **Related To**: #186 (Deployment documentation for Next.js web app) - Provides context on deployment architecture
- **Related To**: #279 (Fly.io production stability) - Production environment configuration may help diagnose issues
- **Related To**: #271 (GitHub OAuth authentication) - GitHub App configuration is part of this setup

## Current State

### Existing Environment Files
- **Root `.env.sample`**: Template for local development (Supabase, ADW automation config)
- **`app/.env.sample`**: Backend-specific template (Supabase, GitHub App, Stripe, webhook secrets)
- **`web/.env.sample`**: Frontend-specific template (API URL, Supabase, Stripe publishable key)
- **`automation/adws/.env.sample`**: ADW automation secrets (Anthropic API, GitHub PAT, MCP server)

### Environment Variables Currently Used

**Backend (`app/src/`):**
- `PORT`, `KOTA_GIT_BASE_URL`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`
- `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`

**Frontend (`web/`):**
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `API_KEY` (optional server-side)

### Deployment Infrastructure
1. **Vercel**: Hosts web frontend with Preview (develop branch) + Production (main branch) environments
2. **Fly.io**: Currently hosts production backend (`kotadb` app), needs `kotadb-staging` for preview
3. **Supabase**: Production database + preview branch already created
4. **GitHub Apps**: Not yet created (need separate apps for prod and preview)
5. **Stripe**: Test mode for preview, production mode for production

## Proposed Changes

### 1. Root-Level `.env.develop` File
- **Action**: create
- **Location**: `.env.develop` (repository root)
- **Rationale**: Centralized configuration for all preview/staging environment variables
- **Details**:
  - Organized by platform: Vercel, Fly.io, Supabase, GitHub, Stripe
  - Empty values with inline instructions and comments
  - Include Stripe test mode endpoints and price IDs
  - Include GitHub App webhook endpoint paths
  - Include Vercel CLI setup instructions in comments
  - Document Fly.io secrets commands for staging app

### 2. Root-Level `.env.production` File
- **Action**: create
- **Location**: `.env.production` (repository root)
- **Rationale**: Centralized configuration for production environment variables
- **Details**:
  - Same structure as `.env.develop` but with production-specific comments
  - Stripe production mode configuration
  - Production GitHub App configuration
  - Production Supabase instance
  - Security warnings for sensitive values

### 3. Update `.gitignore`
- **Action**: modify
- **Location**: `.gitignore`
- **Rationale**: Prevent accidental commit of environment configuration files
- **Details**:
  - Add `.env.develop` to gitignore
  - Add `.env.production` to gitignore
  - Verify `.env` and `.env.local` are already ignored

### 4. Create Deployment Setup Guide
- **Action**: create
- **Location**: `docs/deployment-setup-guide.md`
- **Rationale**: Step-by-step instructions for using the environment files
- **Details**:
  - Prerequisites section (GitHub Apps, Stripe accounts, Supabase projects)
  - Manual setup steps for GitHub Apps creation
  - Fly.io staging app creation instructions
  - Vercel CLI environment variable configuration
  - Fly.io secrets management commands
  - Testing and validation steps

## Testing Strategy

### Validation Steps
1. **File Creation Validation**:
   - Verify `.env.develop` and `.env.production` exist at repository root
   - Confirm `.gitignore` excludes new files
   - Verify file structure matches proposed format

2. **Documentation Completeness**:
   - Review deployment setup guide for accuracy
   - Verify all environment variables from existing `.env.sample` files are covered
   - Check that platform-specific instructions are clear

3. **Local Testing** (manual, post-implementation):
   - Copy `.env.develop` to `.env.develop.local` and populate with test values
   - Attempt Vercel CLI deployment with environment variables
   - Attempt Fly.io secrets configuration with staging app
   - Verify no syntax errors in environment files

### Automated Validation
- Run `git status` to ensure new env files are gitignored
- Verify no hardcoded secrets in created files (all values should be empty or placeholders)

## Rollback Plan

Since this is a creation-only task with no code changes:
1. Delete `.env.develop` and `.env.production` files
2. Revert `.gitignore` changes
3. Remove `docs/deployment-setup-guide.md`
4. No database migrations or infrastructure changes to rollback

## Dependencies

### External Prerequisites (Manual Setup Required)
1. **GitHub Apps**: User must create two apps manually:
   - KotaDB Production (for main Supabase + Fly.io production)
   - KotaDB Preview (for Supabase preview branch + Fly.io staging)
   - Each requires: App ID, private key (PEM), webhook secret

2. **Fly.io Staging App**: User must create `kotadb-staging` app
   - Use `fly apps create kotadb-staging --org personal`
   - Configure same specs as production (1 CPU, 1024 MB, region `iad`)

3. **Stripe Configuration**: User must configure test vs production mode
   - Test mode: webhooks for staging, test price IDs
   - Production mode: webhooks for production, production price IDs

4. **Supabase Preview Branch**: Already exists per user description
   - Need connection URL and keys from Supabase dashboard

### No New npm Packages Required

### No Environment Variable Changes to Existing Apps
(Configuration files are templates only, not actively loaded by apps)

## Implementation Order

### Phase 1: Create Base Environment Files
1. Create `.env.develop` with all platform sections and placeholder values
2. Create `.env.production` with same structure, production-specific notes
3. Update `.gitignore` to exclude both files

### Phase 2: Create Documentation
1. Create `docs/deployment-setup-guide.md` with step-by-step instructions
2. Document GitHub App creation process
3. Document Fly.io staging app creation
4. Document Vercel CLI environment configuration
5. Document Fly.io secrets management

### Phase 3: Validation and Testing
1. Review all files for completeness and accuracy
2. Verify gitignore exclusion working
3. Cross-reference with existing `.env.sample` files to ensure no variables missed
4. Verify deployment guide clarity

## Validation Commands

**Level 1: Basic validation**
```bash
# Verify files created
ls -la .env.develop .env.production docs/deployment-setup-guide.md

# Verify gitignore working
git status | grep -E "\.env\.(develop|production)"  # Should return no results

# Check for accidental secret commits
grep -E "(sk_live|pk_live|-----BEGIN)" .env.develop .env.production  # Should return no real secrets
```

**Level 2: Documentation review**
```bash
# Verify all environment variables documented
cat .env.develop | grep -E "^[A-Z_]+=" | wc -l  # Should match expected variable count

# Check for consistent formatting
grep -E "^# ={50,}" .env.develop  # Should show section headers

# Verify deployment guide completeness
grep -E "^##" docs/deployment-setup-guide.md  # Should show all major sections
```

**Level 3: Integration readiness**
- Manually test Vercel CLI environment variable setup with `.env.develop` values
- Manually test Fly.io secrets commands from deployment guide
- Verify webhook endpoint paths are correct for each environment

## File Structure Preview

### `.env.develop` Structure
```
# =============================================================================
# PREVIEW/STAGING ENVIRONMENT CONFIGURATION
# =============================================================================
# This file contains environment variables for preview/staging deployments.
# Platform targets: Vercel Preview, Fly.io staging (kotadb-staging), Supabase preview branch
#
# IMPORTANT: DO NOT COMMIT THIS FILE WITH REAL VALUES
# Use this as a template and populate with actual secrets from respective platforms.

# =============================================================================
# VERCEL (web/) - Preview Environment
# =============================================================================
# Set these via: vercel env add <NAME> preview
# Or via Vercel Dashboard: Project Settings → Environment Variables → Preview

NEXT_PUBLIC_API_URL=https://kotadb-staging.fly.dev
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=  # Stripe test mode publishable key (pk_test_...)
API_KEY=  # Optional: KotaDB API key for server-side calls

# =============================================================================
# FLY.IO (app/) - Staging Environment (kotadb-staging)
# =============================================================================
# Set these via: flyctl secrets set <NAME>=<VALUE> --app kotadb-staging
# Create app first: flyctl apps create kotadb-staging --org personal

PORT=3000
KOTA_GIT_BASE_URL=https://github.com

SUPABASE_URL=  # Supabase preview branch URL
SUPABASE_ANON_KEY=  # Supabase preview branch anon key
SUPABASE_SERVICE_KEY=  # Supabase preview branch service role key
SUPABASE_DB_URL=  # postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

GITHUB_APP_ID=  # GitHub App ID for KotaDB Preview app
GITHUB_APP_PRIVATE_KEY=  # PEM format: "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=  # Generate with: openssl rand -hex 32
# Webhook URL: https://kotadb-staging.fly.dev/webhooks/github

STRIPE_SECRET_KEY=  # Stripe test mode secret key (sk_test_...)
STRIPE_WEBHOOK_SECRET=  # Stripe test mode webhook secret (whsec_...)
STRIPE_SOLO_PRICE_ID=  # Stripe test mode Solo tier price ID
STRIPE_TEAM_PRICE_ID=  # Stripe test mode Team tier price ID
# Webhook URL: https://kotadb-staging.fly.dev/webhooks/stripe

# =============================================================================
# SUPABASE - Preview Branch Configuration
# =============================================================================
# Get these from: Supabase Dashboard → Preview Branch → Project Settings → API

# (Values duplicated above for clarity - use same values in Vercel and Fly.io sections)

# =============================================================================
# GITHUB APP - Preview Configuration
# =============================================================================
# Create at: https://github.com/settings/apps/new
# App Name: KotaDB Preview
# Homepage URL: https://kotadb-staging.fly.dev
# Webhook URL: https://kotadb-staging.fly.dev/webhooks/github
# Permissions: Repository (Read & Write), Contents (Read-only)
# Events: push, pull_request

# (Values set above in Fly.io section)

# =============================================================================
# STRIPE - Test Mode Configuration
# =============================================================================
# Dashboard: https://dashboard.stripe.com/test
# Create products and prices for Solo and Team tiers
# Configure webhook endpoint: https://kotadb-staging.fly.dev/webhooks/stripe
# Events: checkout.session.completed, customer.subscription.*

# (Values set above in Fly.io section)
```

### `.env.production` Structure
(Same structure as `.env.develop`, but with production URLs and production mode notes)

### `docs/deployment-setup-guide.md` Structure
```markdown
# Deployment Setup Guide

## Prerequisites
- Supabase projects (production + preview branch)
- Stripe account (test mode + production mode)
- Fly.io account with CLI installed
- Vercel account with CLI installed
- GitHub account with admin access for creating apps

## Phase 1: Create GitHub Apps
### Production App (KotaDB Production)
[Step-by-step instructions]

### Preview App (KotaDB Preview)
[Step-by-step instructions]

## Phase 2: Create Fly.io Staging App
[Commands and configuration]

## Phase 3: Configure Vercel Environments
[Vercel CLI commands]

## Phase 4: Configure Fly.io Secrets
[Fly.io secrets commands]

## Phase 5: Stripe Webhook Configuration
[Stripe dashboard instructions]

## Validation
[Testing steps]
```

## Notes

- **User Decisions Confirmed**:
  - Two separate GitHub Apps (preview + production) for clear separation of concerns
  - Fly.io staging app named `kotadb-staging`
  - Stripe test mode for preview, include webhook endpoint paths
  - Leave secrets empty with instructions (no placeholder values)
  - Prioritize Vercel CLI over dashboard for environment variable setup
  - Prepare for CI/CD auto-deployment but don't implement yet (out of scope)

- **Security Considerations**:
  - All environment files are gitignored to prevent accidental secret exposure
  - Deployment guide emphasizes secret rotation best practices
  - PEM format private keys require proper escaping in environment variables
  - Webhook secrets should be cryptographically random (minimum 32 bytes)

- **Future Work** (not in scope for this plan):
  - CI/CD workflows for auto-deployment (`.github/workflows/deploy-preview.yml`, `deploy-production.yml`)
  - Automated secret rotation scripts
  - Environment variable validation scripts
  - Terraform/IaC for infrastructure provisioning
