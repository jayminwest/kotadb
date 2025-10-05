# KotaDB AI Developer Workflow (ADW)

This package orchestrates planning, implementation, and validation for KotaDB issues using Claude Code and the GitHub CLI. It mirrors the TAC automation stack while tailoring validation to our Bun/TypeScript toolchain.

## Components
- `adw_plan_build.py` – end-to-end workflow runner (classification → plan → implement → PR).
- `agent.py` – thin wrapper around Claude Code CLI for prompts/templates with run-scoped logging.
- `github.py` – GitHub CLI helpers for fetching issues, commenting, polling, and branch hygiene.
- `trigger_cron.py` – 20-second poller that auto-runs the workflow for new issues or `adw` comment pings.
- `trigger_webhook.py` – FastAPI server that responds to GitHub webhooks and launches workflows asynchronously.
- `health_check.py` – composite readiness probe (environment variables, git, Bun toolchain, GitHub CLI, Claude CLI).
- `ts_helpers.py` – Bun/TypeScript command catalogue for validation steps.
- `utils.py` – shared helpers for log directories, run IDs, environment scoping, and logging.

All scripts are declared as `uv run` entry points so they can execute without virtualenv setup.

## System Diagram
```
┌────────────────┐      ┌────────────────────┐      ┌──────────────────┐
│  GitHub Issue  │──┐   │ adw_plan_build.py │──┐   │ Claude Code CLI │
└────────────────┘  │   └────────────────────┘  │   └──────────────────┘
                    │                           │
                    ▼                           ▼
             ┌────────────┐             ┌────────────────┐
             │ github.py  │◄──────────►│ agent.py        │
             └────────────┘             └────────────────┘
                    │                           │
                    ▼                           ▼
             ┌────────────┐             ┌────────────────┐
             │ GitHub CLI │             │ Claude Outputs │
             └────────────┘             └────────────────┘
                    │                           │
                    ▼                           ▼
             ┌────────────┐             ┌────────────────┐
             │ git branch │             │ logs/<ADW_ID>/ │
             └────────────┘             └────────────────┘
```

## Data Flows
1. **Trigger** – Operator invokes `uv run adw/adw_plan_build.py <issue>` or an automated trigger fires. `health_check.py` may run beforehand to verify prerequisites.
2. **Issue fetch** – `adw_plan_build.py` resolves the repo via `github.py`, pulls the issue JSON using `gh issue view`, and saves metadata to the run log.
3. **Classification** – The runner calls `agent.py` with `/classify_issue`, streaming prompts and JSONL output into `logs/kota-db-ts/<env>/<adw_id>/issue_classifier/`.
4. **Planning** – Planner prompts (`/feature`, `/bug`, `/chore`) generate a spec under `specs/`. `adw_plan_build.py` persists prompts, captures resulting plan text, and records the plan path.
5. **Branch & commits** – `/generate_branch_name` creates and checks out the working branch. `/commit` stages and commits changes after planning and implementation stages.
6. **Implementation** – `/implement` consumes the plan file, applies code changes, runs validation commands (Bun lint/typecheck/test/build), and logs command output paths.
7. **Pull request** – `/pull_request` pushes the branch, builds the PR body, and captures the PR URL for issue comments.
8. **Issue updates** – `adw_plan_build.py` posts status comments and final success messages via `github.py`.

## Architecture Notes
- **Control Plane**: `adw_plan_build.py` orchestrates sequential stages, relying on typed contracts from `data_types.py` and utilities from `utils.py` for logging and IDs.
- **Execution Plane**: `agent.py` isolates Claude Code CLI invocation, saving prompts and JSONL responses for transparency and future replay.
- **Integration Layer**: `github.py` is the sole gateway to GitHub, keeping CLI invocations centralised and observable.
- **Validation Layer**: Bun commands (lint, typecheck, test, build) form the default quality gates; additional steps can be injected via plan files or environment profiles under `adws/environments/`.
- **Observability**: All prompts, raw outputs, and execution logs are written beneath `logs/kota-db-ts/<env>/<adw_id>/`, enabling audit trails for every automation run.

## Required Toolchain
- Bun + TypeScript (`bun run lint`, `bun run typecheck`, `bun test`, `bun run build`).
- GitHub CLI (`gh`) authenticated with `gh auth login` or `GITHUB_PAT`.
- Claude Code CLI reachable via `CLAUDE_CODE_PATH` (defaults to `claude`).

## Logs & Run Artifacts
Run metadata is rooted at `logs/kota-db-ts/<env>/<adw_id>/`:
- `adw_plan_build/` – execution logs per workflow.
- `<agent>/raw_output.jsonl` – Claude streaming output per agent.
- `<agent>/prompts/` – saved prompts for auditability.

Override the base directory with `ADW_LOG_ROOT` if needed.

## Usage
```bash
# Health check all prerequisites
uv run adws/health_check.py --json

# Post health check summary to issue #42
uv run adws/health_check.py --issue 42

# Process a single issue (creates plan, commits, PR)
uv run adws/adw_plan_build.py 1234

# Resume/debug an existing run id
uv run adws/adw_plan_build.py 1234 deadbeef
```

## Automation Triggers
- **Cron poller** – `uv run adws/trigger_cron.py`
  - Polls open issues every 20 seconds.
  - Runs the workflow when an issue has no comments or the latest comment is exactly `adw`.
- **Webhook server** – `PORT=8001 uv run adws/trigger_webhook.py`
  - Exposes `POST /gh-webhook` for GitHub Issues & Issue Comment events and `GET /health` for liveness checks.
  - Launches `adw_plan_build.py` in the background with a generated ADW ID and reports log locations under `logs/kota-db-ts/<env>/<run_id>/`.

## Validation Defaults
Automation expects the following commands to succeed unless the plan specifies extras:
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`

Ensure plans and implementation steps call out additional scripts (seeders, migrations, smoke tests) when required.

## Credentials
Copy `.env.sample` to `.env` and populate:
- `ANTHROPIC_API_KEY`
- Optional: `CLAUDE_CODE_PATH`, `GITHUB_PAT`, `E2B_API_KEY`

Restrict production/staging secrets to approved environments. Use the `ADW_ENV` environment variable to scope log directories and credential suffixing.
