# Feature Plan: Hybrid ADW Resilience Architecture with Retry Logic and MCP Orchestration

## Metadata
- **Issue**: #148
- **Title**: feat: implement hybrid ADW resilience architecture with retry logic and MCP orchestration
- **Labels**: component:ci-cd, component:observability, priority:high, effort:large, status:needs-investigation
- **Target Completion Rate**: 80%+ (from current ~50-60%)
- **Branch**: `feat/148-hybrid-adw-resilience-retry-mcp`

## Issue Relationships

- **Depends On**: #145 (ADW MCP server orchestration) - Requires MCP server infrastructure for orchestration layer
- **Related To**: #136 (simplify ADW flow) - Builds on simplified 3-phase architecture
- **Related To**: #130 (agent-friendly resilience patterns) - Implements retry logic patterns
- **Related To**: #105 (log analysis) - Improves observability for success rate tracking

## Overview

### Problem
ADW workflows fail to complete due to transient failures (20-30% of failures could be auto-recovered), non-resumable phases requiring full re-execution, state fragility from 15+ field state files, and limited orchestration without dynamic agent coordination.

Current state:
- No automatic retry logic for transient failures (network issues, API errors)
- Phase failures abort entire workflows without recovery mechanisms
- No checkpoint system for resuming partially-completed phases
- Complex state management prone to incomplete transitions
- Sequential orchestration without dynamic agent coordination
- Verbose diagnostic logging accumulated from debugging past issues

### Desired Outcome
- **80%+ completion rate** for ADW workflows (from current ~50-60%)
- **Automatic retry** for transient errors at agent execution and phase transition levels
- **Checkpoint-based resume** capability for failed phases
- **MCP server as orchestrator** leveraging existing infrastructure
- **Streamlined observability** with structured events instead of verbose logs
- **Dynamic multi-agent coordination** for complex 5-10 agent workflows

### Non-Goals
- Replace existing phase structure (keep plan/build/review separation)
- Interactive agent sessions for ADW (async/non-interactive priority)
- Real-time streaming progress (batch-based is sufficient)
- Multi-repository ADW support (single repo for now)
- ADW prioritization/scheduling (FIFO queue is fine)
- Cost optimization beyond checkpoint-based resume (no model switching)

## Technical Approach

### Architecture Notes

