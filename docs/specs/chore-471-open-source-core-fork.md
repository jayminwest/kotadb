# Chore Plan: Open Source Core Codebase Fork

## Context

KotaDB currently has zero active users but generates consulting leads through YouTube content. This chore creates a public fork of KotaDB core functionality (`app/`, `automation/`, `shared/`) on @jayminwest's personal GitHub while keeping the web application and business logic private in kotadb/kotadb. The public fork will:

- Provide real-world code examples for YouTube content and client discussions
- Showcase production-quality LLM/MCP implementation expertise
- Enable community contributions to core indexing/search/automation infrastructure
- Preserve ability to monetize SaaS later by keeping billing/frontend private

**Business Context**: The public repository serves as a consulting portfolio demonstrator. The single source of truth remains `kotadb/kotadb` (private), with automated sync to `jayminwest/kotadb` (public fork) via GitHub Actions. Both `develop` and `main` branches are synced to preserve the git flow in the public repository.

**Billing Code Strategy**: Option B - Feature Flag Approach. Stripe integration code remains in public repo but controlled via `ENABLE_BILLING` environment variable, allowing it to serve as educational example while being disabled by default in public deployments.

## Relevant Files

### GitHub Actions
- `.github/workflows/sync-public-fork.yml` - Automated sync workflow to public repo
- `.github/workflows/app-ci.yml` - Reference for CI configuration patterns
- `.github/workflows/automation-ci.yml` - Reference for CI configuration patterns

### Core Application (Public)
- `app/src/api/stripe.ts` - Stripe client initialization (feature-flagged)
- `app/src/api/webhooks.ts` - Stripe webhook handlers (feature-flagged)
- `app/src/api/routes.ts` - API routes including billing endpoints (feature-flagged)
- `app/src/index.ts` - Server entrypoint (Stripe validation conditional)
- `app/src/types/rate-limit.ts` - Rate limit tiers (references subscription tiers)
- `app/src/auth/validator.ts` - Auth validation (subscription tier checks)
- `app/package.json` - Dependencies including Stripe SDK
- `app/tests/api/stripe-webhooks.test.ts` - Webhook integration tests
- `app/tests/api/checkout-session.test.ts` - Checkout session tests
- `app/tests/auth/validator.test.ts` - Auth validator tests with subscription fixtures
- `shared/types/api.ts` - API types including checkout session
- `shared/types/entities.ts` - Entity types including Subscription interface

### Web Application (Private - Excluded)
- `web/` - Entire Next.js frontend directory
- `web/app/pricing/page.tsx` - Pricing page component
- `web/app/dashboard/page.tsx` - Dashboard with subscription UI
- `web/app/auth/dev-session/route.ts` - Dev session endpoint

### Documentation
- `README.md` - Root documentation (needs public-facing version)
- `CLAUDE.md` - Claude Code integration guide (public)
- `docs/vision/` - Business strategy and roadmap (private - exclude)
- `.claude/commands/` - Slash commands and prompts (public)
- `docs/specs/` - Technical specifications (public)
- `docs/deployment/` - Deployment guides (public, sanitized)
- `docs/guides/` - Technical guides (public)
- `automation/adws/README.md` - ADW architecture docs (public)

### Configuration Files
- `.gitignore` - Git ignore patterns (public version needs `.env*` exclusions)
- `.env.sample` - Environment variable template (needs billing flag documentation)
- `.env.production` - Production environment (private - exclude)
- `.env.develop` - Development environment (private - exclude)
- `biome.json` - Linting config (public)
- `docker-compose.yml` - Docker setup (public)
- `package.json` - Root package config (public)

### New Files
- `docs/specs/chore-471-open-source-core-fork.md` - This plan document
- `.github/workflows/sync-public-fork.yml` - Automated sync workflow
- `README.public.md` - Public-facing README (to replace README.md in public fork)
- `CONTRIBUTING.md` - Contribution guidelines for public repo
- `LICENSE` - MIT license file for public repo

## Work Items

### Preparation
1. Verify current branch is clean and up-to-date with develop
2. Create feature branch `chore/471-open-source-core-fork` from develop
3. Backup current repository state (git worktree list, git status)
4. Verify no sensitive credentials in files to be published (audit git log for secrets)

### Execution
1. **Create feature flag infrastructure for billing code**
   - Add `ENABLE_BILLING` environment variable support to `app/src/index.ts`
   - Wrap Stripe validation in conditional check (`if (process.env.ENABLE_BILLING === 'true')`)
   - Update `app/src/api/routes.ts` to conditionally register billing endpoints
   - Add feature flag guards to `app/src/api/stripe.ts` and `app/src/api/webhooks.ts`
   - Update tests to handle conditional Stripe configuration
   - Document `ENABLE_BILLING` flag in `app/.env.sample`

