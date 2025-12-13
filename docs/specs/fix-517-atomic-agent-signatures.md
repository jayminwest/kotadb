# Implementation Spec: Fix ADW Atomic Agent Signature Mismatches

**Issue:** #517 - fix(adw): resolve 7 atomic agent signature mismatches in orchestrator.py
**Type:** Bug Fix
**Priority:** High
**Estimated Effort:** Small (< 1 day)

---

## Executive Summary

The `orchestrator.py` file has 7 critical signature mismatches where agent invocations do not match the actual function signatures defined in the respective `agent_*.py` files. These mismatches prevent end-to-end workflow execution.

---

## Signature Mismatches

| # | Agent | Line | Current (Broken) | Expected |
|---|-------|------|-----------------|----------|
| 1 | `commit_plan` | 309 | `(issue, adw_id, logger, cwd)` | `(issue, issue_class, adw_id, logger, cwd)` |
| 2 | `implement_plan` | 328 | `(issue, plan_file, adw_id, logger, cwd)` | `(plan_file, adw_id, logger, cwd)` |
| 3 | `commit_implementation` | 347 | `(issue, adw_id, logger, cwd)` | `(issue, issue_class, adw_id, logger, cwd)` |
| 4 | `create_pull_request` | 366 | `(issue, adw_id, logger, cwd)` | `(branch_name, issue, plan_file, adw_id, logger, cwd)` |
| 5 | `run_review` | 387 | `(issue, adw_id, logger, cwd)` | `(spec_file, adw_id, logger, cwd)` |
| 6 | `push_branch` | 401 | `(branch_name, adw_id, logger, cwd)` returns unpacked | `(branch_name, logger, cwd)` returns `Dict` |
| 7 | `cleanup_worktree` | 419 | `(worktree_path, adw_id, logger)` returns unpacked | `(worktree_name, logger, base_path)` returns `bool` |

---

## Files to Modify

### Primary Changes

#### 1. `automation/adws/adw_agents/orchestrator.py`

**Changes:**

##### Line 308-310 (commit_plan)
```python
# BEFORE:
def commit_plan_with_state():
    response = commit_plan(issue, adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)

# AFTER:
def commit_plan_with_state():
    commit_message, error = commit_plan(issue, state.issue_class, adw_id, logger, cwd=state.worktree_path)
    return (commit_message, error)
```

##### Line 327-329 (implement_plan)
```python
# BEFORE:
def implement_with_state():
    response = implement_plan(issue, state.plan_file or "", adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)

# AFTER:
def implement_with_state():
    response = implement_plan(state.plan_file or "", adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)
```

##### Line 346-348 (commit_implementation)
```python
# BEFORE:
def commit_impl_with_state():
    response = commit_implementation(issue, adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)

# AFTER:
def commit_impl_with_state():
    commit_message, error = commit_implementation(issue, state.issue_class, adw_id, logger, cwd=state.worktree_path)
    return (commit_message, error)
```

##### Line 365-367 (create_pull_request)
```python
# BEFORE:
def create_pr_with_state():
    response = create_pull_request(issue, adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)

# AFTER:
def create_pr_with_state():
    pr_url, error = create_pull_request(
        state.branch_name or "", issue, state.plan_file or "", adw_id, logger, cwd=state.worktree_path
    )
    return (pr_url, error)
```

##### Line 386-388 (run_review)
```python
# BEFORE:
def review_with_state():
    response = run_review(issue, adw_id, logger, cwd=state.worktree_path)
    return (response, None) if response.success else (None, response.output)

# AFTER:
def review_with_state():
    review_result, error = run_review(state.plan_file or "", adw_id, logger, cwd=state.worktree_path)
    return (review_result, error)
```

##### Line 400-401 (push_branch)
```python
# BEFORE:
def push_with_state():
    return push_branch(state.branch_name or "", adw_id, logger, cwd=state.worktree_path)

# AFTER:
def push_with_state():
    result = push_branch(state.branch_name or "", logger, cwd=state.worktree_path)
    if not result["success"]:
        return (None, result.get("error_message", "Push failed"))
    return (result, None)
```

##### Line 418-419 (cleanup_worktree)
```python
# BEFORE:
def cleanup_with_state():
    return cleanup_worktree(state.worktree_path or "", adw_id, logger)

# AFTER:
def cleanup_with_state():
    success = cleanup_worktree(state.worktree_name or "", logger)
    if not success:
        return (None, "Worktree cleanup failed")
    return (True, None)
```

---

### Test File

#### 2. `automation/adws/adw_agents_tests/test_agent_orchestrator.py`

Add new test classes to verify signature correctness:

- `TestCommitPlanSignature` - verifies `issue_class` is passed
- `TestImplementPlanSignature` - verifies `plan_file` is first param, no `issue`
- `TestCommitImplementationSignature` - verifies `issue_class` is passed
- `TestCreatePullRequestSignature` - verifies `branch_name` and `plan_file` are passed
- `TestRunReviewSignature` - verifies `spec_file` (not `issue`) is passed
- `TestPushBranchSignature` - verifies no `adw_id`, Dict return handling
- `TestCleanupWorktreeSignature` - verifies `worktree_name` (not path), no `adw_id`, bool return

---

## State Fields Used

All required state fields are available in `ADWState`:

| Field | Set At | Used By |
|-------|--------|---------|
| `state.issue_class` | Line 263 (classify_issue) | commit_plan, commit_implementation |
| `state.plan_file` | Plan phase | implement_plan, create_pull_request, run_review |
| `state.branch_name` | Line 283 (generate_branch) | create_pull_request, push_branch |
| `state.worktree_name` | Setup phase | cleanup_worktree |
| `state.worktree_path` | Setup phase | All agents (cwd parameter) |

---

## Validation Steps

1. **Pre-implementation baseline:**
   ```bash
   cd automation/adws && uv run pytest adw_agents_tests/ -v
   ```

2. **Post-implementation tests:**
   ```bash
   cd automation/adws && uv run pytest adw_agents_tests/test_agent_orchestrator.py -v
   ```

3. **All agent tests:**
   ```bash
   cd automation/adws && uv run pytest adw_agents_tests/ -v
   ```

4. **Type check:**
   ```bash
   cd automation && uv run mypy adws/adw_agents/orchestrator.py --ignore-missing-imports
   ```

---

## Acceptance Criteria

- [x] All 7 signature mismatches identified
- [ ] All 7 signature fixes applied in orchestrator.py
- [ ] Return type handling corrected for push_branch (Dict) and cleanup_worktree (bool)
- [ ] Unit tests added for each agent signature
- [ ] Existing adw_agents_tests/ tests pass
- [ ] No regressions in phase scripts (adw_phases/*.py)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing state fields at runtime | Low | Medium | All fields verified to be set before use |
| Return type errors | Low | Low | Tests verify correct handling |
| Phase scripts regression | Low | Low | Phase scripts use different code paths |

---

## References

- Issue: https://github.com/kotadb/kota-db-ts/issues/517
- Orchestrator: `automation/adws/adw_agents/orchestrator.py`
- Agent implementations: `automation/adws/adw_agents/agent_*.py`
