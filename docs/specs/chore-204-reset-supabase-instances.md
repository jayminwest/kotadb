# Chore Plan: Reset Production and Staging Supabase Instances to Current Schema

## Context

Both production (`mnppfnyhvgohhblhcgbq`) and staging (`szuaoiiwrwpuhdbruydr`) Supabase instances were configured for an earlier version of the codebase and contain outdated schemas, stale data, and potentially incorrect RLS policies. This chore performs a clean-slate reset using Supabase CLI to match the current migration files in `app/supabase/migrations/`.

**Why this matters now:**
- Outdated schema blocks production deployment and feature validation
- Incorrect RLS policies may compromise multi-tenant data isolation
- Stale data interferes with testing and API contract validation
- Current migrations (11 files) are not reflected in remote instances

**Constraints:**
- No data preservation needed (clean slate approach)
- Use Supabase CLI `db reset` and `db push` commands for automation
- Must update deployment secrets (GitHub Actions, Fly.io) if credentials regenerated
- Must validate RLS policies thoroughly to prevent data leakage

## Relevant Files

- `app/supabase/migrations/*.sql` — Migration files for Supabase CLI (11 files)
- `app/supabase/config.toml` — Supabase project configuration with project references
- `app/.env` — Local environment credentials (may need update if keys regenerated)
- `app/.env.production` — Production credentials (may need update if keys regenerated)
- `.github/workflows/app-ci.yml` — CI workflow using Supabase secrets (may need update)
- `docs/supabase-setup.md` — Setup documentation for Supabase configuration

### New Files

- `docs/specs/chore-204-reset-supabase-instances.md` — This maintenance plan
- `app/scripts/seed-test-data.sql` — SQL script for test user and API key creation

## Work Items

### Preparation

- Verify migration sync between `app/src/db/migrations/` and `app/supabase/migrations/` via `bun run test:validate-migrations`
- Create git branch from `develop`: `chore/204-reset-supabase-instances`
- Install Supabase CLI if not available: `brew install supabase/tap/supabase`
- Authenticate Supabase CLI: `supabase login`
- Verify Supabase CLI can access both projects: `supabase projects list`

### Execution

