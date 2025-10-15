# Chore Plan: Consolidate Fly.io Configuration and Setup Staging Deployment

## Context
The current `fly.toml` configuration lives in the repository root alongside the `automation/` directory, which is intentionally excluded from deployment (development acceleration only). All deployment-related configuration should be consolidated within the `app/` directory where the application code lives.

This chore establishes a proper staging environment on Fly.io with the following goals:
- Move deployment configuration to `app/` directory for better organization
- Set up a functioning staging environment for pre-production validation
- Update MCP integration to support both local and staging environments
- Document the staging deployment process for future reference

**Constraints:**
- This is staging-only; production deployment will be handled separately
- Requires Fly.io credentials (user must provide if not already authenticated)
- Requires staging Supabase project credentials (user must provide)
- Must maintain backward compatibility with local development workflow

## Relevant Files
- `fly.toml` — Root-level Fly.io configuration (will be moved to `app/fly.toml`)
- `.mcp.json` — MCP server configuration (will be updated to support staging environment)
- `app/Dockerfile` — Docker image definition (already compatible with Fly.io)
- `docker-compose.yml` — Shows `home` production target uses `app/` build context
- `README.md` — Root README with deployment section (lines 203-211)
- `app/README.md` — Application-specific documentation (if exists)

### New Files
- `app/fly.toml` — Relocated Fly.io configuration with staging app name
- `docs/deployment.md` — Comprehensive deployment documentation for staging and future production

## Work Items

### Preparation
- Verify Fly.io CLI is installed (`flyctl version`)
- Check Fly.io authentication status (`flyctl auth whoami`)
- **If not authenticated**: Notify user to run `flyctl auth login` and provide Fly.io credentials
- Verify staging Supabase project exists and credentials are available
- **If staging Supabase not ready**: Notify user to create staging project at https://supabase.com/dashboard and obtain:
  - `SUPABASE_URL` (staging project URL)
  - `SUPABASE_SERVICE_KEY` (staging service role key)
  - `SUPABASE_ANON_KEY` (staging anon key)
- Create feature branch: `chore/77-consolidate-flyio-staging-deployment` from `develop`

### Execution
- Move `fly.toml` from repository root to `app/fly.toml`
- Update `app/fly.toml` to reflect staging environment:
  - Change `app = "kota-db"` to `app = "kota-db-staging"`
  - Keep existing configuration (region: iad, internal_port: 3000, resources, auto-scaling)
- Remove `fly.toml` from repository root
- Update `.mcp.json` to support multiple environments:
  - Rename existing `kotadb` server to `kotadb-local`
  - Add `kotadb-staging` server with staging URL placeholder
  - Document API key generation requirement for staging
- Create `docs/deployment.md` with staging deployment guide:
  - Prerequisites (Fly.io CLI, Supabase staging project)
  - Step-by-step deployment instructions
  - Secret management (`flyctl secrets set`)
  - Health check validation
  - MCP integration testing
  - Troubleshooting section
- Update root `README.md` to reference `docs/deployment.md` for deployment instructions
- Stage all changes for commit

### Follow-up
- Validate `fly.toml` configuration: `cd app && flyctl config validate`
- Verify Docker build from `app/` directory: `cd app && docker build -t kota-db-staging .`
- Create deployment verification checklist in `docs/deployment.md`
- Add note in plan about manual deployment steps (requires user credentials)

## Step by Step Tasks

### Git Setup
- Create feature branch: `git checkout -b chore/77-consolidate-flyio-staging-deployment develop`

### Configuration Migration
- Move `fly.toml` to `app/fly.toml`
- Update app name in `app/fly.toml` from `kota-db` to `kota-db-staging`
- Delete `fly.toml` from repository root

### MCP Configuration Update
- Update `.mcp.json` to support multiple environments (local and staging)
- Rename `kotadb` server to `kotadb-local`
- Add `kotadb-staging` server configuration with placeholder URL and API key

### Documentation
- Create `docs/deployment.md` with comprehensive staging deployment guide
- Include sections: Prerequisites, Deployment Steps, Secret Management, Validation, Troubleshooting
- Update root `README.md` deployment section to reference `docs/deployment.md`

