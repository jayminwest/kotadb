# /beads:show

Show detailed information about a specific issue including its dependency tree.

## Usage
```
/beads:show <issue_id>
```

## Arguments
- `$1` (issue_id): Beads issue ID (required, e.g., "kota-123" or "123")

## Instructions

1. Set the beads workspace context to the project root:
   ```
   Use mcp__plugin_beads_beads__set_context with workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   ```

2. Normalize the issue ID:
   - If ID starts with "kota-", use as-is
   - If ID is just a number, prefix with "kota-"
   - Example: "123" becomes "kota-123"

3. Fetch issue details using the MCP tool:
   ```
   Use mcp__plugin_beads_beads__show with:
   - workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   - issue_id="$1" (normalized)
   ```

4. Format the output with the following sections:
   - **Metadata**: ID, title, type, status, priority, assignee
   - **Dates**: Created, updated, closed (if applicable)
   - **Description**: Full description text
   - **Design Notes**: If present
   - **Acceptance Criteria**: If present
   - **Dependencies**: Issues this depends on (with relationship type)
   - **Dependents**: Issues that depend on this (blocked by this issue)
   - **External Links**: GitHub issue URL if external_ref exists
   - **Spec File**: Link to spec file if found in `docs/specs/`

5. Check for spec file matching pattern: `docs/specs/{type}-{number}-*.md`

6. For dependency tree visualization:
   - Show relationship types: blocks, related, parent-child, discovered-from
   - Indicate status of each dependency (open, in_progress, blocked, closed)
   - Highlight blockers (dependencies that are not closed)

## Output Format

```markdown
## Issue: kota-123

### Metadata
- **Title**: Add rate limiting middleware
- **Type**: feature
- **Status**: in_progress
- **Priority**: High (2)
- **Assignee**: claude
- **Created**: 2025-10-28T10:00:00Z
- **Updated**: 2025-10-28T14:30:00Z

### Description
Implement tier-based rate limiting for all authenticated API endpoints.

### Acceptance Criteria
- [ ] Rate limits enforced per tier (free: 100/hr, solo: 1000/hr, team: 10000/hr)
- [ ] Returns 429 with Retry-After header when limit exceeded
- [ ] Rate limit headers injected into all responses

### Dependencies (Blocks)
- ✅ kota-25 - API key generation (closed)
- ⏳ kota-30 - Database migration for rate limit counters (in_progress)

### Dependents (Blocked By This)
- kota-150 - API endpoint documentation (open)
- kota-151 - Integration tests (open)

### Spec File
[docs/specs/feature-123-rate-limiting.md](docs/specs/feature-123-rate-limiting.md)

### External Links
- GitHub Issue: https://github.com/kotadb/kota-db-ts/issues/123
```

## Error Handling

- Issue not found: Return "Issue $1 not found. Use `/beads:list` to see available issues."
- Invalid issue ID format: Return "Invalid issue ID format. Use 'kota-123' or '123'."
- Beads database not initialized: Return "Beads not initialized. Run `bd init --prefix kota` in project root."

## Examples

```bash
# Show issue by full ID
/beads:show kota-123

# Show issue by number only
/beads:show 123

# Show epic with child issues
/beads:show kota-70
```

## Use Cases

- **Dependency verification**: Check if all blockers are resolved before starting work
- **Context gathering**: Understand issue scope before planning implementation
- **Progress tracking**: Monitor status of dependent issues
- **Relationship discovery**: Find related work and design decisions
