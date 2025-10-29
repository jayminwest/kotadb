# Chore Plan: Change Default Branch to Develop

## Context
GitHub's auto-close feature for PR issue references only triggers when PRs merge into the default branch. KotaDB currently uses `main` as the default branch, but all active development PRs merge into `develop`, causing issues to remain open despite correct `closes #XXX` syntax in merged PRs. This creates manual issue closure overhead and stale open issues.

**Current State:**
- Default branch: `main`
- Active development branch: `develop`
- All recent PRs merge to `develop` (#326, #325, #324, #323, #322)
- Issue auto-close status: Not working

**Goal:** Align repository default branch with active development workflow to enable automatic issue closure.

**Constraints:**
- Must maintain branch protection rules
- Must not break CI/CD deployment workflows
- Must update all documentation references
- Low risk, high impact maintenance task

## Relevant Files
- `README.md` — Main documentation with setup instructions
- `CLAUDE.md` — Development guidance and workflow documentation
- `.github/workflows/*.yml` — CI/CD workflows that may reference default branch
- `docs/deployment-guide.md` — Deployment process documentation (if exists)
- `.github/pull_request_template.md` — PR template with branch references (if exists)
- `.github/CONTRIBUTING.md` — Contribution guidelines (if exists)

### New Files
None - this is configuration and documentation update only

## Work Items

### Preparation
1. Verify current branch protection rules on `main` branch
2. Back up current GitHub repository settings (document branch protection config)
3. Identify all documentation files referencing `main` as default branch
4. Review CI/CD workflows for hardcoded `main` branch references

### Execution
1. Configure branch protection rules for `develop` branch (mirror `main` settings)
2. Change repository default branch from `main` to `develop` via GitHub settings
3. Update all documentation files to reflect new default branch
4. Update any CI/CD workflow files with hardcoded default branch references
5. Verify branch protection rules are active on `develop`

### Follow-up
1. Create test issue and PR to verify auto-close functionality
2. Monitor first few PRs after change to ensure auto-close works
3. Clean up test artifacts
4. Document change in project changelog or release notes

## Step by Step Tasks

### 1. Audit Current Configuration
- Run `gh api repos/:owner/:repo/branches/main/protection` to capture current protection rules
- Run `git grep -n "default branch" README.md CLAUDE.md docs/` to find documentation references
- Run `git grep -n "main branch" README.md CLAUDE.md docs/` to find additional references
- Run `git grep -n "branches:.*main" .github/workflows/` to find CI workflow references
- Document current settings in this issue's comments

### 2. Configure Branch Protection for Develop
- Run `gh api repos/:owner/:repo/branches/develop/protection` to check existing protection
- Apply same protection rules to `develop` as currently configured on `main`:
  - Require pull request reviews before merging
  - Require status checks to pass (CI workflows)
  - Configure appropriate additional rules based on audit
- Verify configuration: `gh api repos/:owner/:repo/branches/develop/protection`

### 3. Update Documentation
- Edit `README.md`: Update default branch references in setup/clone instructions
- Edit `CLAUDE.md`: Update branch workflow documentation (Git Flow section)
- Edit `docs/deployment-guide.md`: Update deployment flow documentation (if file exists)
- Edit `.github/pull_request_template.md`: Update base branch references (if file exists)
- Edit `.github/CONTRIBUTING.md`: Update contribution workflow (if file exists)
- Search for any other markdown files with hardcoded branch references

### 4. Review and Update CI/CD Workflows
- Review `.github/workflows/*.yml` files identified in audit
- Update any deployment workflows that assume `main` is default
- Most workflows using `pull_request` triggers should be unaffected
- Ensure production deployments still explicitly target `main` branch

### 5. Change Default Branch
- Run `gh repo edit --default-branch develop` to change repository default
- Verify change: `gh repo view --json defaultBranchRef`
- Confirm via GitHub Web UI: Settings → Branches → Default branch shows "develop"

### 6. Validate Auto-Close Functionality
- Create test issue: "test: verify auto-close on develop merge (#test-auto-close)"
- Create test branch from `develop`
- Create test PR to `develop` with "Closes #<test-issue-number>" in description
- Merge test PR to `develop`
- Verify test issue auto-closes within 1-2 minutes
- If auto-close works: Clean up test issue and PR
- If auto-close fails: Investigate and troubleshoot before proceeding

### 7. Final Validation and Push
- Run `bun run lint` to verify no syntax issues
- Run `bun run typecheck` to verify TypeScript compilation
- Run `git grep -n "main.*default" .` to catch any missed references
- Commit all changes: `chore(repo): change default branch to develop for auto-close`
- Push branch: `git push -u origin chore/329-change-default-branch-develop`

## Risks

**Risk:** External users clone wrong branch by default
**Mitigation:** README.md will have clear setup instructions. Users cloning via `gh repo clone` respect default branch setting. `develop` is the active branch so this is desired behavior.

**Risk:** CI/CD deployments target wrong branch
**Mitigation:** Production deployment workflows explicitly reference `main` branch for production deploys. Review workflows in Step 4 to confirm explicit branch targets.

**Risk:** Branch protection rules not properly configured
**Mitigation:** Configure protection on `develop` before changing default. Verify configuration before and after change.

**Risk:** Team confusion about new default
**Mitigation:** Add comment to issue when complete. Update CLAUDE.md with clear workflow documentation. Aligns with existing Git Flow practice.

**Risk:** Broken links or references in documentation
**Mitigation:** Comprehensive grep search in preparation phase. Manual review of all identified files.

## Validation Commands

### Pre-Change Validation
```bash
# Verify branch exists and is up to date
git fetch origin
git branch -a | grep develop

# Check branch protection configuration
gh api repos/:owner/:repo/branches/develop/protection
```

### Post-Change Validation
```bash
# Basic checks
bun run lint
bun run typecheck
bun test

# Verify default branch change
gh repo view --json defaultBranchRef

# Verify branch protection active
gh api repos/:owner/:repo/branches/develop/protection

# Search for missed references
git grep -n "default.*main" .
git grep -n "main.*default" .
git grep -n "base.*main" .github/

# Verify CI workflows
git grep -n "branches:" .github/workflows/
```

### Auto-Close Validation
```bash
# Test workflow (manual steps documented in Step 6)
# 1. Create test issue
# 2. Create test PR with "Closes #XXX"
# 3. Merge PR
# 4. Verify issue auto-closes
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(repo): change default branch to develop for auto-close` not `Based on the plan, the commit should change the default branch`

### Example Valid Commits
```
chore(repo): configure branch protection for develop
docs: update default branch references to develop
ci: ensure deployment workflows target main explicitly
chore(repo): change default branch to develop
test: verify auto-close functionality on develop
```

## Deliverables

### Configuration Changes
- GitHub repository default branch changed to `develop`
- Branch protection rules configured for `develop` (matching `main`)
- Auto-close functionality verified via test PR

### Documentation Updates
- `README.md` updated with correct default branch references
- `CLAUDE.md` updated with branch workflow documentation
- Any additional documentation files updated (deployment guides, PR templates, contributing guides)

### CI/CD Updates
- `.github/workflows/*.yml` reviewed and updated if needed
- Production deployment workflows verified to explicitly target `main`

### Validation Evidence
- Test issue/PR demonstrating auto-close functionality
- Branch protection API response showing active rules
- Grep search results showing no hardcoded `main` references

### Process Documentation
- Comment on issue #329 documenting completion
- Update project changelog or release notes (if applicable)
