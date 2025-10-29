# Chore Plan: Enable Stripe Webhook Tests with CLI Integration

## Context

PR #345 merged Stripe webhook endpoint implementation (#332), but **all 8 webhook tests are failing** in the full test suite due to missing `STRIPE_SECRET_KEY` configuration. The tests were excluded from validation during PR review because the validation command only runs tests in `tests/integration/` directory, not `tests/api/`.

The webhook endpoint implementation is correct and follows the GitHub webhook pattern, but tests cannot exercise handler business logic without real Stripe resources. Handlers make Stripe API calls (`stripe.subscriptions.retrieve()`, `stripe.customers.retrieve()`) which require valid Stripe resource IDs that don't exist with test fixture data.

**Why This Matters Now:**
- Broken test suite blocks future development and CI reliability
- Tests skip critical validation of subscription lifecycle handlers
- Missing anti-mock compliance for external service integration (inconsistent with Supabase Local pattern)

**Constraints:**
- Must follow KotaDB's anti-mock philosophy (no stubs, real service integration)
- Must mirror Supabase Local integration pattern established in test infrastructure
- Must work identically in CI and local development environments
- Must not require manual Stripe dashboard configuration per developer

## Relevant Files

### Existing Files
- `app/tests/api/stripe-webhooks.test.ts` — Failing webhook tests (8 tests, all require real Stripe resources)
- `app/scripts/setup-test-db.sh` — Test environment setup (reference pattern for Stripe CLI integration)
- `app/scripts/cleanup-test-containers.sh` — Test environment teardown (needs Stripe CLI process cleanup)
- `app/scripts/generate-env-test-compose.sh` — Auto-generates `.env.test` from container ports (needs Stripe webhook secret)
- `.github/workflows/app-ci.yml` — CI workflow (needs Stripe CLI installation step)
- `.claude/commands/testing/testing-guide.md` — Testing documentation (needs Stripe CLI setup instructions)
- `app/src/api/stripe.ts` — Stripe client initialization (webhook handlers reference this)
- `app/src/api/routes.ts:128-199` — Webhook endpoint implementation (handlers call Stripe API)
- `.env.example` — Environment variable documentation (needs Stripe test credentials)

### New Files
- None (all modifications to existing infrastructure scripts)

## Work Items

### Preparation
1. Create Stripe test account and obtain test mode credentials
2. Configure GitHub Actions secrets for CI:
   - `STRIPE_SECRET_KEY` (sk_test_...)
   - `STRIPE_SOLO_PRICE_ID` (price_...)
   - `STRIPE_TEAM_PRICE_ID` (price_...)
3. Install Stripe CLI locally for testing: `brew install stripe/stripe-cli/stripe`
4. Verify Docker Compose test stack is working: `cd app && bun test:setup && bun test:teardown`

### Execution

#### Phase 1: Quick Fix - Graceful Test Skipping
**Goal:** Unblock CI and local development immediately by skipping Stripe tests when credentials not configured.

1. **Add conditional skip logic to Stripe webhook tests:**
   - Modify `app/tests/api/stripe-webhooks.test.ts` in `beforeAll` hook
   - Check for `STRIPE_SECRET_KEY` environment variable
   - If missing, log warning and exit gracefully (no test failures)
   - If present, proceed with existing test setup

2. **Verify quick fix works:**
   - Run `bun test` without Stripe credentials → tests skip with warning
   - Export test credentials → tests run and pass
   - Commit quick fix to unblock CI

#### Phase 2: Stripe CLI Integration - Complete Solution
**Goal:** Enable real Stripe webhook testing following Supabase Local pattern (mirroring how Supabase credentials are auto-populated in `.env.test`).

3. **Integrate Stripe CLI into CI setup script:**
   - Modify `.github/scripts/setup-supabase-ci.sh` (CI setup) after seeding
   - Check if Stripe credentials configured in GitHub secrets: `if [ -n "${STRIPE_SECRET_KEY:-}" ]`
   - Start Stripe CLI listener in background: `stripe listen --forward-to http://localhost:${KONG_PORT}/webhooks/stripe --skip-verify > .stripe-listen.log 2>&1 &`
   - Capture PID: `STRIPE_CLI_PID=$!` and save to `.stripe-test.pid`
   - Extract webhook secret from log: `STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret 2>/dev/null || echo "")`
   - Export secret for environment generation
   - Add health check: wait for "Ready!" in `.stripe-listen.log`

