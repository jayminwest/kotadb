# KotaDB AI Developer Workflow (ADW)

The ADW toolchain automates the SDLC loop for GitHub issues by coordinating Claude Code agents, Bun validation, GitHub CLI, and git operations. The implementation mirrors the modular TAC stack while preserving KotaDB-specific validation defaults.

All entrypoints are declared as `uv run` scripts so they execute without bespoke virtualenv setup.

---

## Module Layout

```
adws/
├── adw_modules/          # Shared core (agents, state, git, workflows)
│   ├── agent.py          # Claude CLI execution wrapper
│   ├── data_types.py     # Pydantic models + command enumerations
│   ├── git_ops.py        # git checkout/commit/push helpers
│   ├── github.py         # gh CLI accessors, bot annotations
│   ├── orchestrators.py  # Composite phase runner utilities
│   ├── state.py          # Persistent ADW state management
│   ├── ts_commands.py    # Bun validation command catalogue
│   ├── utils.py          # Env loading, logging, JSON helpers
│   └── workflow_ops.py   # Agent wrappers for plan/build/test/review/etc.
├── adw_plan.py           # Plan phase (classify → branch → plan → PR)
├── adw_build.py          # Build phase (implement plan + push)
├── adw_test.py           # Validation phase (Bun lint/typecheck/test/build)
├── adw_review.py         # Review phase (Claude review + reporting)
├── adw_document.py       # Documentation phase (docs-update + commits)
├── adw_patch.py          # Patch phase (comment-driven quick fixes)
├── adw_plan_build*.py    # Composite orchestrators chaining phases
├── adw_sdlc.py           # Full SDLC (plan → build → test → review → docs)
├── adw_tests/            # Pytest suite covering utilities and workflows
├── trigger_cron.py       # Poll-based trigger that launches a workflow
├── trigger_webhook.py    # FastAPI webhook trigger (comment driven)
└── health_check.py       # Environment readiness probe
```

---

## Phase Scripts

Each single-phase script expects `ISSUE_NUMBER [ADW_ID]` and persists progress to `agents/<adw_id>/adw_state.json`:

- `adw_plan.py` — classify the issue, generate a branch + plan file, commit the plan, and open/update the PR.
- `adw_build.py` — resume from state, implement the plan, commit code, and push.
- `adw_test.py` — run Bun lint/typecheck/test/build (auto-includes `bun install` if lockfiles changed) and record results.
- `adw_review.py` — run the reviewer agent against the spec, summarise findings, and block on unresolved blockers.
- `adw_document.py` — produce documentation updates via `/document` (or `/docs-update` fallback) and commit/push changes.
- `adw_patch.py` — apply targeted fixes when an issue/comment contains the `adw_patch` keyword.

Composite runners (e.g. `adw_plan_build_test.py`, `adw_sdlc.py`) simply chain single-phase scripts using `adw_modules.orchestrators.run_sequence`.

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
| Bun/TypeScript   | `bun run lint`, `bun run typecheck`, `bun test`, `bun run build`      |
| GitHub CLI       | `gh auth login` or `GITHUB_PAT`                                       |
| Claude Code CLI  | `CLAUDE_CODE_PATH` (defaults to `claude`)                             |
| Environment vars | `ANTHROPIC_API_KEY`, optional `E2B_API_KEY`, `ADW_ENV`, log overrides |

Dotenv loading order: repository `.env` ➜ `ADW_ENV_FILE` (if set) ➜ `adws/.env*`.

---

## Usage Examples

```bash
# Health check prerequisites
uv run adws/health_check.py --json

# Plan + build + test pipeline for issue #123
uv run adws/adw_plan_build_test.py 123

# Restart a run with a known ADW id
uv run adws/adw_build.py 123 deadbeef

# Patch mode (requires `adw_patch` keyword in issue/comment)
uv run adws/adw_patch.py 123 deadbeef
```

---

## Automation Triggers

- **Cron poller** (`uv run adws/trigger_cron.py`)
  Polls open issues every 20 seconds. A workflow launches when the latest comment (excluding ADW bot posts) is exactly `adw`. The cron trigger runs `adw_plan_build_test.py` by default.

- **Webhook server** (`PORT=8001 uv run adws/trigger_webhook.py`)
  FastAPI endpoint that reacts to issue comment commands. Examples:
  - `/adw plan-build-test` → `adw_plan_build_test.py`
  - `/adw review` → `adw_review.py`
  - `/adw sdlc` → `adw_sdlc.py`
  The webhook injects `ADW_WORKFLOW` into the runner container so the appropriate script executes.

- **Home Server Integration** (`uv run adws/adw_triggers/adw_trigger_cron_homeserver.py`)
  Polls a custom home server endpoint (via Tailscale) for pending tasks. Each task runs in an isolated git worktree with automatic status synchronization. See [Home Server Integration](#home-server-integration) section below for details.

Both surfaces write logs beneath `logs/kota-db-ts/…` so bot activity is observable.

---

## Validation Defaults

Unless overridden by the plan or environment, the build/test phases enforce:

1. `bun run lint`  
2. `bun run typecheck`  
3. `bun test`  
4. `bun run build`

The test phase automatically injects `bun install` when a recognised lockfile is dirty. Extend `ts_commands.py` if project-specific commands are needed.

---

## Containerised Deployment (Optional)

Two Docker images power remote execution:

| Image                     | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `docker/adw-webhook`      | Exposes the FastAPI webhook + cron helper       |
| `docker/adw-runner`       | Ephemeral runtime with Bun, Claude CLI, and gh  |

```bash
# Build images
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

Each task runs in an isolated git worktree at `trees/{worktree_name}/`:
- Worktree names are auto-generated from task titles if not provided
- Multiple tasks can run concurrently in separate worktrees
- Worktrees are created automatically from the `develop` branch
- Each worktree has its own working directory, preventing conflicts

Example worktree structure:
```
kota-db-ts/
├── .git/                  # Shared git repository
├── trees/
│   ├── feat-rate-limiting/
│   │   └── kota-db-ts/    # Isolated working directory
│   └── bug-auth-fix/
│       └── kota-db-ts/    # Another isolated working directory
└── agents/
    ├── abc123/            # ADW execution artifacts
    └── def456/
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
- `.claude/commands/`: Slash command templates

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
