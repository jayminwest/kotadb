# Bug Plan: MCP Server Python3 PATH Resolution Failure

## Bug Summary

**Observed Behavior:**
The ADW MCP server (`automation/adws/mcp_server`) starts successfully and listens on port 4000, but crashes immediately when executing any MCP tool that requires Python bridge communication. The crash occurs with error code `ENOENT` (no such file or directory) when attempting to spawn `python3` subprocess.

```
ENOENT: no such file or directory, posix_spawn 'python3'
     path: "python3",
  syscall: "spawn python3",
    errno: -2,
spawnargs: [ "-m", "adws.adw_modules.mcp_bridge", "list_workflows" ],
     code: "ENOENT"
```

**Expected Behavior:**
MCP server should successfully spawn Python bridge processes and execute tool commands (e.g., `adw_list_workflows`, `adw_get_state`) without PATH resolution errors.

**Suspected Scope:**
- All 8 MCP tools affected (`workflow.ts:88`, `workflow.ts:171`, `git.ts:103`, `validation.ts:62`)
- Issue occurs specifically when Bun runtime inherits minimal PATH environment
- Four `spawn("python3", ...)` call sites across three tool modules
- No fallback mechanism for Python executable discovery

## Root Cause Hypothesis

**Leading Theory:**
The MCP server runs under Bun runtime, which may inherit a different PATH environment than the user's interactive shell. When Node.js `child_process.spawn()` searches for the `python3` executable, it only looks in directories listed in the inherited PATH. If Bun's PATH doesn't include the Python installation directory (e.g., `/Users/jayminwest/.cache/uv/archive-v0/xiMReLFz9OH30qgJ1fKgO/bin/` for uv-managed Python or `/Library/Frameworks/Python.framework/Versions/3.12/bin` for system Python), the spawn operation fails immediately with ENOENT.

**Supporting Evidence:**
1. Shell command `which python3` returns `/Users/jayminwest/.cache/uv/archive-v0/xiMReLFz9OH30qgJ1fKgO/bin/python3` (uv-managed)
2. Error message confirms PATH search failure: `posix_spawn 'python3'` with `errno: -2`
3. MCP server starts successfully (no initialization errors), indicating PATH is valid for Bun itself
4. Crash occurs at runtime during tool invocation, not during server startup
5. All four spawn call sites use bare `"python3"` string without absolute path resolution
6. No environment variable configuration for Python path in `package.json` scripts or `.env.sample`

**Alternative Hypotheses (Lower Probability):**
- Missing Python dependencies: Unlikely, as error is ENOENT (file not found), not import errors
- Incorrect working directory: Unlikely, as `cwd: getAutomationDir()` is correctly set in spawn options
- Permission issues: Unlikely, as ENOENT specifically means file not found in PATH

## Fix Strategy

**Primary Approach: Environment Variable Configuration with Fallback**
Implement a Python path resolution utility that:
1. Checks for `PYTHON_PATH` environment variable (highest priority)
2. Falls back to `python3` for backward compatibility
3. Centralizes path resolution logic to avoid code duplication
4. Documents environment variable in `.env.example` and README

**Code Changes:**
1. Create `src/utils/python.ts` with `getPythonExecutable()` function
2. Update all four spawn call sites to use centralized utility
3. Add `PYTHON_PATH` to MCP server `.env.example`
4. Update server index to log resolved Python path on startup for debugging

**Configuration Updates:**
1. Add `PYTHON_PATH` environment variable to `.env.example`
2. Document Python path discovery in `automation/adws/mcp_server/README.md`
3. Add troubleshooting section for PATH-related errors

**Guardrails:**
- Preserve backward compatibility by defaulting to `"python3"` if env var not set
- Log resolved Python path at server startup for debuggability
- Add validation helper to test Python executable accessibility
- Include instructions for different Python installation methods (system, Homebrew, pyenv, uv)

## Relevant Files