**Two-Tier State Model**
- **Tier 1 (Core State)**: MCP server maintains minimal state (adw_id, phase, status) for fast queries
- **Tier 2 (Artifacts)**: Filesystem stores rich execution history (raw outputs, checkpoints, logs)
- Rationale: Balance between queryability and resilience (file corruption doesn't break orchestration)

**Retry Logic Layering**
- **Level 1**: Agent execution retries (3 attempts with exponential backoff: 1s, 3s, 5s)
- **Level 2**: Phase transition retries (2 attempts for retryable failures)
- Rationale: Transient errors are common (API rate limits, network blips), auto-recovery improves completion rate

**Checkpoint Granularity**
- Checkpoints at logical breakpoints within phases (e.g., after plan creation, after file implementation)
- Not after every agent call (too granular, storage overhead)
- Rationale: Balance resume capability with simplicity

**MCP Server as Orchestrator**
- Leverage existing `automation/adws/mcp_server` infrastructure
- MCP server becomes source of truth for workflow state
- Enables concurrent ADW execution and real-time status queries
- Rationale: Already built for stateful operations, TypeScript type safety, async-first

### Key Modules to Touch

**Python Modules (Automation Layer)**:
- `automation/adws/adw_modules/agent.py` - Add RetryCode enum and retry wrapper function
- `automation/adws/adw_modules/workflow_ops.py` - Add checkpoint save/load functions
- `automation/adws/adw_modules/data_types.py` - Extend with retry_code field and checkpoint types
- `automation/adws/adw_phases/adw_plan.py` - Add checkpoints and emit events
- `automation/adws/adw_phases/adw_build.py` - Add checkpoints and emit events
- `automation/adws/adw_phases/adw_review.py` - Add checkpoints and emit events
- `automation/adws/adw_sdlc.py` - Migrate to MCP orchestration

**New Python Modules**:
- `automation/adws/adw_modules/events.py` - Structured event system (WorkflowEvent, EventType, emit_event)

**TypeScript Modules (MCP Server)**:
- `automation/adws/mcp_server/src/tools/orchestrate_adw.ts` - MCP orchestration tool
- `automation/adws/mcp_server/src/tools/query_adw_events.ts` - Event query tool
- `automation/adws/mcp_server/src/tools/query_adw_status.ts` - Status query tool
- `automation/adws/mcp_server/src/tools/spawn_agent.ts` - Dynamic agent spawning (Phase 5)
- `automation/adws/mcp_server/src/lib/agent_coordinator.ts` - SDK-based coordination (Phase 5)
- `automation/adws/mcp_server/src/db/adw_state.ts` - State storage interface

**Test Files**:
- `automation/adws/adw_tests/test_retry_logic.py` - Retry behavior tests
- `automation/adws/adw_tests/test_checkpoints.py` - Checkpoint save/load tests
- `automation/adws/adw_tests/test_events.py` - Event emission tests

### Data/API Impacts

**State Schema Changes** (backward compatible):
- Add optional `retry_code` field to `AgentPromptResponse` in `data_types.py`
- Add optional `checkpoints` field to ADW state JSON (map of phase -> checkpoint data)
- Add optional `event_log` array to track workflow events

**New MCP Tools**:
- `orchestrate_adw` - Orchestrate full ADW workflow with retry logic
- `query_adw_events` - Query workflow event log
- `query_adw_status` - Get current phase and progress
- `spawn_agent` (Phase 5) - Spawn specialized agent dynamically

**MCP Server Database Schema** (SQLite):
```typescript
interface ADWCoreState {
  adw_id: string;
  issue_number: number;
  current_phase: 'plan' | 'build' | 'review';
  phase_status: Map<string, 'pending' | 'in_progress' | 'completed' | 'failed'>;
  created_at: string;
  updated_at: string;
}

interface WorkflowEvent {
  event_id: string;
  adw_id: string;
  timestamp: string;
  event_type: 'phase_start' | 'phase_complete' | 'error' | 'retry' | 'checkpoint';
  phase?: string;
  message: string;
  metadata?: Record<string, unknown>;
}
```

**Checkpoint File Format** (`agents/{adw_id}/{phase}/checkpoints.json`):
```json
{
  "phase": "build",
  "checkpoints": [
    {
      "timestamp": "2025-10-17T12:00:00Z",
      "step": "implementation",
      "files_completed": ["src/api/routes.ts", "src/db/queries.ts"],
      "next_action": "commit_changes"
    }
  ]
}
```

## Relevant Files

### Existing Files
- `automation/adws/adw_modules/agent.py` - Agent execution wrapper (needs retry logic)
- `automation/adws/adw_modules/workflow_ops.py` - Workflow utility functions (needs checkpoint functions)
- `automation/adws/adw_modules/data_types.py` - Type definitions (needs retry_code, checkpoint types)
- `automation/adws/adw_phases/adw_plan.py` - Plan phase script (needs checkpoints, events)
- `automation/adws/adw_phases/adw_build.py` - Build phase script (needs checkpoints, events)
- `automation/adws/adw_phases/adw_review.py` - Review phase script (needs checkpoints, events)
- `automation/adws/adw_sdlc.py` - SDLC orchestrator (migrate to MCP)
- `automation/adws/README.md` - Documentation (update with new patterns)
- `CLAUDE.md` - Project architecture (update ADW section)

### New Files
- `automation/adws/adw_modules/events.py` - Structured event system
- `automation/adws/mcp_server/src/tools/orchestrate_adw.ts` - MCP orchestration tool
- `automation/adws/mcp_server/src/tools/query_adw_events.ts` - Event query tool
- `automation/adws/mcp_server/src/tools/query_adw_status.ts` - Status query tool
- `automation/adws/mcp_server/src/db/adw_state.ts` - State storage
- `automation/adws/adw_tests/test_retry_logic.py` - Retry tests
- `automation/adws/adw_tests/test_checkpoints.py` - Checkpoint tests
- `automation/adws/adw_tests/test_events.py` - Event tests

## Task Breakdown

### Phase 1: Foundational Resilience (Retry Logic) - High Priority, 2-3 hours
**Rationale**: Highest ROI, smallest effort, no breaking changes

- Add `RetryCode` enum to `adw_modules/agent.py` (CLAUDE_CODE_ERROR, TIMEOUT_ERROR, EXECUTION_ERROR, ERROR_DURING_EXECUTION, NONE)
- Implement `prompt_claude_code_with_retry()` with configurable max_retries (default: 3) and retry_delays (default: [1, 3, 5])
- Add `retry_code` field to `AgentPromptResponse` in `data_types.py`
- Update `prompt_claude_code()` to detect error types and set retry_code
- Create `adw_tests/test_retry_logic.py` with retry behavior tests
- Update `README.md` to document retry logic behavior
- Test with forced transient failure scenarios

### Phase 2: Resume Capability (Checkpoints) - Medium Priority, 4-6 hours
**Rationale**: Enables cost-effective retries, reduces waste from re-running successful steps

- Create checkpoint data structures in `data_types.py` (CheckpointData, CheckpointFile)
- Implement `save_checkpoint(adw_id, phase, data)` in `workflow_ops.py`
- Implement `load_checkpoint(adw_id, phase)` in `workflow_ops.py`
- Add checkpoint saving to `adw_plan.py` at logical breakpoints (after plan creation)
- Add checkpoint saving to `adw_build.py` at logical breakpoints (after implementation, before commit)
- Add checkpoint saving to `adw_review.py` at logical breakpoints (after review completion)
- Add `--resume` flag to phase scripts to resume from last checkpoint
- Create `adw_tests/test_checkpoints.py` with save/load tests
- Test resume after simulated phase failures
- Update `README.md` with checkpoint usage examples

### Phase 3: Centralized Orchestration (MCP Server) - High Priority, 8-10 hours
**Rationale**: Largest architectural shift, enables all future enhancements

- Create `mcp_server/src/db/adw_state.ts` with ADWCoreState interface and SQLite storage
- Implement `mcp_server/src/tools/orchestrate_adw.ts` MCP tool
- Implement `mcp_server/src/tools/query_adw_status.ts` MCP tool
- Update `adw_sdlc.py` to invoke MCP tool instead of direct phase execution
- Migrate state tracking from filesystem to MCP server database
- Add concurrent ADW execution tests
- Update `README.md` with MCP orchestration usage
- Test backward compatibility with direct phase execution

### Phase 4: Clean Observability (Structured Events) - Medium Priority, 4-6 hours
**Rationale**: Quality-of-life improvement, reduces noise, improves debuggability

- Create `adw_modules/events.py` with `WorkflowEvent` dataclass and `EventType` enum
- Implement `emit_event()` function that logs to file + sends to MCP server
- Create `mcp_server/src/tools/query_adw_events.ts` MCP tool
- Add `mcp_server/src/db/events.ts` for event storage
- Replace verbose diagnostic logging in `adw_plan.py` with structured events
- Replace verbose diagnostic logging in `adw_build.py` with structured events
- Replace verbose diagnostic logging in `adw_review.py` with structured events
- Reduce GitHub issue comments to milestones only (PHASE_COMPLETE, ERROR)
- Create `adw_tests/test_events.py` with event emission tests
- Update `README.md` with event query examples

### Phase 5: Advanced Coordination (Multi-Agent) - Future, 10-12 hours
**Rationale**: Future capability, not blocking for 80% completion rate

- Add `spawn_agent` MCP tool for dynamic agent creation
- Implement agent role specialization (implementer, reviewer, debugger, tester)
- Create `mcp_server/src/lib/agent_coordinator.ts` for SDK-based coordination
- Integrate Claude Code SDK in MCP server
- Test dynamic agent spawning based on workflow state
- Enable parallel agent execution for independent tasks
- Document multi-agent patterns in `README.md`

### Cross-Phase Requirements
- All changes maintain backward compatibility with existing ADW runs
- Test suite passes: `cd automation && uv run pytest adws/adw_tests/ -v`
- Type checking passes: `cd automation && uv run mypy adws/`
- Documentation updated: `automation/adws/README.md` with new patterns
- Observability: All phases emit structured events
- No breaking changes to `adw_state.json` schema (extend, don't replace)

## Step by Step Tasks

### Foundation Setup
- Create feature branch `feat/148-hybrid-adw-resilience-retry-mcp` from `develop`
- Review TEMP_REFERENCE implementation for retry logic patterns
- Set up testing fixtures for retry and checkpoint scenarios

### Phase 1 Implementation (Retry Logic)
- Add `RetryCode` enum to `automation/adws/adw_modules/agent.py`
- Add `retry_code` field to `AgentPromptResponse` in `automation/adws/adw_modules/data_types.py`
- Implement `prompt_claude_code_with_retry()` in `automation/adws/adw_modules/agent.py`
- Update `prompt_claude_code()` to detect error types and set retry_code appropriately
- Update all `execute_template()` calls in phase scripts to use retry wrapper
- Create `automation/adws/adw_tests/test_retry_logic.py` with unit tests
- Test with forced transient failure: `FORCE_CLAUDE_ERROR=true uv run adws/adw_phases/adw_plan.py 123`
- Verify 3 retry attempts with exponential backoff (1s, 3s, 5s delays)
- Update `automation/adws/README.md` with retry logic documentation

### Phase 2 Implementation (Checkpoints)
- Add checkpoint data structures to `automation/adws/adw_modules/data_types.py`
- Implement `save_checkpoint()` in `automation/adws/adw_modules/workflow_ops.py`
- Implement `load_checkpoint()` in `automation/adws/adw_modules/workflow_ops.py`
- Add checkpoint saving to `automation/adws/adw_phases/adw_plan.py` after plan creation
- Add checkpoint saving to `automation/adws/adw_phases/adw_build.py` after implementation, before commit
- Add checkpoint saving to `automation/adws/adw_phases/adw_review.py` after review completion
- Add `--resume` flag parsing to each phase script
- Implement resume logic to skip completed steps based on checkpoint
- Create `automation/adws/adw_tests/test_checkpoints.py` with save/load tests
- Test simulated failure: `SIMULATE_FAILURE_AT_STEP=implementation uv run adws/adw_phases/adw_build.py 125`
- Test resume: `uv run adws/adw_phases/adw_build.py 125 --resume`
- Verify skipped completed steps and resumed from failure point
- Update `automation/adws/README.md` with checkpoint usage examples

### Phase 3 Implementation (MCP Orchestration)
- Create `automation/adws/mcp_server/src/db/adw_state.ts` with ADWCoreState interface
- Implement SQLite storage functions in `adw_state.ts` (create, read, update)
- Create `automation/adws/mcp_server/src/tools/orchestrate_adw.ts` MCP tool
- Implement phase execution logic with retry handling in `orchestrate_adw.ts`
- Create `automation/adws/mcp_server/src/tools/query_adw_status.ts` MCP tool
- Update `automation/adws/adw_sdlc.py` to invoke MCP orchestration tool
- Add fallback mode to run phases directly if MCP server unavailable
- Create integration tests for MCP orchestration
- Test concurrent ADW execution: multiple issues in parallel
- Verify state isolation and no contention
- Update `automation/adws/README.md` with MCP orchestration usage
- Update `CLAUDE.md` with MCP architecture diagram

### Phase 4 Implementation (Structured Events)
- Create `automation/adws/adw_modules/events.py` with `WorkflowEvent` and `EventType`
- Implement `emit_event()` function with file logging and MCP server integration
- Create `automation/adws/mcp_server/src/db/events.ts` for event storage
- Create `automation/adws/mcp_server/src/tools/query_adw_events.ts` MCP tool
- Replace verbose logging in `automation/adws/adw_phases/adw_plan.py` with structured events
- Replace verbose logging in `automation/adws/adw_phases/adw_build.py` with structured events
- Replace verbose logging in `automation/adws/adw_phases/adw_review.py` with structured events
- Update GitHub comment logic to only post milestones (PHASE_COMPLETE, ERROR)
- Create `automation/adws/adw_tests/test_events.py` with event emission tests
- Run workflow and verify event log: `curl -X POST http://localhost:3001/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_adw_events","arguments":{"adw_id":"<adw_id>"}}}'`
- Verify GitHub comment count reduced to 3-4 key milestones
- Update `automation/adws/README.md` with event query examples

### Final Validation and Documentation
- Run full test suite: `cd automation && uv run pytest adws/adw_tests/ -v`
- Run type checking: `cd automation && uv run mypy adws/`
- Run Python syntax check: `cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py`
- Test full SDLC workflow with retry/checkpoint/events: `uv run adws/adw_sdlc.py <test_issue_number>`
- Verify success rate improvement (target: 80%+)
- Update `automation/adws/README.md` with complete architecture documentation
- Update `CLAUDE.md` with ADW resilience architecture
- Update `.claude/commands/docs/conditional_docs.md` if new documentation areas added
- Commit all changes with conventional commit message
- Push branch: `git push -u origin feat/148-hybrid-adw-resilience-retry-mcp`

## Risks & Mitigations

### Risk 1: Breaking Changes to Existing Workflows
**Impact**: High - Could break all running ADW workflows
**Mitigation**:
- All phases are additive (retry is opt-in via wrapper function)
- Checkpoint files are optional (phases work without them)
- MCP orchestration runs alongside direct execution during transition
- Extensive testing before rollout
- Backward compatibility tests in `adw_tests/`

### Risk 2: MCP Server as Single Point of Failure
**Impact**: High - Workflow execution halts if MCP server is down
**Mitigation**:
- Phases can still run directly via `uv run` (fallback mode)
- MCP server state is backed by SQLite (durable)
- Health checks and auto-restart in production
- Graceful degradation to direct execution

### Risk 3: Increased Complexity
**Impact**: Medium - Harder to debug and maintain
**Mitigation**:
- Incremental rollout (Phase 1-2 before Phase 3)
- Clear documentation of new patterns
- Simplification in observability (Phase 4) offsets orchestration complexity
- Comprehensive testing at each phase

### Risk 4: Checkpoint File Corruption
**Impact**: Medium - Resume fails, must re-run phase
**Mitigation**:
- Atomic writes with temp files + rename
- JSON schema validation on load
- Fallback to full phase execution if checkpoint invalid
- Checkpoint files stored separately from state files

### Risk 5: Retry Logic Masking Real Issues
**Impact**: Medium - Genuine bugs get retried instead of fixed
**Mitigation**:
- Distinguish transient vs. permanent failures via RetryCode
- Log all retry attempts for visibility
- Event log tracks retry patterns for analysis
- Max retry limit prevents infinite loops

## Validation Strategy

### Automated Tests
**Integration Tests** (hitting real filesystem and subprocess):
- `adw_tests/test_retry_logic.py` - Retry behavior with simulated failures
- `adw_tests/test_checkpoints.py` - Checkpoint save/load/resume
- `adw_tests/test_events.py` - Event emission and querying
- `adw_tests/test_mcp_orchestration.py` - MCP tool execution

**Unit Tests**:
- RetryCode enum values
- Checkpoint data structure validation
- Event format validation
- State schema compatibility

### Manual Checks
**Phase 1 Validation**:
```bash
# Force transient failure and verify retries
cd automation && FORCE_CLAUDE_ERROR=true uv run adws/adw_phases/adw_plan.py 123
# Expected: 3 retry attempts, eventual failure with clear error message

# Normal execution (no retries)
cd automation && uv run adws/adw_phases/adw_plan.py 124
# Expected: Success on first attempt, no retries logged
```

**Phase 2 Validation**:
```bash
# Simulate mid-phase failure
cd automation && SIMULATE_FAILURE_AT_STEP=implementation uv run adws/adw_phases/adw_build.py 125
# Expected: Checkpoint saved before failure

# Resume from checkpoint
cd automation && uv run adws/adw_phases/adw_build.py 125 --resume
# Expected: Skips completed steps, resumes from failure point
```

**Phase 3 Validation**:
```bash
# Start MCP server
cd automation/adws/mcp_server && bun run src/index.ts &

# Query ADW status via MCP
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_adw_status","arguments":{"adw_id":"test123"}}}'

# Orchestrate ADW via MCP
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"orchestrate_adw","arguments":{"issue_number":"126"}}}'
# Expected: Workflow executes, state queryable in real-time
```

**Phase 4 Validation**:
```bash
# Run workflow with event emission
cd automation && uv run adws/adw_sdlc.py 127

# Query events via MCP
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_adw_events","arguments":{"adw_id":"<adw_id>","event_types":["phase_complete","error"]}}}'

# Check GitHub comments count
gh issue view 127 --json comments --jq '.comments | length'
# Expected: 3-4 comments (was 10+ before), structured event log available
```

### Success Metrics
- **Completion rate**: 80%+ (from current ~50-60%)
- **Transient failure recovery**: 100% of retryable errors auto-recovered within 3 attempts
- **Cost efficiency**: Failed 5-agent run → 3-agent retry (40% cost savings)
- **Observability**: Event queries return results in <100ms
- **Scalability**: 3+ concurrent ADWs without contention
- **GitHub noise reduction**: 10+ comments per run → 3-4 key milestones

### Release Guardrails
- Monitor completion rate daily via `automation/adws/scripts/analyze_logs.py`
- Alert when success rate < 50% (automatic issue comment in CI)
- Rollback plan: Disable retry wrapper and MCP orchestration, revert to direct execution
- Feature flags: `ADW_ENABLE_RETRIES`, `ADW_ENABLE_CHECKPOINTS`, `ADW_USE_MCP_ORCHESTRATION`
- Gradual rollout: Phase 1 → Phase 2 → Phase 3 → Phase 4 (validate at each step)

## Validation Commands

```bash
# Lint check
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py

# Type checking
cd automation && uv run mypy adws/

# Integration tests
cd automation && uv run pytest adws/adw_tests/ -v --tb=short

# Full test suite
cd automation && uv run pytest adws/adw_tests/

# Syntax validation
cd automation && python3 -m py_compile adws/adw_modules/*.py adws/adw_phases/*.py adws/adw_tests/*.py

# End-to-end workflow test
cd automation && uv run adws/adw_sdlc.py <test_issue_number>

# Log analysis (verify success rate improvement)
cd automation && uv run adws/scripts/analyze_logs.py --format json --hours 24
```

## References

### Investigation Sources
- TEMP_REFERENCE_automation/adw_modules/agent.py:326-378 - Retry logic implementation reference
- TEMP_REFERENCE_automation/adw_modules/agent_sdk.py - SDK integration patterns
- TEMP_REFERENCE_automation/adw_chore_implement.py - Inline workflow composition

### Current Implementation
- automation/adws/adw_modules/agent.py - Agent execution (no retry logic)
- automation/adws/adw_sdlc.py - Sequential orchestrator
- automation/adws/adw_phases/ - Phase scripts (plan, build, review)
- automation/adws/README.md:1-372 - ADW architecture overview

### Related Documentation
- #145 - ADW MCP server for agent-orchestrator communication (complementary)
- #86 - Git staging loss issue (solved with defensive logging, would benefit from checkpoints)
- automation/adws/README.md - ADW overview
- CLAUDE.md - Project architecture
- docs/specs/adws-homeserver-integration-architecture.md - Home server integration

### Architecture Patterns
- 3-phase architecture (plan → build → review) from PR #136
- Worktree isolation from feature #65
- MCP server tooling from issue #145
- Log analysis patterns from feature #105