4. **Integrate Stripe CLI into local setup script:**
   - Modify `app/scripts/setup-test-db.sh` (local setup) after seeding
   - Mirror exact same logic as CI script (Step 3)
   - Use same `.stripe-test.pid` and `.stripe-listen.log` file locations
   - Ensure identical behavior between CI and local environments

5. **Update environment generation script to auto-populate Stripe credentials:**
   - Modify `app/scripts/generate-env-test-compose.sh`
   - Add Stripe credentials **only if** environment variables present (mirrors Supabase pattern)
   - Append to `.env.test` file generation:
     ```bash
     # Stripe Configuration (optional - tests skip if not configured)
     STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
     STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
     STRIPE_SOLO_PRICE_ID=${STRIPE_SOLO_PRICE_ID:-}
     STRIPE_TEAM_PRICE_ID=${STRIPE_TEAM_PRICE_ID:-}
     ```
   - Echo confirmation only if Stripe configured: `if [ -n "${STRIPE_SECRET_KEY:-}" ]; then echo "  Stripe CLI webhook secret: whsec_..."; fi`

6. **Integrate Stripe CLI cleanup into teardown script:**
   - Modify `app/scripts/cleanup-test-containers.sh` before Docker teardown
   - Check if `.stripe-test.pid` exists
   - Read PID and kill process: `kill $(cat .stripe-test.pid) 2>/dev/null || true`
   - Remove artifacts: `rm -f .stripe-test.pid .stripe-listen.log`
   - Log cleanup only if Stripe was running: `if [ -f .stripe-test.pid ]; then echo "✓ Stopped Stripe CLI"; fi`

7. **Rewrite Stripe webhook tests with real fixtures:**
   - Replace test fixture IDs with real Stripe resource creation in `beforeAll`
   - Create real test customer via `stripe.customers.create()`
   - Create real test subscription via `stripe.subscriptions.create()`
   - Create real test price/product if needed (or use configured test price IDs)
   - Rewrite test cases to trigger real webhook events via `stripe trigger` CLI
   - Add `waitForCondition` helpers to verify async handler completion
   - Add proper cleanup in `afterAll` to delete Stripe resources

8. **Add Stripe CLI installation to CI workflow:**
   - Modify `.github/workflows/app-ci.yml` test job
   - Add step after "Install dependencies" to install Stripe CLI
   - Use official Stripe apt repository (Ubuntu)
   - Verify installation with `stripe --version`
   - Export GitHub secrets as environment variables before calling setup script:
     ```yaml
     env:
       STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
       STRIPE_SOLO_PRICE_ID: ${{ secrets.STRIPE_SOLO_PRICE_ID }}
       STRIPE_TEAM_PRICE_ID: ${{ secrets.STRIPE_TEAM_PRICE_ID }}
     ```

9. **Update testing documentation:**
    - Modify `.claude/commands/testing/testing-guide.md`
    - Document Stripe CLI requirement and installation
    - Explain Stripe test credential setup
    - Add troubleshooting section for Stripe CLI issues
    - Reference Stripe CLI integration in anti-mock philosophy section

### Follow-up
11. **Run full validation suite:**
    - Execute `bun test:setup` to verify Stripe CLI starts correctly
    - Run `bun test` to verify all Stripe webhook tests pass
    - Execute `bun test:teardown` to verify cleanup works
    - Check `.env.test` contains `STRIPE_WEBHOOK_SECRET`
    - Verify `.stripe-test.pid` file is created and cleaned up

12. **Update environment variable documentation:**
    - Modify `app/.env.example` to document Stripe test credentials
    - Add comments explaining where to obtain test mode keys
    - Document webhook secret (auto-generated, not manually configured)

