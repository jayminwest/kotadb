# Bug Plan: Fix TypeScript errors in MCP tests and implement pre-commit hooks

## Bug Summary
- **Observed behaviour**: Application CI failing on `develop` branch (run 18618520088, commit 34af9bc) due to 3 TypeScript compilation errors in MCP test files during type-check step
- **Expected behaviour**: Type-check step passes with zero errors, allowing full CI pipeline to complete
- **Suspected scope**: Test helper type narrowing issue, incorrect response parsing in authentication tests, array destructuring type inference issue in concurrent tests

## Root Cause Hypothesis
- **Leading theory**: TypeScript strict type checking identifies three distinct issues:
  1. `assertToolResult` helper uses runtime string values with `.toBe()` which expects literal type union
  2. `authentication.test.ts` incorrectly calls `.json()` on already-parsed response wrapper object
  3. `concurrent.test.ts` array destructuring with spread operator prevents TypeScript from guaranteeing array length
- **Supporting evidence**: CI logs show exact line numbers and error codes (TS2769, TS2339, TS18048), local type-check may pass due to different TypeScript version or already-fixed code in worktree

## Fix Strategy
- **Code changes**:
  1. Apply type assertion `as any` to `assertToolResult` type parameter (line 119) to bridge runtime/compile-time type gap
  2. Remove incorrect `.json()` call in `authentication.test.ts` (line 82), use `response.data` directly
  3. Add explicit null check after array destructuring in `concurrent.test.ts` before using `searchResponse`
- **Guardrails**: Implement Husky pre-commit hooks to run `bunx tsc --noEmit` and `bun run lint` on staged files, preventing future type errors from reaching CI
- **Data/config updates**: Add `husky` and `lint-staged` to devDependencies, create `.husky/pre-commit` hook with conditional execution based on changed files

## Relevant Files
- `app/tests/helpers/mcp.ts` — Test helper with type narrowing issue in assertToolResult (line 119)
- `app/tests/mcp/authentication.test.ts` — Incorrect .json() call on response wrapper (line 82)
- `app/tests/mcp/concurrent.test.ts` — Undefined check missing for destructured array element (lines 248-256)
- `app/package.json` — Add husky/lint-staged dependencies and prepare script
- `.github/workflows/app-ci.yml` — CI workflow affected by type-check failures (line 54)
- `CLAUDE.md` — Document pre-commit workflow and troubleshooting

### New Files
- `.husky/pre-commit` — Conditional type-check and lint execution for app/shared changes
- `.husky/_/.gitignore` — Standard Husky internal files directory
- `app/.lintstagedrc.json` — lint-staged configuration for staged file checks (optional performance optimization)

## Task Breakdown

### Verification
1. Reproduce CI failure locally by checking out commit 34af9bc from develop branch
2. Run `cd app && bunx tsc --noEmit` and confirm 3 errors at specified line numbers
3. Capture error messages showing TS2769, TS2339, TS18048 error codes
4. Verify tests still pass despite type errors: `cd app && bun test`

### Implementation
1. **Fix Type Error 1 (app/tests/helpers/mcp.ts:119)**:
   - Change `expect(typeof result[field]).toBe(type);` to `expect(typeof result[field]).toBe(type as any);`
   - Add comment explaining type assertion bridges runtime string to literal type union

2. **Fix Type Error 2 (app/tests/mcp/authentication.test.ts:82)**:
   - Remove line: `const data = (await response.json()) as any;`
   - Replace with: `const data = response.data as any;`
   - Update comment to clarify `sendMcpRequest` returns pre-parsed data

3. **Fix Type Error 3 (app/tests/mcp/concurrent.test.ts:248-256)**:
   - Code already contains proper fix with null check (lines 248-251)
   - Verify fix is correct: extract `results[results.length - 1]` to variable, then check `if (!searchResponse) throw Error`
   - Ensure subsequent uses of `searchResponse` keep non-null assertions (lines 254-255)

4. **Install Husky and lint-staged**:
   - Run `cd app && bun add -D husky lint-staged`
   - Run `cd app && bunx husky init` to create `.husky/` directory

5. **Create Pre-commit Hook**:
   - Create `.husky/pre-commit` with conditional execution logic:
     - Detect changed files in `app/` or `shared/` directories
     - Run `bunx tsc --noEmit` in `shared/` if shared types changed
     - Run `bunx tsc --noEmit` in `app/` if app files changed
     - Run `bun run lint` in `app/` if app files changed
     - Exit with code 1 on any failure to block commit
   - Make hook executable: `chmod +x .husky/pre-commit`

6. **Configure lint-staged (Optional Performance Optimization)**:
   - Create `app/.lintstagedrc.json` with config for `*.{ts,tsx,js,jsx}` files
   - Configure to run `bunx tsc --noEmit` and `bun run lint` on staged files only
   - Update `.husky/pre-commit` to use `bunx lint-staged` for incremental checks

7. **Add Prepare Script**:
   - Update `app/package.json` scripts section: `"prepare": "cd .. && husky install app/.husky"`
   - Ensures hooks are installed automatically when developers run `bun install`

### Validation
1. **Type-check passes**: Run `cd app && bunx tsc --noEmit` and verify exit code 0 with no errors
2. **Shared types check passes**: Run `cd shared && bunx tsc --noEmit` and verify exit code 0
3. **Tests still pass**: Run `cd app && bun test` and verify all 133 tests pass (no regressions)
4. **Lint passes**: Run `cd app && bun run lint` and verify no issues
5. **Migration sync validated**: Run `cd app && bun run test:validate-migrations` to ensure no drift
6. **Pre-commit hook blocks type errors**:
   - Introduce deliberate type error: `echo "const x: string = 123;" >> app/src/index.ts`
   - Stage file: `git add app/src/index.ts`
   - Attempt commit: `git commit -m "test: should fail"`
   - Verify hook fails and blocks commit
   - Revert test change: `git restore app/src/index.ts`
