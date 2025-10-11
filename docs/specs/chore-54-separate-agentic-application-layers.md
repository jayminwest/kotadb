# Chore Plan: Separate Agentic and Application Layers into Distinct Directories

## Context

Currently, the agentic automation layer (`automation/adws/`) and the application layer (`app/src/`, `app/tests/`) coexist in the same monorepo root. This creates potential for cross-contamination between two fundamentally different systems:

1. **Application Layer**: TypeScript/Bun HTTP API service for code indexing and search
2. **Agentic Layer**: Python-based AI developer workflow automation

**Why this chore matters now:**
- Docker builds copy unnecessary files from both layers, increasing build context size
- Shared `.env` files create confusion about which layer needs which variables
- CI workflows mix concerns (TypeScript linting vs Python ADW execution)
- Path references in documentation span both layers without clear boundaries
- Risk of accidental cross-layer dependencies as both systems evolve
- ADW scripts reference application files (e.g., `app/src/index.ts`) but this coupling is implicit

**Constraints:**
- Cannot break existing functionality in either layer
- Must maintain backward compatibility for deployed services
- Docker Compose services must continue to work
- CI/CD pipelines must not regress
- ADW automation must continue to operate on the application layer

## Relevant Files

### Application Layer (to be moved to `app/`)
- `app/src/**/*.ts` — Core TypeScript application code (19 files)
- `app/tests/**/*.test.ts` — Test suite (133 tests)
- `app/package.json` — Bun dependencies and scripts
- `app/tsconfig.json` — TypeScript configuration
- `bun.lock` — Dependency lockfile
- `.env.sample` — Application environment template
- `Dockerfile` — Application container image
- `supabase/` — Database migrations and configuration
- `scripts/*.sh` — Application-specific bash scripts (setup-test-db.sh, etc.)

### Agentic Layer (to be moved to `automation/`)
- `automation/adws/**/*.py` — ADW automation scripts (38 Python files)
- `automation/adws/.env.sample` — ADW environment template
- `docker/adw-*.Dockerfile` — ADW-specific Docker images
- `.claude/commands/*.md` — Claude Code slash commands

### Shared/Root (remains at root)
- `README.md` — Repository overview (update to reflect structure)
- `CLAUDE.md` — Claude Code instructions (update paths)
- `docs/` — Documentation (update references)
- `.github/workflows/` — CI configuration (split into separate workflows)
- `.gitignore` — Git ignore patterns (update paths)
- `docker-compose.yml` — Multi-service orchestration (update paths)
- `.devcontainer/` — VS Code devcontainer configuration

### New Files
- `app/README.md` — Application layer quickstart
- `automation/README.md` — Agentic layer quickstart (moved from automation/adws/README.md)
- `automation/pyproject.toml` — Python project configuration (if not exists)
- `.github/workflows/app-ci.yml` — Application-specific CI
- `.github/workflows/automation-ci.yml` — ADW-specific CI (if tests exist)

## Work Items

### Preparation
1. Create new directory structure (`app/`, `automation/`)
2. Audit all cross-layer references (Docker, CI, docs, scripts)
3. Document migration mapping for developer reference
4. Create backup branch for rollback safety

### Execution
1. **Create directory structure**
   - `mkdir -p app automation`
   - Move application files to `app/`
   - Move ADW files to `automation/`
   - Update `.gitignore` with new paths

2. **Update application layer references**
   - Modify `app/tsconfig.json` path aliases (adjust relative paths if needed)
   - Update `app/package.json` scripts (adjust script paths)
   - Update `app/Dockerfile` COPY paths (now relative to app/)
   - Update test helper paths in `app/tests/helpers/*.ts`

3. **Update agentic layer references**
   - Modify ADW scripts to reference `../app/` for application targets
   - Update Docker paths in `automation/docker/*.Dockerfile`
   - Update `.claude/commands/*.md` to reference new paths
   - Adjust log output paths in ADW modules

4. **Update shared infrastructure**
   - Split `.github/workflows/ci.yml` into `app-ci.yml` and `automation-ci.yml`
   - Update `docker-compose.yml` build contexts and volume mounts
   - Update `README.md` with new structure overview
   - Update `CLAUDE.md` architecture section with new paths
   - Update `docs/specs/*.md` to reference correct paths