2. **Create GitHub Actions sync workflow**
   - Design `.github/workflows/sync-public-fork.yml` to:
     - Trigger on pushes to `develop` and `main` branches
     - Filter paths: `app/**`, `automation/**`, `shared/**`, `.claude/**`, `docs/**` (excluding `docs/vision/**`)
     - Checkout repository with full history
     - Remove private components (`web/`, `docs/vision/`, `.env.production`, `.env.develop`)
     - Replace `README.md` with `README.public.md`
     - Add `LICENSE` and `CONTRIBUTING.md` files
     - Force push to `jayminwest/kotadb` public repository
   - Configure GitHub Actions secrets: `PUBLIC_REPO_DEPLOY_KEY` or `PUBLIC_REPO_TOKEN`
   - Test workflow with dry-run mode

3. **Create public-facing documentation**
   - Write `README.public.md` with:
     - Open source MCP server positioning
     - Self-hosting instructions (without billing by default)
     - Consulting availability and contact information
     - Link to private repo for full-stack web application (optional)
     - Badge indicating "Core Engine - Self-hostable"
   - Create `CONTRIBUTING.md` with:
     - Code contribution guidelines
     - Testing requirements (antimocking philosophy)
     - PR submission process
     - Code of conduct reference
   - Create `LICENSE` file with MIT license text
   - Update `.env.sample` to document `ENABLE_BILLING=false` (default for public)

4. **Update conditional documentation index**
   - Extend `.claude/commands/docs/conditional_docs/app.md` with:
     - Condition: "When user asks about billing feature flag or Stripe integration in open source fork"
     - Docs: `docs/specs/chore-471-open-source-core-fork.md`
   - Extend `.claude/commands/docs/conditional_docs/automation.md` if sync workflow affects ADW usage

5. **Security audit**
   - Run `git log -p | grep -i "supabase_service_key\|stripe_secret_key\|api.key\|secret"` to check history
   - Verify no production credentials in files staged for public release
   - Confirm `.gitignore` excludes `.env.production` and `.env.develop`
   - Review `docs/deployment/` for any sensitive deployment configurations

### Follow-up
1. Test public repository locally by cloning into separate directory
2. Verify `bun install && bun test` passes without billing environment variables
3. Validate that billing endpoints return appropriate errors when `ENABLE_BILLING=false`
4. Monitor GitHub Actions workflow execution on first push to develop
5. Update private repo README to clarify public/private split and link to public fork

## Step by Step Tasks

### 1. Preparation and Branch Setup
- Verify clean working tree: `git status`
- Fetch latest changes: `git fetch --all --prune`
- Ensure on develop branch: `git checkout develop && git pull --rebase`
- Create feature branch: `git checkout -b chore/471-open-source-core-fork`
- Create plan file checkpoint: `git add docs/specs/chore-471-open-source-core-fork.md && git commit -m "chore(docs): add open source fork plan"`

### 2. Feature Flag Implementation
- Update `app/src/index.ts`:
  - Add `ENABLE_BILLING` env var check before Stripe validation
  - Log billing mode status on startup (enabled/disabled)
- Update `app/src/api/routes.ts`:
  - Wrap Stripe webhook route (`/webhooks/stripe`) in `if (process.env.ENABLE_BILLING === 'true')`
  - Wrap checkout session route (`/subscriptions/create-checkout-session`) in billing flag check
  - Return 501 Not Implemented when billing disabled and billing endpoints called
- Update `app/src/api/stripe.ts`:
  - Add guards to `getStripeClient()` and `validateStripePriceIds()` when billing disabled
  - Return null/skip validation gracefully when `ENABLE_BILLING !== 'true'`
- Update `app/src/api/webhooks.ts`:
  - Add billing flag check to webhook signature verification
- Update `app/.env.sample`:
  - Add `ENABLE_BILLING=false` with comment explaining feature flag
  - Document that billing features require Stripe credentials
- Update tests:
  - `app/tests/api/stripe-webhooks.test.ts` - skip suite when billing disabled
  - `app/tests/api/checkout-session.test.ts` - skip suite when billing disabled
  - `app/tests/auth/validator.test.ts` - mock subscription data regardless of billing flag

### 3. Public Documentation Creation
- Create `README.public.md`:
  - Title: "KotaDB - Self-Hosted Code Intelligence Engine"
  - Subtitle: "Lightweight MCP server for code indexing and search, powered by Bun + PostgreSQL"
  - Features section highlighting core capabilities (indexing, search, MCP, ADW)
  - Quick Start with `bun install && bun run dev` instructions
  - Self-hosting guide (Supabase setup, environment variables, migrations)
  - Note: "Billing features disabled by default. Set `ENABLE_BILLING=true` for Stripe integration."
  - Consulting CTA: "Need help integrating KotaDB? Contact: [email/LinkedIn]"
  - Link to private web app: "Looking for hosted solution? Visit [kotadb.com](https://kotadb.com)"