13. **Test CI integration:**
    - Push branch and verify GitHub Actions workflow passes
    - Check CI logs for Stripe CLI installation output
    - Verify Stripe webhook tests run and pass in CI
    - Confirm cleanup happens in "Teardown" step

## Step by Step Tasks

### Phase 1: Quick Fix (Immediate Unblock)
1. Modify `app/tests/api/stripe-webhooks.test.ts`:
   - Add environment check in `beforeAll`: `if (!process.env.STRIPE_SECRET_KEY) { console.warn('[SKIP] ...'); process.exit(0); }`
   - Preserve existing test structure (no other changes)
2. Run validation: `cd app && bun test` (without Stripe credentials)
   - Expected: Tests skip gracefully with warning message
3. Run validation: `cd app && export STRIPE_SECRET_KEY=sk_test_... && bun test`
   - Expected: Stripe webhook tests run (may fail due to missing resources - acceptable for Phase 1)
4. Commit quick fix: `git add app/tests/api/stripe-webhooks.test.ts && git commit -m "chore(testing): gracefully skip Stripe webhook tests when credentials not configured (#346)"`
5. Push branch and verify CI passes: `git push -u origin chore/346-stripe-cli-test-integration`

### Phase 2: Complete Stripe CLI Integration
6. Update `app/scripts/generate-env-test-compose.sh`:
   - Add Stripe credential block at end of EOF heredoc (mirrors Supabase pattern):
     ```bash
     # Stripe Configuration (optional - auto-populated if configured in environment)
     STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-}
     STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
     STRIPE_SOLO_PRICE_ID=${STRIPE_SOLO_PRICE_ID:-}
     STRIPE_TEAM_PRICE_ID=${STRIPE_TEAM_PRICE_ID:-}
     ```
   - Add output line: `if [ -n "${STRIPE_SECRET_KEY:-}" ]; then echo "  Stripe webhook:  http://localhost:${KONG_PORT}/webhooks/stripe"; fi`

7. Integrate Stripe CLI into `.github/scripts/setup-supabase-ci.sh`:
   - Add after seeding (line 173), before final echo
   - Check if configured: `if [ -n "${STRIPE_SECRET_KEY:-}" ]; then`
   - Install check: `command -v stripe >/dev/null 2>&1 || { echo "⚠️ Stripe CLI not installed, skipping"; exit 0; }`
   - Start listener: `stripe listen --forward-to ${API_URL}/webhooks/stripe --skip-verify > .stripe-listen.log 2>&1 &`
   - Save PID: `echo $! > .stripe-test.pid`
   - Get secret: `sleep 2; STRIPE_WEBHOOK_SECRET=$(stripe listen --print-secret 2>/dev/null || echo "")`
   - Export for env generation: `export STRIPE_WEBHOOK_SECRET`
   - Log: `echo "✅ Stripe CLI listener started (webhook secret: whsec_...)"`

8. Integrate Stripe CLI into `app/scripts/setup-test-db.sh`:
   - Mirror exact logic from Step 7 after seeding (line 167)
   - Use same file paths: `.stripe-test.pid`, `.stripe-listen.log`
   - Ensure identical behavior between CI and local

9. Integrate cleanup into `app/scripts/cleanup-test-containers.sh`:
   - Add before Docker teardown (line 26):
     ```bash
     # Stop Stripe CLI if running
     if [ -f .stripe-test.pid ]; then
         echo "  ✓ Stopping Stripe CLI..."
         kill $(cat .stripe-test.pid) 2>/dev/null || true
         rm -f .stripe-test.pid .stripe-listen.log
     fi
     ```

10. Rewrite `app/tests/api/stripe-webhooks.test.ts`:
    - Remove conditional skip logic from Phase 1
    - Add real Stripe resource creation in `beforeAll`:
      ```typescript
      testCustomer = await stripe.customers.create({ email: `test-${Date.now()}@test.local`, metadata: { user_id: testUserId } });
      testSubscription = await stripe.subscriptions.create({ customer: testCustomer.id, items: [{ price: process.env.STRIPE_SOLO_PRICE_ID }], metadata: { user_id: testUserId } });
      ```
    - Rewrite test cases to use `stripe trigger` CLI commands
    - Add `waitForCondition` for async handler verification
    - Add cleanup in `afterAll`: `await stripe.subscriptions.del(testSubscription.id); await stripe.customers.del(testCustomer.id);`

