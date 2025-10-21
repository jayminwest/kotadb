# Epic 9: CI/CD & Deployment

> **Reference Document**: This epic was from original planning. See [ROADMAP.md](./ROADMAP.md) for current priorities and [CURRENT_STATE.md](./CURRENT_STATE.md) for gap analysis.

**Status**: 🟡 40% Complete (CI Working, Deployment Missing)
**Priority**: High (Launch blocker)
**Estimated Duration**: 1-2 weeks
**Actual Progress**: GitHub Actions CI working, Docker Compose for local dev. Remaining: Fly.io deployment, secrets management, automated migrations.

## Overview

Set up Fly.io deployment, CI/CD pipeline, and secrets management. Enable automated deployment from `develop` (staging) and `main` (production) branches.

## Issues

### Issue #31: Create Fly.io configuration

**Priority**: P1 (High)
**Depends on**: None (can start early)
**Blocks**: #32 (CI/CD pipeline)

#### Description
Configure Fly.io apps for staging and production environments. Create separate `fly.toml` configs with environment-specific settings.

#### Acceptance Criteria
- [ ] Two Fly.io apps created: `kotadb-staging`, `kotadb-prod`
- [ ] Separate `fly.toml` configs: `fly.staging.toml`, `fly.prod.toml`
- [ ] Health check integration (`/health` endpoint)
- [ ] Resource limits configured (CPU, memory, disk)
- [ ] Auto-scaling rules (min/max instances)
- [ ] Persistent volumes for temporary workspaces (optional)
- [ ] Environment variables documented

#### Technical Notes
- Region: Choose closest to Supabase region (likely `iad` or `lhr`)
- Image: Build from Dockerfile
- Port: 3000 (matches Bun server)
- Machine size: `shared-cpu-1x` for staging, `shared-cpu-2x` for prod

#### Files to Create
- `fly.staging.toml` - Staging configuration
- `fly.prod.toml` - Production configuration
- `docs/deployment.md` - Deployment guide

#### Example fly.staging.toml
```toml
app = "kotadb-staging"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "staging"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[checks]
  [checks.health]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    path = "/health"
    timeout = "5s"
    type = "http"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 1024
```

#### Fly.io App Creation
```bash
# Create staging app
flyctl apps create kotadb-staging

# Create production app
flyctl apps create kotadb-prod

# Set secrets (see #33)
flyctl secrets set SUPABASE_URL=... --app kotadb-staging
```

---

### Issue #32: Build CI/CD pipeline

**Priority**: P0 (Critical)
**Depends on**: #31 (Fly.io config), #3 (migrations), #34-38 (tests)
**Blocks**: Automated deployment

#### Description
Create GitHub Actions workflow for validation, testing, migration, and deployment.

#### Acceptance Criteria
- [ ] Workflow triggers on push to `feat/*`, `develop`, `main`
- [ ] Validation stage: lint, typecheck, test, build (all branches)
- [ ] Migration stage: apply migrations (develop, main only)
- [ ] Deployment stage: deploy to Fly.io (develop, main only)
- [ ] Branch routing:
  - `develop` → `kotadb-staging`
  - `main` → `kotadb-prod`
- [ ] Rollback on deployment failure
- [ ] Manual approval for production migrations (optional)

#### Technical Notes
- Use `flyctl` GitHub Action for deployment
- Store Fly.io API token in GitHub Secrets
- Run migrations before deployment
- Deploy only if tests pass

#### Files to Create
- `.github/workflows/ci.yml` - Main CI/CD workflow
- `.github/workflows/rollback.yml` - Manual rollback workflow

#### Example Workflow
```yaml
name: CI/CD

on:
  push:
    branches:
      - feat/**
      - develop
      - main

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
      - run: bun run build

  migrate:
    runs-on: ubuntu-latest
    needs: validate
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - name: Run migrations (staging)
        if: github.ref == 'refs/heads/develop'
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL_STAGING }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY_STAGING }}
        run: bun run migrate

      - name: Run migrations (prod)
        if: github.ref == 'refs/heads/main'
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL_PROD }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY_PROD }}
        run: bun run migrate

  deploy:
    runs-on: ubuntu-latest
    needs: migrate
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to staging
        if: github.ref == 'refs/heads/develop'
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: flyctl deploy --config fly.staging.toml --remote-only

      - name: Deploy to production
        if: github.ref == 'refs/heads/main'
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
        run: flyctl deploy --config fly.prod.toml --remote-only

      - name: Verify deployment
        run: |
          if [ "${{ github.ref }}" == "refs/heads/develop" ]; then
            curl -f https://kotadb-staging.fly.dev/health || exit 1
          else
            curl -f https://kotadb-prod.fly.dev/health || exit 1
          fi
```

---

### Issue #33: Create secrets management scripts

**Priority**: P2 (Medium)
**Depends on**: #31 (Fly.io apps exist)
**Blocks**: Production deployment

#### Description
Build scripts to sync secrets from local SSOT files to Fly.io and Supabase.

#### Acceptance Criteria
- [ ] `scripts/sync-secrets-staging.sh` syncs staging secrets
- [ ] `scripts/sync-secrets-prod.sh` syncs production secrets
- [ ] Scripts push to both Fly.io and Supabase (if needed)
- [ ] Documentation for secret rotation
- [ ] Template files for `.env.staging.secrets`, `.env.prod.secrets`
- [ ] Scripts validate required secrets before pushing

#### Technical Notes
- Never commit actual secrets to git
- Store templates in `.env.sample.staging`, `.env.sample.prod`
- Use `flyctl secrets import` for bulk updates
- Validate secrets format before pushing

#### Files to Create
- `scripts/sync-secrets-staging.sh` - Staging secret sync
- `scripts/sync-secrets-prod.sh` - Production secret sync
- `.env.sample.staging` - Staging secret template
- `.env.sample.prod` - Production secret template
- `docs/secrets.md` - Secrets management guide

#### Example Script
```bash
#!/bin/bash
# scripts/sync-secrets-staging.sh

set -e

SECRETS_FILE=".env.staging.secrets"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: $SECRETS_FILE not found"
  exit 1
fi

# Validate required secrets
required_secrets=(
  "SUPABASE_URL"
  "SUPABASE_SERVICE_KEY"
  "GITHUB_APP_ID"
  "GITHUB_APP_PRIVATE_KEY"
  "GITHUB_WEBHOOK_SECRET"
)

for secret in "${required_secrets[@]}"; do
  if ! grep -q "^$secret=" "$SECRETS_FILE"; then
    echo "Error: Missing required secret: $secret"
    exit 1
  fi
done

# Push to Fly.io
echo "Syncing secrets to Fly.io (kotadb-staging)..."
flyctl secrets import --app kotadb-staging < "$SECRETS_FILE"

echo "Secrets synced successfully!"
```

---

## Success Criteria

- [ ] Fly.io apps are created and configured
- [ ] CI/CD pipeline runs on all branches
- [ ] Tests gate all merges
- [ ] Migrations apply automatically before deployment
- [ ] Deployments succeed to staging and production
- [ ] Secrets are manageable via scripts
- [ ] Rollback procedure is documented and tested

## Dependencies for Other Epics

This epic depends on:
- Epic 1 (migrations)
- Epic 10 (tests must pass)
- All other epics (everything must work for deployment)

This epic enables:
- Automated deployments
- Continuous delivery
- Staging environment testing
