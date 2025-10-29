# Feature Plan: Auto-Merge for ADW PRs After CI Validation

## Overview

### Problem
ADW-generated PRs currently merge manually after CI validation passes, despite 85.7% of PRs merging without formal reviews (42/49 analyzed). This introduces unnecessary latency: median 15 minutes from CI pass to merge, with fast CI runtime (~2-3 minutes). The manual step blocks downstream workflows and doesn't add value for validation-driven merges.

### Desired Outcome
Enable automated PR merging after successful CI validation for ADW-generated PRs, reducing median merge time from 15 minutes to ~3 minutes (CI runtime only). Strengthen CI trust mechanisms (code coverage, build validation, security checks) to ensure auto-merge safety. Target: >80% auto-merge success rate with zero regressions in code quality.

### Non-Goals
- Auto-merge for manually created PRs (human-initiated work requires review)
- Changing GitHub's branch protection rules or required status checks
- Replacing CI validation with weaker checks
- Auto-merge for PRs with merge conflicts (requires manual resolution)

## Technical Approach

### Architecture Notes
The implementation extends the ADW build phase to enable auto-merge after PR creation. GitHub's `gh pr merge --auto` flag configures PRs to merge automatically when all required checks pass (setup, typecheck, lint, test jobs). The merge completes asynchronously after CI finishes, requiring no additional coordination logic in ADW scripts.

### Key Modules to Touch
- `automation/adws/adw_phases/adw_build.py` — Add `gh pr merge --auto --squash` after PR creation (lines 280-300)
- `.github/workflows/app-ci.yml` — Add coverage threshold check and build validation job
- `automation/adws/scripts/analyze_logs.py` — Track auto-merge success/failure in ADW metrics
- `automation/adws/adw_modules/state.py` — Add `auto_merge_enabled` field to state schema

### Data/API Impacts
**State Schema Changes** (`ADWState` in `adw_modules/state.py`):
- Add `auto_merge_enabled: bool` field (default: `False` for safety)
- Add `merge_status: str | None` field for tracking (values: `pending`, `success`, `failed`, `conflict`)
- Add `merge_timestamp: float | None` field for metrics analysis

**Environment Variables**:
- `ADW_AUTO_MERGE` (default: `false`) — Feature flag to enable auto-merge globally

**GitHub API Usage**:
No direct API calls required. Uses `gh pr merge --auto` CLI command which delegates to GitHub's native auto-merge feature.

## Relevant Files

### Modified Files
- `automation/adws/adw_phases/adw_build.py` — Add auto-merge logic after PR creation (lines 280-300)
  - Checks `ADW_AUTO_MERGE` environment flag
  - Runs `gh pr merge --auto --squash --delete-branch` after successful PR creation
  - Logs auto-merge enablement and handles failures gracefully
  - Updates ADW state with merge status

- `.github/workflows/app-ci.yml` — Enhance CI trust with additional validation jobs
  - Add `coverage` job (depends on `test`): runs `bun test --coverage`, uploads artifact, checks threshold (70%)
  - Add `build` job (depends on `test`): runs `bun run build`, verifies output artifacts exist
  - Update job dependency: `test` → [`coverage`, `build`] → auto-merge triggers after all pass

- `automation/adws/adw_modules/state.py` — Extend state schema for auto-merge tracking
  - Add `auto_merge_enabled`, `merge_status`, `merge_timestamp` fields to `ADWState.data` schema
  - Add helper methods: `update_merge_status(status: str)`, `is_auto_merge_enabled() -> bool`

- `automation/adws/scripts/analyze_logs.py` — Add auto-merge metrics tracking
  - Parse `merge_status` from state files
  - Calculate auto-merge success rate (success / (success + failed))
  - Add alert if auto-merge failure rate >10%
  - Include merge time distribution in reports

- `automation/adws/README.md` — Document auto-merge feature and behavior
  - Add "Auto-Merge Workflow" section explaining feature flag, safety checks, failure scenarios
  - Update "Environment Variables" section with `ADW_AUTO_MERGE` flag
  - Add troubleshooting guide for auto-merge failures (conflict resolution, CI failures)

### New Files
- `docs/specs/feature-305-automerge-adw-prs.md` — This plan document

## Task Breakdown

