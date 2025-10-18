# Chore Plan: Integrate Automation Layer Tests into CI with uv Support

## Context

The automation layer (`automation/adws/`) has a comprehensive pytest test suite (48+ tests covering worktree management, state, workflow ops, diagnostics, validation, and utilities), but these tests are not integrated into CI. This resulted in PR #78 introducing 4 failing tests that weren't caught until manual review (later fixed in commit 602be33).

**Current State**:
- ✅ Application CI exists (`.github/workflows/app-ci.yml`) - runs Bun tests for TypeScript code
- ❌ No automation CI workflow for Python tests in `automation/adws/adw_tests/`
- ❌ Tests must be run manually with `python3 -m pytest` or via `uv run pytest`
- ❌ PR #78 merged with 4 failing tests (later fixed in 602be33)
- ✅ Project uses `uv` package manager (configured in `automation/pyproject.toml`)

**Problem**:
Without automated testing in CI, Python code changes can introduce regressions that aren't discovered until:
1. Manual review (if reviewer runs tests)
2. Production runtime errors
3. Downstream workflow failures

This defeats the purpose of having a test suite and violates continuous integration best practices.

**Constraints**:
- High priority (blocks other work)
- Small effort (< 1 day)
- Must not disrupt existing app-ci workflow
- Must use `uv` package manager (already in use locally)
- Must follow existing CI patterns (path filtering, branch protection)

## Relevant Files

### Existing Files to Modify
- `.github/workflows/` — Create new `automation-ci.yml` workflow
- `automation/pyproject.toml` — May need linting/type checking tool dependencies
- `automation/adws/README.md` — Document CI setup and add status badge
- `.claude/commands/docs/conditional_docs.md` — Add conditions for automation CI documentation

### Files to Reference (no changes)
- `.github/workflows/app-ci.yml` — Reference for CI patterns and structure
- `automation/adws/adw_tests/test_*.py` — 10 test files with 48+ tests
- `automation/adws/adw_modules/*.py` — Python modules to lint/check

### New Files
- `.github/workflows/automation-ci.yml` — New CI workflow for Python tests

## Work Items

### Preparation
- Review existing test suite to understand dependencies (git, Python 3.12+)
- Verify `pyproject.toml` pytest configuration is CI-ready
- Check if `uv.lock` exists (appears missing, will need `uv sync` to create)
- Review `.github/workflows/app-ci.yml` for CI patterns to replicate

### Execution
1. **Create automation-ci.yml workflow**
   - Mirror structure of `app-ci.yml` (path filtering, branch triggers)
   - Install Python 3.12 via `actions/setup-python@v5`
   - Install `uv` via `astral-sh/setup-uv@v5` with caching enabled
   - Configure git identity for worktree tests
   - Run Python syntax check on all modules
   - Run pytest suite with verbose output
   - Add optional linting step (non-blocking initially)

2. **Update project documentation**
   - Add CI status badge to `automation/adws/README.md`
   - Document test execution commands and CI setup
   - Add troubleshooting section for common CI failures

3. **Extend conditional_docs.md**
   - Add automation CI documentation conditions
   - Reference new CI workflow setup guide

### Follow-up
- Monitor first CI runs for false positives or environmental issues
- Verify CI completes in < 2 minutes (target time)
- Confirm branch protection can require automation-ci check
- Add GitHub status check requirement to repository settings (manual step for maintainers)

## Step by Step Tasks

### Phase 1: CI Workflow Creation
1. Create `.github/workflows/automation-ci.yml` with:
   - Trigger on push to `main`/`develop` and PRs affecting `automation/**` paths
   - Install Python 3.12 via `actions/setup-python@v5`
   - Install `uv` via `astral-sh/setup-uv@v5` with `enable-cache: true`
   - Configure git identity: `git config --global user.name/user.email`
   - Set `working-directory: automation` as default
   - Run syntax check: `python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py`
   - Install dependencies: `uv sync --frozen` (creates lockfile if missing)
   - Run test suite: `uv run pytest adws/adw_tests/ -v --tb=short`

### Phase 2: Documentation Updates
2. Add CI status badge to `automation/adws/README.md`:
   - Badge: `![Automation CI](https://github.com/jayminwest/kota-db-ts/workflows/Automation%20CI/badge.svg)`
   - Add "CI Integration" section documenting test execution
   - Add troubleshooting guide for CI failures

3. Extend `.claude/commands/docs/conditional_docs.md`:
   - Add condition: "When working on automation CI or testing infrastructure, read `.github/workflows/automation-ci.yml`"
   - Add reference to automation test documentation

### Phase 3: Validation & Deployment
4. Create test PR with intentional Python syntax error to verify CI catches failures
5. Create test PR with failing test to verify CI catches test failures
6. Create clean PR with Python changes to verify CI passes
7. Verify CI runtime is < 2 minutes
8. Push branch with all changes: `git push -u origin chore/79-automation-ci-integration`
9. Run `/pull_request chore/79-automation-ci-integration <issue_json> docs/specs/chore-79-automation-ci-integration.md <adw_id>` to create PR

## Risks

