# Bug Plan: MCP server crashes due to python3 not found in PATH during spawn

## Bug Summary
- **Observed behaviour**: MCP server starts successfully and listens on port 4000, but crashes immediately when attempting to execute Python bridge commands with `ENOENT: no such file or directory, posix_spawn 'python3'` error
- **Expected behaviour**: MCP server should successfully execute Python bridge commands by finding the correct Python executable path
- **Suspected scope**: Environment variable loading for MCP server startup script in `automation/adws/mcp_server/package.json` and `.env` file setup

## Root Cause Hypothesis
- **Leading theory**: The MCP server's startup script (`bun run src/index.ts`) does not automatically load the `.env` file, so the `PYTHON_PATH` environment variable is never set. Bun runtime inherits a minimal PATH from the parent process that may not include user-specific Python installation directories (e.g., `/Library/Frameworks/Python.framework/Versions/3.12/bin`). The `getPythonExecutable()` utility correctly falls back to `"python3"`, but when `spawn()` searches for this binary in the limited PATH, it fails with ENOENT.
- **Supporting evidence**:
  - README.md documents `PYTHON_PATH` environment variable and `.env` setup (lines 112-161)
  - `.env.example` exists but `.env` is not created automatically
  - `package.json` dev script is `"bun run src/index.ts"` without `--env-file` flag
  - `getPythonExecutable()` utility works correctly (unit tests pass)
  - Server logs show warning when `PYTHON_PATH` not set (src/index.ts:60-63)
  - Error location is `workflow.ts:88` which uses `spawn(getPythonExecutable(), ...)` correctly

## Fix Strategy
- **Code changes**:
  1. Update `package.json` dev script to include Bun's `--env-file` flag for automatic `.env` loading
  2. Add preload script or module to load `.env` file if `--env-file` flag is not universally supported
  3. Add setup validation in `src/index.ts` to check Python path resolution on startup
- **Data/config updates**:
  1. Create `.env` file from `.env.example` in developer setup (not committed to git)
  2. Update `.gitignore` to ensure `.env` is excluded (verify automation/adws/mcp_server/.env entry)
  3. Document setup requirement in README.md quick start section
- **Guardrails**:
  1. Add startup validation that verifies Python executable exists and is executable
  2. Log clear error message if Python path resolution fails
  3. Integration test that verifies `.env` loading works before server accepts requests
  4. Add check in CI to ensure `.env.example` stays in sync with documented variables

## Relevant Files
- `automation/adws/mcp_server/package.json` — Update dev script to load .env file
- `automation/adws/mcp_server/src/index.ts` — Add Python path validation on startup
- `automation/adws/mcp_server/src/utils/python.ts` — Add validation helper for executable existence
- `automation/adws/mcp_server/README.md` — Update quick start with .env setup step
- `automation/adws/mcp_server/tests/integration/setup.ts` — Add .env loading verification
- `.gitignore` — Verify .env exclusion for mcp_server directory

### New Files
- `automation/adws/mcp_server/.env` — Created from .env.example during local setup (git-ignored)
- `automation/adws/mcp_server/src/utils/env.ts` — Environment loading utility with validation (optional if using --env-file)

## Task Breakdown

### Verification
- **Steps to reproduce current failure**:
  1. Ensure no `.env` file exists in `automation/adws/mcp_server/`
  2. Run `cd automation/adws/mcp_server && bun run dev` to start server
  3. Verify server starts successfully and logs warning about PYTHON_PATH not set
  4. Send MCP tool call: `curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"adw_list_workflows","arguments":{}}}'`
  5. Observe server crash with ENOENT error
- **Logs/metrics to capture**:
  - Server startup logs showing Python path resolution
  - ENOENT error with spawn syscall details
  - PATH environment variable inherited by Bun process
  - Result of `which python3` in user shell vs Bun runtime PATH

### Implementation
1. **Update package.json dev script to load .env file**
   - Change `"dev": "bun run src/index.ts"` to `"dev": "bun --env-file=.env run src/index.ts"`
   - Verify Bun version supports `--env-file` flag (Bun 1.0+)
   - Add fallback script for older Bun versions if needed

2. **Add Python executable validation utility**
   - Create `validatePythonExecutable()` function in `src/utils/python.ts`
   - Check if resolved path exists using `fs.existsSync()` or `fs.accessSync()`
   - Verify executable permissions using `fs.constants.X_OK`
   - Return validation result with error message

3. **Add startup validation in src/index.ts**
   - Call `validatePythonExecutable()` before starting Express server
   - Log clear error and exit with code 1 if validation fails
   - Include resolution instructions in error message
   - Add to startup logs: resolved path, validation status

4. **Update README.md with setup instructions**
   - Add "Quick Start" or "Setup" section before "Usage (Development)"
   - Document `.env` file creation: `cp .env.example .env`
   - Add step to set `PYTHON_PATH` using `which python3`
   - Update existing "Environment Configuration" section reference