11. Update `.github/workflows/app-ci.yml`:
    - Add step after "Install dependencies (cache miss fallback)" in test job (before "Setup Docker Compose"):
      ```yaml
      - name: Install Stripe CLI
        run: |
          curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
          echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
          sudo apt update
          sudo apt install stripe
          stripe --version
      ```
    - Add environment variables to "Setup Docker Compose" step:
      ```yaml
      - name: Setup Docker Compose test stack and generate credentials
        working-directory: .
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_SOLO_PRICE_ID: ${{ secrets.STRIPE_SOLO_PRICE_ID }}
          STRIPE_TEAM_PRICE_ID: ${{ secrets.STRIPE_TEAM_PRICE_ID }}
        run: |
          # ... existing commands
      ```

12. Update `.claude/commands/testing/testing-guide.md`:
    - Add "Stripe CLI Setup" section documenting installation
    - Add environment variable requirements
    - Add troubleshooting for common Stripe CLI issues
    - Reference anti-mock philosophy

13. Update `app/.env.example`:
    - Add Stripe test credential documentation
    - Explain webhook secret is auto-generated

14. Run full validation suite:
    - `cd app && bun test:setup` → verify Stripe CLI starts
    - `cd app && bun test` → verify all tests pass including Stripe webhooks
    - `cd app && bun test:teardown` → verify cleanup completes
    - Check `.env.test` contains `STRIPE_WEBHOOK_SECRET`

15. Commit Phase 2 changes:
    - `git add app/scripts/ app/tests/ .github/ .claude/ app/.env.example docs/specs/`
    - `git commit -m "chore(testing): integrate Stripe CLI for real webhook testing following Supabase Local pattern (#346)"`

16. Push and verify CI: `git push`
    - Verify GitHub Actions workflow passes
    - Check Stripe CLI installation in CI logs
    - Confirm Stripe webhook tests pass in CI

17. Create PR: `gh pr create --title "chore: enable Stripe webhook tests with CLI integration following Supabase Local pattern (#346)" --body "See docs/specs/chore-346-stripe-cli-test-integration.md"`

## Risks

### Phase 1 Risks
- **Risk:** Quick fix might hide test failures indefinitely if credentials never configured
  - **Mitigation:** Add explicit CI check that fails if Stripe credentials missing (Phase 2)

### Phase 2 Risks
- **Risk:** Stripe CLI might not be available in CI environment or fail to install
  - **Mitigation:** Use official Stripe apt repository (stable, maintained by Stripe)

- **Risk:** Stripe API rate limits might be hit during test execution
  - **Mitigation:** Use Stripe Test Mode which has generous rate limits; tests create minimal resources

- **Risk:** Webhook secret extraction might fail or timeout
  - **Mitigation:** Add retry logic and timeout handling in startup script; fail fast with clear error message

- **Risk:** Stripe CLI process might not clean up properly, leaving orphaned listeners
  - **Mitigation:** Use PID file tracking; add SIGKILL fallback; verify cleanup in tests

- **Risk:** Real Stripe resource creation might fail during tests
  - **Mitigation:** Use test mode keys; add proper error handling; clean up resources in `afterAll` even on failure

- **Risk:** Tests might become flaky due to webhook delivery timing
  - **Mitigation:** Use `waitForCondition` helpers with generous timeouts; Stripe CLI delivers webhooks synchronously in test mode

## Validation Commands

### Phase 1 Validation
```bash
# Without Stripe credentials (tests should skip gracefully)
cd app
unset STRIPE_SECRET_KEY
bun test
# Expected: ✓ Tests pass, Stripe tests skipped with warning

# With Stripe credentials (tests should run)
export STRIPE_SECRET_KEY=sk_test_...
bun test
# Expected: Tests attempt to run (may fail without CLI - acceptable for Phase 1)
```