- Create `CONTRIBUTING.md`:
  - Welcome message for contributors
  - Development setup (Bun, Supabase Local, tests)
  - Antimocking testing philosophy reference
  - Git Flow explanation: feature branches → `develop` → `main`
  - PR guidelines (branch from develop, link to issue, pass CI)
  - Code style (Biome linter, TypeScript strict mode)
  - Commit message format (Conventional Commits)
  - Note: "Changes are synced from private repo - PRs accepted for core functionality only"
- Create `LICENSE`:
  - MIT License text
  - Copyright year and attribution: "Copyright (c) 2024 Jaymin West"

### 4. GitHub Actions Sync Workflow
- Create `.github/workflows/sync-public-fork.yml`:
  ```yaml
  name: Sync Public Fork
  on:
    push:
      branches: [develop, main]
      paths:
        - 'app/**'
        - 'automation/**'
        - 'shared/**'
        - '.claude/**'
        - 'docs/**'
        - '!docs/vision/**'
        - 'README.public.md'
        - 'CONTRIBUTING.md'
        - 'LICENSE'
        - '.gitignore'
        - 'package.json'
        - 'biome.json'
        - 'docker-compose.yml'

  jobs:
    sync:
      runs-on: ubuntu-latest
      steps:
        - name: Checkout private repo
          uses: actions/checkout@v4
          with:
            fetch-depth: 0

        - name: Remove private components
          run: |
            rm -rf web/
            rm -rf docs/vision/
            rm -f .env.production .env.develop .env.test
            rm -f web/.env.local web/.env.vercel.preview

        - name: Replace README with public version
          run: |
            mv README.public.md README.md

        - name: Prepare public repository files
          run: |
            # LICENSE and CONTRIBUTING.md already exist in root
            echo "Public fork prepared for sync"

        - name: Configure git for public fork
          run: |
            git config user.name "github-actions[bot]"
            git config user.email "github-actions[bot]@users.noreply.github.com"

        - name: Push to public fork
          env:
            PUBLIC_REPO_TOKEN: ${{ secrets.PUBLIC_REPO_TOKEN }}
            BRANCH_NAME: ${{ github.ref_name }}
          run: |
            git remote add public https://x-access-token:${PUBLIC_REPO_TOKEN}@github.com/jayminwest/kotadb.git
            git add -A
            git commit -m "chore: sync from private repo ${BRANCH_NAME} ($(git rev-parse --short HEAD))" || true
            git push public HEAD:${BRANCH_NAME} --force
  ```
- Configure GitHub Actions secret `PUBLIC_REPO_TOKEN` in private repo settings
- Test workflow with manual trigger (workflow_dispatch)

### 5. Conditional Documentation Updates
- Edit `.claude/commands/docs/conditional_docs/app.md`:
  - Add new section under "## Billing and Payments" (or create if missing)
  - Condition: "When asked about billing features, Stripe integration, or open source fork billing strategy"
  - Files: `docs/specs/chore-471-open-source-core-fork.md`
- Verify existing conditional docs don't conflict with new public fork context

### 6. Security Audit and Validation
- Run secret scan: `git log --all -p | grep -iE "(stripe_secret_key|supabase_service_key|password|api.key)" | head -50`
- Verify `.gitignore` includes `.env.production` and `.env.develop`
- Check public-facing files for hardcoded credentials: `grep -r "sk_live\|sk_test\|supabase.*\.co" app/ automation/ shared/ .claude/ 2>/dev/null`
- Review `docs/deployment/` for sensitive deployment URLs or keys

### 7. Local Testing and Validation
- Stage all changes: `git add .`
- Run linting: `cd app && bun run lint`
- Run type checking: `cd app && bunx tsc --noEmit`
- Test with billing disabled:
  - Export `ENABLE_BILLING=false`
  - Start server: `cd app && bun run src/index.ts`
  - Verify billing endpoints return 501 Not Implemented
  - Run test suite: `cd app && bun test`
  - Verify Stripe tests are skipped when billing disabled
- Test with billing enabled (if Stripe credentials available):
  - Export `ENABLE_BILLING=true`
  - Verify Stripe validation passes
  - Run billing tests: `cd app && bun test stripe`

### 8. Commit and Push
- Commit feature flag changes: `git add app/ shared/ && git commit -m "feat(billing): add ENABLE_BILLING feature flag for open source fork"`
- Commit documentation: `git add README.public.md CONTRIBUTING.md LICENSE docs/ .claude/ && git commit -m "docs: add public fork documentation and contributing guide"`
- Commit sync workflow: `git add .github/workflows/sync-public-fork.yml && git commit -m "ci: add GitHub Actions workflow for public fork sync"`
- Push feature branch: `git push -u origin chore/471-open-source-core-fork`