### Validation
- Run `cd app && flyctl config validate` to verify Fly.io configuration
- Run `cd app && docker build -t kota-db-staging .` to verify Docker build
- Run `cd app && bunx tsc --noEmit` to verify TypeScript compilation
- Run `cd app && bun test` to ensure no regressions

### Git Operations
- Stage all changes: `git add app/fly.toml .mcp.json docs/deployment.md README.md`
- Commit with message following Conventional Commits format
- Push branch: `git push -u origin chore/77-consolidate-flyio-staging-deployment`
- Run `/pull_request chore/77-consolidate-flyio-staging-deployment <issue_json> docs/specs/chore-77-consolidate-flyio-staging-deployment.md <adw_id>` to create PR

## Risks

### Risk: Fly.io credentials not available
**Mitigation:** Notify user early in process to authenticate with `flyctl auth login`. Provide clear instructions in plan output and documentation.

### Risk: Staging Supabase project not ready
**Mitigation:** Document Supabase project creation steps in `docs/deployment.md`. Notify user to create staging project before attempting deployment. Provide environment variable checklist.

### Risk: Breaking local development workflow
**Mitigation:** Keep `.mcp.json` backward compatible by renaming existing local config. Verify local development still works after changes. Document local vs staging configuration differences.

### Risk: Docker build context mismatch
**Mitigation:** Verify Docker build works from `app/` directory before committing. Test with `docker build -t kota-db-staging .` from `app/` directory. Review `docker-compose.yml` `home` target for consistency.

### Risk: Fly.io CLI not finding config in new location
**Mitigation:** Test `flyctl config validate` from `app/` directory. Ensure all `flyctl` commands are run with correct working directory. Document working directory requirements in deployment guide.

## Validation Commands

All validation commands should be run from the `app/` directory:

```bash
cd app

# Verify Fly.io configuration
flyctl config validate

# Verify Docker build
docker build -t kota-db-staging .

# Type-check TypeScript
bunx tsc --noEmit

# Run test suite
bun test

# Verify no hardcoded environment URLs in tests
bun run test:validate-env
```

**Note:** Actual deployment to Fly.io staging is NOT part of this chore's validation. Deployment requires user credentials and will be documented in `docs/deployment.md` for manual execution.

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: consolidate fly.io config in app/ directory` not `Based on the plan, the commit should consolidate the fly.io configuration`

## Deliverables

### Code Changes
- `app/fly.toml` — Relocated Fly.io configuration with staging app name
- Removal of root-level `fly.toml`

### Config Updates
- `.mcp.json` — Multi-environment MCP server configuration (local + staging)

### Documentation Updates
- `docs/deployment.md` — New comprehensive deployment guide with:
  - Prerequisites checklist (Fly.io CLI, Supabase staging project)
  - Step-by-step staging deployment instructions
  - Secret management commands (`flyctl secrets set`)
  - Health check validation procedures
  - MCP integration testing guide
  - Troubleshooting section for common issues
- `README.md` — Updated deployment section to reference `docs/deployment.md`

### User Notifications Required

**Fly.io Authentication:**
If `flyctl auth whoami` fails, notify user:
```
Fly.io authentication required. Please run:
  flyctl auth login

This will open a browser for authentication. Once complete, re-run the deployment steps.
```

**Staging Supabase Credentials:**
Before attempting deployment, notify user:
```
Staging Supabase project required. Please ensure you have:
1. Created a staging Supabase project at https://supabase.com/dashboard
2. Run database migrations on the staging project
3. Have the following credentials ready:
   - SUPABASE_URL (your staging project URL)
   - SUPABASE_SERVICE_KEY (staging service role key)
   - SUPABASE_ANON_KEY (staging anon key)

These will be set as Fly.io secrets during deployment.
```

**Staging API Key Generation:**
After staging deployment, notify user:
```
To use the staging MCP server, you need a staging API key:
1. Connect to staging Supabase database
2. Generate API key using staging environment
3. Update .mcp.json kotadb-staging server with the generated key

See docs/deployment.md for detailed instructions.
```