5. **Verify .gitignore excludes .env file**
   - Check root `.gitignore` for `.env` pattern
   - Add `automation/adws/mcp_server/.env` if not covered by existing pattern
   - Ensure `.env.example` is NOT ignored

6. **Update integration test setup**
   - Add `.env` loading verification in `tests/integration/setup.ts`
   - Set `PYTHON_PATH` in test environment setup
   - Add test case for ENOENT error when PYTHON_PATH is invalid

### Validation
- **Tests to add/update** (integration tests hitting real Python bridge per antimocking):
  1. Add test case in `tests/integration/adw_get_state.test.ts` verifying `.env` loaded
  2. Add test case in `tests/unit/python.test.ts` for `validatePythonExecutable()`
  3. Add integration test that verifies server rejects startup with invalid PYTHON_PATH
  4. Add test that verifies all 8 MCP tools work after `.env` loading
  5. Update `tests/integration/setup.ts` to create test `.env` file

- **Manual checks to run**:
  1. Delete `.env` file and verify server logs clear error on startup (with validation)
  2. Create `.env` with valid `PYTHON_PATH` from `which python3` output
  3. Start server with `bun run dev` and verify startup logs show correct path
  4. Test all 8 MCP tools via curl (list_workflows, get_state, run_phase, git_commit, etc.)
  5. Verify server does not crash during tool invocation
  6. Test with invalid PYTHON_PATH and verify server rejects startup with clear error
  7. Test without `PYTHON_PATH` set but `python3` in PATH (should work with warning)

## Step by Step Tasks

### Environment Setup
- Verify Bun version supports `--env-file` flag (run `bun --version` and check >= 1.0)
- Check root `.gitignore` for `.env` pattern coverage
- Review existing `.env.example` for completeness

### Code Implementation
- Add `validatePythonExecutable()` to `src/utils/python.ts` with fs existence check
- Update `src/index.ts` to call validation before `app.listen()`
- Add clear error logging with resolution instructions when validation fails
- Update `package.json` dev script to include `--env-file=.env`

### Documentation Updates
- Add "Quick Start" section to README.md before "Usage (Development)"
- Document `.env` file creation step with `cp .env.example .env` command
- Add instructions to set `PYTHON_PATH` using `which python3` output
- Update troubleshooting section with validation error messages

### Testing
- Write unit tests for `validatePythonExecutable()` function
- Update integration test setup to create test `.env` file
- Add integration test for startup validation failure
- Run full MCP server test suite to verify fix
- Manually test server startup with valid/invalid/missing `.env` scenarios

### Validation and Commit
- Run `cd automation/adws/mcp_server && bun test` to verify all tests pass
- Run `cd automation/adws/mcp_server && bunx tsc --noEmit` for type checking
- Start server with `bun run dev` and test all 8 MCP tools manually
- Verify startup logs show correct Python path resolution
- Stage changes: `git add automation/adws/mcp_server package.json README.md src/ tests/`
- Commit with conventional format: `fix(mcp): resolve python3 spawn ENOENT by loading .env file (#156)`
- Push branch: `git push -u origin bug/156-mcp-python-path`

## Regression Risks

- **Adjacent features to watch**:
  1. All 8 MCP tools (adw_get_state, adw_list_workflows, adw_run_phase, git_commit, git_create_worktree, git_cleanup_worktree, bun_validate, bun_validate_migrations) — ensure Python bridge invocation still works
  2. MCP server startup in CI/CD environments — verify `.env` file handling in automated deployments
  3. Development workflow for other contributors — ensure `.env.example` has clear instructions
  4. Python bridge module (`adws/adw_modules/mcp_bridge.py`) — verify no changes needed

- **Follow-up work if risk materialises**:
  1. If `--env-file` flag not supported in older Bun versions, implement manual `.env` loading using `dotenv` package or custom parser
  2. If validation breaks existing workflows, add `SKIP_PYTHON_VALIDATION` env var for emergency bypass
  3. If CI fails due to missing `.env`, add `.env` generation script to CI setup
  4. If multiple Python installations cause ambiguity, add PYTHON_VERSION validation

## Validation Commands

- `cd automation/adws/mcp_server && bunx tsc --noEmit`
- `cd automation/adws/mcp_server && bun test`
- `cd automation/adws/mcp_server && bun run dev` (verify startup without crash)
- Manual MCP tool test: `curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"adw_list_workflows","arguments":{}}}'`
- Verify all 8 tools work via integration tests
- Test startup validation with invalid/missing PYTHON_PATH

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(mcp): load .env file for Python path resolution` not `Looking at the changes, this commit fixes the .env loading issue`

**Example good commit messages**:
- `fix(mcp): resolve python3 spawn ENOENT by loading .env file (#156)`
- `feat(mcp): add Python executable validation on startup`
- `docs(mcp): add .env setup instructions to README quick start`
- `test(mcp): add integration tests for .env loading and validation`
