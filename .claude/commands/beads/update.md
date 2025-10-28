# /beads:update

Update an existing issue's fields (status, priority, assignee, description, etc.).

## Usage
```
/beads:update <issue_id> [status] [priority] [assignee] [description]
```

## Arguments
- `$1` (issue_id): Beads issue ID (required, e.g., "kota-123" or "123")
- `$2` (status): New status - one of: open, in_progress, blocked, closed (optional)
- `$3` (priority): New priority - 0 (low), 1 (medium), 2 (high) (optional)
- `$4` (assignee): New assignee name (optional)
- `$5` (description): New description text (optional)

## Instructions

1. Set the beads workspace context to the project root:
   ```
   Use mcp__plugin_beads_beads__set_context with workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   ```

2. Normalize the issue ID:
   - If ID starts with "kota-", use as-is
   - If ID is just a number, prefix with "kota-"

3. Validate parameters:
   - If status provided, ensure it's one of: open, in_progress, blocked, closed
   - If priority provided, ensure it's 0, 1, or 2
   - If no fields provided, return error "At least one field must be updated"

4. Update the issue using the MCP tool:
   ```
   Use mcp__plugin_beads_beads__update with:
   - workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   - issue_id="$1" (normalized)
   - status="$2" (if provided)
   - priority=$3 (if provided, as integer)
   - assignee="$4" (if provided)
   - description="$5" (if provided)
   ```

5. Return confirmation with updated fields:
   - Issue ID
   - Fields changed (old value → new value)
   - Timestamp of update

6. If status changed to "in_progress":
   - Suggest claiming work: "You are now assigned to this issue"
   - Remind to check dependencies: "Run `/beads:show $1` to verify blockers resolved"

7. If status changed to "closed":
   - Check if this unblocks other issues
   - Suggest running `/beads:ready` to find newly unblocked work

## Output Format

```markdown
## Issue Updated: kota-123

### Changes Made
- **Status**: open → in_progress
- **Assignee**: (none) → claude
- **Updated**: 2025-10-28T15:45:00Z

### Next Steps
- Verify blockers resolved: `/beads:show kota-123`
- Create feature branch: `git checkout -b feat/123-rate-limiting`
- Link spec file: `docs/specs/feature-123-rate-limiting.md`

✅ You are now working on this issue
```

## Error Handling

- Issue not found: Return "Issue $1 not found. Use `/beads:list` to see available issues."
- Invalid status: Return error with list of valid statuses (open, in_progress, blocked, closed)
- Invalid priority: Return error with valid range (0-2)
- No fields provided: Return "At least one field must be updated. Usage: /beads:update <id> [status] [priority] [assignee] [description]"

## Examples

```bash
# Claim work on an issue
/beads:update kota-123 in_progress "" claude

# Update priority only
/beads:update 123 "" 2

# Mark issue as completed
/beads:update kota-123 closed

# Update description
/beads:update 123 "" "" "" "Updated description with more context"

# Change status to blocked
/beads:update kota-124 blocked
```

## Workflow Integration

### Claiming Work
When starting work on an issue:
```bash
/beads:update kota-123 in_progress "" claude
```

### Marking Complete
When finishing implementation:
```bash
/beads:update kota-123 closed
```

Then check for newly unblocked issues:
```bash
/beads:ready
```

### Blocking on Dependencies
When discovering blockers during implementation:
```bash
# Mark current issue as blocked
/beads:update kota-123 blocked

# Add dependency relationship
/beads:dep kota-123 kota-124 blocks
```

## Design and Acceptance Criteria

To update design notes or acceptance criteria, use additional parameters:
- `design`: Design notes for implementation approach
- `acceptance_criteria`: Checklist of completion criteria

These are typically set when creating spec files and planning implementation.