7. **Pre-commit hook blocks lint errors**:
   - Introduce lint error: `echo "const unused = 'test';" >> app/src/index.ts`
   - Stage and attempt commit
   - Verify hook fails with lint error
   - Revert test change
8. **Pre-commit hook allows valid commits**:
   - Make valid change: `echo "// Valid comment" >> app/src/index.ts`
   - Stage and commit: `git add app/src/index.ts && git commit -m "chore: add comment"`
   - Verify hook passes and commit succeeds
   - Revert test commit: `git reset HEAD~1 && git restore app/src/index.ts`
9. **Hook bypass works**: Run `git commit --no-verify -m "emergency: bypass"` on test change and verify commit succeeds
10. **CI passes on PR**: Push branch and verify Application CI workflow completes without type-check errors

## Step by Step Tasks

### Phase 1: Fix TypeScript Errors
1. Check out working branch from develop or use current worktree
2. Open `app/tests/helpers/mcp.ts` and apply type assertion fix at line 119
3. Open `app/tests/mcp/authentication.test.ts` and fix incorrect `.json()` call at line 82
4. Open `app/tests/mcp/concurrent.test.ts` and verify fix already applied (lines 248-251)
5. Run local type-check validation: `cd app && bunx tsc --noEmit`
6. Run local test validation: `cd app && bun test`
7. Stage TypeScript fixes: `git add app/tests/`

### Phase 2: Implement Pre-commit Hooks
1. Navigate to app directory: `cd app`
2. Install Husky: `bun add -D husky`
3. Install lint-staged: `bun add -D lint-staged`
4. Initialize Husky: `bunx husky init`
5. Create `.husky/pre-commit` hook file with conditional execution logic
6. Make hook executable: `chmod +x .husky/pre-commit`
7. Create `app/.lintstagedrc.json` configuration file (optional)
8. Update `app/package.json` with prepare script
9. Test hook installation: `bun install` (should run prepare script)
10. Stage hook configuration: `git add .husky/ app/package.json app/.lintstagedrc.json`

### Phase 3: Documentation Updates
1. Open `CLAUDE.md` at repository root
2. Add new section "Pre-commit Hooks" under "Development Commands"
3. Document hook installation: `bun install` automatically installs hooks
4. Document hook execution: runs on `git commit` for app/shared changes
5. Document hook bypass: `git commit --no-verify` for emergencies
6. Add troubleshooting section for common hook failures
7. Stage documentation: `git add CLAUDE.md`

### Phase 4: Validation and Commit
1. Run full validation suite (see Validation section above)
2. Create commit with conventional format: `git commit -m "fix: resolve TypeScript errors in MCP tests and add pre-commit hooks (#198)"`
3. Verify pre-commit hook executes during commit
4. Push branch to remote: `git push -u origin bug/198-typescript-mcp-errors`
5. Create PR with description linking to issue #198
6. Monitor CI pipeline for successful completion
7. Address any CI failures or review feedback
8. Merge PR after approval

## Regression Risks
- **Adjacent features to watch**:
  - All MCP test files depend on `assertToolResult` helper - verify no test failures after type assertion change
  - Authentication tests use `sendMcpRequest` wrapper - ensure response.data access pattern works across all usage sites
  - Concurrent tests rely on Promise.all array destructuring - verify TypeScript correctly infers types after explicit check
  - Pre-commit hooks may slow down commit workflow by 5-10 seconds - monitor developer feedback for performance issues
  - Hooks may fail on systems without Bun installed globally - ensure prepare script handles Bun installation correctly
- **Follow-up work if risk materialises**:
  - If assertToolResult change causes test failures: refactor to use proper type guard with literal type union
  - If response.data pattern breaks other tests: audit all sendMcpRequest usage sites and apply consistent parsing
  - If pre-commit hooks cause developer friction: add SKIP_HOOKS=1 environment variable for temporary bypass
  - If hook performance is unacceptable: optimize with lint-staged to check only changed files
  - If CI still fails after fixes: investigate TypeScript version differences between local and CI environments

## Validation Commands
```bash
# Type checking
cd app && bunx tsc --noEmit
cd shared && bunx tsc --noEmit

# Linting
cd app && bun run lint

# Testing
cd app && bun test

# Migration sync
cd app && bun run test:validate-migrations

# Environment variable validation
cd app && bun run test:validate-env

# Build validation
cd app && bun run build

# Pre-commit hook validation
cd app && echo "const x: string = 123;" >> src/index.ts
git add src/index.ts
git commit -m "test: should fail"  # Should fail
git restore src/index.ts

# Hook bypass validation
git commit --no-verify -m "test: should succeed"  # Should succeed
```

## Commit Message Validation
All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `fix(tests): <subject>` or `chore(tooling): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Valid scopes: tests, tooling, ci-cd, mcp (choose most specific)
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements:
  - ✅ `fix(tests): resolve TypeScript errors in MCP test helpers`
  - ✅ `chore(tooling): add Husky pre-commit hooks for type-check and lint`
  - ❌ `Looking at the changes, this commit fixes the TypeScript errors in tests`
  - ❌ `Based on the issue, here is a commit that adds pre-commit hooks`

## Issue Relationships
- **Unblocks**: #167 (parallelize type-check and lint) - Currently blocked by CI reliability
- **Related To**: #162 (CI reliability investigation) - Part of broader CI stability effort
- **Related To**: #173 (template-code alignment validation) - Parallel effort for automation CI quality
- **Follow-Up**: Consider adding test execution to pre-commit checks for high-risk changes (balance feedback speed vs commit workflow friction)