### Phase 2 Validation
```bash
# Full test lifecycle with Stripe CLI integration
cd app

# Setup (should start Supabase + Stripe CLI)
bun test:setup
# Expected: ✓ Docker Compose services healthy
#          ✓ Stripe CLI listener started
#          ✓ .env.test contains STRIPE_WEBHOOK_SECRET

# Run tests (should pass with real Stripe integration)
bun test
# Expected: ✓ All tests pass including 8 Stripe webhook tests

# Teardown (should clean up Stripe CLI + Docker)
bun test:teardown
# Expected: ✓ Stripe CLI process stopped
#          ✓ .stripe-test.pid removed
#          ✓ Docker containers removed

# Verify cleanup
ps aux | grep stripe
# Expected: No Stripe CLI processes running

# Type checking
cd app && bunx tsc --noEmit
cd ../shared && bunx tsc --noEmit

# Linting
cd app && bun run lint

# Build
cd app && bun run build
```

### CI Validation
```bash
# Push branch and monitor GitHub Actions
git push -u origin chore/346-stripe-cli-test-integration

# Check CI logs for:
# - Stripe CLI installation success
# - Webhook secret generation
# - All 8 Stripe webhook tests passing
# - Cleanup completing without errors
```

## Commit Message Validation

All commits will follow Conventional Commits format. Example valid messages:
- `chore(testing): gracefully skip Stripe webhook tests when credentials not configured (#346)`
- `chore(testing): integrate Stripe CLI for real webhook testing following Supabase Local pattern (#346)`
- `chore(ci): add Stripe CLI installation to test workflow (#346)`
- `docs(testing): document Stripe CLI setup and requirements (#346)`

**Avoid:**
- Meta-commentary: "Based on the plan, this commit adds..."
- Redundant phrases: "I can see the tests need..."
- Passive voice: "The Stripe CLI will be integrated..."

**Use:**
- Direct statements: "Integrate Stripe CLI into test setup"
- Active voice: "Add Stripe webhook secret to environment"

## Deliverables

### Phase 1 Deliverables
- Modified `app/tests/api/stripe-webhooks.test.ts` with conditional skip logic
- Verified test suite passes without Stripe credentials
- Committed and pushed quick fix branch

### Phase 2 Deliverables
- Modified scripts (Stripe CLI integration mirrors Supabase pattern):
  - `.github/scripts/setup-supabase-ci.sh` (added Stripe CLI startup after seeding)
  - `app/scripts/setup-test-db.sh` (added Stripe CLI startup after seeding)
  - `app/scripts/cleanup-test-containers.sh` (added Stripe CLI teardown before Docker cleanup)
  - `app/scripts/generate-env-test-compose.sh` (added Stripe credentials auto-population to `.env.test`)
- Rewritten test file:
  - `app/tests/api/stripe-webhooks.test.ts` (real Stripe resources and CLI triggers)
- Updated CI workflow:
  - `.github/workflows/app-ci.yml` (Stripe CLI installation step + environment variables)
- Updated documentation:
  - `.claude/commands/testing/testing-guide.md` (Stripe CLI setup instructions)
  - `app/.env.example` (Stripe test credential documentation)
- Configured GitHub Actions secrets:
  - `STRIPE_SECRET_KEY`, `STRIPE_SOLO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`
- Verified end-to-end integration:
  - All 8 Stripe webhook tests passing locally
  - All 8 Stripe webhook tests passing in CI
  - `.env.test` auto-populated with Stripe credentials (mirrors Supabase)
  - Cleanup working correctly (no orphaned processes)

## Issue Relationships

- **Related To:** #332 (Stripe webhook handlers) - Original implementation that introduced failing tests
- **Blocks:** Future Stripe feature development - Cannot iterate on subscription logic without working tests
- **Related To:** #287 (CI/CD workflows) - Stripe CLI integration required in CI pipeline
- **Follow-Up:** Consider similar CLI integration for other external services (GitHub Apps local testing)