### Modified Files
- `automation/adws/mcp_server/src/tools/workflow.ts` — Update two spawn calls (lines 88, 171) to use Python path utility
- `automation/adws/mcp_server/src/tools/git.ts` — Update spawn call (line 103) to use Python path utility
- `automation/adws/mcp_server/src/tools/validation.ts` — Update spawn call (line 62) to use Python path utility
- `automation/adws/mcp_server/src/index.ts` — Add Python path validation and logging on server startup
- `automation/adws/mcp_server/README.md` — Add Python path configuration section and troubleshooting guide

### New Files
- `automation/adws/mcp_server/.env.example` — Environment variable template with PYTHON_PATH documentation
- `automation/adws/mcp_server/src/utils/python.ts` — Centralized Python executable path resolution utility

## Task Breakdown

### Verification
1. **Reproduce crash locally:**
   - Start MCP server: `cd automation/adws/mcp_server && bun run dev`
   - Verify server starts and listens on port 4000
   - Trigger tool invocation via curl: `curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"adw_list_workflows","arguments":{}}}'`
   - Confirm ENOENT error in server logs or response body

2. **Capture diagnostic information:**
   - Run `which python3` in shell and record absolute path
   - Run `echo $PATH` to verify Python directory is in user's PATH
   - Start server and inspect inherited PATH: `console.log(process.env.PATH)` in `src/index.ts`
   - Confirm PATH discrepancy between shell and Bun runtime

3. **Verify Python bridge module accessibility:**
   - Run `cd automation && python3 -m adws.adw_modules.mcp_bridge list_workflows` to confirm bridge works with shell PATH
   - Confirm error is PATH-related, not import/dependency issues

### Implementation

1. **Create Python path resolution utility:**
   - Create `automation/adws/mcp_server/src/utils/python.ts`
   - Implement `getPythonExecutable()` function that reads `process.env.PYTHON_PATH` with fallback to `"python3"`
   - Add JSDoc comments documenting behavior and environment variable usage
   - Export as named export for type safety

2. **Create environment variable template:**
   - Create `automation/adws/mcp_server/.env.example` file
   - Add `PYTHON_PATH` variable with documentation and example value
   - Include instructions for finding Python path (`which python3`)
   - Add note about uv, pyenv, and system Python installation methods

3. **Update workflow tools module:**
   - Import `getPythonExecutable` from `../utils/python.js` in `src/tools/workflow.ts`
   - Replace `spawn("python3", ...)` with `spawn(getPythonExecutable(), ...)` at line 88 in `executePythonBridge()`
   - Replace `spawn("python3", processArgs, ...)` with `spawn(getPythonExecutable(), processArgs, ...)` at line 171 in `executeRunPhase()`
   - Verify no other spawn calls in the file

4. **Update git tools module:**
   - Import `getPythonExecutable` from `../utils/python.js` in `src/tools/git.ts`
   - Replace `spawn("python3", ...)` with `spawn(getPythonExecutable(), ...)` at line 103 in `executePythonBridge()`
   - Verify no other spawn calls in the file

5. **Update validation tools module:**
   - Import `getPythonExecutable` from `../utils/python.js` in `src/tools/validation.ts`
   - Replace `spawn("python3", ...)` with `spawn(getPythonExecutable(), ...)` at line 62 in `executePythonBridge()`
   - Verify no other spawn calls in the file

6. **Add server startup validation:**
   - Update `automation/adws/mcp_server/src/index.ts` to import `getPythonExecutable`
   - Add console log on server start: `console.log(\`Using Python executable: \${getPythonExecutable()}\`)`
   - Add validation warning if `PYTHON_PATH` env var is not set (recommend setting it for production)

7. **Update README documentation:**
   - Add "Environment Configuration" section to `automation/adws/mcp_server/README.md`
   - Document `PYTHON_PATH` environment variable with examples
   - Add troubleshooting section for ENOENT errors
   - Include instructions for different Python installation methods
   - Add section on verifying Python bridge accessibility before starting server

### Validation

1. **Unit test Python path utility:**
   - Create `automation/adws/mcp_server/tests/unit/python.test.ts`
   - Test `getPythonExecutable()` returns env var value when set
   - Test `getPythonExecutable()` returns `"python3"` fallback when env var unset
   - Test behavior with empty string env var (should use fallback)

