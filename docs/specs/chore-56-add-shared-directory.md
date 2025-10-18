# Chore Plan: Add Shared Directory for Cross-Layer Dependencies

## Context

Following the separation of application layer (`app/`) and agentic layer (`automation/`) in #54, we need a designated location for shared resources that both layers legitimately depend on. Currently, shared resources like documentation, Claude commands, and schemas are scattered at the repository root, making ownership boundaries unclear.

**Why this chore matters now:**
- Three-layer architecture (app, automation, shared) provides clearer separation than two-layer
- Documentation (`docs/`) is referenced by both layers but currently at root
- `.claude/commands/` is used by automation but contains cross-layer concerns
- Future API contracts and database schemas need a neutral home
- Developers need clarity on where to place genuinely shared resources

**Constraints:**
- Must not break existing paths in active PRs or deployed services
- Both layers must be able to reference shared/ without creating tight coupling
- Git history should be preserved for moved files
- CI workflows must continue to work without modification
- Documentation updates should be minimal

## Relevant Files

### Files to Move to shared/
- `docs/` — Documentation referenced by both layers (9 files including specs/, vision/)
- `automation/.claude/` — Claude Code commands (currently in automation, but cross-layer)
- Root-level documentation that applies to both layers

### Files to Update (Path References)
- `README.md` — Update structure diagram and paths
- `CLAUDE.md` — Update architecture section with shared/ layer
- `automation/adws/README.md` — Update documentation references
- `.gitignore` — Add shared/ specific ignore patterns if needed
- `docker-compose.yml` — Potentially mount shared/ if needed
- `.github/workflows/app-ci.yml` — Update paths to shared/docs/
- `.claude/commands/conditional_docs.md` — Update with shared/ path conditions

### Files That Stay at Root
- `docker-compose.yml` — Orchestration configuration
- `docker-compose.test.yml` — Test infrastructure
- `fly.toml` — Deployment configuration
- `.gitignore` — Repository-wide ignore patterns
- `.github/` — CI/CD workflows

### New Files
- `shared/README.md` — Explain purpose and guidelines for shared resources
- `shared/schemas/` — Future home for API contracts, database schemas (directory only)

## Work Items

### Preparation
1. Verify that no active PRs will be broken by moving docs/
2. Create branch from current state (should be chore/54 branch or develop)
3. Document current references to docs/ and .claude/ in both layers
4. Plan migration to minimize path breakage

### Execution
1. **Create shared/ directory structure**
   - Create `shared/` at repository root
   - Create `shared/docs/`, `shared/.claude/`, `shared/schemas/`
   - Create `shared/README.md` explaining the shared layer

