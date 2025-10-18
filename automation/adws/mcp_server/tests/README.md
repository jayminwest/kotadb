# MCP Server Integration Tests

## Overview

This directory contains integration tests for the ADW MCP server tools. All tests follow anti-mock principles by testing against real services (git, filesystem, Python bridge).

## Test Structure

```
tests/
├── integration/
│   ├── setup.ts              # Test helpers and fixtures
│   ├── git_commit.test.ts    # Git operation tests
│   ├── adw_get_state.test.ts # State management tests
│   └── bun_validate.test.ts  # Validation tests
└── README.md                 # This file
```

## Prerequisites

1. **Bun runtime**: Install from https://bun.sh
2. **Python 3.x**: Required for Python bridge
3. **Git**: Required for git operation tests
4. **Dependencies installed**:
   ```bash
   cd automation/adws/mcp_server
   bun install
   ```

## Running Tests

### All Integration Tests
```bash
cd automation/adws/mcp_server
bun test
```

### Specific Test File
```bash
bun test tests/integration/git_commit.test.ts
bun test tests/integration/adw_get_state.test.ts
bun test tests/integration/bun_validate.test.ts
```

### With Verbose Output
```bash
DEBUG=1 bun test
```

## Test Coverage

### 1. Git Operations (git_commit.test.ts)
- **Real Service**: Git CLI
- **Tests**:
  - Creates commits in real git repositories
  - Stages specific files
  - Handles errors for non-existent worktrees
  - Verifies commits via `git log`

### 2. State Management (adw_get_state.test.ts)
- **Real Service**: Filesystem
- **Tests**:
  - Loads state from JSON files
  - Lists workflows from agents directory
  - Filters workflows by ID
  - Validates state structure

### 3. Validation (bun_validate.test.ts)
- **Real Service**: Bun CLI
- **Tests**:
  - Runs lint and typecheck on real code
  - Detects validation failures
  - Returns structured error information
  - Handles non-existent directories

## Anti-Mock Compliance

All tests hit real services without mocks:

- **No mocked git commands**: Tests create actual git repos and run real git operations
- **No mocked filesystem**: Tests write and read actual files
- **No mocked subprocess**: Tests execute real Python bridge and Bun CLI
- **Evidence**: Tests verify outcomes via real service inspection (git log, file reads, exit codes)

## Test Fixtures

Tests use temporary directories and cleanup after execution:

- Git repos: Created in `tmpdir()` with unique prefixes
- State files: Created in `tmpdir()/mcp-test-agents/{adw_id}/`
- Worktrees: Created in `tmpdir()` for validation tests
- Cleanup: All temp directories removed in `afterAll()` hooks

## Failure Injection

Tests verify error handling with real failures:

- Invalid adw_id → actual state file not found
- Non-existent worktree → real git operation fails
- Invalid code → real typecheck failures
- Missing directories → real filesystem errors

No mocked errors or stubbed responses.

## CI Integration

To add these tests to CI:

1. Ensure Python environment is available
2. Install Bun and dependencies
3. Run `bun test` in CI workflow
4. Capture test output and logs as artifacts

Example GitHub Actions:
```yaml
- name: Install Bun
  uses: oven-sh/setup-bun@v1

- name: Install dependencies
  run: |
    cd automation/adws/mcp_server
    bun install

- name: Run integration tests
  run: |
    cd automation/adws/mcp_server
    bun test
```

## Extending Tests

To add new test files:

1. Create `tests/integration/<tool_name>.test.ts`
2. Import helpers from `./setup.ts`
3. Follow anti-mock principles (test real services)
4. Add cleanup in `afterAll()` hooks
5. Document real service interactions

## Troubleshooting

### Tests hang or timeout
- Check that Python bridge is functional: `python3 -m adws.adw_modules.mcp_bridge`
- Verify git is accessible: `git --version`
- Ensure permissions for temp directories

### Import errors
- Run `bun install` to install dependencies
- Check TypeScript paths are configured correctly
- Verify `tsconfig.json` includes test directory

### Python bridge errors
- Ensure you're in the project root when running tests
- Check Python path includes `automation/` directory
- Verify Python dependencies are installed: `uv sync`
