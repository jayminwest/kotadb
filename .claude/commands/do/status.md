# /do/status - Query ADW Workflow State

**Template Category**: Query
**Prompt Level**: 3 (Read-only)

Query the current state of an ADW workflow execution.

## Variables

- `$1`: ADW execution ID

## Execution Flow

1. **Read State File**:
   - Load `automation/agents/{adw_id}/adw_state.json`
   - Parse using TypeScript ADWState reader

2. **Display Status**:
   ```markdown
   ## ADW Status: {adw_id}
   
   **Issue**: #{issue_number} - {issue_title}
   **Branch**: {branch_name}
   **Worktree**: {worktree_path}
   **PR Created**: {pr_created ? "Yes" : "No"}
   
   ### Phase Status
   - Scout: {scout_status}
   - Plan: {plan_status}
   - Build: {build_status}
   - Review: {review_status}
   
   ### Metrics
   {display metrics from extra.metrics if present}
   
   ### Files
   - Spec: {plan_file}
   ```

3. **Check Completion**:
   - If all phases complete: "Workflow finished. PR: {pr_url}"
   - If in progress: "Workflow running. Phase: {current_phase}"
   - If failed: "Workflow failed. Check logs: automation/logs/{adw_id}/"