2. **Move documentation to shared/**
   - Move `docs/` → `shared/docs/`
   - Move `automation/.claude/` → `shared/.claude/` (or keep at automation if truly ADW-specific)

3. **Update path references**
   - Update `README.md` structure diagram
   - Update `CLAUDE.md` architecture paths
   - Update `automation/adws/README.md` documentation links
   - Update `.claude/commands/conditional_docs.md` with shared/ paths

4. **Verify no broken references**
   - Grep for hardcoded `docs/` paths
   - Grep for hardcoded `.claude/` paths
   - Test documentation links

### Follow-up
1. Monitor CI workflows to ensure path references work
2. Update any external documentation or deployment guides
3. Consider adding linting rule to prevent hardcoded absolute paths

## Step by Step Tasks

### Phase 1: Preparation and Branch Setup
- Ensure we're on the correct branch (chore/54 or develop)
- Create issue #56 tracking branch: `git checkout -b chore/56-add-shared-directory`
- Create backup tag: `git tag backup-before-shared-layer`
- Document current structure: `tree -L 2 -I "node_modules|.git" > /tmp/pre-shared-structure.txt`

### Phase 2: Create Shared Directory Structure
- Create shared directory: `mkdir -p shared/schemas`
- Create README explaining shared layer purpose:
  ```bash
  cat > shared/README.md <<'EOF'
  # Shared Resources

  This directory contains resources shared across both the application layer (app/) and agentic layer (automation/).

  ## Structure

  - `docs/` - Documentation, specifications, and vision documents
  - `.claude/` - Claude Code slash commands and configuration
  - `schemas/` - API contracts, database schemas, and shared type definitions

  ## Guidelines

  **What belongs in shared/:**
  - Documentation that applies to multiple layers
  - Configuration used by both application and automation
  - Type definitions and schemas that cross layer boundaries
  - Scripts or utilities that are genuinely layer-agnostic

  **What does NOT belong in shared/:**
  - Application-specific code (goes in app/)
  - Automation-specific scripts (goes in automation/)
  - Layer-specific configuration or documentation

  ## Usage

  Both layers can reference shared resources:
  - From app/: `../shared/docs/schema.md`
  - From automation/: `../shared/docs/specs/`
  - From root: `shared/docs/`
  EOF
  ```

### Phase 3: Move Documentation to shared/
- Move docs directory: `git mv docs shared/docs`
- Move .claude commands (if appropriate): `git mv automation/.claude shared/.claude`
  - Note: Evaluate if .claude should stay in automation/ or move to shared/
  - Decision: Move to shared/ since commands reference both layers

### Phase 4: Update Root Documentation
- Update `README.md` structure section:
  ```markdown
  ## Project Layout

  ```
  app/                   # Application layer (TypeScript/Bun API service)
    app/src/                 # API, auth, database, indexer, MCP implementation
    app/tests/               # Test suite (133 tests)
    app/package.json         # Bun dependencies and scripts

  automation/            # Agentic layer (Python AI developer workflows)
    automation/adws/                # ADW automation scripts and modules
    docker/              # ADW-specific Docker images

  shared/                # Cross-layer resources
    docs/                # Documentation, specs, vision
    .claude/             # Claude Code slash commands
    schemas/             # API contracts, database schemas (future)

  .github/workflows/     # CI workflows
  ```
  ```
- Update `CLAUDE.md` architecture section with shared/ references:
  - Change `docs/schema.md` → `shared/docs/schema.md`
  - Add note about three-layer architecture
- Update `.gitignore` if needed (likely no changes required)

### Phase 5: Update Automation Layer References
- Update `automation/adws/README.md`:
  - Change `docs/specs/` → `../shared/docs/specs/`
  - Change `.claude/commands/` → `../shared/.claude/commands/`
- Update any ADW Python scripts that reference docs/ (if any):
  ```bash
  grep -r "docs/" automation/adws --include="*.py" | grep -v ".pyc"
  ```
- Update `.claude/commands/conditional_docs.md`:
  - Change conditions to reference `shared/docs/` instead of `docs/`

### Phase 6: Update CI Workflows
- Check if `.github/workflows/app-ci.yml` references docs/:
  ```bash
  grep "docs/" .github/workflows/*.yml
  ```
- Update any references to `docs/` → `shared/docs/`
- No changes expected since CI doesn't currently reference docs/

### Phase 7: Update Docker Configuration
- Check `docker-compose.yml` for docs/ references:
  ```bash
  grep "docs/" docker-compose.yml
  ```
- Check if any volumes need updating (likely not, since docs are not mounted)
- Verify supabase-kong volume path is correct (should reference `app/supabase/` not `shared/`)

### Phase 8: Verify Path References
- Search for hardcoded docs/ paths in markdown:
  ```bash
  grep -r "\bdocs/" --include="*.md" . | grep -v "shared/docs/" | grep -v ".git"
  ```
- Search for .claude/ paths:
  ```bash
  grep -r "\.claude/" --include="*.md" --include="*.py" . | grep -v "shared/.claude/" | grep -v ".git"
  ```
- Verify no broken relative links in documentation:
  ```bash
  cd shared/docs && grep -r "\.\./\.\." --include="*.md" specs/
  ```

### Phase 9: Update Documentation Cross-References
- Update `shared/docs/specs/*.md` files if they reference docs/:
  ```bash
  cd shared/docs/specs && sed -i '' 's|docs/|../|g' *.md
  ```
  - Example: `docs/schema.md` → `../schema.md`
  - Example: `docs/specs/` → `../specs/` (relative within shared/docs/)
- Update `shared/.claude/commands/conditional_docs.md`:
  - Change all `docs/` → `shared/docs/`
  - Update conditions to reference three-layer architecture

### Phase 10: Validation
- Verify directory structure:
  ```bash
  tree -L 3 -I "node_modules|.git|__pycache__" shared/
  ```
- Verify git history preserved:
  ```bash
  git log --follow shared/docs/schema.md | head -20
  ```
- Check for broken symlinks:
  ```bash
  find . -xtype l
  ```
- Verify no broken documentation links (manual review of key docs):
  - `shared/docs/schema.md`
  - `shared/docs/testing-setup.md`
  - `shared/docs/specs/chore-54-separate-agentic-application-layers.md`

### Phase 11: Commit and Push
- Review all changes: `git status`
- Stage changes: `git add -A`
- Commit:
  ```bash
  git commit -m "$(cat <<'EOF'
  chore: add shared directory for cross-layer dependencies (#56)

  Establishes three-layer architecture:
  - app/: Application layer (TypeScript/Bun API)
  - automation/: Agentic layer (Python ADW)
  - shared/: Cross-layer resources (docs, commands, schemas)

  Changes:
  - Move docs/ → shared/docs/
  - Move automation/.claude/ → shared/.claude/
  - Create shared/schemas/ for future API contracts
  - Update README.md and CLAUDE.md with new structure
  - Update documentation cross-references

  This clarifies ownership boundaries and provides a neutral home for
  genuinely shared resources like documentation and schemas.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  EOF
  )"
  ```
- Push branch: `git push -u origin chore/56-add-shared-directory`

### Phase 12: Create Pull Request
- Create PR:
  ```bash
  /pull_request chore/56-add-shared-directory {"number":56,"title":"chore: add shared directory for cross-layer dependencies"} /Users/jayminwest/Projects/kota-db-ts/shared/docs/specs/chore-56-add-shared-directory.md adw-chore-56
  ```

## Risks

**Risk:** Moving docs/ breaks active PRs or branches
**Mitigation:** The chore/54 branch has just been created and merged, so docs/ move should be safe. If there are conflicts, they'll be in path references only (easy to fix with find/replace). Create this branch from the latest state after #54 merge.

**Risk:** Documentation links break after moving to shared/docs/
**Mitigation:** Most documentation uses relative links (e.g., `docs/schema.md` from root, or `../schema.md` from specs/). After moving to shared/docs/, adjust relative paths in step 9. Use grep to find hardcoded absolute paths and update them.

**Risk:** CI workflows reference docs/ and break
**Mitigation:** Current CI workflows don't appear to reference docs/ for validation. They only test code in app/. If any references exist, update them in Phase 6.

**Risk:** .claude/commands/ needs to stay in automation/ not shared/
**Mitigation:** Evaluate whether commands are truly cross-layer or automation-specific. If they only trigger ADW workflows, keep in automation/. If they're also used by developers for general development (like /prime, /implement), move to shared/. Decision: Move to shared/ since many commands reference app/ layer.

**Risk:** Developers confused about where to put new files
**Mitigation:** Create comprehensive `shared/README.md` with clear guidelines on what belongs in each layer. Include examples of good and bad placement decisions.

**Risk:** Path references in ADW Python scripts break
**Mitigation:** ADW scripts don't currently import or read from docs/ (verified by grep). They reference application files via `../app/`. The .claude/commands/ move requires updating ADW modules if they construct command paths programmatically.

**Risk:** Three-layer structure increases cognitive overhead
**Mitigation:** The shared/ layer is intentionally small and contains only genuinely shared resources. Most development happens in app/ or automation/. The added clarity outweighs the minimal overhead.

## Validation Commands

### Directory Structure Validation
- `tree -L 3 -I "node_modules|.git|__pycache__" shared/` — Verify shared/ structure
- `ls -la shared/docs/` — Confirm docs moved successfully
- `ls -la shared/.claude/commands/` — Confirm commands moved successfully

### Path Reference Validation
- `grep -r "\bdocs/" --include="*.md" README.md CLAUDE.md automation/` — Find outdated docs/ refs
- `grep -r "\.claude/commands" --include="*.md" --include="*.py" .` — Find outdated .claude refs
- `find . -xtype l` — Find broken symlinks

### Git History Validation
- `git log --follow shared/docs/schema.md | head -10` — Verify history preserved
- `git log --follow shared/.claude/commands/prime.md | head -10` — Verify history preserved

### Application Layer (no changes expected)
- `cd app && bun install` — Verify dependencies
- `cd app && bun run lint` — Lint TypeScript
- `cd app && bunx tsc --noEmit` — Type-check
- `cd app && bun test` — Run tests (may need test:setup first)

### Documentation Integrity
- Manually verify key documentation files render correctly:
  - `shared/docs/schema.md`
  - `shared/docs/testing-setup.md`
  - `shared/docs/specs/chore-54-separate-agentic-application-layers.md`
- Check for broken relative links in specs/

## Deliverables

### Directory Structure Changes
- `shared/` directory created at repository root
- `shared/docs/` containing all documentation (moved from root docs/)
- `shared/.claude/` containing Claude Code commands (moved from automation/.claude/)
- `shared/schemas/` created as placeholder for future API contracts
- `shared/README.md` explaining purpose and guidelines

### Configuration Updates
- `README.md` updated with three-layer architecture diagram
- `CLAUDE.md` updated with shared/ references in architecture section
- `automation/adws/README.md` updated with `../shared/docs/` references
- `.claude/commands/conditional_docs.md` updated with `shared/docs/` path conditions

### Documentation Updates
- All spec files updated with corrected relative paths (if needed)
- Documentation cross-references validated and fixed
- Git history preserved for all moved files

### Validation Proof
- Directory structure verified with `tree` command
- Git history preserved (verified with `git log --follow`)
- No broken symlinks (verified with `find`)
- Path references validated with grep
- Documentation links manually verified
