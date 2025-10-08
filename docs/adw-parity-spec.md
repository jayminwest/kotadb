# AI Developer Workflow (ADW) Parity Specification

## 1. Background
- **Current state (KotaDB)**: single `adws` package centered on `adw_plan_build.py`, minimal helpers (`agent.py`, `github.py`, `ts_helpers.py`, `utils.py`), no persistent workflow state, limited automation scripts, and no dedicated testing harness.
- **Reference state (TAC tac-6)**: modularized `adws/adw_modules` core with reusable state, git, workflow helpers; discrete phase scripts (plan, build, test, review, document, patch); composite orchestrators; triggers; and a targeted test suite.
- **Objective**: align `kota-db-ts/adws` capabilities with the TAC implementation while retaining KotaDB-specific validation (Bun/TypeScript) and omitting cloud storage dependencies.

## 2. Goals
- Introduce a module layout that mirrors TAC’s `adw_modules`, enabling shared state, git operations, workflow utilities, and type definitions.
- Support the full SDLC workflow surface (plan, build, test, review, document, patch) as standalone scripts and composed runners.
- Maintain KotaDB validation defaults (Bun lint/typecheck/test/build) and expose TypeScript helpers through the new module structure.
- Ensure GitHub automation (comments, PR lifecycle, triggers) behaves consistently with TAC’s workflows.
- Provide automated tests, developer tooling, and documentation that explain the expanded system.

## 3. Non-Goals
- Cloud-based screenshot upload (e.g., Cloudflare R2) or other storage integrations.
- Replacing Bun/TypeScript validation with alternative toolchains.
- Rewriting existing production automation outside the `adws` surface.

## 4. Current Gaps
| Area | KotaDB | TAC Reference | Gap |
| --- | --- | --- | --- |
| Module layout | Flat scripts + helpers | `adw_modules` package + shared state | Missing modular core and state persistence |
| Workflow coverage | `adw_plan_build.py` only | Plan, build, test, review, document, patch | Missing discrete phases and composites |
| Git/state handling | Inline in scripts | Shared helpers + `ADWState` persistence | No reusable state layer |
| Automation triggers | `trigger_cron.py` + webhook stub | Triggers leveraging modular workflows | Needs refactor to new surface |
| Testing | None | `adw_tests` suite | No regression safety net |
| Docs | Short README | Comprehensive README + onboarding | Needs deep documentation |

## 5. Target Architecture Overview
- `adws/adw_modules/`
  - `agent.py`: Claude execution wrapper (reuse KotaDB implementation with module path adjustments).
  - `data_types.py`: Consolidated pydantic models, command enums, test result data classes.
  - `git_ops.py`: Git branch/push/commit helpers plus PR orchestration entry points.
  - `github.py`: CLI wrappers for issues, comments, and polling (reuse KotaDB logic, integrate ADW bot prefixing).
  - `state.py`: `ADWState` class for `agents/{adw_id}/adw_state.json` management plus stdin/stdout helpers.
  - `utils.py`: Environment loading, logging setup, run-id generation, JSON parsing.
  - `workflow_ops.py`: Shared operations for classify/build/implement/test/review/document/patch flows, branch name generation, commit/PR templating, plan discovery, Bun command helpers.
- `adws/` scripts
  - Core phases: `adw_plan.py`, `adw_build.py`, `adw_test.py`, `adw_review.py`, `adw_document.py`, `adw_patch.py`.
  - Composites: `adw_plan_build.py`, `adw_plan_build_test.py`, `adw_plan_build_review.py`, `adw_plan_build_test_review.py`, `adw_plan_build_document.py`, `adw_sdlc.py`.
  - Triggers: `adw_triggers/trigger_cron.py`, `adw_triggers/trigger_webhook.py` updated to call new scripts and emit ADW bot identifiers.
  - Scripts folder: update/run helpers (e.g., `scripts/run-adw.sh`) to target new entry points.
- `adws/adw_tests/` mirrored suite covering agents, workflow utilities, health checks, and sandbox testing (adapted to Bun environment).
- Documentation coverage in `docs/` and `adws/README.md`.

