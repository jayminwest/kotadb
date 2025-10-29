# /beads:sync-github

Synchronize open GitHub issues into the Beads database to maintain alignment between GitHub issue tracker and local Beads SQLite database.

## Purpose

This command ensures that GitHub issues (the source of truth for public tracking) are reflected in the local Beads database (optimized for ADW workflow operations). It creates or updates Beads issues based on open GitHub issues, maintaining:

- Issue metadata (title, labels, status)
- Dependency relationships (from issue body references)
- Priority/effort mappings (from GitHub labels)
- External references (GitHub issue number)

## Prerequisites

1. **Beads initialized**: Run `bd init kota-db-ts` if `.beads/` directory missing
2. **GitHub CLI authenticated**: `gh auth status` shows valid token
3. **Workspace context set**: MCP tools require workspace root

## Execution Flow

### 1. Fetch Open GitHub Issues

```bash
gh issue list \
  --limit 100 \
  --state open \
  --json number,title,body,labels,state
```

**Filter criteria**:
- Only `state: OPEN` issues
- Skip issues already closed in GitHub but open in Beads (will be handled separately)

### 2. Parse Issue Metadata

For each GitHub issue:

**Priority mapping** (from labels):
- `priority:critical` → priority=1
- `priority:high` → priority=2
- `priority:medium` → priority=3
- `priority:low` → priority=4
- No label → priority=3 (default)

**Effort mapping** (from labels):
- `effort:small` → ~1 day
- `effort:medium` → ~1-3 days
- `effort:large` → ~1 week

**Type mapping** (from labels):
- `type:bug` → issue_type="bug"
- `type:feature` → issue_type="feature"
- `type:chore` → issue_type="chore"
- `type:task` → issue_type="task"
- No label → issue_type="task" (default)

**Component extraction** (from labels):
- Labels starting with `component:` → stored in labels array

### 3. Extract Dependencies

Parse issue body for dependency references:

**Blocks relationships**:
```markdown
## Dependencies
- Depends on #123
- Blocked by #456
```

**Related issues**:
```markdown
## Related Issues
- Related to #789
```

### 4. Create or Update Beads Issues

For each GitHub issue:

```typescript
const beadsId = `kota-db-ts-${githubIssueNumber}`;

// Check if issue exists
const existing = mcp__plugin_beads_beads__show({
  issue_id: beadsId,
  workspace_root: "."
});

if (!existing) {
  // Create new beads issue
  mcp__plugin_beads_beads__create({
    id: beadsId,
    title: githubIssue.title,
    description: githubIssue.body,
    issue_type: mappedType,
    priority: mappedPriority,
    labels: componentLabels,
    external_ref: `${githubIssueNumber}`,
    workspace_root: "."
  });
} else {
  // Update existing beads issue
  mcp__plugin_beads_beads__update({
    issue_id: beadsId,
    title: githubIssue.title,
    description: githubIssue.body,
    priority: mappedPriority,
    workspace_root: "."
  });
}
```

### 5. Sync Dependencies

After all issues created/updated, add dependency relationships:

```typescript
for (const dep of dependencies) {
  mcp__plugin_beads_beads__dep({
    issue_id: beadsId,
    depends_on_id: `kota-db-ts-${dep.number}`,
    dep_type: "blocks", // or "related"
    workspace_root: "."
  });
}
```

### 6. Export and Commit

```bash
# Export updated database to JSONL
bd export -o .beads/issues.jsonl

# Commit changes
git add .beads/issues.jsonl
git commit -m "bd sync: $(date -u +%Y-%m-%d\ %H:%M:%S)"
```

## Output Format

Display summary of sync operation:

```
GitHub → Beads Sync Complete

Created: 5 new issues
Updated: 12 existing issues
Unchanged: 23 issues
Dependencies added: 8 relationships

Next steps:
- Review changes: bd list --limit 20
- Query ready work: bd ready --priority 1
- Sync to remote: git push
```

## Error Handling

### GitHub API Errors

If `gh issue list` fails:
- Check authentication: `gh auth status`
- Verify rate limits: `gh api rate_limit`
- Retry with exponential backoff (3 attempts)

### Beads MCP Errors

If MCP tools unavailable:
- Verify workspace context: `mcp__plugin_beads_beads__where_am_i()`
- Set context: `mcp__plugin_beads_beads__set_context({ workspace_root: "." })`
- Check beads init: `ls -la .beads/`

### Dependency Resolution Failures

If referenced issue not found:
- Log warning: "Issue #123 referenced but not found in GitHub"
- Skip dependency (don't fail entire sync)
- Create TODO comment in beads issue notes

## Usage Examples

### Manual Sync

```bash
# Sync all open GitHub issues
claude -c "/beads:sync-github"
```

### Automated Sync (Cron)

Add to `.github/workflows/beads-sync.yml`:

```yaml
name: Beads Sync
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: uv tool install beads
      - run: claude -c "/beads:sync-github"
      - run: git push
```

### Pre-Workflow Sync

Integrate into orchestrator:

```bash
# Always sync before starting workflow
/beads:sync-github
/orchestrator 303 --- Implement feature with fresh issue data
```

## Best Practices

1. **Sync frequency**: Run sync every 6 hours or before major workflow batches
2. **Git hygiene**: Always commit JSONL changes to maintain sync history
3. **Bidirectional caution**: This is GitHub → Beads sync only (not bidirectional)
4. **Status overrides**: Don't override Beads status if issue claimed (`in_progress`)
5. **Dependency verification**: Validate dependency chains after sync (`bd blocked`)

## Limitations

- **One-way sync**: GitHub is source of truth; Beads changes not pushed to GitHub
- **Label dependency**: Relies on consistent GitHub label conventions
- **No deletion**: Closed GitHub issues not automatically closed in Beads (manual cleanup)
- **Rate limits**: GitHub API limited to 5000 requests/hour (authenticated)

## Related Commands

- `/beads:ready` - Query ready-to-work issues
- `/beads:show <issue_id>` - View issue details
- `/beads:update <issue_id> <status>` - Update issue status
- `/orchestrator <issue_number>` - Start ADW workflow

## Related Documentation

- [Beads ADW Integration](./../docs/beads-adw-integration.md) - Workflow integration guide
- [Issue Relationships](./../docs/issue-relationships.md) - Dependency types
- [Beads Quickstart](https://github.com/kotadb/beads) - Beads CLI documentation

## Troubleshooting

### "Duplicate external_ref"

If multiple beads issues reference same GitHub number:
```bash
# Find duplicates
bd list | grep "external_ref: 303"

# Delete duplicate (keep lowest ID)
bd delete kota-db-ts-303-duplicate --force
```

### "Dependency cycle detected"

If circular dependencies found:
```bash
# Visualize dependency graph
bd dep list

# Break cycle by removing one dependency
bd dep remove kota-db-ts-303 kota-db-ts-305
```

### "JSONL merge conflict"

If git merge conflicts in `.beads/issues.jsonl`:
```bash
# Re-export from current database
bd export -o .beads/issues.jsonl

# Stage and commit
git add .beads/issues.jsonl
git commit -m "bd sync: resolve merge conflict"
```
