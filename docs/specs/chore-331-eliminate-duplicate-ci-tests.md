# Chore Plan: Eliminate Duplicate Test Execution in CI

## Context
Application CI currently has a **50% failure rate** over the last 20 runs (10/20 failures), with tests passing but the coverage job failing inconsistently. The root cause is duplicate test execution - tests run in both the `test` job (line 172) and the `coverage` job (line 225), causing infrastructure flakiness and wasting ~3-4 minutes per run.

This chore consolidates coverage generation into the `test` job and removes the separate `coverage` job entirely, eliminating duplicate execution while maintaining full coverage reporting capability.

**Constraints / Deadlines**:
- High priority (priority:high label) - blocking merge confidence
- Small effort scope (effort:small label) - single workflow file change
- Must maintain coverage artifact availability (30-day retention)
- No loss of coverage visibility or enforcement capability

## Relevant Files
- `.github/workflows/app-ci.yml` — Primary target: modify test job (lines 121-179), remove coverage job (lines 181-243)

### New Files
None - this is a pure deletion/consolidation chore.

## Work Items

### Preparation
- Verify current branch is `develop` (default branch per branching strategy)
- Create feature branch: `chore/331-eliminate-duplicate-ci-tests`
- Confirm current CI state: `gh run list --workflow "Application CI" --limit 20`
- Document baseline metrics: failure rate (50%), average runtime (~6 min)

### Execution
1. **Modify test job to generate coverage** (`.github/workflows/app-ci.yml:167-172`)
   - Change `bun run test` to `bun test --coverage` (line 172)
   - Add coverage artifact upload step after test execution (before teardown step at line 174)
   - Use existing artifact upload pattern from coverage job (lines 233-238)

2. **Remove coverage job entirely** (`.github/workflows/app-ci.yml:181-243`)
   - Delete entire `coverage` job block (63 lines)
   - No dependency changes needed - `build` job already depends on `test` job only (line 247)

3. **Remove coverage threshold TODO** (optional clarity improvement)
   - Delete placeholder comment block (lines 227-231) since it's non-functional
   - Future coverage thresholds can be added when Bun supports programmatic parsing

### Follow-up
- Push branch: `git push -u origin chore/331-eliminate-duplicate-ci-tests`
- Monitor first 5 CI runs on the PR for stability
- After merge to `develop`, track next 20 runs for < 10% failure rate target
- Verify coverage artifacts remain downloadable via GitHub Actions UI
- Measure runtime improvement (expect ~3-4 min reduction from 6 min baseline)

## Step by Step Tasks

### Git Setup
- Verify on `develop` branch: `git branch --show-current`
- Create feature branch: `git checkout -b chore/331-eliminate-duplicate-ci-tests`

### Modify Test Job
- Edit `.github/workflows/app-ci.yml` line 172: change `bun run test` to `bun test --coverage`
- Add coverage artifact upload step after line 173 (before teardown):
  ```yaml
  - name: Upload coverage report
    uses: actions/upload-artifact@v4
    with:
      name: coverage-report
      path: app/coverage/
      retention-days: 30
  ```

### Remove Coverage Job
- Delete lines 181-243 (entire `coverage` job block)
- Verify `build` job dependency unchanged (line 247: `needs: test`)

### Optional Cleanup
- Delete lines 227-231 (coverage threshold TODO placeholder)

### Validation
- Run local validation: `cd app && bun test --coverage` (verify coverage generates)
- Stage changes: `git add .github/workflows/app-ci.yml`
- Commit with conventional format: `chore(ci): eliminate duplicate test execution to fix 50% failure rate`
- Push branch: `git push -u origin chore/331-eliminate-duplicate-ci-tests`

### Post-Push Verification
- Create PR via GitHub UI or `gh pr create --base develop --title "chore: eliminate duplicate test execution to fix 50% failure rate (#331)"`
- Monitor PR CI runs (expect 0-1 failures due to genuine test issues only)
- After merge, track 20 runs via `gh run list --workflow "Application CI" --limit 20`
- Confirm < 10% failure rate and ~3-4 min runtime reduction

## Risks

| Risk | Mitigation |
|------|------------|
| Coverage generation fails in test job | Local validation confirms `bun test --coverage` works; existing coverage job uses same command |
| Artifact upload path incorrect | Reuse exact artifact upload configuration from existing coverage job (lines 233-238) |
| Build job breaks due to missing dependency | Build job already depends only on `test` job (line 247), not `coverage` job |
| Coverage visibility lost | Coverage artifact upload preserves 30-day retention; no enforcement exists today (placeholder only) |
| Genuine test failure masked as flake fix | First 5 PR runs will confirm test stability; monitoring 20 runs post-merge validates improvement |

## Validation Commands

```bash
# Local validation (before commit)
cd app
bun test --coverage                    # Verify coverage generation works
ls -la coverage/                       # Confirm coverage/ directory created

# Pre-commit validation
cd app
bun run lint                           # Should pass (no code changes)
bunx tsc --noEmit                      # Should pass (no code changes)

# Post-merge validation
gh run list --workflow "Application CI" --limit 20    # Track failure rate
gh run view <run-id> --log | grep -i "coverage"      # Verify artifact upload
gh run view <run-id> --log | grep -i "duration"      # Measure runtime improvement
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(ci): eliminate duplicate test execution` not `Based on the plan, the commit should eliminate duplicate tests`

**Recommended commit message**:
```
chore(ci): eliminate duplicate test execution to fix 50% failure rate

Consolidates coverage generation into test job and removes separate coverage
job to eliminate infrastructure flakiness. Reduces CI runtime by ~3-4 minutes
while maintaining coverage artifact availability.

Fixes #331
```

## Deliverables

### Code Changes
- `.github/workflows/app-ci.yml`:
  - Modified `test` job to run `bun test --coverage` instead of `bun run test`
  - Added coverage artifact upload step to `test` job
  - Removed entire `coverage` job (63 lines deleted)

### Config Updates
None - this is purely a workflow change.

### Documentation Updates
None required - change is self-documenting via workflow simplification. Coverage artifacts remain available via GitHub Actions UI at same location (30-day retention preserved).

---

**Expected Outcomes**:
- CI failure rate drops from 50% to < 10% (0-2 failures in next 20 runs)
- Average CI runtime reduces from ~6 min to ~3 min (50% faster)
- No duplicate test execution (single test run per CI invocation)
- Coverage artifacts still downloadable from GitHub Actions UI
- Simplified workflow maintenance (fewer jobs, clearer dependency graph)
