# KotaDB AI Developer Workflow (ADW)

The ADW toolchain automates the SDLC loop for GitHub issues by coordinating Claude Code agents, Bun validation, GitHub CLI, and git operations. The implementation mirrors the modular TAC stack while preserving KotaDB-specific validation defaults.

All entrypoints are declared as `uv run` scripts so they execute without bespoke virtualenv setup.

**Note:** The agentic layer operates on the application layer located in `../app/`. All references to source code, tests, and configuration files in the TypeScript application should use paths relative to `../app/` (e.g., `../app/src/index.ts`, `../app/package.json`).

---

## Module Layout

```
adws/
├── adw_modules/          # Shared core (agents, state, git, workflows)
│   ├── agent.py          # Claude CLI execution wrapper
│   ├── data_types.py     # Pydantic models + command enumerations
│   ├── git_ops.py        # git checkout/commit/push + worktree management
│   ├── github.py         # gh CLI accessors, bot annotations
│   ├── orchestrators.py  # Composite phase runner utilities
│   ├── state.py          # Persistent ADW state management
│   ├── ts_commands.py    # Bun validation command catalogue
│   ├── utils.py          # Env loading, logging, JSON helpers
│   └── workflow_ops.py   # Agent wrappers for plan/build/test/review/etc.
├── adw_phases/           # Single-phase execution scripts
│   ├── adw_plan.py       # Plan phase (classify → branch → plan → PR)
│   ├── adw_build.py      # Build phase (implement plan + push)
│   ├── adw_test.py       # Validation phase (Bun lint/typecheck/test/build)
│   ├── adw_review.py     # Review phase (Claude review + reporting)
│   ├── adw_document.py   # Documentation phase (docs-update + commits)
│   └── adw_patch.py      # Patch phase (comment-driven quick fixes)
├── adw_sdlc.py           # Full SDLC orchestrator (plan → build → test → review → docs)
├── adw_tests/            # Pytest suite covering utilities and workflows
├── adw_triggers/         # Automation trigger systems
│   └── adw_trigger_cron_homeserver.py  # Home server task poller
├── trigger_cron.py       # Poll-based trigger that launches a workflow
├── trigger_webhook.py    # FastAPI webhook trigger (comment driven)
└── health_check.py       # Environment readiness probe
```

---

## Phase Scripts

Each single-phase script (located in `adw_phases/`) expects `ISSUE_NUMBER [ADW_ID]` and persists progress to `agents/<adw_id>/adw_state.json`:

- `adw_phases/adw_plan.py` — classify the issue, generate a branch + plan file, commit the plan, and open/update the PR.
- `adw_phases/adw_build.py` — resume from state, implement the plan, commit code, and push.
- `adw_phases/adw_test.py` — run Bun lint/typecheck/test/build (auto-includes `bun install` if lockfiles changed) and record results.
- `adw_phases/adw_review.py` — run the reviewer agent against the spec, summarise findings, and block on unresolved blockers.
- `adw_phases/adw_document.py` — produce documentation updates via `/document` (or `/docs-update` fallback) and commit/push changes.
- `adw_phases/adw_patch.py` — apply targeted fixes when an issue/comment contains the `adw_patch` keyword.

The SDLC orchestrator (`adw_sdlc.py`) chains single-phase scripts using `adw_modules.orchestrators.run_sequence`.

---

## Tests

The beginnings of an automated regression suite lives under `adws/adw_tests/`:

- `test_utils.py` — verifies JSON parsing helpers for agent output.
- `test_state.py` — exercises persistent state creation and rehydration.
- `test_workflow_ops.py` — covers validation summarisation, lockfile detection, and issue comment formatting.

Run locally with:

```bash
uv run pytest adws/adw_tests
```

The tests avoid live API calls by using temporary directories and subprocess stubs.

---

## Logs & State

Run metadata is rooted at `logs/kota-db-ts/<env>/<adw_id>/`:

- `<phase>/execution.log` — structured logger output per phase.
- `<agent>/raw_output.jsonl` — Claude streaming output.
- `<agent>/prompts/` — rendered prompt templates for auditability.

Persistent automation state lands in `agents/<adw_id>/adw_state.json` (branch, plan path, classification, etc.). Override the base directories with `ADW_LOG_ROOT` if necessary.

