# Chore Plan: Reduce Test Output Verbosity

## Context
Bun test output currently includes excessive verbosity that makes it difficult to identify test failures and understand test run results at a glance. This impacts developer experience in local development and CI/CD environments:

- Authentication logs appear dozens of times during test runs (`[Auth] Success - userId: ...`)
- Test setup messages clutter output (`[Test Setup] Loaded N variables from .env.test`)
- No consolidated summary makes it hard to see pass/fail counts quickly
- CI logs are cluttered (estimated > 1000 lines for 133 tests)
- Debugging is harder due to low signal-to-noise ratio

**Constraints:**
- Must preserve full logs when `DEBUG=1` environment variable is set
- Must not break existing test assertions that depend on console output
- Must maintain CI/CD compatibility with GitHub Actions workflow
- Must preserve error-level logs unconditionally for debugging

**Scope:**
This chore focuses on conditional logging suppression during test runs. We will NOT:
- Modify Bun's built-in test reporter
- Change test framework or test file structure
- Implement custom test harness or log buffering
- Alter test coverage or validation behavior

## Relevant Files

### Modified Files
- `app/src/auth/middleware.ts` — Contains `console.log` and `console.warn` statements for authentication events (lines 80, 109-111, 120-122)
- `app/tests/setup.ts` — Contains `console.log` statements for environment setup (lines 25-28, 58-64)
- `app/src/auth/validator.ts` — Contains `console.error` for validation failures (line 171)
- `.github/workflows/app-ci.yml` — May need adjustment to set `DEBUG` for troubleshooting runs

### Files for Reference (not modified)
- `app/package.json` — Test command configuration (line 11)
- `app/src/auth/rate-limit.ts` — Rate limit logging (checked: no console statements found)
- `app/src/auth/keys.ts` — Key generation logging (checked: no console statements found)
- `app/src/auth/cache.ts` — Cache logging (checked: no console statements found)

### New Files
None (conditional logging only)

## Work Items

### Preparation
1. Verify current test output baseline (line count, verbosity level)
2. Identify all console logging statements in test-related paths
3. Confirm `DEBUG` environment variable is not already in use
4. Review CI workflow for compatibility with conditional logging

### Execution
1. Add conditional logging helper function for test environment detection
2. Update `app/src/auth/middleware.ts` to suppress auth logs unless `DEBUG=1`
3. Update `app/tests/setup.ts` to suppress setup logs unless `DEBUG=1`
4. Preserve all `console.error` statements unconditionally (error-level logs)
5. Run local tests to verify output reduction and DEBUG mode behavior
6. Run CI tests to verify compatibility and readability improvement

### Follow-up
1. Update CLAUDE.md to document `DEBUG=1` flag for verbose test output
2. Monitor first few CI runs for any test assertion breakage
3. Document verbosity reduction in PR description with before/after metrics

## Step by Step Tasks

### Phase 1: Baseline and Discovery
- Run `cd app && bun test 2>&1 | wc -l` to establish baseline line count
- Run `cd app && bun test 2>&1 | grep -c '\[Auth\]'` to count auth log occurrences
- Run `cd app && bun test 2>&1 | grep -c '\[Test Setup\]'` to count setup log occurrences
- Search for all `console.log`, `console.warn`, `console.error` in `app/src/auth/` and `app/tests/`
- Confirm `process.env.DEBUG` is not used elsewhere in the codebase

### Phase 2: Implementation
- Create conditional logging helper in `app/src/auth/middleware.ts`:
  - Add `const isTestEnv = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test'`
  - Add `const isDebug = process.env.DEBUG === '1'`
  - Add `const shouldLog = !isTestEnv || isDebug`
- Update `console.log` at line 109-111 in `app/src/auth/middleware.ts`:
  - Wrap in `if (shouldLog) { ... }`
- Update `console.warn` at line 80 in `app/src/auth/middleware.ts`:
  - Wrap in `if (shouldLog) { ... }`
- Update `console.warn` at line 120-122 in `app/src/auth/middleware.ts`:
  - Wrap in `if (shouldLog) { ... }`
- Update `console.log` at lines 25-28 in `app/tests/setup.ts`:
  - Wrap in `if (!process.env.DEBUG) return;` guard
- Update `console.log` at lines 58-64 in `app/tests/setup.ts`:
  - Wrap in `if (process.env.DEBUG === '1') { ... }`
- Keep `console.error` at line 63 in `app/tests/setup.ts` unconditional (error-level)
- Keep `console.error` at line 171 in `app/src/auth/validator.ts` unconditional

