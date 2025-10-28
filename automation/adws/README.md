# KotaDB AI Developer Workflow (ADW)

![Automation CI](https://github.com/jayminwest/kota-db-ts/workflows/Automation%20CI/badge.svg)

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
├── adw_agents/           # Atomic agent catalog (chore #216, "one agent, one task, one prompt")
│   ├── agent_classify_issue.py      # Issue classification (feat/bug/chore)
│   ├── agent_generate_branch.py     # Conventional branch name generation
│   ├── agent_create_plan.py         # Plan creation via slash commands
│   ├── agent_commit_plan.py         # Plan commit message generation
│   ├── agent_implement_plan.py      # Implementation via /workflows:implement
│   ├── agent_commit_implementation.py  # Implementation commit messages
│   ├── agent_create_pr.py           # Pull request creation
│   ├── agent_review_code.py         # Code review execution
│   ├── agent_push_branch.py         # Git push with retry logic
│   ├── agent_cleanup_worktree.py    # Worktree cleanup
│   ├── orchestrator.py              # DAG-based workflow coordinator (Phase 2+)
│   └── README.md                    # Agent catalog documentation
├── adw_agents_tests/     # Unit tests for atomic agents
│   ├── test_agent_classify_issue.py
│   ├── test_agent_generate_branch.py
│   ├── test_agent_create_plan.py
│   └── test_agent_orchestrator.py
├── adw_phases/           # Single-phase execution scripts (3-phase architecture as of #136)
│   ├── adw_plan.py       # Plan phase (classify → branch → plan)
│   ├── adw_build.py      # Build phase (implement plan → commit → push → PR)
│   └── adw_review.py     # Review phase (Claude review + reporting)
├── adw_sdlc.py           # Full SDLC orchestrator (plan → build → review)
├── adw_tests/            # Pytest suite covering utilities and workflows
├── adw_triggers/         # Automation trigger systems
│   └── adw_trigger_cron_homeserver.py  # Home server task poller
├── trigger_cron.py       # Poll-based trigger that launches a workflow
├── trigger_webhook.py    # FastAPI webhook trigger (comment driven)
└── health_check.py       # Environment readiness probe
```

---

## Phase Scripts

**3-Phase Architecture** (simplified in PR #136):

Each single-phase script (located in `adw_phases/`) expects `ISSUE_NUMBER [ADW_ID]` and persists progress to `agents/<adw_id>/adw_state.json`:

- `adw_phases/adw_plan.py` — classify the issue, generate a branch + plan file, and commit the plan (PR creation deferred to build phase).
- `adw_phases/adw_build.py` — resume from state, implement the plan, commit code, push, and create/update the PR.
- `adw_phases/adw_review.py` — run the reviewer agent against the spec, summarize findings, and block on unresolved blockers.

**Removed Phases** (as of #136):
- `adw_test.py` — Validation phase (removed: 367 lines)
- `adw_document.py` — Documentation phase (removed: 232 lines)
- `adw_patch.py` — Patch workflow (removed: 244 lines)

**Rationale**: The 5-phase architecture achieved 0% success rate across 57 runs due to over-engineering. The simplified 3-phase flow (plan → build → review) targets >80% completion rate by focusing on core functionality and deferring PR creation until implementation is complete.

The SDLC orchestrator (`adw_sdlc.py`) chains single-phase scripts using `adw_modules.orchestrators.run_sequence`.

---

## Atomic Agent Catalog

**Chore #216: Migrate ADW to Atomic Agents** (Phase 1 Complete)

The atomic agent catalog decomposes monolithic phase scripts into reusable, single-purpose agents following the "one agent, one task, one prompt" philosophy. This addresses the 0% success rate (issue #206) by improving debuggability, enabling parallel execution, and providing fine-grained error recovery.

**Architecture Benefits:**
- **Fine-grained Error Handling**: Retry individual agents instead of entire phases
- **Parallel Execution**: Independent agents (classify + generate_branch) run concurrently
- **Improved Debuggability**: 10-50 line agent functions vs 200-300 line phase scripts
- **Better Testability**: Unit tests per agent with clear success/failure criteria

**Migration Status:**
- ✅ Phase 1 (Extraction): 10 atomic agents + orchestrator extracted, unit tests created
- 🚧 Phase 2 (Orchestration): DAG-based executor with parallel execution (planned)
- 📅 Phase 3 (Decomposition): Convert phase scripts to thin wrappers (planned)
- 📅 Phase 4 (Validation): Side-by-side comparison, success rate measurement (planned)

**Feature Flag:**
```bash
# Use atomic agent orchestrator (Phase 2+)
export ADW_USE_ATOMIC_AGENTS=true

# Use legacy phase scripts (default, Phase 1)
export ADW_USE_ATOMIC_AGENTS=false
```

**Current Behavior (Phase 1):**
- `ADW_USE_ATOMIC_AGENTS=true` → Raises `NotImplementedError` (orchestrator not yet implemented)
- `ADW_USE_ATOMIC_AGENTS=false` → Uses legacy phase scripts (default, stable)

**Agent Catalog:**
See `adw_agents/README.md` for complete agent documentation, including inputs, outputs, failure modes, and usage examples for all 10 atomic agents.

---

## Resilience & Recovery

**Feature #148: Hybrid ADW Resilience Architecture**

The ADW system includes automatic retry logic and checkpoint-based resume capabilities to improve workflow completion rates.

### Retry Logic

Agent execution automatically retries on transient errors (network issues, API rate limits, timeouts):

```python
from adw_modules.agent import prompt_claude_code_with_retry, AgentPromptRequest, RetryCode

# Automatic retry with exponential backoff (1s, 3s, 5s)
request = AgentPromptRequest(
    prompt="Your prompt here",
    adw_id="adw_123",
    agent_name="test_agent",
    model="sonnet",
    output_file="/path/to/output.jsonl"
)

response = prompt_claude_code_with_retry(request, max_retries=3)

# Response includes retry_code for error classification
if response.retry_code == RetryCode.TIMEOUT_ERROR:
    # Handle timeout-specific recovery
    pass
```

**Retryable Error Types** (from `RetryCode` enum):
- `CLAUDE_CODE_ERROR` - CLI execution failures
- `TIMEOUT_ERROR` - Command timeouts
- `EXECUTION_ERROR` - Generic subprocess errors
- `ERROR_DURING_EXECUTION` - Agent execution failures
- `NONE` - Success or non-retryable errors

**Default Behavior**:
- 3 retry attempts with exponential backoff (1s, 3s, 5s delays)
- Configurable via `max_retries` and `retry_delays` parameters
- Automatic detection and classification of error types
- Detailed retry logging for debugging

### Checkpoints

Phase scripts can save checkpoints at logical breakpoints to enable resume after failures:

```python
from datetime import datetime
from adw_modules.workflow_ops import save_checkpoint, load_checkpoint
from adw_modules.data_types import CheckpointData

# Save a checkpoint after completing a step
checkpoint = CheckpointData(
    timestamp=datetime.now().isoformat(),
    step="implementation",
    files_completed=["src/api/routes.ts", "src/db/queries.ts"],
    next_action="commit_changes",
    metadata={"commit_hash": "abc123"}
)

save_checkpoint(adw_id, phase="build", checkpoint_data=checkpoint, logger=logger)

# Load checkpoints to resume from last successful step
checkpoint_file = load_checkpoint(adw_id, phase="build", logger=logger)
if checkpoint_file:
    last_checkpoint = checkpoint_file.checkpoints[-1]
    logger.info(f"Resuming from step: {last_checkpoint.step}")
    # Skip completed work, resume from next_action
```

**Checkpoint Storage**:
- Location: `agents/{adw_id}/{phase}/checkpoints.json`
- Format: JSON with atomic write (temp file + rename)
- Multiple checkpoints per phase (append-only)
- Automatic validation on load (returns None on corruption)

**Resume Workflow**:
1. Load checkpoint file for the phase
2. Check `last_checkpoint.next_action` to determine resume point
3. Skip completed steps based on `files_completed`
4. Continue execution from failure point

---

## ADW Observability

The ADW Metrics Analysis workflow provides automated observability into ADW success rates and failure patterns through daily log analysis and metrics collection.

### Metrics Workflow

**Schedule**: Daily at 00:00 UTC (configured in `.github/workflows/adw-metrics.yml`)
**Manual Trigger**: Available via GitHub Actions workflow dispatch

The workflow analyzes execution logs and agent state to generate:
- Success rate metrics and temporal trends
- Phase progression funnels (plan → build → review)
- Failure distribution by phase and root cause
- Issue-level outcome tracking
- Worktree staleness detection (>7 days)

### Viewing Metrics

```bash
# List recent workflow runs
gh run list --workflow="ADW Metrics Analysis" --limit 5

# View latest metrics in GitHub Actions UI
gh run view --workflow="ADW Metrics Analysis" --web

# Download metrics artifact from specific run
gh run download <run_id> -n adw-metrics-<run_number>

# Parse metrics JSON
jq '.summary' automation/metrics.json
```

### Manual Analysis

Run log analysis locally without triggering the CI workflow:

```bash
# Analyze last 24 hours (default)
uv run automation/adws/scripts/analyze_logs.py --format text

# JSON output for programmatic parsing
uv run automation/adws/scripts/analyze_logs.py --format json --hours 48

# Markdown report to file
uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file report.md

# Analyze specific environment
uv run automation/adws/scripts/analyze_logs.py --env staging
```

### Alert Thresholds

The workflow automatically creates GitHub issues when metrics indicate problems:

- **50% success rate**: Investigation recommended (automatic issue comment)
- **20% success rate**: Critical threshold (workflow fails)

Alert issues are labeled with `automation`, `alert`, and `priority:high` for easy filtering:

```bash
# Check for active alerts
gh issue list --label automation,alert --state open
```

### Baseline Metrics

**Target Success Rate**: >80% (per 3-phase architecture goals from PR #136)

Expected failure modes to monitor:
- Plan phase failures: Issue classification errors, spec generation issues
- Build phase failures: Implementation errors, commit/push failures, PR creation issues
- Review phase failures: Spec file not found, Claude Code review errors

### Artifacts

Metrics artifacts are uploaded with 90-day retention:
- **Format**: JSON
- **Location**: GitHub Actions artifacts (`adw-metrics-<run_number>`)
- **Retention**: 90 days
- **Schema**: `{summary: {success_rate, total_runs, ...}, runs: [...], phase_reaches: {...}, failure_phases: {...}}`

### GitHub Step Summary

Each workflow run renders a markdown summary visible in the GitHub Actions UI:
- Success rate and run counts
- Phase funnel visualization
- Top failure patterns
- Stale worktree warnings

---

## Orchestrator Slash Command Integration

**Feature #187: `/orchestrator` End-to-End Workflow Automation**

The `/orchestrator` slash command provides a single-command interface for automating the full issue-to-PR workflow. It complements the Python ADW layer by enabling manual and interactive execution of the same multi-phase workflow.

### Usage

```bash
# Basic execution
/orchestrator <issue_number>

# Dry-run validation (no execution)
/orchestrator <issue_number> --dry-run

# Skip worktree cleanup after completion
/orchestrator <issue_number> --skip-cleanup

# Force execution on closed issues
/orchestrator <issue_number> --force

# Resume from last checkpoint after failure
/orchestrator --resume <adw_id>
```

### Workflow Phases

The orchestrator coordinates the same 3-phase architecture as the Python ADW layer:

1. **Plan Phase**: Issue classification → `/feat`, `/bug`, or `/chore` → spec file generation
2. **Build Phase**: Implementation → `/implement` → validation execution
3. **PR Creation**: Branch push → `/pull_request` → PR number extraction
4. **Review Phase**: Code analysis → `/pr-review` → review posting

### State Management

Orchestrator state is persisted to `automation/agents/<adw_id>/orchestrator/state.json`:

```json
{
  "adw_id": "orch-187-20251020140000",
  "issue_number": "187",
  "issue_title": "feat: implement /orchestrator slash command",
  "issue_type": "feat",
  "worktree_name": "feat-187-orchestrator-command",
  "worktree_path": "trees/feat-187-orchestrator-command",
  "branch_name": "feat-187-orchestrator-command",
  "plan_file": "docs/specs/feature-187-orchestrator-slash-command.md",
  "pr_number": "210",
  "pr_url": "https://github.com/user/kota-db-ts/pull/210",
  "phase_status": {
    "plan": "completed",
    "build": "completed",
    "pr": "completed",
    "review": "completed"
  },
  "checkpoints": [...]
}
```

### Checkpoint Recovery

The orchestrator implements checkpoint-based recovery for failure scenarios:

- **Checkpoints**: Saved after each phase completion
- **Resume**: Use `--resume <adw_id>` to continue from last successful phase
- **Preservation**: Worktree preserved on failure for debugging
- **Cleanup**: Configurable via `--skip-cleanup` flag or `ADW_CLEANUP_WORKTREES` env var

### Integration with Python ADW Layer

The `/orchestrator` command complements the Python automation layer:

| Feature | Python ADW | Orchestrator Slash Command |
|---------|-----------|---------------------------|
| **Invocation** | `uv run automation/adws/adw_sdlc.py <issue>` | `/orchestrator <issue>` |
| **Execution** | Automated (webhook/cron) | Manual (interactive) |
| **State Location** | `agents/<adw_id>/adw_state.json` | `agents/<adw_id>/orchestrator/state.json` |
| **Phase Agents** | Python subprocess calls | Claude Code subprocess calls |
| **Worktree Isolation** | Yes (via `git_ops.py`) | Yes (via `git worktree add`) |
| **Checkpoint Recovery** | Yes (automatic retry + resume) | Yes (manual `--resume`) |
| **MCP Integration** | Yes (Tasks API for tracking) | No (deferred to #153) |

### Documentation

- **Slash Command Template**: `.claude/commands/workflows/orchestrator.md`
  - **Subagent Delegation Pattern**: Documents how to invoke phase-specific slash commands programmatically (SlashCommand tool vs subprocess execution)
  - **State File Integration**: Complete state file schema, lifecycle, and context passing patterns
  - **Phase Output Extraction**: Parsing strategies with fallback mechanisms for extracting plan files, validation results, PR URLs, review decisions
  - **Subagent Error Recovery**: Checkpoint-based recovery system with common failure scenarios and recovery steps
- **Integration Tests**: `automation/adws/adw_tests/test_orchestrator_integration.py`
- **Spec File**: `docs/specs/feature-187-orchestrator-slash-command.md`
- **Conditional Docs Entry**: `.claude/commands/docs/conditional_docs/automation.md`
- **Output Contract Standards**: `.claude/commands/docs/prompt-code-alignment.md` - Template output format specifications for orchestrator parsing

### Limitations

- **Single Issue**: Orchestrates one issue at a time (no batch processing)
- **No Parallelization**: Phases execute sequentially
- **No MCP Integration**: Uses subprocess for phase agents (not MCP Tasks API)
- **Manual Recovery**: Resume requires manual flag (not automatic retry)
- **Local Only**: Executes on local machine (not CI/CD environment)

Future enhancements (MCP Tasks API, automated retry, parallel execution) are tracked in follow-up issues.

---

## Tests

The beginnings of an automated regression suite lives under `adws/adw_tests/`:

- `test_utils.py` — verifies JSON parsing helpers for agent output.
- `test_state.py` — exercises persistent state creation and rehydration.
- `test_workflow_ops.py` — covers validation summarisation, lockfile detection, and issue comment formatting.
- `test_retry_logic.py` — tests automatic retry behavior for transient errors.
- `test_checkpoints.py` — validates checkpoint save/load and resume functionality.

Run locally with:

```bash
uv run pytest adws/adw_tests
```

The tests avoid live API calls by using temporary directories and subprocess stubs.

---

## CI Integration

The automation layer test suite runs automatically in GitHub Actions on every push and pull request affecting `automation/**` paths.

**Workflow**: `.github/workflows/automation-ci.yml`

**What runs**:
1. Python syntax check on all modules and phase scripts
2. Full pytest suite (48+ tests) with verbose output
3. Environment: Python 3.12 + uv package manager with dependency caching

**Local execution** (matches CI exactly):
```bash
# Syntax check
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py

# Install dependencies and run tests
cd automation && uv sync && uv run pytest adws/adw_tests/ -v --tb=short
```

**CI Features**:
- Path filtering: Only runs when automation code changes
- Git identity configured for worktree tests
- Dependency caching via `astral-sh/setup-uv@v5`
- Target runtime: < 2 minutes
- Status badge reflects latest build state

**Troubleshooting CI Failures**:

*Syntax Errors*:
- Check Python syntax locally: `python3 -m py_compile <file>`
- Verify imports resolve: `cd automation && uv run python3 -c "import adws.adw_modules.utils"`

*Test Failures*:
- Run specific test: `cd automation && uv run pytest adws/adw_tests/test_<name>.py -v`
- Check for environment differences (git config, file permissions)
- Review test logs in GitHub Actions output

*Dependency Issues*:
- Regenerate lockfile: `cd automation && uv sync`
- Verify lockfile committed: `git status uv.lock`
- Check for version conflicts: `uv pip list`

*Git Operation Failures*:
- Worktree tests require git identity (configured in CI)
- Check git version: `git --version` (2.25+ recommended)
- Verify test isolation: Each test uses temporary directories

---

## MCP Integration

**Feature #69: Connect Automation Agents to MCP Server**

ADW automation agents can connect to the local KotaDB MCP server to access code intelligence tools during workflow execution. This enables agents to search indexed code, trigger repository indexing, and query recent file changes—enhancing context awareness during plan and build phases.

### Setup

1. **Generate Automation API Key** (team tier for 10,000 req/hr rate limit):
   ```bash
   cd app && bun scripts/generate-automation-key.ts
   ```

2. **Configure Environment Variables**:
   Add the generated API key to `automation/adws/.env`:
   ```bash
   # MCP (Model Context Protocol) integration
   MCP_SERVER_URL=http://localhost:3000/mcp
   KOTA_MCP_API_KEY=kota_team_<key_id>_<secret>
   ```

3. **Start MCP Server** (in separate terminal):
   ```bash
   cd app && bun run src/index.ts
   ```

4. **Verify Connectivity**:
   ```bash
   uv run adws/health_check.py mcp --json
   ```

### How It Works

The ADW system automatically configures Claude Code agents to connect to the MCP server when both:
- `KOTA_MCP_API_KEY` environment variable is set
- Agent execution uses worktree-based isolation (`cwd` parameter set)

**Automatic Configuration Flow**:
1. Before executing Claude Code CLI, `agent.py` creates a `.mcp.json` file in the worktree directory
2. Configuration includes HTTP transport with Bearer token authentication
3. Claude Code discovers the project-scoped MCP config and connects to the server
4. Agents gain access to three MCP tools: `search_code`, `index_repository`, `list_recent_files`

**Manual Configuration** (for interactive Claude Code sessions):
Create `.mcp.json` in your project directory:
```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### Available MCP Tools

When connected, agents can invoke:

- `search_code` — Full-text search across indexed repositories
- `index_repository` — Trigger indexing of a repository before building features
- `list_recent_files` — Query recently indexed files for context discovery

### Health Check

The `mcp` health check validates server connectivity and tool availability:
```bash
# Run MCP health check only
uv run adws/health_check.py mcp

# Include MCP in full health check
uv run adws/health_check.py all --json
```

**Health Check Validations**:
- `KOTA_MCP_API_KEY` environment variable is set
- MCP server is reachable at configured URL
- Authentication succeeds (valid API key)
- MCP tools are available (`tools/list` JSON-RPC request)

**Common Errors**:
- `KOTA_MCP_API_KEY environment variable not set` — Configure API key in `.env`
- `Cannot connect to MCP server` — Start the MCP server (`cd app && bun run src/index.ts`)
- `MCP server authentication failed` — Generate new API key or check for typos
- `No tools available from MCP server` — Server started but tools not registered (restart server)

### Rate Limiting

Team tier API keys provide **10,000 requests per hour** (shared across all automation workflows). Monitor rate limit headers in logs:
- `X-RateLimit-Limit`: Total requests allowed per hour
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

If rate limits are exceeded, the health check will report 429 status codes and workflows may fail mid-execution. Consider workflow-specific rate budgets if approaching limits during heavy automation periods.

### Troubleshooting

**MCP tools not appearing in Claude Code sessions**:
- Verify `.mcp.json` exists in project directory (check worktree path)
- Confirm MCP server is running and accessible (`curl http://localhost:3000/mcp`)
- Check health_check.py output for connectivity errors

**Authentication failures**:
- Regenerate automation API key and update `.env`
- Verify API key format matches `kota_team_<key_id>_<secret>`
- Check MCP server logs for authentication errors

**Worktree isolation issues**:
- MCP config is created in worktree root, not repository root
- Verify `cwd` parameter is set when calling `prompt_claude_code()`
- Inspect worktree directory for `.mcp.json` file after agent execution

---

## Beads Integration (Phase 2)

**Feature #303: Beads ADW Workflow Integration**

Beads (local issue tracking via SQLite) replaces GitHub API queries in ADW workflows, providing sub-50ms work selection, atomic claim operations, and dependency graph queries. This eliminates GitHub API latency (150ms+), reduces rate limit pressure, and enables offline-friendly workflows.

### Benefits

- **30x faster queries**: Beads SQLite queries are 5-20ms vs 150ms+ GitHub API latency
- **Atomic work claims**: `bd update --status in_progress` prevents concurrent agent conflicts
- **Dependency graphs**: `dependencies` and `dependents` fields eliminate spec file parsing
- **Offline-friendly**: Local-first data access, sync via git commits
- **Reduced rate limits**: 5000 GitHub API requests/hour → minimal usage

### Architecture

```
GitHub Issues → bd sync → beads SQLite → MCP Tools → ADW Workflows
                              ↓
                         JSONL export → git commit → sync across machines
```

### Setup

1. **Install Beads CLI**:
   ```bash
   uv tool install beads
   bd --version
   ```

2. **Initialize Beads** (if not already initialized):
   ```bash
   bd init --prefix kota-db-ts
   ```

3. **Sync Issues** (import from GitHub):
   ```bash
   bd sync
   ```

### Using Beads in Workflows

**Orchestrator Work Selection**:
```typescript
// Primary: Beads (sub-50ms)
const issue = mcp__plugin_beads_beads__show({
  issue_id: `kota-db-ts-${issueNumber}`,
  workspace_root: "."
});

// Fallback: GitHub API (150ms+)
if (!issue) {
  const ghIssue = await gh.issue.view(issueNumber);
}
```

**Atomic Work Claim**:
```typescript
// Prevent concurrent agents from claiming same work
const claimed = mcp__plugin_beads_beads__update({
  issue_id: issue.id,
  status: "in_progress",
  assignee: "claude",
  workspace_root: "."
});
```

**Dependency Validation**:
```typescript
// Check if dependencies resolved before starting
for (const depId of issue.dependencies) {
  const dep = mcp__plugin_beads_beads__show({
    issue_id: depId,
    workspace_root: "."
  });
  if (dep.status !== "closed") {
    console.error(`Blocked by ${depId}: ${dep.title}`);
  }
}
```

### Python Automation Layer

For Python scripts that need beads data, use CLI-based helpers from `adw_modules/beads_ops.py`:

```python
from adw_modules.beads_ops import (
    query_ready_issues_cli,
    get_issue_details_cli,
    update_issue_status_cli,
)

# Query ready issues (no blockers)
issues = query_ready_issues_cli(priority=1, limit=10)

# Get issue details with dependencies
details = get_issue_details_cli("kota-db-ts-303")

# Update status atomically
success = update_issue_status_cli(
    "kota-db-ts-303",
    "in_progress",
    assignee="claude",
)
```

### State Schema Extension

ADW state now includes beads tracking fields:

```json
{
  "adw_id": "orch-303-20251028120000",
  "issue_number": "303",
  "beads_issue_id": "kota-db-ts-303",
  "beads_sync": {
    "last_sync": "2025-10-28T12:00:00Z",
    "source": "beads",
    "beads_available": true
  }
}
```

### Sync Strategy

Beads uses JSONL for git-based sync (`.beads/issues.jsonl`):

1. **Manual sync**: `bd sync` (exports SQLite → JSONL, commits changes)
2. **Auto-import**: Beads detects newer JSONL on `git pull` and imports automatically
3. **Conflict resolution**: Last-write-wins (SQLite timestamp-based)

### Troubleshooting

**"Beads CLI not found"**:
- Install beads: `uv tool install beads`
- Verify: `bd --version`

**"Issue not found in beads"**:
- Sync beads: `bd sync`
- Check JSONL: `cat .beads/issues.jsonl`
- Verify external_ref: `bd show <issue_id>`

**"Atomic claim failed"**:
- Check if issue already claimed: `bd show <issue_id>`
- Verify status: Should be `open`, not `in_progress`
- Check worktree isolation: Ensure agents in separate worktrees

**"Dependency sync delay"**:
- Beads auto-imports JSONL if newer than database
- Force import: `bd import .beads/issues.jsonl`
- Check freshness: Compare JSONL timestamp with database

### Related Documentation

- Beads Integration Guide (`.claude/commands/docs/beads-adw-integration.md`): Complete developer guide
- Orchestrator (`.claude/commands/workflows/orchestrator.md`): Beads work selection in Phase 1
- Prioritize (`.claude/commands/issues/prioritize.md`): Beads dependency graph queries
- Issue Relationships (`.claude/commands/docs/issue-relationships.md`): Dependency types

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
| MCP Server (optional) | KotaDB MCP server for code intelligence tools: `KOTA_MCP_API_KEY`, `MCP_SERVER_URL` |
| Environment vars | `ANTHROPIC_API_KEY`, optional `E2B_API_KEY`, `ADW_ENV`, log overrides |

Dotenv loading order: repository `.env` ➜ `ADW_ENV_FILE` (if set) ➜ `adws/.env*`.

---

## Usage Examples

```bash
# Health check prerequisites
uv run adws/health_check.py --json

# Full SDLC workflow for issue #123
uv run adws/adw_sdlc.py 123

# Run individual phases (3-phase architecture)
uv run adws/adw_phases/adw_plan.py 123
uv run adws/adw_phases/adw_build.py 123
uv run adws/adw_phases/adw_review.py 123

# Restart a phase with a known ADW id
uv run adws/adw_phases/adw_build.py 123 deadbeef
```

---

## Automation Triggers

- **Cron poller** (`uv run adws/trigger_cron.py`)
  Polls open issues every 20 seconds. A workflow launches when the latest comment (excluding ADW bot posts) is exactly `adw`. The cron trigger runs the full SDLC workflow by default.

- **Webhook server** (`PORT=8001 uv run adws/trigger_webhook.py`)
  FastAPI endpoint that reacts to issue comment commands. Examples (3-phase architecture):
  - `/adw plan` → `adw_phases/adw_plan.py`
  - `/adw build` → `adw_phases/adw_build.py`
  - `/adw review` → `adw_phases/adw_review.py`
  - `/adw sdlc` → `adw_sdlc.py` (runs all 3 phases)
  The webhook injects `ADW_WORKFLOW` into the runner container so the appropriate script executes.

- **Home Server Integration** (`uv run adws/adw_triggers/adw_trigger_cron_homeserver.py`)
  Polls a custom home server endpoint (via Tailscale) for pending tasks. Each task runs in an isolated git worktree with automatic status synchronization. See [Home Server Integration](#home-server-integration) section below for details.

- **API-Driven Phase Task Trigger** (`uv run adws/adw_triggers/adw_trigger_api_tasks.py`)
  Polls the kota-tasks MCP server for pending phase tasks and routes them to individual phase scripts (plan, build, test, review, document). Enables phase-level workflow orchestration with concurrent task execution. See [API-Driven Phase Execution](#api-driven-phase-execution) section below for details.

All triggers write logs beneath `logs/kota-db-ts/…` so bot activity is observable.

---

## Validation Defaults

**Note**: As of PR #136, the automated test phase has been removed. Validation commands are no longer automatically executed by the ADW system. Developers should run validation manually before creating PRs:

```bash
cd app && bun run lint       # Lint check
cd app && bun run typecheck  # Type checking
cd app && bun test           # Test suite
cd app && bun run build      # Production build
```

The `ts_commands.py` module retains validation command definitions for potential future reintegration or manual use.

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

### Statistics Reporting

The trigger automatically reports statistics to the home server for remote monitoring and alerting. This enables observability without requiring direct terminal access.

**Configuration Options**:
- `--stats-enabled/--no-stats-enabled`: Enable/disable stats reporting (default: enabled)
- `--stats-interval <seconds>`: Reporting frequency in seconds (default: 60, minimum: 10)
- `--stats-endpoint <path>`: API endpoint for stats (default: `/api/kota-tasks/stats`)
- `--trigger-id <id>`: Custom trigger identifier (default: auto-generated from hostname + timestamp)

**Environment Variables**:
- `HOMESERVER_STATS_ENABLED`: Enable stats reporting (`true` or `false`)
- `HOMESERVER_STATS_INTERVAL`: Reporting interval in seconds
- `HOMESERVER_STATS_ENDPOINT`: Stats API endpoint path

**Example Configuration**:
```bash
# Using CLI flags
uv run adws/adw_triggers/adw_trigger_cron_homeserver.py \
  --stats-interval 30 \
  --trigger-id production-trigger-001

# Using environment variables
export HOMESERVER_STATS_ENABLED=true
export HOMESERVER_STATS_INTERVAL=45
uv run adws/adw_triggers/adw_trigger_cron_homeserver.py

# Disable stats reporting
uv run adws/adw_triggers/adw_trigger_cron_homeserver.py --no-stats-enabled
```

**Stats Payload Example**:
```json
{
  "trigger_id": "kota-trigger-hostname-20251013142530",
  "hostname": "jaymins-mac-pro",
  "stats": {
    "checks": 42,
    "tasks_started": 12,
    "worktrees_created": 8,
    "homeserver_updates": 15,
    "errors": 0,
    "uptime_seconds": 3600,
    "last_check": "14:32:15",
    "active_workflows": 2
  },
  "timestamp": "2025-10-13T14:32:15.123456"
}
```

**Failure Behavior**:
- Stats reporting errors are non-blocking (logged but don't crash trigger)
- Error count increments on reporting failures
- Trigger continues normal task processing regardless of stats reporting status

**Manual Testing**:
```bash
# Test stats endpoint with curl
curl -X POST https://jaymins-mac-pro.tail1b7f44.ts.net/api/kota-tasks/stats \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_id": "test-trigger-001",
    "hostname": "test-host",
    "stats": {"checks": 1, "errors": 0, "uptime_seconds": 60},
    "timestamp": "2025-10-13T14:00:00Z"
  }'

# Observe stats updates in home server logs
# Expected: POST requests every 60 seconds (default interval)

# Verify trigger continues operating if stats endpoint unavailable
# Expected: Warning messages in trigger logs, but task processing continues
```

---

## API-Driven Phase Execution

The API-driven phase task trigger enables phase-level workflow orchestration by polling the kota-tasks MCP server for pending phase tasks and routing them to individual phase scripts. This architecture enables selective phase retry, concurrent phase execution, and API-driven task creation.

### Setup

1. Configure MCP server in `.mcp.json` (already configured):
   ```json
   {
     "mcpServers": {
       "kota-tasks": {
         "type": "http",
         "url": "http://localhost:3000/mcp",
         "headers": {
           "Authorization": "Bearer <api_key>"
         }
       }
     }
   }
   ```

2. Start the API trigger:
   ```bash
   # Continuous polling (default: 10 second interval)
   uv run adws/adw_triggers/adw_trigger_api_tasks.py

   # Run once and exit
   uv run adws/adw_triggers/adw_trigger_api_tasks.py --once

   # Custom configuration
   uv run adws/adw_triggers/adw_trigger_api_tasks.py \
     --polling-interval 15 \
     --max-concurrent 3 \
     --verbose
   ```

### Task Structure

Phase tasks in the kota-tasks MCP server must include:
- `task_id`: Unique identifier (UUID)
- `title`: Short description
- `status`: Current status (pending/claimed/in_progress/completed/failed)
- `priority`: Priority level (low/medium/high)
- `tags.phase`: Phase name (plan, build, test, review, document)
- `tags.issue_number`: GitHub issue number
- `tags.worktree`: Worktree name for execution
- `tags.parent_adw_id`: Parent ADW execution ID for tracking

Example phase task:
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "kotadb",
  "title": "Build phase: Issue #110",
  "description": "Execute build phase for issue #110",
  "status": "pending",
  "priority": "high",
  "tags": {
    "phase": "build",
    "issue_number": "110",
    "worktree": "feat-110-example",
    "parent_adw_id": "abc-123"
  },
  "created_at": "2025-10-13T14:30:00Z"
}
```

### Phase Routing

The trigger automatically routes tasks to phase scripts based on `tags.phase` (3-phase architecture as of #136):

| Phase | Script | Purpose |
|-------|--------|---------|
| plan | `adw_phases/adw_plan.py` | Create implementation plan |
| build | `adw_phases/adw_build.py` | Implement plan and create PR |
| review | `adw_phases/adw_review.py` | Code review |

**Note**: Test and document phases were removed in PR #136. Phase tasks with `tags.phase: "test"` or `tags.phase: "document"` will be rejected.

### Task Creation via Slash Commands

Create phase tasks using the `/tasks:create` slash command:

```bash
# Create a build phase task
/tasks:create build "Execute build phase for issue #110" 110 abc-123 feat-110-example high

# Create a review phase task
/tasks:create review "Run code review for issue #110" 110 abc-123 feat-110-example medium
```

Query phase tasks using `/tasks:query_phase`:

```bash
# Query pending build tasks
/tasks:query_phase build pending 10

# Query all in-progress tasks
/tasks:query_phase all in_progress

# Query completed review tasks
/tasks:query_phase review completed 50
```

Update task status using `/tasks:update_status`:

```bash
# Mark task as completed
/tasks:update_status <task_id> completed '{"exit_code": 0}'

# Mark task as failed
/tasks:update_status <task_id> failed null "Build failed: compilation errors"
```

### Task Lifecycle

1. **pending**: Task created and waiting to be picked up
2. **claimed**: Trigger picked up the task (not yet started)
3. **in_progress**: Phase script is executing
4. **completed**: Phase succeeded (includes result data)
5. **failed**: Phase failed (includes error message)

### Concurrent Execution

The trigger supports concurrent phase task execution with configurable limits:

```bash
# Allow up to 5 concurrent phase tasks
uv run adws/adw_triggers/adw_trigger_api_tasks.py --max-concurrent 5
```

**Concurrency Features**:
- Independent phases from different issues run in parallel
- Worktree isolation prevents git conflicts
- Each task tracked individually with separate logs
- Task deduplication prevents re-execution

### Monitoring

The trigger provides real-time status display:

```
┌─────────────────── 🔄 API-Driven Phase Task Trigger ───────────────────┐
│  Status             Running                                             │
│  Max Concurrent     5                                                   │
│  Active Tasks       3                                                   │
│  Checks Performed   127                                                 │
│  Tasks Claimed      45                                                  │
│  Tasks Completed    42                                                  │
│  Tasks Failed       3                                                   │
│  Errors             0                                                   │
│  Last Check         14:32:15                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Structured Logging

All trigger events are logged to `.adw_logs/api_trigger/YYYYMMDD.log` in JSON format:

```json
{
  "timestamp": "2025-10-13T14:32:15.123456",
  "event": "phase_task_started",
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "phase": "build",
  "issue_number": "110",
  "worktree": "feat-110-example",
  "adw_id": "abc-123"
}
```

### Configuration Options

**CLI Flags**:
- `--polling-interval <seconds>`: Polling frequency (default: 10)
- `--max-concurrent <number>`: Max parallel tasks (default: 5)
- `--dry-run`: Show tasks without executing
- `--once`: Run single check and exit
- `--verbose`: Show detailed output
- `--log-file <path>`: Custom log file path

**Environment Variables**:
- `KOTA_TASKS_MCP_SERVER`: MCP server name (default: kota-tasks)
- `KOTA_TASKS_PROJECT_ID`: Project identifier (default: kotadb)

### Use Cases

**Selective Phase Retry**:
```bash
# Create task to re-run only the build phase
/tasks:create build "Retry implementation after fixing dependency issue" 110 abc-123 feat-110-example high
```

**Note**: With the 3-phase architecture (plan → build → review), the build phase now includes PR creation. The review phase runs after the PR is created.

**API-Driven Workflows**:
External systems can create phase tasks via the kota-tasks MCP API, enabling:
- Event-driven triggers (e.g., GitHub webhook → create build task)
- Scheduled phase execution (e.g., nightly test runs)
- Manual phase triggering from dashboards
- Integration with external workflow orchestrators

### Architecture

**Task API Module** (`adws/adw_modules/tasks_api.py`):
- Python wrappers for MCP task operations
- Executes MCP tools via Claude Code CLI `--mcp` flag
- Functions: `create_phase_task()`, `update_task_status()`, `get_task()`, `list_tasks()`
- Error handling for MCP server connectivity issues

**Trigger** (`adws/adw_triggers/adw_trigger_api_tasks.py`):
- Polls kota-tasks API for pending phase tasks
- Routes tasks to phase scripts based on `tags.phase`
- Updates task status throughout lifecycle
- Manages concurrent task execution with configurable limits
- Graceful shutdown handling (SIGINT/SIGTERM)

**Slash Commands** (`.claude/commands/tasks/`):
- `/tasks:create` - Create phase task with metadata
- `/tasks:update_status` - Update task status
- `/tasks:query_phase` - Query tasks by phase filter

### Troubleshooting

**Issue**: Tasks not being picked up
**Diagnostics**:
1. Verify MCP server is accessible:
   ```bash
   claude --mcp kota-tasks__tasks_list --args '{"project_id":"kotadb"}'
   ```
2. Check task status (only `pending` tasks are claimed)
3. Review trigger logs in `.adw_logs/api_trigger/`

**Issue**: Task status not updating
**Diagnostics**:
1. Check MCP server connectivity
2. Verify task_id exists: `claude --mcp kota-tasks__tasks_get --args '{"task_id":"<task_id>"}'`
3. Review phase script execution logs

**Issue**: Phase script not found
**Symptoms**: Task marked as failed with "No phase script found" error
**Solution**: Verify phase name in `tags.phase` is one of: plan, build, review (test and document phases were removed in #136)

---

## Log Analysis

The ADW system includes automated log analysis tooling to surface critical metrics and failure patterns from execution logs and agent state.

### Quick Start

```bash
# Text output to stdout (default)
uv run automation/adws/scripts/analyze_logs.py

# JSON output for programmatic consumption
uv run automation/adws/scripts/analyze_logs.py --format json

# Markdown report to file
uv run automation/adws/scripts/analyze_logs.py --format markdown --output file --output-file report.md

# Analyze last 48 hours
uv run automation/adws/scripts/analyze_logs.py --hours 48

# Analyze staging environment
uv run automation/adws/scripts/analyze_logs.py --env staging
```

### Key Metrics

The log analysis script extracts and aggregates:
- **Success rate**: `(completed_runs / total_runs) * 100`
- **Phase funnel**: Runs reaching each phase (plan → build → review) — updated for 3-phase architecture as of #136
- **Failure distribution**: Count by phase and root cause category
- **Issue distribution**: Runs per issue number with outcome breakdown
- **Worktree metrics**: Active, completed, and stale worktree counts
- **Temporal analysis**: Success rate trends over configurable time windows

### Output Formats

**Text**: Human-readable stdout output with emojis and formatted tables
**JSON**: Structured data for CI integration and programmatic analysis
**Markdown**: GitHub-friendly reports compatible with issue comments

### CI Integration

The log analysis runs daily via GitHub Actions (`.github/workflows/adw-metrics.yml`):
- **Schedule**: Daily at 00:00 UTC
- **Outputs**: JSON metrics artifact + markdown summary in workflow output
- **Alerting**: Posts issue comment when success rate < 50%
- **Artifacts**: 90-day retention for historical tracking

Trigger manually:
```bash
gh workflow run adw-metrics.yml --ref develop
```

### Data Sources

**Execution Logs**: `automation/logs/kota-db-ts/{env}/{adw_id}/adw_sdlc/execution.log`
- Issue number extraction
- Phase progression tracking
- Failure pattern analysis
- Error message aggregation

**Agent State**: `automation/agents/{adw_id}/adw_state.json`
- Worktree metadata correlation
- Branch name tracking
- Plan file references
- Timestamp analysis for staleness detection

### Monitoring Best Practices

**Daily Review**:
1. Check success rate trend (target: >80%)
2. Identify top 3 failure phases
3. Review error patterns for systemic issues

**Weekly Review**:
1. Analyze 7-day success rate trend
2. Identify issues with multiple failed attempts
3. Clean up stale worktrees (>7 days old)

**Alerting Thresholds**:
- **50% success rate**: Investigation recommended (automatic issue comment in CI)
- **20% success rate**: Critical threshold (CI workflow fails)

### Example Output

```
═══════════════════════════════════════════════════════════════════════════════
ADW Agentic Run Analysis - Last 24 Hours
Analysis Time: 2025-10-13 19:04:10
Environment: local
═══════════════════════════════════════════════════════════════════════════════

📊 SUMMARY METRICS
───────────────────────────────────────────────────────────────────────────────
Total runs analyzed: 18

Outcome Distribution:
  • failed_at_adw_test          :  9 runs ( 50.0%)
  • failed_at_adw_plan          :  4 runs ( 22.2%)
  • failed_at_adw_build         :  4 runs ( 22.2%)
  • in_progress                 :  1 runs (  5.6%)

Phase Reach (how many runs got to each phase):
  • adw_plan     : 18 runs (100.0%)
  • adw_build    : 13 runs ( 72.2%)
  • adw_review   :  0 runs (  0.0%)

Note: adw_test and adw_document phases removed in PR #136
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

**Note**: As of PR #136, the automated test phase (`adw_test.py`) has been removed. Validation is now a manual responsibility.

**Manual Validation**:
Developers should run validation commands manually before creating PRs:

```bash
cd app && bun run lint       # Lint check
cd app && bun run typecheck  # Type checking
cd app && bun test           # Test suite
cd app && bun run build      # Production build
```

**CI Validation**:
GitHub Actions still runs full validation on all PRs via `.github/workflows/app-ci.yml`:
- Automated test suite (133 tests)
- Lint and type checking
- Migration sync validation
- Environment variable validation

**Issue**: Tests passing locally but failing in CI
**Common Causes**:
1. **Port mismatch**: Local tests use port `54326`, CI may differ
2. **Environment variables**: Check `.env.test` is generated correctly
3. **Database state**: CI runs against fresh database, local may have stale data

**Solution**:
```bash
# Reset local test database to match CI state
cd app && bun run test:reset
cd app && bun test

# Regenerate .env.test from Supabase status
cd app && bun run test:env
```

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