---

## Toolchain & Credentials

| Requirement      | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| Bun/TypeScript   | Application layer: `cd ../app && bun run lint`, `bun test`, etc.     |
| GitHub CLI       | `gh auth login` or `GITHUB_PAT`                                       |
| Claude Code CLI  | `CLAUDE_CODE_PATH` (defaults to `claude`)                             |
| Environment vars | `ANTHROPIC_API_KEY`, optional `E2B_API_KEY`, `ADW_ENV`, log overrides |

Dotenv loading order: repository `.env` ➜ `ADW_ENV_FILE` (if set) ➜ `adws/.env*`.

---

## Usage Examples

```bash
# Health check prerequisites
uv run adws/health_check.py --json

# Full SDLC workflow for issue #123
uv run adws/adw_sdlc.py 123

# Run individual phases
uv run adws/adw_phases/adw_plan.py 123
uv run adws/adw_phases/adw_build.py 123
uv run adws/adw_phases/adw_test.py 123

# Restart a phase with a known ADW id
uv run adws/adw_phases/adw_build.py 123 deadbeef

# Patch mode (requires `adw_patch` keyword in issue/comment)
uv run adws/adw_phases/adw_patch.py 123 deadbeef
```

---

## Automation Triggers

- **Cron poller** (`uv run adws/trigger_cron.py`)
  Polls open issues every 20 seconds. A workflow launches when the latest comment (excluding ADW bot posts) is exactly `adw`. The cron trigger runs the full SDLC workflow by default.

- **Webhook server** (`PORT=8001 uv run adws/trigger_webhook.py`)
  FastAPI endpoint that reacts to issue comment commands. Examples:
  - `/adw plan` → `adw_phases/adw_plan.py`
  - `/adw build` → `adw_phases/adw_build.py`
  - `/adw review` → `adw_phases/adw_review.py`
  - `/adw sdlc` → `adw_sdlc.py`
  The webhook injects `ADW_WORKFLOW` into the runner container so the appropriate script executes.