### Phase 1: Auto-Merge Implementation
- Add `ADW_AUTO_MERGE` feature flag with default `false` for safety
- Modify `adw_build.py` to call `gh pr merge --auto --squash --delete-branch` after PR creation
- Add safety check: only enable auto-merge for ADW-generated PRs (check for `automation` label)
- Handle `gh pr merge --auto` failures gracefully (log warning, update state, continue workflow)
- Test with existing CI workflow to verify merge triggers after all jobs pass

### Phase 2: CI Trust Enhancements
- Add `coverage` job to `.github/workflows/app-ci.yml` that runs `bun test --coverage`
- Configure coverage threshold check: fail job if coverage <70%
- Upload coverage report as CI artifact for historical tracking
- Add `build` job that runs `bun run build` and verifies output artifacts
- Add dependency auditing step (basic: check for `npm audit` or `bun audit` support)
- Ensure migration sync validation remains in setup job (already present)

### Phase 3: Monitoring & Metrics
- Extend `ADWState` schema with `auto_merge_enabled`, `merge_status`, `merge_timestamp` fields
- Modify `adw_build.py` to update state after enabling auto-merge
- Add auto-merge metrics tracking to `analyze_logs.py` (success rate, failure distribution)
- Add alert logic: create GitHub issue if auto-merge failure rate >10% over 24 hours
- Validate metrics collection with test runs (seed state files with merge data)

## Step by Step Tasks

### 1. Implement Auto-Merge Logic in Build Phase
- Open `automation/adws/adw_phases/adw_build.py`
- Locate PR creation logic (lines 280-300, after `create_pull_request()` call)
- Add environment flag check: `auto_merge_enabled = os.getenv("ADW_AUTO_MERGE", "false").lower() == "true"`
- Add conditional logic after successful PR creation:
  ```python
  if auto_merge_enabled and pr_url:
      # Extract PR number from URL
      pr_number = pr_url.split('/')[-1]
      logger.info(f"Enabling auto-merge for PR #{pr_number}")

      # Enable auto-merge with squash and branch deletion
      merge_result = subprocess.run(
          ["gh", "pr", "merge", pr_number, "--auto", "--squash", "--delete-branch"],
          capture_output=True,
          text=True,
          cwd=worktree_path
      )

      if merge_result.returncode == 0:
          logger.info(f"Auto-merge enabled for PR #{pr_number}")
          state.update(auto_merge_enabled=True, merge_status="pending")
      else:
          logger.warning(f"Failed to enable auto-merge: {merge_result.stderr}")
          state.update(auto_merge_enabled=False)
  ```
- Add GitHub comment after auto-merge enablement: `"✅ Auto-merge enabled - PR will merge after CI validation passes"`
- Test with `ADW_AUTO_MERGE=false` (default): verify auto-merge NOT enabled
- Test with `ADW_AUTO_MERGE=true`: verify `gh pr merge --auto` executes successfully

### 2. Extend State Schema for Auto-Merge Tracking
- Open `automation/adws/adw_modules/state.py`
- Locate `ADWState` class and `data` property schema
- Add fields to state initialization:
  ```python
  "auto_merge_enabled": False,
  "merge_status": None,  # pending, success, failed, conflict
  "merge_timestamp": None,
  ```
- Add helper methods:
  ```python
  def update_merge_status(self, status: str) -> None:
      self.update(merge_status=status, merge_timestamp=time.time())

  def is_auto_merge_enabled(self) -> bool:
      return self.data.get("auto_merge_enabled", False)
  ```
- Run type-check: `cd automation && uv run pyright adws/adw_modules/state.py`
- Run unit tests: `cd automation && uv run pytest adws/adw_tests/test_state.py -v`

