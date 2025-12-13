# /do/adw - Full ADW Workflow Execution

**Template Category**: Action
**Prompt Level**: 7 (Orchestrator)

Execute full ADW workflow (scout → plan → build → review → validate) for a GitHub issue using Python orchestration layer.

## Variables

- `$1`: Issue number or GitHub URL

## Execution Flow

1. **Validate Issue**:
   - Extract issue number from input (supports `#123`, `123`, or GitHub URL)
   - Verify issue exists via `gh issue view {number}`

2. **Invoke Python Orchestrator**:
   ```bash
   uv run automation/adws/adw_sdlc.py {issue_number} --stream-tokens
   ```

3. **Parse Token Events**:
   - Read JSON lines from stdout
   - Display token usage in real-time
   - Aggregate total cost

4. **Monitor Progress**:
   - Check `automation/agents/{adw_id}/adw_state.json` for phase status
   - Report completed phases: scout ✓ → plan ✓ → build ✓ → review ✓

5. **Report Completion**:
   ```markdown
   ## ADW Workflow Complete
   
   **Issue**: #{number}
   **ADW ID**: {adw_id}
   **Phases**: scout ✓ → plan ✓ → build ✓ → review ✓
   
   ### Token Usage
   - Total Input: {input_tokens:,}
   - Total Output: {output_tokens:,}
   - Total Cost: ${cost_usd:.4f}
   
   ### Artifacts
   - Spec: {plan_file}
   - Branch: {branch_name}
   - Worktree: {worktree_path}
   
   ### Next Steps
   Run: /do/status {adw_id}
   ```

## Error Handling

- **Python not found**: Return clear installation instructions
- **Issue not found**: Suggest valid issue number
- **Workflow fails**: Display error from Python stderr, preserve partial state