2. **Integration test with PYTHON_PATH set:**
   - Create `automation/adws/mcp_server/.env.test` file with `PYTHON_PATH=$(which python3)`
   - Load `.env.test` in test setup (or use `bun --env-file=.env.test test`)
   - Run existing integration tests: `cd automation/adws/mcp_server && bun test`
   - Verify all 3 test suites pass (`adw_get_state.test.ts`, `bun_validate.test.ts`, `git_commit.test.ts`)

3. **Manual verification with server restart:**
   - Create `automation/adws/mcp_server/.env` with `PYTHON_PATH=$(which python3)`
   - Start server: `cd automation/adws/mcp_server && bun run dev`
   - Verify startup log shows resolved Python path
   - Test `adw_list_workflows` tool: `curl -X POST http://localhost:4000/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"adw_list_workflows","arguments":{}}}'`
   - Verify response contains workflow list (not ENOENT error)
   - Test all 8 MCP tools via curl (workflow, git, validation categories)

4. **Test backward compatibility without PYTHON_PATH:**
   - Remove `PYTHON_PATH` from `.env` (or unset environment variable)
   - Restart server and verify it still attempts to use `"python3"` (should work if python3 is in system PATH)
   - Confirm fallback behavior logged on startup

5. **Cross-platform validation (if applicable):**
   - Test on macOS with Homebrew Python (`/usr/local/bin/python3`)
   - Test on macOS with system Python (`/usr/bin/python3`)
   - Test on macOS with uv-managed Python (`~/.cache/uv/archive-v0/.../bin/python3`)
   - Document any platform-specific considerations in README

## Step by Step Tasks

### 1. Verification and Diagnosis
- Reproduce ENOENT crash by starting server and invoking `adw_list_workflows` tool
- Capture Python path from `which python3` and compare with Bun runtime PATH
- Verify Python bridge module works with correct path: `cd automation && python3 -m adws.adw_modules.mcp_bridge list_workflows`
- Document PATH discrepancy and confirm root cause hypothesis

### 2. Implementation - Core Utility
- Create `automation/adws/mcp_server/src/utils/python.ts` with `getPythonExecutable()` function
- Implement environment variable lookup with fallback logic
- Add JSDoc documentation with usage examples
- Create `.env.example` with `PYTHON_PATH` configuration template

### 3. Implementation - Tool Module Updates
- Update `src/tools/workflow.ts`: replace two spawn calls with `getPythonExecutable()`
- Update `src/tools/git.ts`: replace one spawn call with `getPythonExecutable()`
- Update `src/tools/validation.ts`: replace one spawn call with `getPythonExecutable()`
- Add imports for `getPythonExecutable` to all three tool modules

### 4. Implementation - Server Initialization
- Update `src/index.ts` to log resolved Python path on server startup
- Add validation warning if `PYTHON_PATH` env var is not set
- Test server startup with and without `PYTHON_PATH` to verify logging

### 5. Testing - Unit Tests
- Create `tests/unit/python.test.ts` with test cases for env var handling
- Run unit tests: `cd automation/adws/mcp_server && bun test tests/unit/python.test.ts`
- Verify all test cases pass (env var set, unset, empty string)

### 6. Testing - Integration Tests
- Create `.env.test` with `PYTHON_PATH=$(which python3)`
- Configure test runner to load `.env.test` (update `package.json` test script if needed)
- Run integration tests: `cd automation/adws/mcp_server && bun test`
- Verify all existing integration tests pass with explicit Python path

### 7. Testing - Manual Server Verification
- Create `.env` file with `PYTHON_PATH=$(which python3)`
- Start server: `cd automation/adws/mcp_server && bun run dev`
- Verify startup log shows correct Python path
- Test all 8 MCP tools via curl to confirm no ENOENT errors

### 8. Documentation
- Update `automation/adws/mcp_server/README.md` with environment configuration section
- Add troubleshooting guide for PATH-related errors
- Document Python path discovery methods for different installation types
- Add example `.env` configuration snippets

### 9. Final Validation
- Run TypeScript type checking: `cd automation/adws/mcp_server && bunx tsc --noEmit`
- Run full test suite: `cd automation/adws/mcp_server && bun test`
- Test backward compatibility by removing `PYTHON_PATH` and verifying fallback behavior
- Verify server runs successfully in both configured and unconfigured states