## 6. Detailed Requirements

### 6.1 Module Refactor
- Create `adws/adw_modules/__init__.py` to expose shared types and helpers.
- Move existing logic into module equivalents:
  - `agent.py` → `adw_modules/agent.py` (retain environment handling).
  - `github.py` → `adw_modules/github.py` (introduce bot identifier constant, optional PAT env).
  - `utils.py` → `adw_modules/utils.py` (logging, env loading, project root).
  - `data_types.py` → `adw_modules/data_types.py` (extend with TAC type set, preserving KotaDB command mappings).
  - `ts_helpers.py` functionality: integrate into `workflow_ops.py` or expose via `adw_modules/ts_commands.py` to keep Bun command serialization accessible.
- Implement new modules based on TAC:
  - `git_ops.py` (branch/commit/push/PR handling).
  - `state.py` (persistent state file support, state piping).
  - `workflow_ops.py` (agent command wrappers, ensure plan discovery, commit/pull request creation, plan/test/review orchestrations).
- Validate imports throughout scripts; ensure `sys.path` manipulation is removed in favor of package-relative imports.

### 6.2 Persistent State & Logging
- Adopt `agents/{adw_id}/` directory convention with:
  - `adw_state.json` storing `adw_id`, `issue_number`, `branch_name`, `plan_file`, `issue_class`.
  - Per-agent prompt and JSONL logs (reuse existing `run_logs_dir`).
- Ensure all scripts load/initialize state via `ensure_adw_id()` before executing phase-specific logic.
- Preserve or enhance logging formatting (e.g., `setup_logger`) to include ADW IDs and stage names.

### 6.3 Workflow Scripts
- Plan (`adw_plan.py`): fetch issue, classify, generate branch, produce plan file path returned by agent, commit plan, persist state, push branch/PR.
- Build (`adw_build.py`): resume via state, ensure branch/plan, run implement command, commit changes, finalize git operations.
- Test (`adw_test.py`): run Bun validation commands, capture results, retry logic (configurable), commit summary, update PR.
- Review (`adw_review.py`): reuse TAC flow minus screenshot upload; capture review issues locally, optionally create patches via implementor agent.
- Document (`adw_document.py`): generate documentation artifacts (specify Bun repo destinations if applicable), update PR/issue.
- Patch (`adw_patch.py`): allow direct patch application for quick fixes.
- Ensure CLI usage mirrors TAC (accepts `<issue-number> [adw-id]` plus relevant flags, supports piped state).

### 6.4 Composite Orchestrators
- `adw_plan_build.py`: thin wrapper that ensures ADW ID, then sequentially invokes plan → build using `subprocess.run`.
- `adw_plan_build_test.py`: extend with test phase, propagate non-zero exits.
- `adw_plan_build_review.py`: plan → build → review (skip tests).
- `adw_plan_build_test_review.py`: full plan/build/test/review chain.
- `adw_plan_build_document.py`: plan → build → document (skip tests/review).
- `adw_sdlc.py`: complete pipeline (plan/build/test/review/document).
- Each orchestrator should accept issue number and optional ADW ID; emit phase start/finish logs similar to TAC.

### 6.5 Git & GitHub Integration
- Standardize issue comment prefixing with `<ADW_ID>_<agent>[:_<session>]` to align with TAC’s parsing expectations.
- Centralize GitHub CLI interactions in `adw_modules/github.py`; handle PAT injection via `GH_TOKEN`.
- Use `git_ops.finalize_git_operations` to push branch and create/update PR, ensuring existing PRs are reused.
- Maintain label/assignment helpers (optional) while ensuring they are toggled via configuration flags if needed.

### 6.6 Validation Commands
- Provide helper in `workflow_ops` (or dedicated module) to build Bun validation sequences:
  - Always run lint, typecheck, test, build.
  - Conditionally run `bun install` if lockfile changed (expose detection helper).
- Ensure command serialization is available to agents (e.g., via `/implement` prompts).
- Document how to extend validation per-environment (e.g., staging vs production).