### Risk: uv.lock missing - first run may create lockfile
**Mitigation**:
- Use `uv sync` instead of `uv sync --frozen` in first iteration
- After first successful run, commit lockfile if created
- Switch to `--frozen` flag for deterministic dependency resolution

### Risk: CI may be slower than local tests (local completes in ~1.5s)
**Mitigation**:
- Use `uv` caching via `enable-cache: true` to speed up dependency installation
- Target < 2 minute total runtime
- Monitor first few runs for performance bottlenecks

### Risk: Git operations in CI may behave differently than local
**Mitigation**:
- Configure git identity in CI (same as test fixtures do locally)
- Use `actions/checkout@v4` with default settings (full history available)
- Worktree tests already use temporary directories (isolated from checkout)

### Risk: False positives from syntax checker
**Mitigation**:
- Start with basic syntax check (`py_compile`) only
- Add linting incrementally (ruff, mypy) as optional/non-blocking steps
- Document known limitations in troubleshooting guide

### Risk: Breaking changes to uv or GitHub Actions
**Mitigation**:
- Pin action versions (`astral-sh/setup-uv@v5`, `actions/setup-python@v5`)
- Pin Python version (3.12) in workflow and pyproject.toml
- Document action version requirements in workflow comments

## Validation Commands

### Pre-Implementation Validation
```bash
# Verify pytest configuration
cd automation && cat pyproject.toml | grep -A5 pytest

# Run tests locally with uv (should complete in ~1.5s)
cd automation && uv run pytest adws/adw_tests/ -v

# Check Python syntax manually
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py

# Verify git operations work in test environment
cd automation && uv run pytest adws/adw_tests/test_git_ops_worktree.py -v
```

### Post-Implementation Validation
```bash
# Verify workflow syntax
gh workflow view automation-ci.yml

# Check workflow runs
gh run list --workflow=automation-ci.yml

# Test CI with intentional failure (separate PR)
# Add syntax error to adws/adw_modules/utils.py, commit, push
# Verify CI fails with parse error

# Test CI with test failure (separate PR)
# Modify test assertion to fail, commit, push
# Verify CI fails with test error

# Test CI with clean changes (this PR)
# Make documentation-only changes, commit, push
# Verify CI passes in < 2 minutes
```

### Integration Validation
```bash
# Verify both CI workflows run independently
gh run list --limit 5

# Check branch protection can require both checks
gh api repos/:owner/:repo/branches/develop/protection

# Verify CI status badge renders correctly
# Visit automation/adws/README.md in GitHub UI
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `ci(automation): add pytest workflow` not `Based on the plan, this commit adds a pytest workflow`

**Example valid commits**:
- `ci(automation): add GitHub Actions workflow for pytest suite`
- `docs(automation): add CI status badge and troubleshooting guide`
- `chore(automation): generate uv.lock for deterministic dependencies`

## Deliverables

### Code Changes
- `.github/workflows/automation-ci.yml` — New CI workflow for automation layer tests
- `automation/uv.lock` — Dependency lockfile (if generated by first CI run)

### Documentation Updates
- `automation/adws/README.md` — CI status badge, setup documentation, troubleshooting guide
- `.claude/commands/docs/conditional_docs.md` — Automation CI documentation conditions

### Validation Artifacts
- Test PR with syntax error (demonstrates CI catches parse errors)
- Test PR with test failure (demonstrates CI catches test failures)
- This PR with clean changes (demonstrates CI passes successfully)

## Benefits

1. **Prevent Regressions**: Catch Python test failures before merge (addresses PR #78 issue)
2. **Faster Feedback**: Automated validation in < 2 minutes vs manual review
3. **Confidence**: Reviewers can trust tests pass before code review
4. **Documentation**: CI workflow serves as executable documentation of validation requirements
5. **Consistency**: Same test commands run in CI and local development (via `uv`)
6. **Parallel Development**: Both application and automation layers have independent CI pipelines

## Future Enhancements (Out of Scope)

- Add test coverage reporting with `pytest-cov` and Codecov integration
- Add linting with `ruff` (errors only, non-blocking warnings)
- Add type checking with `mypy` (optional, non-blocking)
- Add matrix strategy to test multiple Python versions (3.12, 3.13)
- Add integration tests for full workflow execution (adw_plan.py → adw_test.py)
- Add performance benchmarking for critical paths (indexing, git ops)
- Generate test reports and upload as artifacts
- Add health check validation step (`adws/health_check.py --json`)

## References

- **Trigger**: PR #78 review - 4 tests failed but weren't caught by CI
- **Test Suite**: `automation/adws/adw_tests/` (10 test files, 48+ tests)
- **Package Config**: `automation/pyproject.toml` - pytest and uv configuration
- **Existing CI**: `.github/workflows/app-ci.yml` - application tests (TypeScript/Bun)
- **Related Issue**: #65 - worktree isolation feature that introduced failing tests
- **Fixed Commit**: 602be33 - resolved the 4 failing tests from PR #78
- **UV Documentation**: https://github.com/astral-sh/uv - modern Python package manager
- **GitHub Actions**: https://docs.github.com/en/actions - CI/CD platform documentation