5. **Update documentation cross-references**
   - Update `.claude/commands/conditional_docs.md` with new path conditions
   - Update all `docs/specs/*.md` files with corrected file paths
   - Update `docs/testing-setup.md` with new script locations
   - Update `docs/supabase-setup.md` if migration paths changed

### Follow-up
1. Run full validation suite on both layers independently
2. Test Docker builds for both `app/` and `automation/` layers
3. Verify CI workflows execute correctly
4. Update deployment documentation (fly.toml paths if needed)
5. Monitor first production deployment for path issues

## Step by Step Tasks

### Phase 1: Preparation and Safety
- Create feature branch from `develop`: `git checkout -b chore/54-separate-agentic-application-layers`
- Create backup tag: `git tag backup-before-layer-separation`
- Create directory structure: `mkdir -p app automation`
- Document current file locations: `git ls-files > /tmp/pre-migration-files.txt`

### Phase 2: Move Application Layer to app/
- Move TypeScript source: `git mv src app/`
- Move tests: `git mv tests app/`
- Move application configs: `git mv app/package.json bun.lock app/tsconfig.json app/`
- Move Dockerfile: `git mv Dockerfile app/`
- Move Supabase configs: `git mv supabase app/`
- Move application scripts: `git mv scripts app/` (or copy shared ones)
- Copy `.env.sample` to `app/.env.sample`

### Phase 3: Move Agentic Layer to automation/
- Move ADW modules: `git mv adws automation/`
- Move ADW Docker configs: `git mv docker automation/`
- Move Claude commands: `git mv .claude automation/` (or keep at root if shared)
- Copy `automation/adws/.env.sample` to `automation/.env.sample`

### Phase 4: Update Application Layer References
- Update `app/tsconfig.json` paths (if absolute paths were used)
- Update `app/package.json` scripts:
  - Change script paths: `"test:setup": "../scripts/setup-test-db.sh"` → `"test:setup": "./scripts/setup-test-db.sh"`
- Update `app/Dockerfile`:
  - Change `COPY app/package.json bun.lock app/tsconfig.json ./` (paths are now relative to app/)
  - Change `COPY . .` context (now copies from app/)
- Update import paths in test files if they reference relative paths outside app/

### Phase 5: Update Agentic Layer References
- Update ADW scripts to reference application layer:
  - Change `app/src/index.ts` → `../app/src/index.ts`
  - Change `app/package.json` → `../app/package.json`
- Update `automation/docker/adw-runner.Dockerfile`:
  - Change build context references
  - Update COPY paths to reference `../app/` if needed
- Update `.claude/commands/*.md` (if moved):
  - Change `/prime` references to new paths
  - Update validation command paths

### Phase 6: Update Shared Infrastructure
- Update `docker-compose.yml`:
  - Change `dev` service build context: `context: .` → `context: ./app`
  - Change `home` service build context: `context: .` → `context: ./app`
  - Change `adw_runner` service dockerfile: `dockerfile: docker/adw-runner.Dockerfile` → `dockerfile: ./automation/docker/adw-runner.Dockerfile`
  - Change `adw_webhook` service dockerfile: `dockerfile: docker/adw-webhook.Dockerfile` → `dockerfile: ./automation/docker/adw-webhook.Dockerfile`
  - Update volume mounts if needed
- Split `.github/workflows/ci.yml`:
  - Create `.github/workflows/app-ci.yml` with TypeScript testing
  - Create `.github/workflows/automation-ci.yml` with Python testing (if applicable)
  - Update working directories: `working-directory: app` for app CI
  - Update script paths: `chmod +x app/.github/scripts/setup-supabase-ci.sh`
- Update `.gitignore`:
  - Change `/.adw_logs` → `/automation/.adw_logs` (if scoped)
  - Change `automation/adws/.env` → `automation/adws/.env`
- Update root `README.md`:
  - Add new structure diagram
  - Link to `app/README.md` and `automation/README.md`
- Update `CLAUDE.md`:
  - Update architecture section with new paths
  - Update command examples: `bun run app/src/index.ts` → `cd app && bun run app/src/index.ts`

