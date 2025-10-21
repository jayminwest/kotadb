# Chore Plan: Resolve Fly.io Deployment Hang During Bun Install

## Context

The initial Fly.io deployment for KotaDB is hanging during the Docker build step at `bun install --frozen-lockfile` after "Resolving dependencies". The build has been stuck for 8+ minutes on the Depot remote builder, preventing successful deployment to production.

This chore is needed now because:
- Blocks production deployments completely
- Prevents CI/CD integration for automated Fly.io deployments
- Affects ability to validate deployment reliability (issue #44)
- Impacts Fly.io configuration consolidation (issue #77)

**Constraints:**
- Must preserve existing Docker image functionality
- Must work with both Depot and local BuildKit builders
- Must not break existing local development workflows
- Must maintain compatibility with Bun 1.1.29 runtime

## Relevant Files

- `app/.dockerignore` — Excludes unnecessary files from build context (reduces 123MB → <1MB)
- `app/fly.toml` — Fly.io deployment configuration (fix app name, increase memory)
- `app/Dockerfile` — Docker build instructions (add network timeout, optimize caching)
- `app/package.json` — Bun dependency manifest (578 lines, includes platform-specific deps)
- `app/bun.lock` — Lockfile with 578-line dependency graph

### New Files

- `app/.dockerignore` — Build context exclusion rules for Docker/Fly.io builds

## Work Items

### Preparation
- Verify current build context size via `docker build --progress=plain` logs
- Verify app name in Fly.io dashboard (`flyctl apps list`)
- Backup current `fly.toml` configuration
- Ensure worktree is on correct branch (`chore/203-flyio-deployment-hang`)

### Execution
- Create `.dockerignore` file with exclusions (node_modules, tests, data, docs, scripts)
- Fix app name mismatch in `fly.toml` (ensure matches Fly.io dashboard)
- Increase VM memory allocation from 512MB to 1024MB in `fly.toml`
- Add `--network-timeout 300000` and `--verbose` flags to `bun install` in Dockerfile
- Test local Docker build: `docker build -t kotadb:test .`
- Verify build context reduced to <5MB in Docker output
- Test Fly.io build-only deployment: `flyctl deploy --build-only --push -a kotadb`

### Follow-up
- Monitor deployment logs for 5 minutes: `flyctl logs -a kotadb`
- Verify `/health` endpoint returns 200 OK
- Document troubleshooting steps in `app/README.md`
- Add deployment command examples to `app/README.md`
- Update `.claude/commands/docs/conditional_docs.md` with `.dockerignore` documentation reference

## Step by Step Tasks

### 1. Create Build Context Exclusions

- Create `app/.dockerignore` file with exclusions:
  - `node_modules/` (will be installed fresh in container)
  - `tests/` (not needed in production image)
  - `data/` (local development data)
  - `supabase/` (local Supabase stack)
  - `scripts/` (development scripts)
  - `docs/` (documentation)
  - `*.md` (except README.md)
  - `.env`, `.env.test`, `.env.sample` (environment files)
  - `.DS_Store` (macOS artifacts)

### 2. Fix Fly.io Configuration

- Run `flyctl apps list` to verify actual app name in Fly.io dashboard
- Update `app/fly.toml` app name to match dashboard (likely `kotadb`)
- Change `[[vm]]` memory allocation from 512MB to 1024MB in `fly.toml`
- Verify `fly.toml` is in `app/` directory (per issue #77)

### 3. Optimize Dockerfile Build

- Add `--network-timeout 300000` flag to `bun install` command in `app/Dockerfile`
- Add `--verbose` flag to `bun install` for better debugging output
- Verify `--frozen-lockfile` flag is preserved (prevents lockfile changes)
- Keep `COPY . .` step after dependency installation for better layer caching

### 4. Test Local Docker Build

- Run `cd app && docker build -t kotadb:test .` to test build locally
- Verify build completes in <2 minutes (down from 8+ minute timeout)
- Check build output for "COPY . ." step showing <5MB context size
- Verify no timeout errors in build logs

### 5. Test Fly.io Build-Only Deployment

- Run `cd app && flyctl deploy --build-only --push --buildkit -a kotadb --config fly.toml`
- Verify build completes successfully without timeout
- If BuildKit fails, fallback to `--depot=false` flag
- Check build logs for successful dependency resolution

### 6. Update Documentation

- Add `.dockerignore` documentation to `app/README.md` under "Docker" section
- Document recommended deployment command: `flyctl deploy --detach --buildkit -a kotadb --config fly.toml`
- Add troubleshooting section for deployment hangs (check logs, cancel stuck builds)
- Include debugging commands: `flyctl logs -a kotadb --no-tail`, `flyctl status -a kotadb`

### 7. Update Conditional Docs Reference

- Add entry to `.claude/commands/docs/conditional_docs.md` for `.dockerignore`:
  ```
  - app/.dockerignore: Read when working on Docker builds, Fly.io deployments, or build optimization
  ```

### 8. Validation and Push

- Run `cd app && bun run lint` to verify no linting issues
- Run `cd app && bunx tsc --noEmit` to verify type-checking passes
- Run `cd app && bun test` to ensure no regressions
- Run local Docker build again: `docker build -t kotadb:test .`
- Stage all changes: `git add app/.dockerignore app/fly.toml app/Dockerfile app/README.md .claude/commands/docs/conditional_docs.md docs/specs/chore-203-flyio-deployment-hang.md`
- Commit with conventional format: `chore: resolve Fly.io deployment hang during bun install (#203)`
- Push branch: `git push -u origin chore/203-flyio-deployment-hang`

## Risks

| Risk | Mitigation |
|------|------------|
| `.dockerignore` excludes necessary files | Test local Docker build before Fly.io deployment; verify application starts successfully |
| App name change breaks existing deployments | Verify app name in Fly.io dashboard first; use exact match |
| Memory increase causes Fly.io cost increase | 1024MB is minimum recommended for Bun; can revert if needed |
| Network timeout too aggressive | 300000ms (5 min) is conservative; Bun install typically <1 min |
| BuildKit builder unavailable | Include fallback command with `--depot=false` in docs |
| Multi-stage build adds complexity | Defer to future optimization; current approach simpler |

## Validation Commands

**Required checks:**
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test
cd app && docker build -t kotadb:test .
cd app && flyctl deploy --build-only --push --buildkit -a kotadb --config fly.toml
```

**Supplemental checks (from `/validate-implementation` HIGH impact level):**
```bash
# Verify build context size
cd app && docker build --progress=plain -t kotadb:test . 2>&1 | grep "COPY . ."

# Test container startup
cd app && docker run -p 3000:3000 -e PORT=3000 kotadb:test &
sleep 5
curl http://localhost:3000/health
docker stop $(docker ps -q --filter ancestor=kotadb:test)

# Verify Fly.io config syntax
cd app && flyctl config validate -c fly.toml
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: resolve Fly.io deployment hang` not `Based on the plan, the commit should resolve Fly.io deployment hang`

**Example valid commit:**
```
chore: resolve Fly.io deployment hang during bun install (#203)

- Add .dockerignore to reduce build context from 123MB to <1MB
- Fix app name mismatch in fly.toml (kota-db-staging → kotadb)
- Increase VM memory allocation from 512MB to 1024MB
- Add network timeout and verbose flags to bun install in Dockerfile

Fixes deployment timeout issues on Depot remote builder by excluding
unnecessary files and increasing build environment resources.
```

## Deliverables

- **Code changes:**
  - `app/.dockerignore` — Build context exclusion rules
  - `app/fly.toml` — Fixed app name, increased memory allocation
  - `app/Dockerfile` — Network timeout and verbose flags for bun install

- **Config updates:**
  - `.claude/commands/docs/conditional_docs.md` — Added `.dockerignore` reference

- **Documentation updates:**
  - `app/README.md` — Added Docker deployment section with troubleshooting
  - `docs/specs/chore-203-flyio-deployment-hang.md` — This maintenance plan
