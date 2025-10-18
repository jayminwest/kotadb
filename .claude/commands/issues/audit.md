# Audit and Close Stale GitHub Issues

Systematically audit open GitHub issues to identify candidates for closure. This command helps maintain a clean issue tracker by finding completed, obsolete, or duplicate issues that can be safely closed.

## Steps

1. **Sync repo state**
   - `git fetch --all --prune`
   - `git pull --rebase` (ensure you have latest commits and PRs)

2. **Fetch all open issues**
   - `gh issue list --limit 100 --state open --json number,title,labels,body,createdAt,updatedAt,comments`
   - Include all issues regardless of age (we'll filter in analysis)
   - Capture full issue metadata for audit trail

3. **Check blocked issues for unblocking opportunities**

   Before identifying closure candidates, audit issues with `blocked` label:
   - Fetch all blocked issues: `gh issue list --label blocked --state open --json number,title,labels,body`
   - For each blocked issue, parse the "Depends On" relationships from issue body
   - Check if blocking issues are now closed/merged: `gh issue view <blocking-number> --json state`
   - If all blocking issues are resolved:
     - Remove `blocked` label: `gh issue edit <number> --remove-label blocked`
     - Add comment explaining unblock: `gh issue comment <number> --body "Unblocked: all dependencies resolved (closes #X, #Y)"`
     - Update issue body to remove or strikethrough "Depends On" references
   - If some blockers remain, add comment with current blocker status
   - Track unblocked issues for prioritization report

4. **Identify closure candidates**

   **Category 1: Completed but not closed**
   - Check for issues with related PRs that merged: `gh pr list --state merged --search "fixes #<number>"`
   - Look for commit messages mentioning issue numbers: `git log --all --grep="#<number>" --oneline`
   - Verify issue acceptance criteria are met by reviewing merged code
   - Closure reason: "Completed via PR #X"

   **Category 2: Obsolete or superseded**
   - Check for "Supersedes" relationships in issue metadata
   - Identify issues made obsolete by architectural changes (check recent merged PRs)
   - Look for issues referencing removed dependencies or deprecated features
   - Review git history for major refactors that resolved the issue implicitly
   - Closure reason: "Superseded by #X" or "Obsolete after PR #Y"

   **Category 3: Duplicates**
   - Search for similar titles: `gh issue list --search "<keywords>" --state all`
   - Compare issue descriptions and acceptance criteria
   - Check for explicit "Related To" relationships that indicate duplication
   - Verify one issue is more complete/actionable than the other
   - Closure reason: "Duplicate of #X"

   **Category 4: Stale or abandoned**
   - Issues with no updates in >90 days (check `updatedAt` field)
   - Issues with `status:needs-investigation` but no recent activity
   - Issues blocked by external dependencies with no resolution timeline
   - Issues with unclear requirements or missing acceptance criteria after follow-up
   - Closure reason: "Stale - no activity in 90+ days. Reopen if needed."

   **Category 5: No longer relevant**
   - Issues for features already implemented differently
   - Issues for bugs that can no longer be reproduced
   - Issues for improvements superseded by better approaches
   - Closure reason: "No longer relevant - resolved differently in PR #X"

5. **Validate closure candidates**

   For each candidate, verify:
   - **Completion check**: If claiming "completed", confirm merged PR or commit exists
   - **Relationship check**: Review all "Blocks" relationships - ensure closure won't leave orphaned blockers
   - **Comment review**: Read recent comments for objections or ongoing work
   - **Assignee check**: If assigned, confirm with assignee before closing
   - **Epic membership**: If "Child Of" an epic, verify epic status is updated

   **Do NOT close issues that:**
   - Have active discussion in last 30 days
   - Are blocking other open issues (unless those are also being closed)
   - Have `priority:critical` or `priority:high` labels without explicit resolution
   - Are assigned to active contributors without confirmation
   - Are part of active epics or roadmap initiatives

6. **Generate audit report**

   Create a structured report with:
   - **Summary statistics**: Total open issues, closure candidates by category, percentage reduction, unblocked issues count
   - **Unblocked issues**: Issues that had `blocked` label removed (with details on resolved dependencies)
   - **High-confidence closures**: Issues safe to close immediately (completed, duplicates)
   - **Medium-confidence closures**: Issues requiring brief verification (obsolete, superseded)
   - **Low-confidence closures**: Issues requiring maintainer decision (stale, unclear)
   - **Keep open**: Issues that should remain open despite age/activity

   For each unblocked issue, include:
   - Issue number and title
   - Previously blocking issues (with resolution status)
   - Recommended next action (prioritize, assign, etc.)
   - Priority/effort labels for workload planning

   For each closure candidate, include:
   - Issue number and title
   - Category (completed/obsolete/duplicate/stale/not-relevant)
   - Closure reason with evidence (PR number, commit hash, related issue)
   - Confidence level (high/medium/low)
   - Recommended closing comment
   - Any "Blocks" relationships that need updating

7. **Execute closures and unblocks** (high-confidence only, unless explicitly approved)

   For unblocked issues (execute automatically):
   - Remove `blocked` label: `gh issue edit <number> --remove-label blocked`
   - Post unblock comment with resolved dependencies
   - Update issue body if needed (strikethrough "Depends On" section)
   - Add to prioritization queue for immediate consideration

   For high-confidence closures:
   - Post closing comment with reason and evidence: `gh issue comment <number> --body "<reason>"`
   - Close issue with appropriate label: `gh issue close <number> --reason completed` or `--reason "not planned"`
   - Update blocked issues if needed (remove "Depends On" reference, add note)
   - Update related spec files if they reference closed issues

   For medium/low-confidence closures:
   - Present report to maintainer for approval
   - Execute closures after explicit confirmation
   - Tag with `needs-closure-review` label if unsure

8. **Update documentation**

   After closing issues:
   - Update any spec files that reference closed issues
   - Update epic/tracking issues to remove closed children
   - Update `docs/specs/` files if closures affect documented features
   - Note closure summary in commit message or PR description

## Reporting

Provide a structured audit report with:
- **Executive Summary**: Total issues reviewed, unblocked count, closure candidates, recommended actions
- **Unblocked Issues**: Issues that had blocking dependencies resolved (ready for prioritization)
- **High-Confidence Closures**: Issues to close immediately (with commands ready to execute)
- **Medium-Confidence Closures**: Issues requiring brief verification before closing
- **Low-Confidence Closures**: Issues requiring maintainer decision
- **Keep Open**: Issues that appear stale but should remain open (with reasoning)
- **Closure Impact**: Issues that will be unblocked, updated, or affected by closures
- **Next Steps**: Recommended follow-up actions (update docs, notify contributors, prioritize unblocked work)

## Output Schema

This command's output is validated against the following schema:

```json
{
  "type": "object",
  "properties": {
    "summary": {
      "type": "object",
      "properties": {
        "total_open": { "type": "number" },
        "unblocked_count": { "type": "number" },
        "closure_candidates": { "type": "number" },
        "high_confidence": { "type": "number" },
        "medium_confidence": { "type": "number" },
        "low_confidence": { "type": "number" }
      },
      "required": ["total_open", "closure_candidates"]
    },
    "unblocked_issues": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "resolved_blockers": {
            "type": "array",
            "items": { "type": "number" }
          },
          "unblock_command": { "type": "string" },
          "comment": { "type": "string" }
        },
        "required": ["number", "title", "resolved_blockers", "unblock_command"]
      }
    },
    "high_confidence_closures": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "category": {
            "type": "string",
            "enum": ["completed", "obsolete", "duplicate", "stale", "not-relevant"]
          },
          "reason": { "type": "string" },
          "evidence": { "type": "string" },
          "close_command": { "type": "string" }
        },
        "required": ["number", "title", "category", "reason", "close_command"]
      }
    },
    "medium_confidence_closures": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "category": { "type": "string" },
          "reason": { "type": "string" },
          "verification_needed": { "type": "string" }
        },
        "required": ["number", "title", "category", "reason", "verification_needed"]
      }
    },
    "impact": {
      "type": "object",
      "properties": {
        "issues_unblocked": {
          "type": "array",
          "items": { "type": "number" }
        },
        "specs_to_update": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  },
  "required": ["summary", "high_confidence_closures"]
}
```

The output should be a JSON object containing audit summary, categorized closure candidates, and impact analysis.

## Examples

### Example: Completed issue closure
Issue #45 (feat: add Docker Compose test stack):
- Category: completed
- Evidence: PR #51 merged on 2024-10-10
- Reason: "Completed via PR #51. Docker Compose test infrastructure successfully deployed to CI."
- Confidence: high
- Command: `gh issue close 45 --reason completed --comment "Completed via PR #51..."`

### Example: Duplicate closure
Issue #38 (chore: improve test coverage):
- Category: duplicate
- Evidence: Issue #52 (chore: add missing test cases) has same acceptance criteria
- Reason: "Duplicate of #52 which has more specific acceptance criteria and is already in progress."
- Confidence: high
- Command: `gh issue close 38 --reason "not planned" --comment "Duplicate of #52..."`

### Example: Obsolete closure
Issue #22 (feat: add SQLite persistence):
- Category: obsolete
- Evidence: PR #29 migrated to Supabase, superseding SQLite approach
- Reason: "Obsolete after Postgres/Supabase migration in PR #29. SQLite removed from architecture."
- Confidence: high
- Command: `gh issue close 22 --reason "not planned" --comment "Superseded by Supabase migration..."`

### Example: Stale issue (medium confidence)
Issue #15 (feat: add webhook triggers):
- Category: stale
- Evidence: No updates in 120 days, assignee inactive
- Reason: "No activity in 120 days. Feature may still be relevant but needs re-evaluation."
- Confidence: medium
- Verification needed: Check with maintainer if webhook triggers are still roadmap priority
- Action: Tag with `needs-closure-review` and request maintainer decision

### Example: Unblocking issue
Issue #110 (feat: multi-phase ADW framework) has `blocked` label:
- Depends On: #25 (API key generation), #26 (rate limiting)
- Check blocker status:
  - `gh issue view 25 --json state` → closed (merged in PR #30)
  - `gh issue view 26 --json state` → closed (merged in PR #31)
- All blockers resolved → unblock automatically:
  - Command: `gh issue edit 110 --remove-label blocked`
  - Comment: `gh issue comment 110 --body "Unblocked: all dependencies resolved (#25 closed in PR #30, #26 closed in PR #31). Ready for implementation."`
  - Update issue body: strikethrough "Depends On" section or add note about resolution
  - Add to prioritization report as newly available work