- **Home Server Integration** (`uv run adws/adw_triggers/adw_trigger_cron_homeserver.py`)
  Polls a custom home server endpoint (via Tailscale) for pending tasks. Each task runs in an isolated git worktree with automatic status synchronization. See [Home Server Integration](#home-server-integration) section below for details.

All triggers write logs beneath `logs/kota-db-ts/…` so bot activity is observable.

---

## Validation Defaults

Unless overridden by the plan or environment, the build/test phases enforce (from `../app/` directory):

1. `cd ../app && bun run lint`
2. `cd ../app && bun run typecheck`
3. `cd ../app && bun test`
4. `cd ../app && bun run build`

The test phase automatically injects `bun install` when a recognised lockfile is dirty. Extend `ts_commands.py` if project-specific commands are needed.

---

## Containerised Deployment (Optional)

Two Docker images power remote execution:

| Image                              | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| `automation/docker/adw-webhook`    | Exposes the FastAPI webhook + cron helper       |
| `automation/docker/adw-runner`     | Ephemeral runtime with Bun, Claude CLI, and gh  |

```bash
# Build images (from repository root)
docker compose build adw_runner adw_webhook

# Run webhook + triggers
docker compose up -d adw_webhook
```

The webhook expects Docker socket access to spawn runner containers and persists logs via the mounted `.adw_logs` volume. Integrate with systemd or your orchestrator of choice for restarts.

---

Enable and start:

```bash
sudo systemctl enable --now adw-webhook.service
```

### Environment variables

- `ADW_RUNNER_IMAGE` – Docker image tag for the per-run container (defaults to `kotadb-adw-runner:latest`).
- `ADW_GIT_REF` – Git branch checked out before each run (default `main`).
- `ADW_REPO_URL` – Optional explicit Git URL override (falls back to the image's embedded remote).
- `ADW_RUNNER_AUTO_PULL` – Set to `false` to skip `docker pull` checks before each run.
- `ADW_LOG_VOLUME` – Optional Docker volume name shared with runner containers (defaults to `kotadb_adw_logs`).

Secrets such as `ANTHROPIC_API_KEY` and `GITHUB_PAT` must still be available in the webhook container environment (e.g. via `.env` + `adws/.env`, Docker secrets, or a secrets manager). The runner receives them per invocation through `docker run -e`.

---

## Home Server Integration

KotaDB ADWs can be triggered from a custom home server endpoint via Tailscale, enabling flexible task orchestration independent of GitHub issues.

### Setup

1. Configure home server URL (in `.env` or environment):
   ```bash
   export HOMESERVER_URL="https://jaymins-mac-pro.tail1b7f44.ts.net"
   export HOMESERVER_TASKS_ENDPOINT="/api/tasks/kotadb"
   ```

2. Start the cron trigger:
   ```bash
   # Continuous polling (default: 15 second interval)
   uv run adws/adw_triggers/adw_trigger_cron_homeserver.py

   # Run once and exit
   uv run adws/adw_triggers/adw_trigger_cron_homeserver.py --once

   # Custom configuration
   uv run adws/adw_triggers/adw_trigger_cron_homeserver.py \
     --polling-interval 30 \
     --max-concurrent 5 \
     --dry-run
   ```

### Task Structure

Tasks from the home server must include:
- `task_id`: Unique identifier
- `title`: Short description
- `description`: Detailed task description
- `status`: Current status (pending/claimed/in_progress/completed/failed)
- `tags`: Optional metadata (model, workflow, worktree)

Example task payload:
```json
{
  "task_id": "task-001",
  "title": "Add rate limiting",
  "description": "Implement tier-based rate limiting for API endpoints",
  "status": "pending",
  "tags": {
    "model": "sonnet",
    "workflow": "complex",
    "worktree": "feat-rate-limiting"
  },
  "created_at": "2025-10-11T14:30:00Z"
}
```

### Workflow Routing

The system automatically routes tasks to appropriate workflows:

- **Simple workflow** (`/build`): For straightforward tasks
  - Typo fixes, logging additions
  - Minor refactors
  - Documentation updates
  - Specify with `tags.workflow: "simple"` or omit (default)

- **Complex workflow** (`/plan` → `/implement`): For architectural changes
  - New features requiring multiple file changes
  - Database schema changes
  - Complex refactors
  - Specify with `tags.workflow: "complex"`

### Worktree Management

All ADW workflows (GitHub issue and home server) execute in isolated git worktrees to prevent conflicts during concurrent execution and local development.

**Centralized Management** (`adw_modules/git_ops.py`):
- `create_worktree()` - Creates isolated worktrees from base branch
- `cleanup_worktree()` - Removes worktrees and optionally deletes branches
- `list_worktrees()` - Lists all active worktrees
- `worktree_exists()` - Checks worktree existence before operations

**Naming Convention**:
- GitHub workflows: `{issue_class}-{issue_number}-{adw_id[:8]}`
- Home server workflows: Auto-generated from task title or explicit via `--worktree-name`
- ADW ID component ensures uniqueness for concurrent executions

**Lifecycle**:
- Created: Before agent execution (plan phase for GitHub, trigger for home server)
- Used: All subsequent phase scripts load worktree path from state
- Cleaned up: Automatically after successful PR creation (configurable)

**Configuration**:
- `ADW_CLEANUP_WORKTREES=true` - Automatic cleanup after PR (default: true)
- `ADW_CLEANUP_ON_FAILURE=false` - Cleanup on workflow failure (default: false, useful for debugging)
- `ADW_WORKTREE_BASE_PATH=trees` - Base directory for worktrees (default: trees)
- `--skip-cleanup` CLI flag - Preserve worktree for manual inspection

Example worktree structure:
```
kota-db-ts/
├── .git/                  # Shared git repository
├── trees/
│   ├── feat-65-b83b443a/
│   │   └── kota-db-ts/    # GitHub issue #65 worktree
│   ├── feat-rate-limiting/
│   │   └── kota-db-ts/    # Home server task worktree
│   └── bug-auth-fix/
│       └── kota-db-ts/    # Another isolated working directory
└── agents/
    ├── b83b443a/          # ADW execution artifacts for issue #65
    └── abc123/            # ADW execution artifacts for home server task
```

### Model Selection

Control which Claude model executes tasks:
- **Sonnet** (default): Fast, cost-effective for most tasks
- **Opus**: More capable for complex architectural decisions

Specify in task tags:
```json
{
  "tags": {
    "model": "opus"
  }
}
```

Or via CLI when starting workflows directly:
```bash
uv run adws/adw_build_update_homeserver_task.py \
  --adw-id abc123 \
  --worktree-name feat-rate-limit \
  --task "Add rate limiting" \
  --task-id task-001 \
  --model opus
```

### Status Synchronization

The trigger automatically updates task status on the home server:
1. **claimed**: Task picked up by trigger
2. **in_progress**: Workflow started
3. **completed**: Implementation finished successfully (includes commit hash)
4. **failed**: Error occurred (includes error message)

Status updates include:
- `adw_id`: Execution identifier for tracking
- `worktree`: Worktree name used
- `commit_hash`: Git commit hash if successful
- `error`: Error message if failed
- `timestamp`: ISO timestamp of update

### Slash Commands

The home server integration adds several new slash commands (see `.claude/commands/`):

- `/get_homeserver_tasks`: Fetch eligible tasks from home server
- `/update_homeserver_task`: Update task status
- `/make_worktree_name`: Generate valid worktree names from task descriptions
- `/init_worktree`: Create isolated git worktrees
- `/build`: Direct implementation workflow
- `/plan`: Create implementation plans for complex tasks

### Template Development Guidelines

Slash command templates in `.claude/commands/` define contracts between AI agents and Python automation code. Misalignment between template output and Python parsing logic causes workflow failures.

**Key Principles**:
- Templates are **executable specifications** - treat them like API contracts
- Changes to template output format can break automation workflows
- Python functions expect specific output formats (strings, paths, JSON, etc.)
- Use relative paths consistently to maintain worktree isolation

**Template Categories**:
1. **Message-Only**: Return single string values (`/commit`, `/generate_branch_name`, `/classify_issue`)
2. **Path Resolution**: Return file paths (`/find_plan_file`, `/patch`)
3. **Action**: Perform file modifications (`/implement`, `/chore`, `/bug`, `/feature`, `/pull_request`)
4. **Structured Data**: Return JSON (`/review`, `/document`)

**Common Pitfalls** (lessons from #84):
- Executing actions when Python expects only message output (e.g., `/commit` running git commands)
- Including explanatory text with output (e.g., "The branch name is: feat/xyz")
- Using absolute paths instead of relative paths (breaks worktree isolation)
- Returning incomplete JSON structures (missing required fields)
- Premature cleanup in multi-phase workflows (removing worktrees before subsequent phases)

**Testing Checklist**:
- [ ] Test template output with consuming Python function
- [ ] Verify output format matches category expectations
- [ ] Use relative paths consistently (never absolute)
- [ ] For JSON templates, ensure all required fields are present
- [ ] Run full workflow integration test with real issue

**Complete Reference**: See `.claude/commands/docs/prompt-code-alignment.md` for:
- Detailed template-to-function mappings
- Output format requirements by category
- Common misalignment patterns with fixes
- Manual and automated testing methodologies
- Case studies from recent fixes (#84, #87)

**Recent Template Fixes**:
- `/commit` template (#84): Fixed to return message string instead of executing git commands
- `/find_plan_file` template (#84): Enhanced parsing to handle git status prefixes and multiple code blocks
- Planning templates (#84): Removed premature worktree cleanup instructions

### Architecture

**Trigger Flow**:
```
Home Server → Trigger (poll) → Claim Task → Create Worktree → Spawn Workflow → Update Status
```

**Simple Workflow**:
```
Task → /build → Commit → Update Home Server (completed)
```

**Complex Workflow**:
```
Task → /plan → /implement → Commit → Update Home Server (completed)
```

**Files**:
- `adws/adw_triggers/adw_trigger_cron_homeserver.py`: Main trigger script
- `adws/adw_build_update_homeserver_task.py`: Simple workflow handler
- `adws/adw_plan_implement_update_homeserver_task.py`: Complex workflow handler
- `adws/adw_modules/data_types.py`: Type definitions (HomeServerTask, etc.)
- `../.claude/commands/`: Slash command templates (at repository root)

### Monitoring

The trigger displays a live status panel showing:
- Current status (running/shutting down)
- Polling interval
- Home server URL
- Statistics (checks performed, tasks started, worktrees created, errors)
- Last check timestamp

Example output:
```
┌─────────────────── 🔄 Home Server Multi-Agent Cron ───────────────────┐
│  Status             Running                                            │
│  Polling Interval   15 seconds                                        │
│  Home Server        jaymins-mac-pro.tail1b7f44.ts.net                 │
│  Checks Performed   42                                                │
│  Tasks Started      12                                                │
│  Worktrees Created  8                                                 │
│  Errors             0                                                 │
│  Last Check         14:32:15                                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### File Path and Git Staging Issues

**Issue**: "No changes to commit" errors despite agents creating files
**Symptoms**: Commit fails with "No changes to commit in worktree" even though files were created
**Root Cause**: Agent used absolute paths instead of relative paths, causing git staging mismatches
**Solution**:
1. All agent prompts now include path handling instructions (chore.md, feature.md, bug.md)
2. Agents must use relative paths (e.g., `docs/specs/plan.md`) not absolute paths
3. Pre-commit validation now checks if files are tracked before attempting commit
4. Enhanced logging shows git status and file paths for debugging

**Diagnostic Commands**:
```bash
# Check git status in worktree
cd trees/<worktree-name>
git status --porcelain

# Verify file is tracked
git ls-files --error-unmatch docs/specs/plan.md

# Run validation tool
python3 automation/adws/scripts/validate-worktree-setup.py <worktree-name>
```

**Issue**: Git staging failures for plan files
**Symptoms**: Files exist on disk but git reports "No changes to commit"
**Solution**:
1. Verify agent used relative paths in Write/Edit tool calls
2. Check execution logs for absolute path warnings
3. Manually stage files if needed: `git add docs/specs/plan.md`
4. Phase scripts now explicitly stage plan files before commit

### Worktree Management Issues

**Issue**: Worktrees not being cleaned up after PR creation
**Symptoms**: `trees/` directory accumulates subdirectories like `trees/feat-65-b83b443a/`
**Solution**:
1. Check `ADW_CLEANUP_WORKTREES` setting in `adws/.env` (default: `true`)
2. Verify the PR creation was successful (cleanup only runs after successful PR)
3. Check for `--skip-cleanup` flag in workflow invocation
4. Review cleanup logs in `logs/kota-db-ts/<env>/<adw_id>/`

**Issue**: Want to preserve worktree for debugging
**Solutions**:
- **Temporary (GitHub workflows)**: Run plan phase with `--skip-cleanup` flag
  ```bash
  uv run adws/adw_phases/adw_plan.py 123 --skip-cleanup
  ```
- **Temporary (Home server workflows)**: Run workflow with `--skip-cleanup` flag
  ```bash
  uv run adws/adw_build_update_homeserver_task.py \
    --adw-id abc123 \
    --worktree-name feat-debug \
    --task "Fix bug" \
    --task-id task-001 \
    --skip-cleanup
  ```
- **Persistent**: Set environment variable in `adws/.env`
  ```bash
  ADW_CLEANUP_WORKTREES=false
  ```
- **Debugging failures**: Enable cleanup on failure
  ```bash
  ADW_CLEANUP_ON_FAILURE=true  # Default: false (preserves worktree for inspection)
  ```

**Issue**: Stale worktrees preventing new task execution
**Symptoms**: `fatal: 'trees/feat-xyz' already exists` or `fatal: 'feat-xyz' is already checked out`
**Solution**: Manually clean up stale worktrees using centralized function or git commands
```bash
# Option 1: Use centralized cleanup function (recommended)
# From Python script or interactive shell:
from adw_modules.git_ops import cleanup_worktree
cleanup_worktree(worktree_name="feat-xyz", base_path="trees", delete_branch=True)

# Option 2: Manual git commands
# List all worktrees
git worktree list

# Remove specific worktree (force flag handles uncommitted changes)
git worktree remove trees/feat-xyz --force

# Remove corresponding branch (if no longer needed)
git branch -D feat-xyz

# Prune stale worktree metadata
git worktree prune
```

**Issue**: Concurrent workflows conflict on git operations
**Symptoms**: `fatal: Unable to create '.git/index.lock': File exists` or merge conflicts
**Solution**:
1. Verify each workflow uses unique worktree name (ADW ID ensures uniqueness)
2. Check worktree names with `git worktree list`
3. Ensure no manual git operations in worktree directories during agent execution
4. Review state files to confirm worktree isolation: `cat agents/<adw_id>/adw_state.json`

**Issue**: Claude Code agents switch root repository branch during worktree execution
**Symptoms**: Root repository switches to worktree branch names (e.g., `chore/81-abc123`), local development branch is lost
**Root Cause**: Git operations performed by agents weren't scoped to worktree despite `cwd` being set
**Solution**: Fixed in #81 via `GIT_DIR` and `GIT_WORK_TREE` environment variables
- `get_claude_env()` now accepts optional `cwd` parameter
- When `cwd` is provided, sets `GIT_DIR={cwd}/.git` and `GIT_WORK_TREE={cwd}`
- Forces all git operations to stay within worktree boundaries
- Preserves root repository branch stability during concurrent workflows
**Verification**:
```bash
# Before executing workflow
ROOT_BRANCH=$(git branch --show-current)
echo "Root branch: $ROOT_BRANCH"

# Execute workflow in worktree
uv run adws/adw_phases/adw_plan.py 81

# After execution - should be unchanged
[ "$(git branch --show-current)" == "$ROOT_BRANCH" ] && echo "✅ Isolation preserved" || echo "❌ Branch changed"
```

### Home Server Integration Issues

**Issue**: Tasks not being picked up from home server
**Symptoms**: Trigger polls but never claims tasks
**Diagnostics**:
1. Verify home server is accessible:
   ```bash
   curl -s $HOMESERVER_URL$HOMESERVER_TASKS_ENDPOINT | jq
   ```
2. Check task status filter (only `pending` tasks are claimed)
3. Review trigger logs for connection errors

**Issue**: Task status not updating on home server
**Symptoms**: Tasks stuck in `claimed` or `in_progress` state
**Diagnostics**:
1. Check network connectivity to home server (Tailscale)
2. Verify home server API endpoint accepts PUT requests
3. Review `adw_id` logs for HTTP error responses

### CI/CD Issues

**Issue**: GitHub Actions failing with "Failed to extract API keys"
**Symptoms**: CI fails at "Setup Supabase Local" step
**Root Cause**: Supabase CLI output format changed between versions
**Solution**: The `.github/scripts/setup-supabase-ci.sh` script has been updated to handle both old and new formats with fallback logic. If you still encounter issues:
1. Check Supabase CLI version: `supabase --version`
2. Verify JSON output: `supabase status --output json | jq`
3. Update script if new field names are introduced

### Validation Failures

**Issue**: Tests passing locally but failing in CI
**Common Causes**:
1. **Port mismatch**: Local tests use port `54326`, CI may differ
2. **Environment variables**: Check `.env.test` is generated correctly
3. **Database state**: CI runs against fresh database, local may have stale data

**Solution**:
```bash
# Reset local test database to match CI state
bun run test:reset
bun test

# Regenerate .env.test from Supabase status
bun run test:env
```

**Issue**: Rate limit tests failing intermittently
**Symptoms**: Cache timing tests show flaky behavior
**Cause**: Time-dependent assertions in tests
**Workaround**: These are known flaky tests, rerun if failed (tracked in test comments)

### Workflow Execution Issues

**Issue**: Workflow exits with "No changes needed"
**Symptoms**: Build phase completes without creating commit
**Expected Behavior**: This is intentional when implementation is already complete or unnecessary
**When to Investigate**: If you expected changes but none were made, review:
1. Agent logs in `logs/kota-db-ts/<env>/<adw_id>/`
2. Plan file requirements vs actual implementation
3. Working tree status via `git status`

**Issue**: Multiple concurrent workflows conflicting
**Symptoms**: Git errors about locked refs or merge conflicts
**Solution**: Worktree isolation prevents conflicts. Check:
1. Each workflow uses unique worktree name
2. Worktrees are created from correct base branch (`develop`)
3. No manual git operations in worktree directories
