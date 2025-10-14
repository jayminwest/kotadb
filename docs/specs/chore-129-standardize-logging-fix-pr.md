# Chore Plan: Standardize ADW Phase Logging and Fix Premature PR Creation

## Context

The automation/adws/adw_phases logging needs cleanup and standardization to ensure workflow visibility. Currently, PRs are being opened prematurely after the plan phase with misleading titles that reference planning artifacts ("add plan") instead of implementation work. The desired flow is: plan phase commits and pushes (no PR), build phase implements and creates PR with implementation-focused title.

**Constraints:**
- Must maintain backward compatibility with existing ADW state files
- Must not break webhook triggers, cron triggers, or home server integration
- Logging changes should not significantly increase log volume
- PR creation timing change must be transparent to CI/CD infrastructure
- Must preserve worktree isolation and concurrent workflow support

## Relevant Files

- `automation/adws/adw_phases/adw_plan.py` — Plan phase currently creates PR prematurely (lines 296-310)
- `automation/adws/adw_phases/adw_build.py` — Build phase currently "updates" PR but should create it (lines 217-229)
- `automation/adws/adw_modules/workflow_ops.py` — Shared workflow utilities including `create_pull_request()` function
- `automation/adws/adw_modules/state.py` — ADW state management, needs `pr_created` flag tracking
- `automation/adws/adw_phases/adw_test.py` — May have logging inconsistencies
- `automation/adws/adw_phases/adw_review.py` — May have logging inconsistencies
- `automation/adws/adw_phases/adw_document.py` — May have logging inconsistencies
- `automation/adws/adw_phases/adw_patch.py` — May have logging inconsistencies
- `automation/adws/adw_sdlc.py` — Multi-phase orchestrator, may need adjustment for PR timing

### New Files

None. All changes are modifications to existing files.

## Work Items

### Preparation
1. Review current logging patterns across all phase scripts (plan, build, test, review, document, patch)
2. Document current PR creation logic in adw_plan.py and adw_build.py
3. Identify inconsistent log levels and message formats
4. Review ADW state management and identify where to add `pr_created` flag

### Execution
1. **Fix PR creation timing:**
   - Remove PR creation from `adw_plan.py` (lines 296-310)
   - Keep push operation in `adw_plan.py` (lines 283-294)
   - Add log message in `adw_plan.py`: "Branch pushed (PR will be created after implementation)"
   - Update `adw_build.py` to create PR instead of updating (lines 217-229)
   - Ensure PR title follows implementation-focused format per issue #115

2. **Add state tracking for PR creation:**
   - Add `pr_created: Optional[bool]` field to `ADWState` dataclass in `automation/adws/adw_modules/state.py`
   - Update `adw_plan.py` to set `pr_created=False` after push
   - Update `adw_build.py` to check `pr_created` state and create PR appropriately
   - Update `adw_build.py` to set `pr_created=True` after successful PR creation

3. **Standardize logging across all phases:**
   - Define standard log message format: `logger.info(f"Phase: {phase_name} | Status: {status} | Context: {context}")`
   - Update all phase scripts to use consistent formats for:
     - Phase start messages
     - Phase completion messages
     - Progress milestones
     - Error conditions
   - Ensure GitHub issue comments match log level importance (INFO for milestones, DEBUG for details)
   - Add phase transition markers where appropriate

4. **Update orchestrator:**
   - Review `adw_sdlc.py` for any hardcoded expectations about PR creation timing
   - Ensure multi-phase workflows handle the new PR creation timing
   - Verify that PR creation only happens once (in build phase)

### Follow-up
1. Run full SDLC workflow on test issue to verify PR created at correct time
2. Verify logs show clear phase progression with standardized messages
3. Check PR title reflects implementation work (not planning)
4. Monitor existing workflows to ensure no regressions
5. Verify worktree cleanup still functions correctly with new timing

## Step by Step Tasks

### Phase 1: Analyze Current State
- Review `adw_plan.py` logging statements and PR creation logic (lines 73-344)
- Review `adw_build.py` logging statements and PR update logic (lines 74-240)
- Review `adw_test.py`, `adw_review.py`, `adw_document.py`, `adw_patch.py` for logging patterns
- Document inconsistencies in log levels, formats, and GitHub comment patterns
- Identify all locations where PR creation/update occurs

### Phase 2: Update State Management
- Add `pr_created: Optional[bool] = None` field to `ADWState` dataclass in `automation/adws/adw_modules/state.py` (after line 48)
- Update `ADWState.to_dict()` to include `pr_created` field (after line 69)
- Update `ADWState.load()` to extract `pr_created` from JSON (after line 92)
- Verify state serialization/deserialization works with new field

### Phase 3: Fix adw_plan.py PR Creation Timing
- Remove PR creation logic from `adw_plan.py` (delete lines 296-310)
- Replace removed block with state update: `state.update(pr_created=False)` and save
- Add log message: `logger.info("Branch pushed successfully. PR will be created after implementation.")`
- Add GitHub comment: `make_issue_comment(issue_number, format_issue_message(adw_id, "ops", "✅ Branch pushed (PR pending implementation)"))`
- Keep worktree cleanup logic as-is (controlled by `ADW_SKIP_PLAN_CLEANUP`)

