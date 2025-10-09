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
