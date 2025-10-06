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
  - Containerised deployments use `docker run` to launch an isolated runner per issue (see below).

## Validation Defaults
Automation expects the following commands to succeed unless the plan specifies extras:
- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build`

Ensure plans and implementation steps call out additional scripts (seeders, migrations, smoke tests) when required.

## Credentials
Copy `adws/.env.sample` to `adws/.env` and populate:
- `ANTHROPIC_API_KEY`
- Optional: `CLAUDE_CODE_PATH`, `GITHUB_PAT`, `E2B_API_KEY`

Restrict production/staging secrets to approved environments. Use the `ADW_ENV` environment variable to scope log directories and credential suffixing.

Shared runtime values (e.g. `ADW_ENV`, log paths) remain in the root `.env`; defining them inside `adws/.env` overrides the shared defaults for automation runs.
Set `ADW_ENV_FILE` to a custom path (e.g. `.env.adws`) if you prefer to source secrets from a different dotenv file.

## Containerised Deployment

Two container images orchestrate the automation:

- `docker/adw-webhook.Dockerfile` builds the FastAPI webhook service. It requires Docker socket access to launch sandboxed runs and persists automation logs under `.adw_logs/`.
- `docker/adw-runner.Dockerfile` builds an execution environment containing Python, uv, Bun, Node (Claude CLI), and the GitHub CLI. Each workflow executes inside this container, starting from a clean clone of the repository.

### Build the images

```bash
docker compose build adw_runner adw_webhook
```

The compose file publishes the runner image locally as `kotadb-adw-runner:latest`; the webhook image references it via `ADW_RUNNER_IMAGE`.

### Run the webhook 24/7

```bash
# start the webhook and keep it running
docker compose up -d adw_webhook

# view logs / health
docker compose logs -f adw_webhook
curl http://localhost:3000/health
```

The service mounts `/var/run/docker.sock` and a persisted `adw_logs` volume so issue runs remain sandboxed yet auditable. Cloudflare Tunnel can forward traffic to port `3000` as before.

### Boot-time restart (systemd example)

Create `/etc/systemd/system/adw-webhook.service`:

```
[Unit]
Description=KotaDB ADW Webhook
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/srv/kotadb
ExecStart=/usr/bin/docker compose up -d adw_webhook
ExecStop=/usr/bin/docker compose down adw_webhook
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

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