### Phase 4: Fix adw_build.py PR Creation
- Update `adw_build.py` PR logic (lines 217-229) to check `state.pr_created`
- Replace "update PR" message with "create PR" message
- Ensure PR is created with implementation-focused title (follow issue #115 guidance)
- After successful PR creation, update state: `state.update(pr_created=True)` and save
- Add log message: `logger.info(f"Pull request created: {pr_url}")`
- Verify PR creation only happens when `state.pr_created` is False or None

### Phase 5: Standardize Logging Formats
- Define standard log format patterns for each phase:
  - Start: `logger.info(f"Phase {phase_name} | Status: starting | Issue: #{issue_number}")`
  - Progress: `logger.info(f"Phase {phase_name} | Status: {milestone} | Context: {details}")`
  - Completion: `logger.info(f"Phase {phase_name} | Status: completed | Result: {summary}")`
- Update `adw_plan.py` logging to use standard format
- Update `adw_build.py` logging to use standard format
- Update `adw_test.py` logging to use standard format
- Update `adw_review.py` logging to use standard format
- Update `adw_document.py` logging to use standard format
- Update `adw_patch.py` logging to use standard format
- Ensure GitHub issue comments reflect appropriate log levels (INFO → comments, DEBUG → logs only)

### Phase 6: Update Orchestrator
- Review `adw_sdlc.py` for PR creation expectations
- Verify multi-phase workflows (adw_plan_build, adw_plan_build_test, etc.) handle new timing
- Ensure no duplicate PR creation logic exists in orchestrator
- Verify worktree cleanup happens at correct time (after PR creation in build phase)

### Phase 7: Validation and Testing
- Run type checking: `cd automation && python -m mypy adws/`
- Run Python syntax check: `python -m py_compile adws/adw_phases/*.py adws/adw_modules/*.py`
- Run pytest suite: `cd automation && pytest adws/adw_tests/ -v`
- Manual test: Run full SDLC on test issue and verify PR created after build phase
- Verify logs show clear phase progression with standardized messages
- Check PR title format: `gh pr view <pr-number> --json title`
- Verify no PR during plan phase: `grep "Pull request created" automation/logs/*/adw_plan/execution.log`
- Verify PR created during build phase: `grep "Pull request created" automation/logs/*/adw_build/execution.log`
- Re-run validation commands to confirm no regressions
- Push branch: `git push -u origin chore-129-c04d4883`
- Create PR using `/pull_request chore-129-c04d4883 <issue_json> docs/specs/chore-129-standardize-logging-fix-pr.md <adw_id>`

## Risks

**Risk:** Breaking existing workflows that expect PR to exist after plan phase
**Mitigation:** Add `pr_created` state flag to track PR creation explicitly. Build phase checks flag and creates PR if not already created. Backward compatible (None/False treated same).

**Risk:** Multi-phase orchestrator may create duplicate PRs
**Mitigation:** State flag prevents duplicates. Build phase checks `pr_created` before creating. Log warnings if PR already exists.

**Risk:** Logging format changes increase log volume significantly
**Mitigation:** Use structured format with consistent length. Replace verbose messages with concise standardized patterns. Monitor log file sizes during testing.

**Risk:** PR title generation in build phase may differ from plan phase approach
**Mitigation:** Both phases use same `create_pull_request()` function from `workflow_ops.py`. Function already follows issue #115 guidance. No behavior change, just timing change.

**Risk:** Worktree cleanup may fail if PR not created
**Mitigation:** Build phase cleanup already conditional on successful operations. Plan phase cleanup controlled by `ADW_SKIP_PLAN_CLEANUP` (default: skip during multi-phase workflows). No change needed.

## Validation Commands

- `cd automation && python -m mypy adws/adw_modules/state.py adws/adw_phases/adw_plan.py adws/adw_phases/adw_build.py`
- `cd automation && python -m py_compile adws/adw_phases/*.py adws/adw_modules/*.py`
- `cd automation && pytest adws/adw_tests/ -v`
- Manual workflow test: `uv run automation/adws/adw_sdlc.py <test-issue-number>`
- Log inspection: `cat automation/logs/kota-db-ts/local/{adw_id}/*/execution.log | grep "Pull request"`
- PR title check: `gh pr view <pr-number> --json title,body`
- State validation: `cat automation/agents/{adw_id}/adw_state.json | jq '.pr_created'`

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: standardize ADW phase logging` not `Based on the plan, the commit should standardize ADW phase logging`

## Deliverables

- Modified `automation/adws/adw_modules/state.py` with `pr_created` field
- Modified `automation/adws/adw_phases/adw_plan.py` with PR creation removed and push-only logic
- Modified `automation/adws/adw_phases/adw_build.py` with PR creation (not update) logic
- Standardized logging formats across all phase scripts (plan, build, test, review, document, patch)
- Updated `automation/adws/adw_sdlc.py` orchestrator if needed for timing adjustments
- Verified PR titles reflect implementation work (not planning artifacts)
- Verified logs show clear phase progression with consistent formats
