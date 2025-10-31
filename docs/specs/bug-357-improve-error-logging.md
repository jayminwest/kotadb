# Bug Plan: Improve Error Logging in Bootstrap Sequence for Production Debugging

## Bug Summary

**Observed behaviour:**
Production deployment (kotadb.fly.dev) enters a crash loop after the Stripe validation checkpoint. Application logs show "Failed to start server: {}" - an empty error object that provides no diagnostic information. The app passes Stripe validation but immediately crashes with exit code 1, resulting in a 502 error for all requests.

**Expected behaviour:**
When the bootstrap sequence fails, the error message should include:
- Full error message text
- Error name/type
- Stack trace for debugging
- Context about which initialization phase failed (Supabase connection, queue startup, worker registration, Express app creation)

**Suspected scope:**
- Primary issue: `app/src/index.ts:132-135` - bootstrap catch handler uses `JSON.stringify(error)` which returns `{}` for Error objects because their properties (message, stack, name) are non-enumerable
- Secondary issue: Missing checkpoint logging between existing log statements makes it impossible to identify which bootstrap phase fails
- Tertiary issue: `app/src/queue/client.ts` error handling could provide more context about connection failures

## Root Cause Hypothesis

**Leading theory:**
The bootstrap sequence fails somewhere after Stripe validation (line 55) but before server startup (line 106), most likely during:
1. Supabase health check (lines 67-73)
2. Queue startup (lines 76-89)
3. Worker registration (lines 92-100)
4. Express app creation (line 103)

The actual error is masked by `JSON.stringify(error)` which serializes Error objects as `{}` due to non-enumerable properties.

**Supporting evidence:**
- Production logs show "✓ Stripe configuration validated" followed immediately by "Failed to start server: {}"
- No intermediate checkpoint logs appear between Stripe validation and crash
- Staging environment (kotadb-staging) works correctly with identical code, suggesting environment-specific issue (likely SUPABASE_DB_URL configuration or pg-boss schema)
- Issue surfaced after PR #356 (271 commits from develop → main)
- Related issues #284 and #279 involved pg-boss queue initialization failures

## Fix Strategy

**Code changes:**
1. Replace `JSON.stringify(error)` in bootstrap catch handler with proper error extraction (message, name, stack)
2. Add timestamped checkpoint logging after each major bootstrap phase:
   - After Stripe validation (already exists at line 55)
   - After Supabase health check (after line 73)
   - After queue startup (after line 89)
   - After worker registration (after line 100)
   - Before Express app creation (before line 103)
3. Enhance queue startup error logging in `app/src/queue/client.ts` to include:
   - Redacted connection string
   - Underlying pg-boss error details
   - Stack trace

**Data/config updates:**
No configuration changes needed. This is a pure observability improvement.