### 9. Post-Push Validation
- Verify GitHub Actions workflow doesn't run on feature branch (only on develop/main)
- Create PR draft: `gh pr create --draft --base develop --title "chore: open source core fork with billing feature flag (#471)" --body "Implements #471 - See docs/specs/chore-471-open-source-core-fork.md for full plan"`
- Request review from repository maintainers
- Await PR approval before merging to develop
- After merge to develop, monitor sync workflow execution
- Verify public fork at `https://github.com/jayminwest/kotadb` receives updates:
  - Check `develop` branch synced: `https://github.com/jayminwest/kotadb/tree/develop`
  - Check `main` branch synced: `https://github.com/jayminwest/kotadb/tree/main`
  - Verify both branches have removed private components (no `web/`, no `docs/vision/`)
  - Confirm README.md is the public version on both branches

## Risks

| Risk | Mitigation |
|------|------------|
| Accidentally exposing production secrets in git history | Run `git log` grep scan for secrets before sync; review `git-secrets` tooling |
| Breaking existing billing functionality in private repo | Feature flag defaults to enabled in private `.env.production`; comprehensive tests |
| Sync workflow conflicts with existing GitHub Actions | Use unique workflow name; test with `workflow_dispatch` trigger first |
| Public fork missing critical dependencies | Test clean clone locally; verify `bun install && bun test` passes |
| Billing feature flag causes test failures | Update tests to conditionally skip Stripe tests when `ENABLE_BILLING=false` |
| Force push to public fork overwrites manual changes | Document "DO NOT commit directly to public fork" in README; all changes via sync |
| Missing attribution or license compliance | Add MIT LICENSE with proper copyright; attribute dependencies in README |

## Validation Commands

### Code Quality
```bash
cd app && bun run lint          # Biome linter
cd app && bunx tsc --noEmit     # TypeScript type checking
```

### Testing
```bash
# Test with billing disabled (default for public)
export ENABLE_BILLING=false
cd app && bun test

# Test with billing enabled (if credentials available)
export ENABLE_BILLING=true
cd app && bun test
```

### Build Validation
```bash
cd app && bun run build         # If build script exists
cd app && bun run src/index.ts  # Verify server starts
```

### Security Audit
```bash
# Check for leaked secrets in git history
git log --all -p | grep -iE "(sk_live|sk_test|supabase.*service.*key|password)" | head -20

# Verify no production env files staged
git status | grep -E ".env.(production|develop)"

# Check public files for hardcoded credentials
grep -r "sk_live\|sk_test\|eyJ.*\..*\." app/ automation/ shared/ 2>/dev/null
```

### Public Fork Simulation
```bash
# Clone into separate directory to simulate public fork
cd /tmp
git clone /path/to/kota-db-ts kotadb-public-test
cd kotadb-public-test

# Simulate public fork cleanup
rm -rf web/ docs/vision/ .env.production .env.develop
mv README.public.md README.md

# Test installation and build
cd app && bun install
bun test
bunx tsc --noEmit
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `style`
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: refresh dependencies` not `Based on the plan, the commit should refresh dependencies`

### Example Valid Commit Messages
- `feat(billing): add ENABLE_BILLING feature flag for open source fork`
- `docs: add public fork README and contributing guidelines`
- `ci: add GitHub Actions workflow for public fork sync`
- `chore: remove private components from public sync`
- `test: skip Stripe tests when billing disabled`

### Example Invalid Commit Messages (DO NOT USE)
- ❌ `Based on the plan, this commit adds billing feature flag`
- ❌ `Here is the implementation of the public fork sync workflow`
- ❌ `Looking at the issue, I can see we need to update docs`
- ❌ `The changes include adding a feature flag for billing`
- ❌ `Let me add the public README documentation`

## Deliverables

### Code Changes
- Feature flag infrastructure in `app/src/index.ts`, `app/src/api/routes.ts`, `app/src/api/stripe.ts`, `app/src/api/webhooks.ts`
- Updated tests with conditional Stripe test execution
- Updated `app/.env.sample` with `ENABLE_BILLING` documentation

### GitHub Actions Workflow
- `.github/workflows/sync-public-fork.yml` - Automated sync to public fork
- GitHub Actions secret configuration: `PUBLIC_REPO_TOKEN`

### Documentation
- `README.public.md` - Public-facing README with self-hosting guide and consulting CTA
- `CONTRIBUTING.md` - Contribution guidelines for open source contributors
- `LICENSE` - MIT license file with proper attribution
- Updated `.claude/commands/docs/conditional_docs/app.md` with billing flag documentation reference

### Security Validation
- Git history audit report (no leaked secrets)
- Confirmed `.gitignore` excludes sensitive files
- Verified no hardcoded credentials in public files