### 6.7 Triggers & Automation
- Move existing `trigger_cron.py` and `trigger_webhook.py` into `adw_triggers/`.
- Update cron logic to leverage new composite scripts (default to plan+build+test or configurable pipeline).
- Webhook server should parse issue comment commands, map to workflow names using `workflow_ops.extract_adw_info`, and launch the corresponding script with ADW ID assignment.
- Ensure triggers respect `ADW_ENV`, logging directories, and handle concurrency (one workflow per ADW ID) similar to TAC.

### 6.8 Testing & Quality Assurance
- Port TAC’s `adw_tests` with adjustments:
  - Replace Python-specific or R2 dependencies with Bun-friendly mocks.
  - Ensure health check test validates Bun commands and Claude CLI availability.
  - Add regression coverage for Bun command serialization (`ts_helpers` replacement).
- Provide fixtures/mocks for GitHub CLI interactions (e.g., using recorded JSON responses or dependency injection).
- Integrate tests into existing CI (e.g., `bun test` or Python test runner via `uv run pytest`).

### 6.9 Documentation & Developer Onboarding
- Expand `adws/README.md` to describe:
  - New module structure and responsibilities.
  - Workflow commands with usage examples.
  - Required environment variables and `.env` setup.
  - Trigger configuration, logging paths, troubleshooting.
- Add this spec to `docs/adw-parity-spec.md` and reference it from README if appropriate.
- Provide migration checklist for developers (e.g., run health check, update `.claude/commands`, confirm Bun scripts).

## 7. Implementation Plan

### Phase 1 – Modular Foundation
1. Scaffold `adw_modules` package and migrate shared code.
2. Introduce `ADWState`, `git_ops`, and `workflow_ops`.
3. Update existing scripts to import from new modules.
4. Validate `adw_plan_build.py` still runs end-to-end.

### Phase 2 – Workflow Surface Expansion
1. Split monolithic plan/build flow into `adw_plan.py` and `adw_build.py`.
2. Implement remaining phase scripts (test, review, document, patch) using TAC logic with Bun adaptation.
3. Create composite orchestrators.
4. Ensure issue comments, commits, PRs, and logging follow the new conventions.

### Phase 3 – Automation & Tooling
1. Refactor cron and webhook triggers to call new workflows.
2. Implement command classification (`/classify_adw`) to map comments → workflows.
3. Update helper scripts (`scripts/run-adw.sh` etc.) and environment loading.

### Phase 4 – Testing & Documentation
1. Port/adapt `adw_tests` suite (unit + integration stubs).
2. Update CI configuration to run new tests (`uv run pytest adws/adw_tests` or similar).
3. Refresh `adws/README.md`, `.env.sample`, and developer guides.
4. Final review using this spec as acceptance criteria.

## 8. Acceptance Criteria
- All new scripts exist, execute successfully with mocked GitHub/Claude inputs, and persist state in `agents/<adw_id>/adw_state.json`.
- `adw_plan_build.py`, `adw_plan_build_test.py`, `adw_sdlc.py` operate end-to-end on sample issues.
- Bun validation commands run during build/test phases and failures propagate with informative issue comments.
- Triggers can launch workflows based on issue comments or polling.
- Automated tests cover critical modules (agent execution, state persistence, workflow ops helpers, health checks).
- Documentation accurately describes workflows, configuration, and troubleshooting.

## 9. Risks & Mitigations
- **Complexity drift between codebases** → establish shared modules aligned with TAC names to simplify future cherry-picks.
- **Regression in existing automation** → incremental rollout by phase, with targeted end-to-end dry runs before enabling triggers.
- **Agent prompt mismatches** → audit `.claude/commands` usage during development and update prompts as needed.
- **State corruption** → add logging + validation in `ADWState.load/save`, include fallback behavior for missing fields.

## 10. Open Questions
- How should default workflows be configured for triggers (e.g., plan+build+test vs plan+build)?
- Are there repository-specific validation steps (seed scripts, migrations) that should be optional per issue class?
- What level of retry logic is required for Bun commands or agent execution failures?

