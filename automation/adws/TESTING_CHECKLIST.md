# 3-Phase ADW Flow Testing Checklist

## Test Command
```bash
cd /Users/jayminwest/Projects/kota-db-ts
uv run automation/adws/adw_sdlc.py <ISSUE_NUMBER>
```

## Successful Flow Checklist

### Pre-Execution
- [ ] Current branch is `develop`
- [ ] Working directory is clean (`git status`)
- [ ] Issue exists and is open: `gh issue view <ISSUE_NUMBER>`

### Phase 1: Plan Phase

**Expected Outcomes:**
- [ ] ADW ID generated (8-character hash visible in logs)
- [ ] Issue classified as `/chore`, `/bug`, or `/feature`
- [ ] Worktree created in `automation/trees/<type>-<issue>-<adw_id>/`
- [ ] Plan file created at `docs/specs/<type>-<issue>-*.md` (inside worktree)
- [ ] Plan committed (visible in `git log` inside worktree)
- [ ] Branch pushed to origin
- [ ] **CRITICAL: NO PR created yet** (verify with `gh pr list --head <branch-name>`)
- [ ] GitHub issue has comments from `[ADW-BOT]` showing progress

**Verification Commands:**
```bash
# Get ADW ID from logs or state
ADW_ID=$(ls automation/agents/ | tail -1)

# Check worktree exists
ls -la automation/trees/

# Verify no PR yet (should return empty)
gh pr list --json number,headRefName | jq '.[] | select(.headRefName | contains("'$ISSUE_NUMBER'"))'

# Check state shows pr_created = null
cat automation/agents/$ADW_ID/adw_state.json | jq '.pr_created'
# Expected output: null
```

### Phase 2: Build Phase

**Expected Outcomes:**
- [ ] Loaded existing worktree from state
- [ ] Implementation agent executed
- [ ] Changes committed (if any) OR "no changes needed" message
- [ ] Branch pushed (if changes made)
- [ ] **CRITICAL: PR created AFTER implementation** (verify with `gh pr list`)
- [ ] State updated: `pr_created = true`

**Verification Commands:**
```bash
# Check PR was created (should show 1 PR)
gh pr list --json number,title,headRefName | jq '.[] | select(.headRefName | contains("'$ISSUE_NUMBER'"))'

# Verify state updated
cat automation/agents/$ADW_ID/adw_state.json | jq '.pr_created'
# Expected output: true

# Check worktree has commits
cd automation/trees/*/
git log --oneline -3
```

### Phase 3: Review Phase

**Expected Outcomes:**
- [ ] Reviewer agent executed
- [ ] Review comment posted to PR
- [ ] Review summary visible on GitHub PR
- [ ] No blocker issues OR blockers documented

**Verification Commands:**
```bash
# Get PR number
PR_NUM=$(gh pr list --json number,headRefName | jq -r '.[] | select(.headRefName | contains("'$ISSUE_NUMBER'")) | .number')

# Check for review comments
gh pr view $PR_NUM --comments | grep -i "review"
```

## Success Criteria (All Must Pass)

### Critical Success Metrics
1. ✅ **PR Timing**: PR created in BUILD phase, NOT in PLAN phase
2. ✅ **3-Phase Completion**: All phases complete without errors
3. ✅ **Worktree Isolation**: Work done in isolated worktree, not main repo
4. ✅ **State Tracking**: ADW state file tracks progress correctly

### Validation Commands Summary
```bash
ISSUE_NUMBER=<YOUR_ISSUE>
ADW_ID=$(ls automation/agents/ | tail -1)

# 1. Verify worktree created
ls automation/trees/ | grep $ISSUE_NUMBER

# 2. Verify PR was created (and only in build phase)
gh pr list --json number,title,headRefName | jq '.[] | select(.headRefName | contains("'$ISSUE_NUMBER'"))'

# 3. Verify state shows PR created
cat automation/agents/$ADW_ID/adw_state.json | jq '{pr_created, plan_file, worktree_name, branch_name}'

# 4. Verify plan commit happened
cd automation/trees/*$ISSUE_NUMBER*/
git log --oneline --grep="plan" -i

# 5. Verify implementation commit happened (if changes needed)
git log --oneline -5
```

## Failure Patterns to Watch For

### Red Flags (PR #136 fixes these)
- ❌ PR created during plan phase (old behavior - THIS IS WHAT WE FIXED)
- ❌ "No changes to commit" errors in plan phase
- ❌ Validation commands running from wrong directory
- ❌ Git staging failures

### Expected Behavior Changes (Post-PR #136)
- ✅ Plan phase completes WITHOUT creating PR
- ✅ Build phase creates PR AFTER implementation
- ✅ Validation commands run from `app/` directory
- ✅ 3 phases only (test/document removed)

## Logs Location
```bash
# Execution logs
automation/logs/kota-db-ts/local/$ADW_ID/adw_sdlc/execution.log

# Agent outputs
automation/logs/kota-db-ts/local/$ADW_ID/*/raw_output.json

# State file
automation/agents/$ADW_ID/adw_state.json
```

## Quick Test (Issue #127 Example)
```bash
# Run full workflow
uv run automation/adws/adw_sdlc.py 127

# Watch logs in real-time
tail -f automation/logs/kota-db-ts/local/*/adw_sdlc/execution.log

# After plan phase completes, verify NO PR:
gh pr list --json headRefName | jq -r '.[].headRefName' | grep 127
# Expected: empty output

# After build phase completes, verify PR EXISTS:
gh pr list --json number,title,headRefName | jq '.[] | select(.headRefName | contains("127"))'
# Expected: PR details
```

## Cleanup After Testing
```bash
# Get ADW ID
ADW_ID=$(ls automation/agents/ | tail -1)

# Remove worktree
git worktree remove automation/trees/*127* --force

# Prune metadata
git worktree prune

# Clean state
rm -rf automation/agents/$ADW_ID

# Close test PR/issue if needed
gh pr close <PR_NUM> --comment "Test complete"
gh issue close 127 --comment "Test complete"
```

## Report Format

After testing, report results in this format:

```markdown
## 3-Phase ADW Flow Test Results - Issue #<NUMBER>

### Execution Summary
- ADW ID: `<adw_id>`
- Issue Type: `<chore|bug|feature>`
- Duration: `<time>`

### Phase Results
- [ ] ✅/❌ Plan Phase: PR creation timing
- [ ] ✅/❌ Build Phase: Implementation & PR creation
- [ ] ✅/❌ Review Phase: Review posted

### Critical Validation
- [ ] ✅/❌ PR was NOT created during plan phase
- [ ] ✅/❌ PR WAS created during build phase
- [ ] ✅/❌ State tracking accurate

### Evidence
```bash
# State after plan
cat automation/agents/<adw_id>/adw_state.json | jq '.pr_created'
# Output: null

# State after build
cat automation/agents/<adw_id>/adw_state.json | jq '.pr_created'
# Output: true

# PR exists
gh pr view <pr_number> --json number,title
```

### Issues Encountered
- None / [List any problems]

### Conclusion
✅ PASS / ❌ FAIL - [Brief summary]
```