**Phase 1: Reset Staging Instance** (`szuaoiiwrwpuhdbruydr`)
- Link CLI to staging project: `cd app && supabase link --project-ref szuaoiiwrwpuhdbruydr`
- Reset database to clean state: `supabase db reset --linked`
- Push migrations to remote: `supabase db push --linked` (if reset doesn't apply migrations)
- Verify schema via CLI: `supabase db diff --linked` (should show no differences)
- Create seed data script: `app/scripts/seed-test-data.sql` with test users and API keys
- Apply seed data: `supabase db execute -f scripts/seed-test-data.sql --linked`
- Test connection: `supabase db inspect tables --linked`
- Update `app/.env` if credentials changed
- Start local API server: `cd app && bun run src/index.ts`
- Validate health endpoint: `curl http://localhost:3000/health`
- Validate authentication with test API key from seed data
- Validate MCP endpoint: `POST /mcp` with `tools/list` JSON-RPC request

**Phase 2: Reset Production Instance** (`mnppfnyhvgohhblhcgbq`)
- Link CLI to production project: `cd app && supabase link --project-ref mnppfnyhvgohhblhcgbq`
- Reset database: `supabase db reset --linked`
- Push migrations: `supabase db push --linked` (if needed)
- Verify schema: `supabase db diff --linked` (should show no differences)
- Apply seed data: `supabase db execute -f scripts/seed-test-data.sql --linked`
- Update production secrets in Fly.io if credentials regenerated
- Update GitHub Actions secrets if credentials regenerated
- Deploy to production and verify health endpoint

**Phase 3: Documentation and Verification**
- Update `docs/supabase-setup.md` with CLI-based reset procedure
- Document seed data credentials in GitHub Secrets
- Trigger CI workflow to verify updated secrets (if changed)
- Verify production deployment connects successfully

### Follow-up

- Monitor production logs for database connection errors (first 24 hours)
- Monitor rate limit enforcement and RLS policy effectiveness
- Document CLI-based reset procedure for future maintenance

## Step by Step Tasks

### Preparation Tasks
1. Run `bun run test:validate-migrations` to verify migration sync
2. Create branch: `git checkout develop && git pull && git checkout -b chore/204-reset-supabase-instances`
3. Install Supabase CLI: `brew install supabase/tap/supabase` (if not installed)
4. Authenticate: `supabase login` (opens browser for authentication)
5. Verify access: `supabase projects list` (should show both projects)

### Create Seed Data Script
6. Create `app/scripts/seed-test-data.sql` with test users and API keys for all tiers

### Staging Instance Reset
7. Link CLI to staging: `cd app && supabase link --project-ref szuaoiiwrwpuhdbruydr`
8. Reset database: `supabase db reset --linked` (applies migrations from `app/supabase/migrations/`)
9. Verify no schema drift: `supabase db diff --linked` (should output "No schema differences detected")
10. Apply seed data: `supabase db execute -f scripts/seed-test-data.sql --linked`
11. Inspect tables: `supabase db inspect tables --linked` (verify all 10+ tables exist)
12. Verify RLS policies: `supabase db inspect policies --linked`
13. Test database function via Supabase MCP or direct SQL query
14. Update `app/.env` with staging credentials if regenerated
15. Start local API: `cd app && bun run src/index.ts`
16. Test health: `curl http://localhost:3000/health`
17. Test auth: `curl -X POST http://localhost:3000/index -H "Authorization: Bearer <seed_api_key>" -d '{"repo_path":"test/repo","ref":"main"}' -H "Content-Type: application/json"`
18. Test MCP: `curl -X POST http://localhost:3000/mcp -H "Authorization: Bearer <seed_api_key>" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' -H "Content-Type: application/json"`

### Production Instance Reset
19. Link CLI to production: `cd app && supabase link --project-ref mnppfnyhvgohhblhcgbq`
20. Reset database: `supabase db reset --linked`
21. Verify no schema drift: `supabase db diff --linked`
22. Apply seed data: `supabase db execute -f scripts/seed-test-data.sql --linked`
23. Inspect tables: `supabase db inspect tables --linked`
24. Update Fly.io secrets if credentials regenerated: `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SUPABASE_ANON_KEY=...`
25. Update GitHub Actions secrets if credentials regenerated (via repo Settings → Secrets)
26. Deploy to production: `fly deploy` (if using Fly.io)
27. Test production health: `curl https://<production-url>/health`
28. Test production auth and MCP endpoints with production API key

### Documentation and Verification
29. Update `docs/supabase-setup.md` with CLI-based reset procedure
30. Document seed data API keys in GitHub Secrets or secure vault
31. Trigger CI workflow: `gh workflow run "Application CI"` (if secrets changed)
32. Monitor CI logs for database connection success

### Validation and Delivery
33. Run full test suite: `cd app && bun test`
34. Run type-check: `cd app && bunx tsc --noEmit`
35. Run lint: `cd app && bun run lint`
36. Commit changes: `git add . && git commit -m "chore: reset production and staging Supabase instances via CLI"`
37. Push branch: `git push -u origin chore/204-reset-supabase-instances`

## Risks

- **Migration application failures**: Mitigate by running `supabase db diff --linked` after reset to verify schema matches expected state
- **RLS policy bugs**: Mitigate by running `supabase db inspect policies --linked` and testing with different user contexts
- **Credential rotation**: Mitigate by checking if `db reset` regenerates API keys, update deployment secrets only if needed
- **CI pipeline failures**: Mitigate by testing credentials with manual workflow trigger before merging
- **Migration sync drift**: Mitigate by running `bun run test:validate-migrations` before starting to ensure source and CLI migrations match

## Validation Commands

**Local validation (before reset):**
```bash
cd app && bun run test:validate-migrations  # Ensure migrations are in sync
cd app && bunx tsc --noEmit                 # Type-check passes
cd app && bun run lint                      # Lint passes
cd app && bun test                          # Full test suite passes
```

**Supabase CLI validation (post-reset staging):**
```bash
cd app
supabase link --project-ref szuaoiiwrwpuhdbruydr
supabase db diff --linked                   # Should show no differences
supabase db inspect tables --linked         # Verify all tables exist
supabase db inspect policies --linked       # Verify RLS policies applied
```

**API validation (staging):**
```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer <seed_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"repo_path": "test/repo", "ref": "main"}'
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <seed_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

**Supabase CLI validation (post-reset production):**
```bash
cd app
supabase link --project-ref mnppfnyhvgohhblhcgbq
supabase db diff --linked                   # Should show no differences
supabase db inspect tables --linked         # Verify all tables exist
supabase db inspect policies --linked       # Verify RLS policies applied
```

**API validation (production):**
```bash
curl https://<production-url>/health
# Test authentication, search, MCP endpoints with production API keys
```

**CI validation:**
```bash
gh workflow run "Application CI"  # Trigger manually if secrets changed
gh run list --limit 1             # Verify latest run passes
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: reset Supabase instances to current schema` not `Based on the plan, the commit should reset Supabase instances`

## Deliverables

- **Staging instance reset**: Clean schema via `supabase db reset --linked`, all migrations applied, RLS policies verified
- **Production instance reset**: Clean schema via `supabase db reset --linked`, all migrations applied, RLS policies verified
- **Seed data script**: `app/scripts/seed-test-data.sql` with test users and API keys for all tiers
- **Environment configuration**: Updated `.env` files and deployment secrets (only if credentials regenerated)
- **Documentation updates**: `docs/supabase-setup.md` includes CLI-based reset procedure
- **Validation results**: `supabase db diff --linked` shows no drift, health checks pass, MCP endpoints functional