### 3. Add Coverage Job to CI Workflow
- Open `.github/workflows/app-ci.yml`
- Add new job after `test` job:
  ```yaml
  coverage:
    runs-on: ubuntu-latest
    needs: test
    defaults:
      run:
        working-directory: app
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.29

      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: app/node_modules
          key: bun-${{ hashFiles('**/bun.lockb') }}

      - name: Install dependencies (cache miss fallback)
        run: bun install --frozen-lockfile

      - name: Setup test environment
        working-directory: .
        run: .github/scripts/setup-supabase-ci.sh

      - name: Run tests with coverage
        run: |
          export $(grep -v '^#' ../.env.test | xargs) || true
          bun test --coverage

      - name: Check coverage threshold
        run: |
          # TODO: Implement coverage threshold check
          # Extract coverage percentage from output and fail if <70%
          echo "Coverage threshold check placeholder"

      - name: Upload coverage report
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: app/coverage/
          retention-days: 30

      - name: Teardown test environment
        if: always()
        working-directory: .
        run: app/scripts/cleanup-test-containers.sh || true
  ```
- Note: Coverage threshold enforcement is a placeholder (Bun coverage tooling investigation needed)

### 4. Add Build Validation Job to CI Workflow
- Open `.github/workflows/app-ci.yml`
- Add new job after `test` job:
  ```yaml
  build:
    runs-on: ubuntu-latest
    needs: test
    defaults:
      run:
        working-directory: app
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: 1.1.29

      - name: Restore dependencies
        uses: actions/cache@v4
        with:
          path: app/node_modules
          key: bun-${{ hashFiles('**/bun.lockb') }}

      - name: Install dependencies (cache miss fallback)
        run: bun install --frozen-lockfile

      - name: Build application
        run: bun run build

      - name: Verify build artifacts
        run: |
          if [ ! -d "dist" ]; then
            echo "Error: dist/ directory not found after build"
            exit 1
          fi
          echo "Build artifacts verified"
  ```

### 5. Add Auto-Merge Metrics to Log Analysis
- Open `automation/adws/scripts/analyze_logs.py`
- Locate state introspection logic (loads `agents/<adw_id>/adw_state.json`)
- Add auto-merge metrics collection:
  ```python
  # Track auto-merge outcomes
  auto_merge_enabled_count = 0
  auto_merge_success_count = 0
  auto_merge_failed_count = 0

  for state_file in state_files:
      state_data = json.loads(state_file.read_text())
      if state_data.get("auto_merge_enabled"):
          auto_merge_enabled_count += 1
          merge_status = state_data.get("merge_status")
          if merge_status == "success":
              auto_merge_success_count += 1
          elif merge_status in ["failed", "conflict"]:
              auto_merge_failed_count += 1

  # Calculate success rate
  if auto_merge_enabled_count > 0:
      auto_merge_success_rate = (auto_merge_success_count / auto_merge_enabled_count) * 100
  ```
