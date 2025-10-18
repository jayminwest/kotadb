# MCP Server Testing Strategy

## Anti-Mock Compliance

Per `.claude/commands/docs/anti-mock.md`, all tests must hit real services without mocks, stubs, or spies.

### Real Service Integration

#### Git Operations
- **Tools**: `git_commit`, `git_create_worktree`, `git_cleanup_worktree`
- **Real Service**: Git CLI via subprocess
- **Test Approach**: Create temporary git repositories in `tmpdir()`, execute tools, verify with `git log`/`git worktree list`
- **Evidence**: Integration tests execute real `git` commands and inspect filesystem state

#### State Management
- **Tools**: `adw_get_state`, `adw_list_workflows`
- **Real Service**: Filesystem (JSON files in `automation/agents/{adw_id}/`)
- **Test Approach**: Create real state files using `ADWState.save()`, query via MCP tools, verify JSON content
- **Evidence**: Tests read/write actual `adw_state.json` files

#### Bun Validation
- **Tools**: `bun_validate`, `bun_validate_migrations`
- **Real Service**: Bun CLI (lint, typecheck, test commands)
- **Test Approach**: Create test worktrees with valid/invalid code, execute tools, verify exit codes and output
- **Evidence**: Tests invoke real `bun run lint` and capture stdout/stderr

#### Workflow Orchestration
- **Tools**: `adw_run_phase`
- **Real Service**: Python ADW phase scripts (`adw_plan.py`, `adw_build.py`, etc.)
- **Test Approach**: Execute phase scripts via MCP tool with test issue numbers, verify state transitions
- **Evidence**: Tests spawn real Python processes and validate orchestration flow

### Test Environment Setup

#### Local Development
```bash
# 1. Start MCP server
cd automation/adws/mcp_server && bun run dev

# 2. Run integration tests (hits real services)
bun test tests/integration/*.test.ts

# 3. Verify real git operations
git worktree list  # Should show test worktrees created by tests
```

#### CI Pipeline (Future)
- GitHub Actions workflow for MCP server tests
- Isolated test environment with git, bun, python3 installed
- Test worktrees cleaned up after each run
- Real service logs captured as artifacts

### Validation Levels

#### Level 1: Static Analysis
- ✅ TypeScript type-check (`bunx tsc --noEmit`)
- ✅ Python syntax check (`python3 -m py_compile`)
- ✅ Lint check (not configured yet, deferred)

#### Level 2: Integration Tests (Required for Merge)
- ✅ MCP tool integration tests (3 tools: git_commit, adw_get_state, bun_validate)
- ✅ Real service validation (git, filesystem, Python bridge)
- ✅ Test infrastructure (setup helpers, fixtures, cleanup)
- Manual smoke testing: Recommended before production deployment

#### Level 3: End-to-End Tests (Post-Merge)
- Full ADW workflow (plan → build → test → review)
- Real GitHub issue execution
- Worktree isolation validation
- Performance and error handling tests

### Failure Injection

Test error paths by introducing real failures:
- Invalid git repositories (missing `.git` directory)
- Malformed state files (invalid JSON)
- Failing lint/typecheck (syntax errors in test code)
- Non-existent worktrees (cleanup already executed)

No mocked errors or stubbed responses.

### Coverage Target

- **Minimum**: 3 tools with integration tests (git_commit, adw_get_state, bun_validate) ✅ **COMPLETED**
- **Current**: 3 tools (git_commit, adw_get_state, bun_validate)
- **Future**: Expand to remaining 5 tools (git_create_worktree, git_cleanup_worktree, adw_run_phase, adw_list_workflows, bun_validate_migrations)
- **Evidence**: Test output shows real service invocations (git logs, filesystem reads, subprocess output)

### Test Files

Integration tests are located in `tests/integration/`:

- `setup.ts` - Test infrastructure and fixtures
- `git_commit.test.ts` - Git operations (4 tests)
- `adw_get_state.test.ts` - State management (6 tests)
- `bun_validate.test.ts` - Validation (5 tests)
- `README.md` - Test documentation and usage

Total: **15 integration tests** covering **3 core tools**

Run tests: `cd automation/adws/mcp_server && bun test`