### Phase 7: Update Documentation
- Update `docs/specs/*.md` files:
  - Find/replace `app/src/` → `app/src/`
  - Find/replace `app/tests/` → `app/tests/`
  - Find/replace `automation/adws/` → `automation/adws/`
- Update `.claude/commands/conditional_docs.md`:
  - Add condition: "When working with files under `app/src/**`" (instead of `app/src/**`)
  - Add condition: "When working with files under `automation/adws/**`" (instead of `automation/adws/**`)
- Create `app/README.md`:
  - Extract application-specific setup from root README
  - Include quickstart commands
- Create `automation/README.md`:
  - Move from `automation/adws/README.md` (or copy)
  - Update relative paths

### Phase 8: Validation and Testing
- Verify directory structure: `tree -L 2 -a`
- Check for broken symlinks: `find . -xtype l`
- Run application layer validation:
  - `cd app && bun install`
  - `cd app && bun run lint`
  - `cd app && bunx tsc --noEmit`
  - `cd app && bun run test:setup`
  - `cd app && bun test`
  - `cd app && bun run test:teardown`
- Run agentic layer validation (if tests exist):
  - `cd automation && uv run pytest automation/adws/adw_tests`
- Test Docker builds:
  - `docker compose build dev` (app layer)
  - `docker compose build adw_runner` (automation layer)
- Verify CI workflows parse correctly:
  - `gh workflow view app-ci.yml`
  - `gh workflow view automation-ci.yml`
- Run grep for broken path references:
  - `grep -r "\\bapp/src/" --include="*.md" docs/ | grep -v "app/src/"`
  - `grep -r "\\bapp/tests/" --include="*.md" docs/ | grep -v "app/tests/"`
  - `grep -r "\\bautomation/adws/" --include="*.md" docs/ automation/ | grep -v "automation/adws/"`

### Phase 9: Commit and Push
- Review all changes: `git status`
- Stage changes: `git add -A`
- Commit with descriptive message:
  ```bash
  git commit -m "$(cat <<'EOF'
  chore: separate agentic and application layers into distinct directories (#54)

  Restructures the repository to eliminate cross-contamination between:
  - Application layer (app/): TypeScript/Bun API service
  - Agentic layer (automation/): Python ADW automation

  Changes:
  - Move app/src/, app/tests/, package.json → app/
  - Move automation/adws/, docker/ → automation/
  - Split CI workflows into app-ci.yml and automation-ci.yml
  - Update all documentation and configuration references
  - Update Docker Compose build contexts

  All 133 tests pass. Docker builds verified. No breaking changes.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```
- Push branch: `git push -u origin chore/54-separate-agentic-application-layers`

### Phase 10: Create Pull Request
- Create PR using slash command:
  ```bash
  /pull_request chore/54-separate-agentic-application-layers {"number":54,"title":"chore: separate agentic layer (automation/adws/) from application layer into distinct directories"} /Users/jayminwest/Projects/kota-db-ts/docs/specs/chore-54-separate-agentic-application-layers.md adw-chore-54
  ```

## Risks

**Risk:** Relative import paths in TypeScript break after moving to app/
**Mitigation:** The project uses TypeScript path aliases (`@api/*`, `@db/*`, etc.) defined in app/tsconfig.json, which are relative to `baseUrl`. These should continue to work as long as app/tsconfig.json moves with the code. Verify with `cd app && bunx tsc --noEmit` before committing.

**Risk:** Docker builds fail due to incorrect COPY paths or build contexts
**Mitigation:** Update all Dockerfiles to use paths relative to their new locations. Test builds locally with `docker compose build` before pushing. The main Dockerfile in `app/` will need `COPY . .` to work from the app/ context.

**Risk:** CI workflows fail due to incorrect working directories or script paths
**Mitigation:** Split CI into `app-ci.yml` and `automation-ci.yml` with explicit `working-directory` directives. Test workflow syntax with `gh workflow view`. The setup scripts in `.github/scripts/` should either be duplicated or referenced with relative paths like `../scripts/`.