- Add auto-merge section to report output (text, JSON, markdown formats)
- Add alert logic: if `auto_merge_success_rate < 90%` and `auto_merge_enabled_count >= 5`, log warning
- Test with seeded state files containing merge data
- Run analysis script: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 24`

### 6. Update Documentation
- Open `automation/adws/README.md`
- Add "Auto-Merge Workflow" section after "Resilience & Recovery":
  ```markdown
  ## Auto-Merge Workflow

  **Feature #305: Auto-Merge for ADW PRs**

  ADW-generated PRs can automatically merge after successful CI validation, reducing
  median merge time from 15 minutes to ~3 minutes (CI runtime only).

  ### Enabling Auto-Merge

  Set the `ADW_AUTO_MERGE` environment variable to enable:

  ```bash
  export ADW_AUTO_MERGE=true
  uv run adws/adw_sdlc.py <issue_number> <adw_id>
  ```

  ### Safety Mechanisms

  - Auto-merge only enabled for ADW-generated PRs (checked via `automation` label)
  - Requires all CI checks to pass: setup, typecheck, lint, test, coverage, build
  - PRs with merge conflicts require manual resolution
  - Failure to enable auto-merge logs warning but continues workflow

  ### Monitoring

  Track auto-merge success rates via `analyze_logs.py`:

  ```bash
  uv run automation/adws/scripts/analyze_logs.py --format json --hours 24
  ```

  Metrics include:
  - Auto-merge enabled count
  - Success rate (target: >90%)
  - Failure distribution (CI failures, conflicts, timeouts)
  ```
- Update "Environment Variables" section to include `ADW_AUTO_MERGE`
- Add troubleshooting subsection for auto-merge failures

### 7. Validation and Testing
- Create test branch: `git checkout -b test/305-auto-merge-validation`
- Set `ADW_AUTO_MERGE=true` in environment
- Run ADW build phase manually: `uv run automation/adws/adw_phases/adw_build.py <issue_number> <adw_id>`
- Verify auto-merge command executes: check logs for `"Enabling auto-merge for PR #<number>"`
- Verify state file updated: `cat automation/agents/<adw_id>/adw_state.json | jq '.auto_merge_enabled'`
- Push branch and create test PR to validate CI behavior
- Verify PR merges automatically after CI passes
- Test failure scenario: create PR with failing test, verify auto-merge does NOT trigger
- Test conflict scenario: create PR with merge conflict, verify auto-merge does NOT trigger

### 8. Type-Check and Lint
- Run Python type-check: `cd automation && uv run pyright adws/adw_modules/state.py adws/adw_phases/adw_build.py adws/scripts/analyze_logs.py`
- Run Python lint: `cd automation && uv run ruff check adws/`
- Fix any type errors or lint warnings
- Run unit tests: `cd automation && uv run pytest adws/adw_tests/ -v`
- Verify all tests pass

### 9. Build and Integration Testing
- Run full ADW workflow on test issue: `uv run automation/adws/adw_sdlc.py <test_issue_number> test-adw-305`
- Monitor execution logs: `tail -f automation/logs/kota-db-ts/local/test-adw-305/adw_sdlc/execution.log`
- Verify plan phase completes successfully
- Verify build phase enables auto-merge (check logs and state file)
- Verify review phase runs after PR merges
- Check PR merged automatically: `gh pr view <pr_number> --json state`
- Run log analysis: `uv run automation/adws/scripts/analyze_logs.py --format markdown --hours 24`
- Verify auto-merge metrics appear in report

### 10. Final Validation and Commit
- Re-run validation commands:
  - `cd automation && uv run pyright adws/`
  - `cd automation && uv run ruff check adws/`
  - `cd automation && uv run pytest adws/adw_tests/ -v`
  - `.github/workflows/app-ci.yml` syntax check (manual review)
- Verify all changes staged: `git status`
- Commit changes with conventional commit message
- Push branch: `git push -u origin feat/305-automerge-adw-prs`
- Verify CI runs on push (GitHub Actions should trigger)
- Monitor CI execution and verify all jobs pass

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Auto-merge triggers before CI completes** | GitHub's `--auto` flag waits for required checks by design; test with actual PR to verify behavior |
| **Coverage job adds significant CI time** | Bun's native coverage is fast (<10s overhead); if excessive, make coverage job optional or run separately |
| **Build job duplicates work from local validation** | Accept trade-off for CI trust; build job ensures production artifacts compile successfully |
| **Auto-merge fails silently without notification** | Add explicit GitHub comment after enabling auto-merge; log warnings on failure |
| **Merge conflicts prevent auto-merge** | GitHub blocks auto-merge on conflicts by default; log warning and require manual resolution |
| **Feature flag disabled by default may confuse users** | Document clearly in README; default `false` is safest for initial rollout |
| **State schema changes break existing workflows** | Add fields with default values (`False`, `None`); test backward compatibility with old state files |
| **Coverage threshold too strict blocks valid PRs** | Start with 70% threshold (reasonable baseline); adjust based on historical coverage data |

## Validation Strategy

### Automated Tests (Integration/E2E)
- **ADW State Tests** (`adw_tests/test_state.py`):
  - Test state schema includes new fields (`auto_merge_enabled`, `merge_status`, `merge_timestamp`)
  - Test `update_merge_status()` helper method updates fields correctly
  - Test `is_auto_merge_enabled()` returns correct boolean
  - Test backward compatibility: loading old state files without new fields works

- **ADW Build Phase Tests** (`adw_tests/test_adw_build.py`, if exists):
  - Test auto-merge logic executes when `ADW_AUTO_MERGE=true`
  - Test auto-merge skipped when `ADW_AUTO_MERGE=false` (default)
  - Test auto-merge failure handled gracefully (log warning, continue workflow)
  - Test state updated correctly after auto-merge enablement

- **Log Analysis Tests** (`adw_tests/test_analyze_logs.py`, if exists):
  - Test auto-merge metrics calculation with seeded state files
  - Test success rate calculation (success / total)
  - Test alert logic triggers when failure rate >10%

### Manual Checks
- **PR Auto-Merge Flow**:
  1. Create test issue with `effort:small` label
  2. Run ADW workflow: `ADW_AUTO_MERGE=true uv run automation/adws/adw_sdlc.py <issue_number> test-305`
  3. Verify build phase creates PR and enables auto-merge
  4. Monitor CI: verify setup, typecheck, lint, test, coverage, build jobs pass
  5. Verify PR merges automatically after CI completes
  6. Check branch deleted after merge (via `--delete-branch` flag)

- **Failure Scenarios**:
  1. **CI Failure**: Introduce failing test → verify PR does NOT auto-merge
  2. **Merge Conflict**: Create conflicting PR → verify auto-merge blocked by GitHub
  3. **Feature Flag Disabled**: Run with `ADW_AUTO_MERGE=false` → verify auto-merge NOT enabled
  4. **Manual PR**: Create PR manually → verify auto-merge NOT enabled (safety check)

- **Data Seeding**:
  - Seed 10 test state files with varying `merge_status` values (success, failed, pending)
  - Run log analysis: `uv run automation/adws/scripts/analyze_logs.py --format json`
  - Verify metrics include auto-merge success rate and failure distribution

### Release Guardrails (Monitoring, Alerting, Rollback)
- **Metrics Collection**:
  - ADW metrics workflow (`.github/workflows/adw-metrics.yml`) runs daily
  - Tracks auto-merge success rate from state files
  - Uploads metrics artifact for historical tracking

- **Alerting**:
  - GitHub issue created if auto-merge success rate <90% AND enabled count >5
  - Alert includes failure distribution (CI failures, conflicts, timeouts)
  - Workflow fails if success rate <50% (critical threshold)

- **Rollback Procedure**:
  1. Disable feature flag: `export ADW_AUTO_MERGE=false` or unset variable
  2. Existing PRs with auto-merge enabled continue behavior (GitHub-side)
  3. New workflows will NOT enable auto-merge until flag re-enabled
  4. No code rollback required (graceful degradation)

- **Monitoring Dashboard** (future enhancement):
  - Track auto-merge success rate over time
  - Graph median merge time reduction
  - Alert on anomalies (sudden failure rate increase)

## Validation Commands

**Python Layer:**
```bash
cd automation && uv run pyright adws/adw_modules/state.py adws/adw_phases/adw_build.py adws/scripts/analyze_logs.py
cd automation && uv run ruff check adws/
cd automation && uv run pytest adws/adw_tests/ -v
```

**TypeScript Layer (if CI workflow changes touch app/):**
```bash
cd app && bunx tsc --noEmit
cd app && bun run lint
cd app && bun test
```

**CI Workflow Validation:**
```bash
# Syntax check (GitHub Actions CLI)
gh workflow view "Application CI" --yaml

