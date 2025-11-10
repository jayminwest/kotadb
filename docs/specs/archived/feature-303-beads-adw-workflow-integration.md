# Feature Plan: Beads Integration Phase 2 - ADW Workflow Integration

## Overview

### Problem
ADW workflows currently query GitHub API for issue metadata and parse spec files for dependency relationships, creating latency (150ms+ per issue), rate limit pressure (5000 req/hr), and race conditions during concurrent agent execution. The orchestrator and prioritization commands need a faster, local-first solution for work selection and dependency analysis.

### Desired Outcome
Replace GitHub API queries with beads MCP tools in `/workflows:orchestrator` and `/issues:prioritize` commands, enabling:
- Sub-50ms work selection queries (local SQLite vs remote API)
- Atomic "claim work" operations via `bd update --status in_progress`
- Dependency graph queries without spec file parsing
- ADW agents creating discovered work with automatic relationship tracking
- No degradation in ADW success rate (maintain ≥80%)

### Non-Goals
- Full GitHub API replacement (issue creation, PR management still use GitHub)
- Beads CLI integration in application layer (automation layer only)
- Real-time issue sync (manual `bd sync` sufficient for Phase 2)
- GitHub webhook integration for automatic beads updates

## Technical Approach

### Architecture Notes
This feature builds on Phase 1 (issue #301) beads infrastructure and integrates with existing ADW workflows without breaking orchestrator patterns. The implementation follows a migration strategy: add beads alongside GitHub API calls, validate parity, then switch primary data source.

**Key Design Decisions:**
1. **Dual-source strategy**: Keep GitHub API as fallback during migration for safety
2. **MCP tool invocation**: Use existing `mcp__plugin_beads_beads__*` tools via SlashCommand patterns
3. **State file augmentation**: Add `beads_issue_id` to orchestrator state for tracking
4. **Checkpoint integration**: Update beads status at each checkpoint for observability

### Key Modules to Touch

**Slash Commands** (`.claude/commands/`):
- `workflows/orchestrator.md`: Add beads work selection before GitHub API fallback
- `issues/prioritize.md`: Replace spec file parsing with `bd show` dependency queries

**Automation Layer** (`automation/adws/`):
- `adw_modules/workflow_ops.py`: Add `select_work_from_beads()` helper
- `adw_modules/state.py`: Extend `ADWState` with `beads_issue_id` field
- `adw_phases/adw_plan.py`: Update beads status on plan completion
- `adw_phases/adw_build.py`: Update beads status on build completion
- `adw_phases/adw_review.py`: Update beads status on review completion

**Testing** (`automation/adws/adw_tests/`):
- New file: `test_beads_integration.py` with 15+ test cases

### Data/API Impacts

**Orchestrator State Schema Extension:**
```json
{
  "adw_id": "orch-303-20251028120000",
  "issue_number": "303",
  "beads_issue_id": "kota-db-ts-303",  // NEW: beads tracking
  "beads_sync": {                       // NEW: sync metadata
    "last_sync": "2025-10-28T12:00:00Z",
    "source": "beads"
  }
}
```

**Beads → GitHub Mapping:**
- Beads issue ID: `kota-db-ts-303` (prefix from `bd init`)
- GitHub issue number: `303`
- Mapping stored in beads `external_ref` field

**Beads Status Lifecycle:**
- `open` → when issue created (Phase 1)
- `in_progress` → when orchestrator claims work (Phase 2)
- `blocked` → if dependencies unresolved (Phase 2)
- `closed` → when PR merged (Phase 2)

## Relevant Files

### Existing Files to Modify

- `.claude/commands/workflows/orchestrator.md` — Add beads work selection logic in Phase 1 (Issue Validation)
- `.claude/commands/issues/prioritize.md` — Replace GitHub API queries with beads MCP tools
- `automation/adws/adw_modules/workflow_ops.py` — Add beads integration helpers
- `automation/adws/adw_modules/state.py` — Extend state schema with beads fields
- `automation/adws/adw_modules/data_types.py` — Add beads-related Pydantic models
- `automation/adws/adw_phases/adw_plan.py` — Update beads status after plan commit
- `automation/adws/adw_phases/adw_build.py` — Update beads status after implementation
- `automation/adws/adw_phases/adw_review.py` — Update beads status after review
- `automation/adws/README.md` — Document beads integration patterns

### New Files to Create

- `automation/adws/adw_tests/test_beads_integration.py` — Integration tests (15+ cases)
- `automation/adws/adw_modules/beads_ops.py` — Beads operation wrappers (query, update, create)
- `.claude/commands/docs/beads-adw-integration.md` — Developer guide for beads workflows

## Task Breakdown

### Phase 1: Beads Integration Helpers (2 days)

**Goal**: Create reusable Python helpers for beads MCP tool invocation.

**Tasks:**
1. Create `automation/adws/adw_modules/beads_ops.py` module
2. Implement `query_ready_issues()` → wraps `mcp__plugin_beads_beads__ready`
3. Implement `get_issue_details()` → wraps `mcp__plugin_beads_beads__show`
4. Implement `update_issue_status()` → wraps `mcp__plugin_beads_beads__update`
5. Implement `create_discovered_issue()` → wraps `mcp__plugin_beads_beads__create`
6. Add error handling for beads MCP unavailable (fallback to GitHub API)
7. Unit tests for `beads_ops.py` (10 test cases)

**Acceptance Criteria:**
- All helper functions successfully invoke beads MCP tools
- Error handling returns `None` on MCP unavailability (enables fallback)
- Unit tests achieve 90%+ code coverage
- Functions return parsed data structures (not raw JSON strings)

### Phase 2: Orchestrator Integration (2-3 days)

**Goal**: Replace GitHub API work selection with beads queries in `/workflows:orchestrator`.

**Tasks:**
1. Extend `ADWState` schema in `state.py` with `beads_issue_id` and `beads_sync` fields
2. Update `.claude/commands/workflows/orchestrator.md` Phase 1 (Issue Validation):
   - Add beads work selection before GitHub API query
   - Query `mcp__plugin_beads_beads__ready` filtered by priority/assignee
   - Extract issue metadata from beads response
   - Fallback to GitHub API if beads unavailable
3. Add atomic "claim work" operation:
   - After worktree creation, call `bd update <issue_id> --status in_progress`
   - Store beads issue ID in orchestrator state
4. Update checkpoint saves to include beads status updates:
   - Plan complete → `bd update <issue_id> --notes "Plan: <plan_file>"`
   - Build complete → `bd update <issue_id> --notes "PR: <pr_url>"`
   - Review complete → `bd close <issue_id> --reason "Completed"`
5. Integration tests for orchestrator beads flow (8 test cases):
   - Work selection from beads (ready list)
   - Atomic claim operation (in_progress status)
   - Checkpoint updates sync to beads
   - Fallback to GitHub API when beads unavailable

**Acceptance Criteria:**
- Orchestrator queries beads for work selection before GitHub API
- Atomic "claim work" prevents concurrent agent conflicts
- Checkpoint recovery restores beads state correctly
- Integration tests verify work selection logic
- No regressions in existing orchestrator end-to-end tests

### Phase 3: Prioritization Integration (1-2 days)

**Goal**: Replace spec file parsing with beads dependency queries in `/issues:prioritize`.

**Tasks:**
1. Update `.claude/commands/issues/prioritize.md`:
   - Replace `gh issue list` with `mcp__plugin_beads_beads__list --status open`
   - Replace spec file parsing with `mcp__plugin_beads_beads__show <issue_id>` for dependency trees
   - Build dependency graph from beads relationships (no filesystem traversal)
   - Identify high-leverage issues (blocking multiple downstream tasks via `dependents` field)
2. Update `workflow_ops.py` with `build_dependency_graph_from_beads()` helper
3. Integration tests for prioritization (5 test cases):
   - Dependency graph built correctly from beads
   - High-leverage issues identified (blocking multiple downstream)
   - Unblocked issues sorted by priority + downstream impact
   - Fallback to GitHub API when beads unavailable
   - Complex dependency chains (3+ levels) resolved correctly

**Acceptance Criteria:**
- `/issues:prioritize` queries beads instead of GitHub API
- Dependency graph includes all relationship types (blocks, depends-on, related-to)
- High-leverage issues sorted by `dependents` count
- Output matches existing prioritization report format
- Integration tests verify graph building with complex dependencies

### Phase 4: Agent Discovery Integration (2 days)

**Goal**: Enable ADW agents to create discovered work in beads with automatic relationship tracking.

**Tasks:**
1. Update agent prompts (`.claude/commands/workflows/*.md`):
   - Add beads workflow section: "Creating Follow-Up Work"
   - Document `bd create` usage for discovered issues
   - Document `bd dep` usage for relationship tracking
2. Add discovered issue creation helper in `workflow_ops.py`:
   - `create_discovered_issue(title, description, parent_issue_id)` → calls `bd create` + `bd dep`
   - Automatically adds `discovered-from` dependency relationship
   - Returns beads issue ID for tracking
3. Update PR templates (`.github/pull_request_template.md`):
   - Add "## Follow-Up Work" section for discovered issues
   - Include beads issue IDs for traceability
4. Integration tests for agent discovery (4 test cases):
   - Agent creates child issue via beads
   - `discovered-from` relationship added automatically
   - Concurrent agents create issues without conflicts
   - PR template includes discovered issue IDs

**Acceptance Criteria:**
- Agents create issues via `bd create` instead of manual tracking
- `discovered-from` relationships added automatically
- Integration tests verify concurrent issue creation (no race conditions)
- PR templates include "Follow-Up Work" section with beads IDs

## Step by Step Tasks

### Setup and Preparation
1. Verify beads Phase 1 (issue #301) is merged and functional
2. Confirm beads MCP tools available: `bd list --status open`
3. Create feature branch: `git checkout -b feat-303-beads-adw-integration develop`
4. Initialize test database for beads integration tests

### Implementation Order (Critical Path)
1. **Create beads operation helpers** (`beads_ops.py`)
   - Essential for all downstream integrations
   - Unit test each helper before proceeding
2. **Extend state schema** (`state.py`, `data_types.py`)
   - Add beads fields to `ADWState`
   - Add migration logic for existing state files
3. **Integrate orchestrator work selection** (`orchestrator.md`, phase scripts)
   - Query beads for ready issues
   - Atomic claim operation
   - Checkpoint updates
4. **Integrate prioritization** (`prioritize.md`, `workflow_ops.py`)
   - Replace spec file parsing
   - Build dependency graph from beads
5. **Enable agent discovery** (agent prompts, `workflow_ops.py`)
   - Create discovered issues
   - Automatic relationship tracking
6. **Comprehensive testing** (`test_beads_integration.py`)
   - 15+ integration tests covering all workflows
   - Concurrency tests (multiple agents)
   - Fallback tests (beads unavailable)

### Validation and Finalization
1. Run full validation suite:
   - `uv run pytest adws/adw_tests/test_beads_integration.py -v`
   - `uv run pytest adws/adw_tests/test_orchestrator_integration.py -v`
   - `cd automation && python3 -m py_compile adws/adw_modules/*.py`
2. Performance benchmarking:
   - Measure GitHub API work selection latency (10 iterations)
   - Measure beads work selection latency (10 iterations)
   - Document improvement percentage (target: ≥50%)
3. ADW success rate validation:
   - Run 5 orchestrator workflows with beads work selection
   - Compare success rate to baseline (last 10 GitHub API workflows)
   - Document any regressions and root cause
4. Update documentation:
   - Add beads integration section to `automation/adws/README.md`
   - Create developer guide: `.claude/commands/docs/beads-adw-integration.md`
5. Commit and push:
   - `git add -A`
   - `git commit -m "feat: integrate beads with ADW workflows for dependency-aware work selection (#303)"`
   - `git push -u origin feat-303-beads-adw-integration`

## Risks & Mitigations

### Risk 1: ADW Success Rate Regression
**Impact**: Beads migration breaks existing ADW workflows, reducing success rate below 80%

**Mitigation**:
- Comprehensive integration tests before deployment (15+ test cases)
- Dual-source strategy: Keep GitHub API as fallback during migration
- Gradual rollout via feature flag (`ADW_USE_BEADS=true` environment variable)
- Rollback plan: Revert to GitHub API queries if success rate drops
- Monitor success rate via `analyze_logs.py` after each workflow execution
- Establish baseline metrics: Run 10 workflows with GitHub API, then 10 with beads, compare

### Risk 2: Concurrent Beads Access Race Conditions
**Impact**: Multiple agents updating same issue simultaneously causes data corruption or lock errors

**Mitigation**:
- SQLite provides automatic locking with SERIALIZABLE isolation (beads Phase 1 guarantee)
- Test concurrent operations in integration tests (5+ agents simultaneously)
- Add retry logic for database lock errors (exponential backoff: 100ms, 200ms, 400ms)
- Monitor SQLite lock errors in execution logs via structured logging
- Document lock error recovery in ADW troubleshooting guide

### Risk 3: Beads JSONL Sync Delays
**Impact**: Agents working on stale issue data after `git pull` if JSONL not imported

**Mitigation**:
- Beads auto-imports JSONL if newer than database (Phase 1 feature)
- Add pre-workflow validation: Check JSONL freshness before work selection
- Document manual sync command in orchestrator error messages: `bd import .beads/issues.jsonl`
- Add `bd sync --dry-run` health check to ADW prerequisites
- Fail fast: Error if JSONL timestamp > database timestamp by >1 hour

### Risk 4: Performance Degradation with Large Issue Count
**Impact**: Beads queries slow down with 1000+ issues, negating latency benefits

**Mitigation**:
- Benchmark queries with 100, 500, 1000 issues (Phase 2 deliverable in testing)
- Beads uses indexes for common queries (status, priority, assignee) per Phase 1 spec
- If degradation detected (>100ms), archive closed issues periodically (e.g., after 90 days)
- Add pagination to `bd list` queries (limit 50 issues per query)
- Monitor query latency in ADW metrics dashboard

## Validation Strategy

### Automated Tests (Integration/E2E with Real Beads Database)

Following `/anti-mock` philosophy, all tests use real beads SQLite database:

**Test Suite**: `automation/adws/adw_tests/test_beads_integration.py`

**Test Setup**:
```python
@pytest.fixture
def beads_test_db(tmp_path):
    """Create real beads database for testing (no mocks)."""
    workspace = tmp_path / "test-workspace"
    workspace.mkdir()
    # Initialize beads with test prefix
    subprocess.run(["bd", "init", "--prefix", "test"], cwd=workspace)
    return workspace
```

**Test Cases (15 total)**:

1. **Work Selection Tests** (5 cases):
   - Query ready issues with priority filter (high priority only)
   - Query ready issues with assignee filter (unassigned only)
   - Empty ready list returns fallback to GitHub API
   - Multiple ready issues sorted by priority + downstream impact
   - Blocked issues excluded from ready list (depends-on unresolved)

2. **Atomic Claim Tests** (3 cases):
   - Single agent claims work (status updates to in_progress)
   - Concurrent agents claim different issues (no conflicts)
   - Concurrent agents attempt same issue (SQLite lock prevents corruption)

3. **Dependency Graph Tests** (4 cases):
   - Simple chain: A depends-on B, B depends-on C (3 levels deep)
   - Diamond dependency: A depends-on B+C, B+C depend-on D
   - High-leverage identification: Issue blocks 5 downstream tasks
   - Circular dependency detection: A → B → C → A (error handling)

4. **Agent Discovery Tests** (3 cases):
   - Agent creates child issue with discovered-from relationship
   - Multiple agents create issues concurrently (no ID conflicts)
   - Discovered issue inherits priority from parent (default: medium)

**Failure Injection Tests**:
- Beads MCP unavailable (fallback to GitHub API)
- Beads JSONL out of sync (error message with sync command)
- SQLite database locked (retry with exponential backoff)
- Invalid beads issue ID (error handling with recovery instructions)

**Real-Service Evidence**:
- All tests hit actual beads SQLite database via MCP tools
- No mocks for beads queries or updates
- Concurrent tests use real multiprocessing (not threads)
- Performance benchmarks use real GitHub API + beads for comparison

### Manual Validation Checks

1. **Orchestrator End-to-End**:
   - Run `/orchestrator 303` with beads work selection
   - Verify issue claimed atomically (status: in_progress)
   - Verify checkpoint updates sync to beads (notes field)
   - Verify PR creation updates beads (external_ref field)
   - Verify issue closed after review (status: closed)

2. **Prioritization Validation**:
   - Run `/issues:prioritize` with 20+ open issues in beads
   - Verify dependency graph matches spec file relationships
   - Verify high-leverage issues sorted by dependents count
   - Verify unblocked issues exclude those with open dependencies

3. **Agent Discovery Validation**:
   - Run orchestrator workflow that discovers follow-up work
   - Verify agent creates issue via `bd create`
   - Verify discovered-from relationship in beads
   - Verify PR template includes "Follow-Up Work" section

4. **Performance Benchmarking**:
   - Seed beads with 100 issues (mix of open/closed, various priorities)
   - Run 10 orchestrator work selections with GitHub API (measure latency)
   - Run 10 orchestrator work selections with beads (measure latency)
   - Calculate improvement: `(github_latency - beads_latency) / github_latency * 100`
   - Target: ≥50% improvement

### Release Guardrails

1. **Feature Flag Rollout**:
   - Phase 1: Enable `ADW_USE_BEADS=true` in local development only
   - Phase 2: Enable in staging environment, monitor for 7 days
   - Phase 3: Enable in production with 10% traffic (canary deployment)
   - Phase 4: Enable for 100% traffic after success rate validation

2. **Monitoring**:
   - Add beads query latency to ADW metrics dashboard
   - Add beads sync failures to alerting (Slack notification)
   - Track ADW success rate by data source (beads vs GitHub API)
   - Alert if success rate drops >5% after beads migration

3. **Rollback Plan**:
   - Disable feature flag: `ADW_USE_BEADS=false`
   - Revert orchestrator changes if success rate <75%
   - Document rollback in incident log with root cause analysis
   - Maximum rollback time: 5 minutes (feature flag toggle)

## Validation Commands

**Level 2 (Integration Tests + Type-Check + Lint)**:
```bash
# Run integration tests
uv run pytest adws/adw_tests/test_beads_integration.py -v

# Run orchestrator tests (regression check)
uv run pytest adws/adw_tests/test_orchestrator_integration.py -v

# Type-check automation layer
cd automation && python3 -m py_compile adws/adw_modules/*.py

# Lint automation layer (if configured)
cd automation && uv run ruff check adws/
```

**Domain-Specific Validation**:
```bash
# Beads health check
bd list --status open

# Beads MCP tool availability
claude --mcp plugin:beads:beads__list --args '{"workspace_root": "."}'

# Performance benchmark (manual)
time uv run adws/scripts/benchmark_work_selection.py --source github --iterations 10
time uv run adws/scripts/benchmark_work_selection.py --source beads --iterations 10

# ADW success rate analysis
uv run adws/scripts/analyze_logs.py --format json --hours 48
```

## Commit Message Validation

All commits for this feature must follow Conventional Commits format:

**Valid Types**: feat, fix, chore, docs, test, refactor

**Valid Scopes**: automation, workflows, beads, adw, tests

**Subject Guidelines**:
- Use direct statements, not meta-commentary
- Avoid: "based on the plan", "this commit", "i can see", "looking at"
- Good: "feat(beads): integrate work selection with orchestrator"
- Bad: "Based on the plan, this commit integrates beads"

**Example Commits**:
```
feat(beads): add MCP tool wrappers for work selection
feat(workflows): integrate beads queries in orchestrator Phase 1
test(beads): add integration tests for concurrent claim operations
docs(automation): document beads workflow patterns in README
```

## Report

- Created feature plan for beads integration Phase 2 (ADW workflow integration)
- Plan covers 4 phases: beads helpers, orchestrator integration, prioritization integration, agent discovery
- Key decisions: dual-source strategy with GitHub API fallback, atomic claim operations via status updates, MCP tool invocation via existing patterns
- Risks: ADW success rate regression (mitigated via comprehensive testing + feature flag), concurrent access race conditions (mitigated via SQLite locking + retry logic), JSONL sync delays (mitigated via pre-workflow validation)
- Validation: 15+ integration tests with real beads database (anti-mock philosophy), performance benchmarks target 50% latency reduction, ADW success rate monitoring ≥80%
- Implementation order prioritizes beads operation helpers first (critical path), then orchestrator, then prioritization, finally agent discovery
