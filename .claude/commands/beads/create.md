# /beads:create

Create a new issue in the beads issue tracker with optional dependencies.

## Usage
```
/beads:create <title> [type] [priority] [description] [deps]
```

## Arguments
- `$1` (title): Issue title (required, e.g., "Add rate limiting middleware")
- `$2` (type): Issue type - one of: bug, feature, task, epic, chore (default: task)
- `$3` (priority): Priority level - 0 (low), 1 (medium), 2 (high) (default: 1)
- `$4` (description): Detailed issue description (optional)
- `$5` (deps): Comma-separated list of issue IDs this depends on (optional, e.g., "kota-1,kota-5")

## Instructions

1. Set the beads workspace context to the project root:
   ```
   Use mcp__plugin_beads_beads__set_context with workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   ```

2. Validate parameters:
   - Ensure title is not empty
   - Validate type is one of: bug, feature, task, epic, chore
   - Validate priority is 0, 1, or 2
   - If deps provided, split by comma and trim whitespace

3. Create the issue using the MCP tool:
   ```
   Use mcp__plugin_beads_beads__create with:
   - workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   - title="$1"
   - issue_type="$2" (default: "task")
   - priority=$3 (default: 1, as integer)
   - description="$4" (optional)
   - deps=["kota-1", "kota-5"] (if $5 provided, as array)
   ```

4. Return the created issue details:
   - Issue ID (e.g., kota-123)
   - Title
   - Type
   - Priority
   - Dependencies (if any)
   - Next steps (link to spec file template if applicable)

## Output Format

```markdown
## Issue Created

**ID**: kota-123
**Title**: Add rate limiting middleware
**Type**: feature
**Priority**: High (2)
**Dependencies**: kota-25 (API key generation)

### Next Steps

1. Create spec file: `docs/specs/feature-123-rate-limiting.md`
2. Add design notes: `bd update kota-123 --design "..."`
3. Add acceptance criteria: `bd update kota-123 --acceptance "..."`
4. Verify dependencies resolved: `/beads:show kota-123`
```

## Error Handling

- Invalid type: Return error with list of valid types (bug, feature, task, epic, chore)
- Invalid priority: Return error with valid range (0-2)
- Invalid dependency ID: Return error indicating which ID is invalid
- Duplicate title: Warn but allow creation (beads supports duplicate titles)
- Missing title: Return error "Title is required"

## Examples

```bash
# Create simple task
/beads:create "Fix authentication bug" bug 2

# Create feature with dependencies
/beads:create "Add rate limiting" feature 2 "Implement tier-based rate limits" "kota-25"

# Create chore with description
/beads:create "Update CI workflow" chore 1 "Migrate from Actions v3 to v4"

# Create epic
/beads:create "Multi-tenant support" epic 2
```

## Automation Notes

When creating issues programmatically (e.g., from ADW workflows):
- Always specify type explicitly (don't rely on defaults)
- Include description for context
- Set external_ref to link GitHub issue: `external_ref="https://github.com/user/repo/issues/123"`
- Use labels for categorization: `labels=["api", "database"]`