# Test trigger on branch push
git push origin feat/305-automerge-adw-prs
gh run list --workflow="Application CI" --limit 5
```

**End-to-End Validation:**
```bash
# Run full ADW workflow with auto-merge enabled
export ADW_AUTO_MERGE=true
uv run automation/adws/adw_sdlc.py <test_issue_number> test-305

# Verify state file updated
cat automation/agents/test-305/adw_state.json | jq '.auto_merge_enabled'

# Check PR auto-merge status
gh pr view <pr_number> --json autoMergeRequest

# Run log analysis
uv run automation/adws/scripts/analyze_logs.py --format markdown --hours 24
```

## Issue Relationships

**Depends On:**
- None (can be implemented immediately)

**Related To:**
- #165: feat: add code coverage reporting to CI workflows (integrate coverage checks for CI trust)
- #287: feat: establish CI/CD workflows for automated deployment (shares CI enhancement goals)
- #161: chore: optimize CI workflows with strict path filtering (CI performance baseline)

**Blocks:**
- None (enhancement to existing workflow)

**Benefits From:**
- #173: feat: implement automated template-code alignment validation tooling (additional CI trust signal)

**Follow-Up:**
- Track auto-merge success rate over first 10-20 PRs
- Adjust coverage threshold based on historical data
- Add security scanning job (dependency audit, secret detection)
- Explore GitHub required checks API for programmatic configuration
