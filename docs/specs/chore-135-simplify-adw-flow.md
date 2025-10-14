# Chore Plan: Simplify ADW Architecture to 5-Step Flow

## Context

The ADW (AI Developer Workflow) system has achieved a **0% success rate** across 57 runs in the past week due to over-engineering and architectural complexity. The system currently consists of 3,285 lines of code across 13 modules, 38 slash commands, and recursive agent invocation patterns that fail at basic functionality.

**Critical Findings**:
- Agent resolution retry loop crashes immediately (never successfully executed)
- Validation commands execute in wrong directory (can't find `package.json` scripts)
- Test environment provisioning overhead (300-500MB RAM, 27s startup, then crashes)
- Premature PR creation (plan phase creates PRs before implementation)
- 878-line god object (`workflow_ops.py` with 27 interdependent functions)
- 36 stale worktrees for 0 successful runs

**What Works**:
✅ Plan phase (issue classification, plan generation)
✅ Build phase (implementation)
✅ State management
✅ GitHub integration
✅ Git operations

**What Fails**:
❌ Test phase (validation commands fail, agent resolution crashes)
❌ Review phase (never reached)
❌ Document phase (never reached)

**Why Now**: The system is blocking all automated issue workflows. We need to strip back to basics and establish a working foundation before adding complexity.

**Constraints**:
- Must maintain worktree isolation (concurrent execution safety)
- Must preserve state management (ADWState tracking)
- Must keep GitHub integration (issue comments, PR creation)
- Must not break existing slash commands used by phases

**Success Metric**: >80% completion rate for the simplified 5-step flow (Plan → Implement → PR → Review)

## Relevant Files

### Files to Modify
- `automation/adws/adw_phases/adw_plan.py` — Remove premature PR creation logic
- `automation/adws/adw_phases/adw_build.py` — Add PR creation after successful implementation
- `automation/adws/adw_modules/workflow_ops.py` — Fix `run_validation_commands()` directory bug (cwd should be `app/`)
- `automation/adws/adw_modules/orchestrators.py` — Update phase orchestration to skip test/document phases
- `automation/adws/adw_sdlc.py` — Replace with simplified orchestrator

### Files to Delete
- `automation/adws/adw_phases/adw_test.py` — Test phase (defer until basics work)
- `automation/adws/adw_phases/adw_document.py` — Documentation phase (defer)
- `automation/adws/adw_phases/adw_patch.py` — Patch workflow (defer)
- `automation/adws/adw_modules/agent_resolution.py` — Broken resolution (never works, 132 lines)
- `automation/adws/adw_modules/validation.py` — Contains broken `run_validation_with_resolution()` (80 lines)

### New Files
- `automation/adws/adw_simple.py` — New minimal orchestrator (~150 lines) implementing 5-step flow
- `docs/specs/chore-135-simplify-adw-flow.md` — This maintenance plan

## Work Items

### Preparation
1. Create branch `chore/135-simplify-adw-flow` from `develop`
2. Verify current ADW state: check for stale worktrees in `automation/trees/`
3. Document current line counts for complexity reduction metrics
4. Backup `automation/adws/adw_sdlc.py` (current orchestrator) for reference

### Execution
1. **Phase 1: Create `adw_simple.py`** (new minimal orchestrator)
   - Implement 5-step flow: worktree → plan → implement → PR → review
   - Remove test/document phase invocations
   - Keep worktree isolation pattern
   - Maintain state management integration

2. **Phase 2: Fix Directory Bug in `workflow_ops.py`**
   - Update `run_validation_commands()`: change `cwd=cwd or project_root()` to `cwd=(cwd / "app") if cwd else (project_root() / "app")`
   - This fixes validation commands executing in wrong directory

3. **Phase 3: Update Phase Scripts**
   - **`adw_plan.py`**: Remove `create_pull_request()` call (defer PR creation)
   - **`adw_build.py`**: Add `create_pull_request()` call after successful implementation
   - **`adw_review.py`**: Verify it posts comments to existing PR (no changes needed)

4. **Phase 4: Delete Broken Components**
   - Delete `adw_phases/adw_test.py` (130 lines)
   - Delete `adw_phases/adw_document.py` (85 lines)
   - Delete `adw_phases/adw_patch.py` (92 lines)
   - Delete `adw_modules/agent_resolution.py` (132 lines)
   - Delete `adw_modules/validation.py` (80 lines)
   - **Total reduction: ~519 lines of broken code**

5. **Phase 5: Update Orchestration**
   - Modify `adw_modules/orchestrators.py` to skip test/document phases
   - Update phase order: plan → build → review (3 phases instead of 5)
   - Ensure state transitions reflect new flow

6. **Phase 6: Simplify `adw_sdlc.py`**
   - Replace complex orchestration with call to `adw_simple.py` logic
   - Remove recursive agent invocation patterns
   - Reduce from ~400 lines to ~150 lines

### Follow-up
1. Run manual test with real issue to verify end-to-end flow
2. Monitor first 5 production runs for >80% success rate
3. Update `automation/adws/README.md` to document new 5-step flow
4. Create follow-up issues for deferred features (test phase, document phase)
5. Schedule worktree cleanup for stale directories (`automation/trees/`)

## Step by Step Tasks

### Git Setup
- Create branch `chore/135-simplify-adw-flow` from `develop`
- Verify clean working directory

### Phase 1: Create Simplified Orchestrator
- Write `automation/adws/adw_simple.py` with 5-step flow
- Implement `main(issue_number)` function:
  - Create worktree for issue
  - Fetch issue from GitHub
  - Classify issue (bug/feat/chore/docs)
  - Generate plan document
  - Commit plan (NO PR)
  - Implement plan
  - Commit implementation
  - Push branch
  - Create PR (AFTER implementation)
  - Review PR
  - Post review comment
- Preserve worktree isolation pattern
- Integrate with ADWState for tracking

### Phase 2: Fix Directory Bug
- Edit `automation/adws/adw_modules/workflow_ops.py`
- Locate `run_validation_commands()` function
- Change `cwd=cwd or project_root()` to `cwd=(cwd / "app") if cwd else (project_root() / "app")`
- Add comment explaining validation commands run from `app/` directory

### Phase 3: Update Phase Scripts
- Edit `automation/adws/adw_phases/adw_plan.py`
  - Remove `create_pull_request()` invocation
  - Update docstring to clarify PR deferred to build phase
- Edit `automation/adws/adw_phases/adw_build.py`
  - Add `create_pull_request()` after implementation success
  - Pass implementation context to PR creation (not planning artifacts)
  - Ensure PR title reflects implementation (e.g., "feat: implement X" not "feat: add plan for X")

### Phase 4: Delete Broken Components
- Delete `automation/adws/adw_phases/adw_test.py`
- Delete `automation/adws/adw_phases/adw_document.py`
- Delete `automation/adws/adw_phases/adw_patch.py`
- Delete `automation/adws/adw_modules/agent_resolution.py`
- Delete `automation/adws/adw_modules/validation.py`

### Phase 5: Update Orchestration
- Edit `automation/adws/adw_modules/orchestrators.py`
- Update phase list to skip test/document phases: `["plan", "build", "review"]`
- Update state transitions to reflect 3-phase flow
- Remove test phase validation logic
- Remove document phase invocation

### Phase 6: Simplify Main Orchestrator
- Edit `automation/adws/adw_sdlc.py`
- Replace complex orchestration with call to `adw_simple.py` logic
- Remove recursive agent patterns
- Reduce file from ~400 lines to ~150 lines
- Maintain backwards compatibility with existing entry points

### Testing & Validation
- Run Python syntax check: `python -m py_compile automation/adws/adw_simple.py`
- Run automation test suite: `cd automation && uv run pytest adws/adw_tests/ -v`
- Verify no hardcoded paths or environment assumptions

### Manual Integration Test
- Select test issue (create new issue or use existing low-priority issue)
- Run simplified workflow: `uv run automation/adws/adw_simple.py <test-issue-number>`
- Verify worktree created in `automation/trees/`
- Verify plan document committed (NO PR yet)
- Verify implementation committed and pushed
- Verify PR created with implementation-focused title
- Verify agent review posted as PR comment
- Verify flow completes in <15 minutes

### Documentation Updates
- Update `automation/adws/README.md` with new 5-step flow
- Document removed phases and rationale
- Add troubleshooting section for directory-related errors
- Update usage examples to reference `adw_simple.py`

### Commit & Push
- Stage changes: `git add automation/adws/ docs/specs/chore-135-simplify-adw-flow.md`
- Commit with message: `chore: simplify ADW to 5-step flow (plan → implement → PR → review)`
- Push branch: `git push -u origin chore/135-simplify-adw-flow`

### Create Pull Request
- Run `/pull_request chore/135-simplify-adw-flow <issue_json> docs/specs/chore-135-simplify-adw-flow.md <adw_id>`
- Ensure PR title ends with issue number: `chore: simplify ADW architecture to 5-step flow (#135)`
- Verify PR description includes complexity reduction metrics (lines deleted, success rate target)

## Risks

**Risk**: Removing agent_resolution.py may break existing calls
**Mitigation**: Grep for imports/references to `agent_resolution` before deletion. The issue description states it "never successfully executed", so no production dependencies exist.

**Risk**: Validation commands may still fail even after directory fix
**Mitigation**: Manual testing step verifies validation commands before PR creation. If failures persist, add diagnostic logging to `workflow_ops.py`.

**Risk**: PR creation timing may still be premature
**Mitigation**: New flow explicitly defers PR creation until after `adw_build.py` completes. State management tracks implementation completion before PR trigger.

**Risk**: Simplified flow may expose new failure modes
**Mitigation**: Focus on one thing at a time: each step (plan → implement → PR → review) is independently verifiable. If failures occur, rollback is straightforward (restore deleted files).

**Risk**: Large diff may be hard to review
**Mitigation**: Structure commits logically: (1) delete broken code, (2) fix directory bug, (3) add simplified orchestrator, (4) update phase scripts. Each commit is independently reviewable.

**Risk**: Existing ADW runs may conflict with new code
**Mitigation**: Check for active worktrees before deployment. New code uses same worktree isolation pattern, so no conflicts with in-flight runs.

## Validation Commands

```bash
# Python syntax check
python -m py_compile automation/adws/adw_simple.py
python -m py_compile automation/adws/adw_modules/workflow_ops.py
python -m py_compile automation/adws/adw_phases/adw_plan.py
python -m py_compile automation/adws/adw_phases/adw_build.py

# Automation test suite (from project root)
cd automation && uv run pytest adws/adw_tests/ -v

# Verify no broken imports after deletions
cd automation && uv run python -c "from adws.adw_simple import main; print('Import successful')"

# Manual integration test (end-to-end verification)
uv run automation/adws/adw_simple.py <test-issue-number>
```

### Additional Validation Based on Impact Level

**Impact Level**: High (architecture change, code deletion, flow modification)

**Supplemental Checks**:
1. **Grep for deleted module references**:
   ```bash
   grep -r "agent_resolution" automation/adws/
   grep -r "from adw_modules.validation import" automation/adws/
   grep -r "adw_test" automation/adws/
   grep -r "adw_document" automation/adws/
   ```

2. **Verify state transitions**:
   - Inspect `automation/adws/adw_modules/state.py` for phase references
   - Ensure removed phases don't break state machine

3. **Check slash command dependencies**:
   ```bash
   grep -r "/validate-implementation" .claude/commands/
   grep -r "/document-changes" .claude/commands/
   ```

4. **Worktree cleanup test**:
   - Create test worktree
   - Run simplified flow
   - Verify worktree cleanup (if `ADW_CLEANUP_WORKTREES=true`)

5. **PR title validation**:
   - After manual test, verify PR title format: `<type>: <description> (#<issue_number>)`
   - Verify PR description contains implementation details (not planning artifacts)

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: simplify ADW to 5-step flow` not `Based on the plan, this commit simplifies ADW to 5-step flow`

**Example Valid Commit Messages**:
- `chore(adw): delete broken agent resolution module`
- `fix(adw): correct validation command working directory`
- `refactor(adw): replace complex orchestration with 5-step flow`
- `docs(adw): update README with simplified architecture`

**Example Invalid Commit Messages**:
- ❌ `chore: based on the issue, I removed the test phase`
- ❌ `fix: looking at the code, the commit should fix the directory bug`
- ❌ `refactor: here is the simplified orchestrator`
- ❌ `docs: let me update the README`

## Deliverables

### Code Changes
- `automation/adws/adw_simple.py` (new, ~150 lines)
- `automation/adws/adw_sdlc.py` (simplified from ~400 to ~150 lines)
- `automation/adws/adw_modules/workflow_ops.py` (directory bug fix)
- `automation/adws/adw_phases/adw_plan.py` (remove PR creation)
- `automation/adws/adw_phases/adw_build.py` (add PR creation after implementation)
- `automation/adws/adw_modules/orchestrators.py` (skip test/document phases)

### Code Deletions
- `automation/adws/adw_phases/adw_test.py` (130 lines)
- `automation/adws/adw_phases/adw_document.py` (85 lines)
- `automation/adws/adw_phases/adw_patch.py` (92 lines)
- `automation/adws/adw_modules/agent_resolution.py` (132 lines)
- `automation/adws/adw_modules/validation.py` (80 lines)
- **Total reduction: ~519 lines**

### Documentation Updates
- `automation/adws/README.md` (document new 5-step flow, removed phases)
- `docs/specs/chore-135-simplify-adw-flow.md` (this maintenance plan)

### Testing Artifacts
- Manual integration test results (PR URL, completion time, review comment)
- Automated test suite output (`pytest` results)
- Complexity reduction metrics (before/after line counts)

### Pull Request
- Branch: `chore/135-simplify-adw-flow`
- Title: `chore: simplify ADW architecture to 5-step flow (#135)`
- Description: Includes complexity reduction metrics, success rate target, and deferred features list