**Risk:** ADW automation scripts can't find application files (app/src/index.ts, app/package.json)
**Mitigation:** Update all ADW scripts to use relative paths like `../app/src/index.ts`. The `adw_modules/ts_commands.py` likely references these files and will need updates. Test with a dry-run ADW execution.

**Risk:** Developer documentation becomes stale with old paths
**Mitigation:** Update all `docs/specs/*.md` files with find/replace. Add a note to `CLAUDE.md` about the restructuring date. Update `.claude/commands/conditional_docs.md` to reflect new path conditions.

**Risk:** Deployed services break due to incorrect runtime paths
**Mitigation:** The application runtime (Dockerfile CMD) uses relative paths like `bun run app/src/index.ts`, which will still work from within the app/ directory. The Docker build context change is transparent to the running container. Verify with local Docker Compose testing before deployment.

**Risk:** Git history becomes harder to trace after file moves
**Mitigation:** Use `git mv` instead of `rm` + `add` to preserve history. Use `git log --follow <file>` to trace history across moves. The backup tag (`backup-before-layer-separation`) allows easy comparison.

**Risk:** Shared scripts (scripts/*.sh) need to be in multiple places
**Mitigation:** Evaluate each script in `scripts/` to determine if it's application-specific (move to `app/scripts/`), automation-specific (move to `automation/scripts/`), or truly shared (keep at root). Update app/package.json and ADW scripts accordingly.

## Validation Commands

### Application Layer (from app/ directory)
- `cd app && bun install` — Install dependencies
- `cd app && bun run lint` — Lint TypeScript code
- `cd app && bunx tsc --noEmit` — Type-check
- `cd app && bun test` — Run 133 tests
- `cd app && bun run build` — Verify build
- `cd app && bun run test:validate-migrations` — Check migration sync
- `cd app && bun run test:validate-env` — Check for hardcoded env vars

### Agentic Layer (from automation/ directory)
- `cd automation && uv run pytest automation/adws/adw_tests` — Run Python tests (if applicable)
- `cd automation && uv run automation/adws/health_check.py --json` — Verify prerequisites

### Docker Validation
- `docker compose build dev` — Build app service
- `docker compose build home` — Build production app service
- `docker compose build adw_runner` — Build automation runner
- `docker compose build adw_webhook` — Build automation webhook
- `docker compose up -d supabase-db supabase-rest` — Test Supabase stack

### Path Reference Validation
- `grep -r "\\bapp/src/" --include="*.md" docs/ | grep -v "app/src/"` — Find outdated app/src/ references
- `grep -r "\\bapp/tests/" --include="*.md" docs/ | grep -v "app/tests/"` — Find outdated app/tests/ references
- `grep -r "\\bautomation/adws/" --include="*.md" docs/ automation/ | grep -v "automation/adws/"` — Find outdated automation/adws/ references
- `find . -xtype l` — Find broken symlinks

### CI Validation
- `gh workflow view app-ci.yml` — Verify app CI workflow syntax
- `gh workflow view automation-ci.yml` — Verify automation CI workflow syntax (if created)

## Deliverables

### Code Changes
- New directory structure: `app/` and `automation/` at repository root
- All application files moved to `app/` with preserved git history
- All automation files moved to `automation/` with preserved git history
- Updated path references in all configuration files

### Configuration Updates
- `docker-compose.yml` with updated build contexts and volume mounts
- `.github/workflows/app-ci.yml` for application-specific CI
- `.github/workflows/automation-ci.yml` for automation-specific CI (if applicable)
- `app/tsconfig.json` paths verified to work from `app/` directory
- `app/package.json` scripts adjusted for new directory structure

### Documentation Updates
- Root `README.md` updated with new structure diagram
- `CLAUDE.md` updated with new architecture paths
- `app/README.md` created with application quickstart
- `automation/README.md` created (moved from automation/adws/README.md)
- All `docs/specs/*.md` files updated with corrected paths
- `.claude/commands/conditional_docs.md` updated with new path conditions

### Validation Proof
- All 133 tests passing from `app/` directory
- Docker Compose builds succeed for all services
- CI workflows parse without syntax errors
- No broken path references in documentation (verified by grep)
- Git history preserved (verified by `git log --follow`)