### 10. Branch and Commit
- Stage all changes: `git add -A`
- Create commit with conventional format: `fix(mcp): resolve python3 spawn ENOENT by adding PYTHON_PATH env var (#156)`
- Push branch: `git push -u origin bug/156-mcp-server-python-path-crash`
- Verify commit message passes validation (no meta-commentary, follows conventional format)

## Regression Risks

**Adjacent Features to Watch:**
1. **Python bridge reliability**: All MCP tools depend on Python bridge subprocess execution. If Python path resolution fails silently or returns invalid path, all tools will break.
2. **Environment variable precedence**: If `PYTHON_PATH` is set incorrectly (e.g., points to Python 2.x or non-existent path), tools will fail in new ways.
3. **Cross-platform compatibility**: Solution must work on macOS, Linux, and Windows (if supported). Windows uses different PATH separators and may require `python.exe` instead of `python3`.
4. **Integration test stability**: Tests currently work in development environment but may fail in CI/CD if environment variables aren't properly loaded.
5. **Server startup behavior**: Adding validation at startup could cause server to refuse to start if Python path is invalid, changing failure mode from runtime to initialization.

**Follow-Up Work if Risks Materialize:**
1. **If Python path validation fails silently**: Add explicit path existence check using `fs.existsSync()` before spawning subprocess
2. **If Windows compatibility issues arise**: Detect platform and adjust executable name (`python3` vs `python.exe` vs `python`)
3. **If CI tests fail**: Update GitHub Actions workflow to set `PYTHON_PATH` environment variable in test jobs
4. **If server startup becomes too strict**: Add `PYTHON_PATH_STRICT` flag to control whether invalid path prevents server startup or just logs warning
5. **If multiple Python versions cause confusion**: Add Python version check subprocess at startup to log version info

## Validation Commands

```bash
# Type checking
cd automation/adws/mcp_server && bunx tsc --noEmit

# Unit tests
cd automation/adws/mcp_server && bun test tests/unit/python.test.ts

# Integration tests
cd automation/adws/mcp_server && bun test tests/integration/*.test.ts

# Full test suite
cd automation/adws/mcp_server && bun test

# Manual server test
cd automation/adws/mcp_server && bun run dev
# In separate terminal:
curl -X POST http://localhost:4000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"adw_list_workflows","arguments":{}}}'

# Verify Python bridge directly
cd automation && python3 -m adws.adw_modules.mcp_bridge list_workflows
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(mcp): resolve python3 spawn ENOENT by adding PYTHON_PATH env var` not `Looking at the changes, this commit fixes the python3 spawn ENOENT error`

## Issue Relationships

- **Related To**: #145 (ADW MCP Server for Agent Orchestration) — This bug affects the MCP server implementation from feature #145
- **Blocks**: Full ADW workflow automation — MCP tools cannot be used until Python path resolution is fixed

## Additional Context

**Python Installation Methods Supported:**
1. **System Python**: `/usr/bin/python3` (macOS/Linux default)
2. **Homebrew**: `/usr/local/bin/python3` or `/opt/homebrew/bin/python3` (Apple Silicon)
3. **pyenv**: `~/.pyenv/versions/X.Y.Z/bin/python3`
4. **uv**: `~/.cache/uv/archive-v0/{hash}/bin/python3` (uv-managed environments)
5. **Custom virtualenv**: Any absolute path to Python executable

**Why Environment Variable Over Automatic Discovery:**
- Explicit configuration is more predictable than PATH searching
- Avoids dependency on `which` command (not guaranteed on all platforms)
- Allows users to specify exact Python version (important for uv environments)
- Easier to debug and document than runtime discovery
- Fallback to `"python3"` preserves backward compatibility

**Alternative Approaches Considered:**
1. **Use `shell: true` in spawn options**: Security risk (shell injection), cross-platform issues
2. **Programmatic PATH search with `which`**: Adds subprocess overhead, not guaranteed on Windows
3. **Hardcode absolute path**: Not portable across machines/environments
4. **Detect and use virtualenv**: Complex logic, doesn't handle all installation methods