**Guardrails:**
- Follow logging standards: Use `process.stdout.write()` and `process.stderr.write()`, never `console.*`
- Include ISO timestamps for all checkpoint logs: `[${new Date().toISOString()}]`
- Redact sensitive data in logs (passwords in connection strings)
- Preserve existing error re-throwing behavior (don't swallow errors)

## Relevant Files

- `app/src/index.ts` — Main bootstrap sequence with inadequate error logging
- `app/src/queue/client.ts` — Queue startup with insufficient error context

### New Files

- `app/tests/bootstrap-error-logging.test.ts` — Test suite to verify error logging improvements

## Task Breakdown

### Verification

**Steps to reproduce current failure:**
1. Review production logs: `flyctl logs --app kotadb --no-tail | tail -40`
2. Observe: "✓ Stripe configuration validated" → "Failed to start server: {}" → exit code 1
3. Confirm: No intermediate checkpoint logs between Stripe validation and crash
4. Verify: 502 error on health check: `curl -s -w "\nHTTP Status: %{http_code}\n" https://kotadb.fly.dev/health`

**Logs/metrics to capture:**
- Fly.io production logs showing crash loop
- HTTP status codes from health check endpoint (502)
- Exit codes from failed bootstrap attempts (1)

### Implementation

**Phase 1: Improve bootstrap error handler (`app/src/index.ts`)**

1. Replace the bootstrap catch handler (lines 132-135) with proper error extraction:
   ```typescript
   bootstrap().catch((error) => {
       // Extract error details for better diagnostics
       const errorMessage = error instanceof Error ? error.message : String(error);
       const errorStack = error instanceof Error ? error.stack : undefined;
       const errorName = error instanceof Error ? error.name : 'Unknown';

       process.stderr.write(`Failed to start server:\n`);
       process.stderr.write(`  Error: ${errorName}\n`);
       process.stderr.write(`  Message: ${errorMessage}\n`);
       if (errorStack) {
           process.stderr.write(`  Stack:\n${errorStack}\n`);
       }
       process.exit(1);
   });
   ```

2. Add checkpoint logging after Supabase health check (after line 73):
   ```typescript
   if (healthError) {
       throw new Error(`Supabase connection failed: ${healthError.message}`);
   }
   process.stdout.write(`[${new Date().toISOString()}] ✓ Supabase connection successful\n`);
   ```

3. Add checkpoint logging after queue startup (after line 83):
   ```typescript
   await queue.createQueue(QUEUE_NAMES.INDEX_REPO);
   process.stdout.write(`[${new Date().toISOString()}] ✓ Job queue started and index-repo queue created\n`);
   ```

4. Add checkpoint logging after worker registration (after line 95):
   ```typescript
   await startIndexWorker(queue);
   process.stdout.write(`[${new Date().toISOString()}] ✓ Indexing worker registered\n`);
   ```

5. Add checkpoint logging before Express app creation (before line 103):
   ```typescript
   process.stdout.write(`[${new Date().toISOString()}] Creating Express app...\n`);
   const app = createExpressApp(supabase);
   process.stdout.write(`[${new Date().toISOString()}] ✓ Express app created\n`);
   ```

**Phase 2: Enhance queue error logging (`app/src/queue/client.ts`)**

1. Improve error handling in `startQueue()` function (lines 66-73):
   ```typescript
   } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       const errorStack = error instanceof Error ? error.stack : undefined;

       process.stderr.write(`[${new Date().toISOString()}] Failed to start job queue\n`);
       process.stderr.write(`  Connection: ${dbUrl.replace(/:[^:@]+@/, ":***@")}\n`);
       process.stderr.write(`  Error: ${errorMessage}\n`);
       if (errorStack) {
           process.stderr.write(`  Stack:\n${errorStack}\n`);
       }
       throw new Error(`Job queue startup failed: ${errorMessage}`);
   }
   ```

2. Fix missing newlines in existing log statements (lines 54, 65, 88, 94):
   - Line 54: Add `\n` at end
   - Line 65: Add `\n` at end
   - Line 88: Add `\n` at end
   - Line 94: Add `\n` at end

### Validation

**Tests to add/update:**

Create `app/tests/bootstrap-error-logging.test.ts`:
```typescript
import { describe, expect, it, spyOn } from "bun:test";

describe("bootstrap error logging", () => {
    it("should extract error message from Error objects", () => {
        const testError = new Error("Test failure");
        const stderr = spyOn(process.stderr, "write");

        // Simulate bootstrap catch handler
        const errorMessage = testError.message;
        const errorName = testError.name;

        expect(errorName).toBe("Error");
        expect(errorMessage).toBe("Test failure");
        expect(errorMessage).not.toBe("{}");
    });

    it("should handle non-Error objects gracefully", () => {
        const testError = "string error";
        const errorMessage = testError instanceof Error ? testError.message : String(testError);

        expect(errorMessage).toBe("string error");
    });

    it("should extract stack trace from Error objects", () => {
        const testError = new Error("Test with stack");

        expect(testError.stack).toBeDefined();
        expect(testError.stack).toContain("Test with stack");
    });
});
```

**Manual checks to run:**

1. **Local testing with simulated failure:**
   ```bash
   cd app
   # Test with missing SUPABASE_DB_URL to trigger queue startup error
   unset SUPABASE_DB_URL
   bun run src/index.ts 2>&1 | tee error-log.txt
   # Verify: Clear error message about missing SUPABASE_DB_URL
   # Verify: Error name, message, and stack trace appear in logs
   ```

2. **Local testing with invalid database connection:**
   ```bash
   cd app
   export SUPABASE_DB_URL="postgresql://invalid:invalid@localhost:9999/invalid"
   bun run src/index.ts 2>&1 | tee connection-error-log.txt
   # Verify: Connection error with redacted URL appears
   # Verify: pg-boss error details visible
   ```

3. **Staging deployment:**
   ```bash
   # Deploy to kotadb-staging first
   git push origin bug/357-improve-error-logging:staging
   # Wait for deployment
   flyctl logs --app kotadb-staging --no-tail | tail -40
   # Verify: Checkpoint logs appear in correct sequence
   # Verify: Startup completes successfully with all checkpoints logged
   ```

4. **Production deployment and diagnosis:**
   ```bash
   # Create PR to merge bug/357-improve-error-logging into main
   gh pr create --title "fix: improve error logging in bootstrap sequence (#357)" --base main
   # After PR approval and merge
   flyctl logs --app kotadb --no-tail --follow
   # Capture: Actual error message/stack trace showing root cause
   # Use diagnostics to identify and fix underlying issue
   ```

## Step by Step Tasks

### Phase 1: Implement Error Logging Improvements

1. Check out feature branch from develop:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b bug/357-improve-error-logging
   ```

2. Update bootstrap error handler in `app/src/index.ts`:
   - Replace lines 132-135 with proper error extraction
   - Extract error message, name, and stack trace
   - Format output for readability with indentation

3. Add checkpoint logging throughout bootstrap sequence in `app/src/index.ts`:
   - After Supabase health check (after line 73)
   - After queue creation (after line 83)
   - After worker registration (after line 100)
   - Before and after Express app creation (around line 103)
   - Use ISO timestamps: `[${new Date().toISOString()}]`

4. Enhance queue error logging in `app/src/queue/client.ts`:
   - Update catch block in `startQueue()` (lines 66-73)
   - Add redacted connection string to error output
   - Include error message and stack trace
   - Fix missing newlines in existing log statements (lines 54, 65, 88, 94)

### Phase 2: Add Test Coverage

5. Create test file `app/tests/bootstrap-error-logging.test.ts`:
   - Test error message extraction from Error objects
   - Test handling of non-Error objects (strings, nulls)
   - Test stack trace extraction
   - Verify error serialization doesn't return `{}`

6. Run test suite locally:
   ```bash
   cd app
   bun test bootstrap-error-logging
   ```

### Phase 3: Local Validation

7. Test with missing environment variable:
   ```bash
   cd app
   unset SUPABASE_DB_URL
   bun run src/index.ts 2>&1 | tee error-log.txt
   # Verify clear error message appears
   ```

8. Test with invalid database connection:
   ```bash
   cd app
   export SUPABASE_DB_URL="postgresql://invalid:invalid@localhost:9999/invalid"
   bun run src/index.ts 2>&1 | tee connection-error-log.txt
   # Verify connection error with context appears
   ```

9. Run full test suite and linting:
   ```bash
   cd app
   bun run lint
   bun run typecheck
   bun test
   bun run build
   ```

### Phase 4: Commit and Push

10. Stage and commit changes:
    ```bash
    git add app/src/index.ts app/src/queue/client.ts app/tests/bootstrap-error-logging.test.ts
    git commit -m "fix: improve error logging in bootstrap sequence for production debugging

- Replace JSON.stringify(error) with proper error extraction (message, name, stack)
- Add checkpoint logging after each bootstrap phase with ISO timestamps
- Enhance queue startup error logging with redacted connection strings
- Add test coverage for error serialization and extraction
- Fix missing newlines in queue client log statements

This fix enables production diagnosis of the current crash loop by surfacing
the actual error instead of '{}'. Follow logging standards (process.stderr.write).

Closes #357"
    ```

11. Push branch to remote:
    ```bash
    git push -u origin bug/357-improve-error-logging
    ```

### Phase 5: Staging Deployment

12. Deploy to staging for validation:
    ```bash
    # Trigger staging deployment (via PR or direct push to staging branch)
    flyctl logs --app kotadb-staging --no-tail --follow
    # Verify checkpoint logs appear in correct sequence
    ```

13. Verify staging health:
    ```bash
    curl -s -w "\nHTTP Status: %{http_code}\n" https://kotadb-staging.fly.dev/health
    # Should return 200
    ```

### Phase 6: Production Deployment and Diagnosis

14. Create PR to develop (default branch):
    ```bash
    gh pr create --title "fix: improve error logging in bootstrap sequence (#357)" \
                 --body "Fixes #357

## Summary
- Replaces JSON.stringify(error) with proper error extraction
- Adds checkpoint logging throughout bootstrap sequence
- Enhances queue startup error logging with context

## Testing
- Added test coverage for error serialization
- Tested locally with simulated failures
- Verified staging deployment shows checkpoint logs

## Diagnosis Next Steps
Once merged and deployed to production, monitor logs to capture actual error and diagnose root cause of crash loop."
    ```

15. After PR approval and merge to develop, monitor production logs:
    ```bash
    flyctl logs --app kotadb --no-tail --follow
    # Capture actual error message showing root cause of crash
    ```

16. Use captured error to diagnose and fix root cause:
    - Create follow-up issue with actual error details
    - Implement targeted fix for underlying problem
    - Link back to #357 for context

## Regression Risks

**Adjacent features to watch:**

1. **Queue worker startup:** Enhanced error logging could expose edge cases in pg-boss initialization that were previously silent
2. **Supabase connection pooling:** Additional logging may reveal connection string format issues (pooler vs direct, SSL parameters)
3. **Express middleware initialization:** Checkpoint logging before Express creation may reveal middleware configuration errors
4. **Graceful shutdown:** SIGTERM handler (lines 112-129) could be affected if error state changes during shutdown

**Follow-up work if risk materializes:**

1. If pg-boss reveals schema initialization failures, create issue to investigate pg-boss schema migration state in production database
2. If Supabase connection reveals SSL/pooler issues, create issue to standardize connection string format across environments
3. If Express creation fails, create issue to add error handling around middleware initialization
4. If production continues crashing after logging improvements, use captured error to create targeted fix issue

## Validation Commands

```bash
# Type checking
cd app && bun run typecheck

# Linting (verifies no console.* usage per logging standards)
cd app && bun run lint

# Unit tests
cd app && bun test bootstrap-error-logging

# Full test suite (integration tests hit real Supabase per antimocking philosophy)
cd app && bun test

# Build verification
cd app && bun run build

# Local error simulation (missing SUPABASE_DB_URL)
cd app && unset SUPABASE_DB_URL && bun run src/index.ts 2>&1 | grep "Error:"

# Local error simulation (invalid connection)
cd app && export SUPABASE_DB_URL="postgresql://invalid:invalid@localhost:9999/invalid" && bun run src/index.ts 2>&1 | grep "Failed to start job queue"
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix: improve error logging in bootstrap sequence` not `Looking at the changes, this commit improves error logging`

**Example valid commit:**
```
fix: improve error logging in bootstrap sequence for production debugging

- Replace JSON.stringify(error) with proper error extraction
- Add checkpoint logging after each bootstrap phase
- Enhance queue startup error logging with context

Closes #357
```
