# /beads:ready

Query ready-to-work tasks from the beads issue tracker. Returns issues with no unresolved blockers.

## Usage
```
/beads:ready [assignee] [priority] [limit]
```

## Arguments
- `$1` (assignee): Optional filter by assignee (e.g., "claude", "jaymin")
- `$2` (priority): Optional filter by priority level (0=low, 1=medium, 2=high)
- `$3` (limit): Optional maximum number of results (default: 10)

## Instructions

1. Set the beads workspace context to the project root:
   ```
   Use mcp__plugin_beads_beads__set_context with workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   ```

2. Query ready tasks using the MCP tool:
   ```
   Use mcp__plugin_beads_beads__ready with:
   - workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   - assignee="$1" (if provided)
   - priority=$2 (if provided, as integer)
   - limit=$3 (if provided, default: 10)
   ```

3. Format the results as a markdown table with columns:
   - Issue ID (link format: `kota-X`)
   - Title
   - Priority (0=Low, 1=Medium, 2=High)
   - Labels (comma-separated)
   - Spec File (if exists in `docs/specs/`)

4. Check for spec files matching pattern: `docs/specs/{type}-{number}-*.md`
   - Example: For `kota-301`, check for `docs/specs/feature-301-*.md`
   - If found, add link in Spec File column

5. Add a recommendation section after the table:
   - Prioritize by: High priority (2) > Medium (1) > Low (0)
   - Within same priority, prefer `effort:small` labeled issues
   - Highlight the top recommended issue

## Output Format

```markdown
## Ready to Work Tasks

| Issue ID | Title | Priority | Labels | Spec File |
|----------|-------|----------|--------|-----------|
| kota-123 | Implement rate limiting | High | effort:small, api | [feature-123-rate-limiting.md](docs/specs/feature-123-rate-limiting.md) |
| kota-124 | Fix auth bug | Medium | bug, auth | - |

### Recommendation

Start with **kota-123** (High priority, small effort, has spec file)
```

## Error Handling

- If no ready tasks found: Return "No ready-to-work tasks found. All issues are either blocked or completed."
- If beads database not initialized: Return "Beads not initialized. Run `bd init --prefix kota` in project root."
- If workspace context fails: Return error message with troubleshooting steps

## Example

```bash
# Query all ready tasks
/beads:ready

# Query ready tasks for specific assignee
/beads:ready claude

# Query high-priority ready tasks
/beads:ready "" 2

# Query top 5 ready tasks
/beads:ready "" "" 5
```
