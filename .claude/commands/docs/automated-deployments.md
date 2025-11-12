# Automated Deployments via GitHub Apps

KotaDB uses GitHub App integrations for automated database migrations and application deployments. This document describes how these integrations work and what happens automatically on merges to `develop` and `main`.

## Overview

Two GitHub Apps are installed on the repository:

1. **Supabase GitHub App** - Automatically applies database migrations
2. **Fly.io GitHub App** - Automatically deploys the backend API

These apps monitor the repository and trigger on pushes to branches, providing status checks via the GitHub Checks API.

## Supabase GitHub App

### What It Does

The Supabase GitHub App automatically manages database migrations for staging and production environments:

- **Preview Branches**: Creates ephemeral database instances for PRs
- **Migration Application**: Applies migrations from `app/supabase/migrations/` sequentially by timestamp
- **Status Reporting**: Reports success/failure via "Supabase Preview" check

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ Developer pushes to branch                                   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ GitHub Actions CI validates migration sync                  │
│ - Runs: bun run test:validate-migrations                    │
│ - Ensures app/src/db/migrations/ ↔ app/supabase/migrations/ │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase GitHub App triggers                                │
│ - Detects changes to app/supabase/migrations/*.sql          │
│ - Creates/updates Preview Branch database                   │
│ - Applies migrations sequentially by timestamp               │
│ - Reports status via "Supabase Preview" check               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ On merge to develop/main                                    │
│ - Supabase applies migrations to staging/production         │
│ - Automatic, no manual `supabase db push` needed            │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

**Project Linkage**: `app/supabase/project-ref`
- Contains the Supabase project reference for automatic linking
- Gitignored (see `.gitignore`: `supabase/`)

**Migration Path**: `app/supabase/migrations/`
- Configured in `app/supabase/config.toml`: `[db.migrations].enabled = true`
- Must stay in sync with `app/src/db/migrations/` (enforced by CI)

**Migration Naming**: `YYYYMMDDHHMMSS_description.sql`
- Timestamp format ensures sequential application
- Generate timestamp: `date -u +%Y%m%d%H%M%S`

### Status Check Behavior

The "Supabase Preview" check appears on PRs and reports:

- **SUCCESS**: Migrations applied successfully to preview branch
- **FAILURE**: Migration conflict or SQL error detected
- **SKIPPED**: No migration changes detected, or merge completed before check

### Example: Migration Conflict Detection

From PR #427 (develop → main merge):
- Migration added: `20251110220855_ensure_api_key_revocation_idempotent.sql`
- Supabase Preview check **FAILED**: Detected column already exists
- Prevented breaking production deployment

### Manual Override (Emergency Only)

For emergency hotfixes outside the git flow:

```bash
# Link to remote project
cd app
supabase link --project-ref <project-ref>

# Apply migrations manually
supabase db push
```

**Note**: This should only be used for emergency fixes. Normal workflow relies on GitHub App automation.

## Fly.io GitHub App

### What It Does

The Fly.io GitHub App automatically deploys the backend API to staging and production:

- **Monitors**: Pushes to branches (especially `develop` and `main`)
- **Builds**: Docker image from `app/Dockerfile`
- **Deploys**: To `kotadb-staging` (develop) or `kotadb` (main)
- **Reports**: Status via "Fly.io" check with deployment URL

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│ Developer merges PR to develop/main                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Fly.io GitHub App triggers                                  │
│ - Detects push to develop/main branch                       │
│ - Builds Docker image from app/Dockerfile                   │
│ - Pushes to Fly.io registry                                 │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Deployment to Fly.io                                        │
│ - develop → kotadb-staging.fly.dev                          │
│ - main → kotadb.fly.dev                                      │
│ - Health checks on /health endpoint                         │
│ - Traffic routed to healthy machines                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Status reported via "Fly.io" check                          │
│ - Links to deployment URL on success                        │
│ - Shows build logs on failure                               │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

**App Configuration**: `app/fly.toml`
- Defines `app = "kotadb"` or `app = "kotadb-staging"`
- Specifies regions, machine sizes, health check endpoints

**Dockerfile**: `app/Dockerfile`
- Multi-stage build with Bun runtime
- Copies `shared/` directory for shared types
- Exposes port 3000 for API

### Status Check Behavior

The "Fly.io" check appears on PRs and reports:

- **SUCCESS**: Deployment completed, includes deployment URL
- **FAILURE**: Build or deployment error, includes logs
- **IN_PROGRESS**: Build or deployment in progress

### Example: Successful Deployment

From PR #427 (develop → main merge):
- Fly.io check **SUCCESS** in 2 minutes
- Deployment URL: `https://fly.io/apps/kotadb-staging/deployments/531164`
- Health check passed, traffic routed to new machines

### Manual Deployment (Emergency Only)

For emergency deployments outside the git flow:

```bash
cd app
flyctl deploy --app kotadb-staging  # or kotadb for production
```

**Note**: This bypasses CI checks and should only be used for critical hotfixes.

## Deployment Flow Summary

### For PRs to develop/main

1. **Developer pushes** to feature branch
2. **GitHub Actions CI** runs (lint, typecheck, test, migration sync validation)
3. **Supabase Preview** creates ephemeral database and applies migrations
4. **Review and merge** PR if all checks pass

### On merge to develop

1. **Supabase GitHub App** applies migrations to staging database
2. **Fly.io GitHub App** builds and deploys to `kotadb-staging.fly.dev`
3. **Status checks** report success/failure
4. **Manual verification** of staging environment (optional)

### On merge to main

1. **Supabase GitHub App** applies migrations to production database
2. **Fly.io GitHub App** builds and deploys to `kotadb.fly.dev`
3. **Status checks** report success/failure
4. **Monitor** production logs and metrics

## Troubleshooting

### Supabase Preview Check Fails

**Symptoms**: "Supabase Preview" check shows FAILURE status

**Common Causes**:
- Migration conflict (column/table already exists)
- SQL syntax error in migration file
- Migration timestamp drift between environments

**Resolution**:
1. Check PR comments for Supabase error message
2. Make migration idempotent with `IF NOT EXISTS` clauses
3. Fix SQL syntax errors
4. Push new commit to re-trigger check

### Fly.io Deployment Fails

**Symptoms**: "Fly.io" check shows FAILURE status

**Common Causes**:
- Docker build errors (missing dependencies, syntax errors)
- Health check failures (app crashes on startup)
- Module resolution errors (shared types, path aliases)

**Resolution**:
1. Check deployment logs: Click "Details" on Fly.io check
2. Test Docker build locally: `cd app && docker build -t test .`
3. Verify health endpoint: `curl https://kotadb-staging.fly.dev/health`
4. Push fix and re-trigger deployment

### Migration Sync Validation Fails

**Symptoms**: CI check "Validate migration sync" fails

**Common Causes**:
- Migrations added to `app/src/db/migrations/` but not copied to `app/supabase/migrations/`
- File content mismatch between the two locations

**Resolution**:
```bash
# Copy migrations from source to Supabase directory
cp app/src/db/migrations/*.sql app/supabase/migrations/

# Verify sync
cd app && bun run test:validate-migrations
```

## GitHub App Permissions

Both apps have the following permissions on the repository:

**Supabase GitHub App**:
- **Contents**: Read (to detect migration changes)
- **Checks**: Write (to report status)
- **Pull Requests**: Read (to create preview branches)

**Fly.io GitHub App**:
- **Contents**: Read (to detect code changes)
- **Checks**: Write (to report deployment status)
- **Deployments**: Write (to trigger deployments)

These permissions are managed via GitHub's App installation settings and cannot be modified in the repository.

## Monitoring Deployments

### View Deployment History

**Supabase**:
```bash
# View applied migrations
cd app
supabase link --project-ref <project-ref>
supabase db diff
```

**Fly.io**:
```bash
# View deployment history
flyctl releases --app kotadb-staging

# View deployment logs
flyctl logs --app kotadb-staging
```

### Check Deployment Status

**Via GitHub UI**:
1. Navigate to PR or commit
2. Scroll to status checks section
3. Click "Details" on Supabase Preview or Fly.io checks

**Via CLI**:
```bash
# Check recent PR status
gh pr view 427 --json statusCheckRollup

# Check specific check status
gh pr view 427 --json statusCheckRollup | jq '.statusCheckRollup[] | select(.name == "Fly.io")'
```

## Related Documentation

- [CI Configuration](./../ci/ci-configuration.md) - GitHub Actions workflows
- [Deployment Guide](./../../docs/deployment.md) - Manual deployment procedures
- [Migration Sync](./../../CLAUDE.md#migration-sync-requirement) - Migration sync requirements
- [Database Schema](./database.md) - Database tables and RLS policies
