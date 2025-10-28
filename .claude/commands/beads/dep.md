# /beads:dep

Add a dependency relationship between two issues.

## Usage
```
/beads:dep <issue_id> <depends_on_id> [relationship_type]
```

## Arguments
- `$1` (issue_id): Source issue ID (e.g., "kota-123" or "123")
- `$2` (depends_on_id): Target issue ID that source depends on (e.g., "kota-25")
- `$3` (relationship_type): Type of relationship (optional, default: "blocks")
  - `blocks`: Hard blocker - source cannot start until target completes
  - `related`: Soft link - issues share technical context
  - `parent-child`: Epic/subtask hierarchy
  - `discovered-from`: Source was discovered while working on target

## Instructions

1. Set the beads workspace context to the project root:
   ```
   Use mcp__plugin_beads_beads__set_context with workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   ```

2. Normalize issue IDs:
   - If IDs start with "kota-", use as-is
   - If IDs are just numbers, prefix with "kota-"

3. Validate relationship type (if provided):
   - Must be one of: blocks, related, parent-child, discovered-from
   - Default to "blocks" if not specified

4. Verify both issues exist before creating relationship:
   - Use `/beads:show` to check if IDs are valid
   - Return error if either issue not found

5. Create the dependency using the MCP tool:
   ```
   Use mcp__plugin_beads_beads__dep with:
   - workspace_root="/Users/jayminwest/Projects/kota-db-ts"
   - issue_id="$1" (normalized)
   - depends_on_id="$2" (normalized)
   - dep_type="$3" (default: "blocks")
   ```

6. Return confirmation with relationship details:
   - Source issue
   - Target issue
   - Relationship type
   - Impact (e.g., "kota-123 is now blocked until kota-25 completes")

## Output Format

```markdown
## Dependency Added

**Source**: kota-123 (Add rate limiting)
**Depends On**: kota-25 (API key generation)
**Relationship**: blocks

### Impact
- kota-123 will not appear in `/beads:ready` until kota-25 is closed
- Use `/beads:show kota-123` to view full dependency tree

### Next Steps
1. Verify dependency status: `/beads:show kota-25`
2. If blocker is resolved, update its status: `/beads:update kota-25 closed`
3. Check for newly ready tasks: `/beads:ready`
```

## Error Handling

- Issue not found: Return "Issue $1 not found. Use `/beads:list` to see available issues."
- Invalid relationship type: Return error with list of valid types (blocks, related, parent-child, discovered-from)
- Circular dependency: Return error "Cannot create dependency: would create circular reference"
- Duplicate dependency: Warn but allow (beads prevents actual duplicates in database)

## Relationship Type Semantics

### blocks
Hard blocker - issue cannot be started until dependency completes.

**Use case**: Technical prerequisite
```bash
# Rate limiting depends on API key generation
/beads:dep kota-123 kota-25 blocks
```

### related
Soft link - issues share technical context but not strict ordering.

**Use case**: Context discovery, similar architectural concerns
```bash
# Both issues touch authentication layer
/beads:dep kota-26 kota-25 related
```

### parent-child
Epic/subtask hierarchy - child is part of larger parent epic.

**Use case**: Breaking down large features
```bash
# Symbol extraction is part of AST parsing epic
/beads:dep kota-74 kota-70 parent-child
```

### discovered-from
Source issue was found while working on target issue.

**Use case**: Tracking discovery path, follow-up work
```bash
# Bug found during rate limiting implementation
/beads:dep kota-150 kota-123 discovered-from
```

## Examples

```bash
# Add hard blocker dependency
/beads:dep kota-123 kota-25 blocks

# Add related issue for context
/beads:dep 26 25 related

# Create parent-child relationship
/beads:dep kota-74 kota-70 parent-child

# Track discovery path
/beads:dep kota-151 kota-123 discovered-from

# Default to blocks relationship
/beads:dep kota-200 kota-199
```

## Workflow Integration

### During Planning
When creating spec files, identify dependencies:
```bash
/beads:create "Add rate limiting" feature 2
# Returns: kota-123

/beads:dep kota-123 kota-25 blocks
/beads:dep kota-123 kota-30 blocks
```

### During Implementation
When discovering blockers:
```bash
# Currently working on kota-123
# Discover missing prerequisite

/beads:create "Add migration for rate limit counters" task 2
# Returns: kota-200

/beads:dep kota-123 kota-200 blocks
/beads:update kota-123 blocked
```

### Finding Impact
When closing issues, check downstream:
```bash
/beads:update kota-25 closed
/beads:ready  # Shows newly unblocked issues
```

## Automation Notes

ADW workflows can use dependencies for:
- **Prerequisite validation**: Verify blockers resolved before starting implementation
- **Work prioritization**: Prefer high-leverage issues that unblock many dependents
- **Context discovery**: Fetch related issues for design pattern examples