### Phase 3: Local Validation
- Run `cd app && bun test 2>&1 | wc -l` and compare to baseline (expect >50% reduction)
- Run `cd app && bun test 2>&1 | grep '\[Auth\]'` and verify no output (unless errors)
- Run `cd app && bun test 2>&1 | grep '\[Test Setup\]'` and verify no output
- Run `DEBUG=1 cd app && bun test 2>&1 | grep -c '\[Auth\]'` and verify logs appear
- Run `DEBUG=1 cd app && bun test 2>&1 | grep -c '\[Test Setup\]'` and verify logs appear
- Verify all 133 tests still pass with no regressions
- Run `cd app && bunx tsc --noEmit` to confirm no TypeScript errors
- Run `cd app && bun run lint` to confirm no linting errors

### Phase 4: Documentation and Finalization
- Update CLAUDE.md to document `DEBUG=1` flag usage:
  - Add to **Testing and type-checking** section
  - Document: `DEBUG=1 cd app && bun test  # Verbose test output (auth logs, setup details)`
- Stage all changes: `git add app/src/auth/middleware.ts app/tests/setup.ts CLAUDE.md`
- Commit with message: `chore: reduce test output verbosity with DEBUG flag (#127)`
- Push branch: `git push -u origin chore/127-reduce-test-verbosity`
- Run `/pull_request chore/127-reduce-test-verbosity {"number":127,"title":"chore: reduce verbosity in test output","labels":["component:testing","priority:medium","effort:small","status:needs-investigation"]} docs/specs/chore-127-reduce-test-verbosity.md chore-127-cedff213`

## Risks

### Risk: Test assertions depend on console output
**Mitigation:** Review test files for assertions on `console.log` output before making changes. If found, preserve those specific logs or update assertions.

### Risk: Bun test environment detection fails
**Mitigation:** Use multiple environment variable checks (`NODE_ENV === 'test'` OR `BUN_ENV === 'test'`) and validate locally before committing.

### Risk: CI workflow breaks due to missing logs
**Mitigation:** Keep all error-level logs (`console.error`) unconditional. Test CI behavior by triggering workflow on feature branch before merging.

### Risk: DEBUG flag conflicts with existing tooling
**Mitigation:** Search codebase for existing `DEBUG` usage and choose alternative variable name (`VERBOSE_TESTS`) if conflicts exist.

### Risk: Developers unaware of DEBUG flag
**Mitigation:** Document flag prominently in CLAUDE.md and include in PR description. Add to `.env.example` with explanatory comment.

## Validation Commands

### Standard Validation (must pass)
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test
cd app && bun run test:validate-migrations
cd app && bun run test:validate-env
```

### Supplemental Validation (chore-specific)
```bash
# Verify output reduction (baseline vs. after)
cd app && bun test 2>&1 | wc -l

# Verify auth logs suppressed
cd app && bun test 2>&1 | grep '\[Auth\]' || echo "PASS: No auth logs in default mode"

# Verify setup logs suppressed
cd app && bun test 2>&1 | grep '\[Test Setup\]' || echo "PASS: No setup logs in default mode"

# Verify DEBUG mode restores logs
DEBUG=1 cd app && bun test 2>&1 | grep -c '\[Auth\]'
DEBUG=1 cd app && bun test 2>&1 | grep -c '\[Test Setup\]'

# Verify error logs preserved
cd app && bun test 2>&1 | grep 'error:' | wc -l
```

### CI Validation
- Trigger `.github/workflows/app-ci.yml` on feature branch
- Verify test step output is < 500 lines
- Verify all 133 tests pass
- Verify no "Missing environment variable" errors
- Verify error logs still appear for actual test failures

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `chore(testing): <subject>`
- Valid types: chore (primary), docs (for CLAUDE.md update)
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements:
  - ✅ `chore(testing): suppress auth logs during test runs unless DEBUG=1`
  - ✅ `chore(testing): add conditional logging for test setup messages`
  - ✅ `docs: document DEBUG flag for verbose test output`
  - ❌ `Based on the plan, the commit should suppress auth logs`
  - ❌ `This commit adds conditional logging to reduce verbosity`

## Deliverables

### Code Changes
- `app/src/auth/middleware.ts`: Conditional logging for auth events
- `app/tests/setup.ts`: Conditional logging for setup messages

### Documentation Updates
- `CLAUDE.md`: Document `DEBUG=1` flag in testing section

### Metrics (for PR description)
- Baseline test output: ~X lines (measure before implementation)
- After implementation: ~Y lines (expect >50% reduction)
- Auth log occurrences: Z → 0 (unless DEBUG=1 or errors)
- Setup log occurrences: N → 0 (unless DEBUG=1)
- Test pass rate: 133/133 (no regressions)

### CI Improvements
- Reduced log storage costs
- Faster visual scanning for failures
- Preserved full logs for debugging via DEBUG=1
