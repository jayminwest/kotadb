# Beads ADW Workflow Integration Guide

This document describes how beads (local issue tracking) integrates with ADW workflows for dependency-aware work selection and atomic claim operations.

## Overview

Beads Integration Phase 2 (issue #303) replaces GitHub API queries with local SQLite database queries in ADW workflows, providing:
- **Sub-50ms work selection** (vs 150ms+ GitHub API latency)
- **Atomic "claim work" operations** (prevents concurrent agent conflicts)
- **Dependency graph queries** (no spec file parsing)
- **Offline-friendly workflows** (local-first data access)

## Architecture

### Data Flow
```
GitHub Issues → bd sync → beads SQLite DB → MCP Tools → ADW Workflows
                             ↓
                        JSONL export → git commit → sync across machines
```

### Key Components
1. **Beads CLI** (`bd`): Command-line interface for issue management
2. **Beads MCP Server** (`plugin:beads:beads`): MCP tools for programmatic access
3. **ADW State Extension**: `beads_issue_id` and `beads_sync` fields track beads metadata
4. **Dual-Source Strategy**: Fallback to GitHub API if beads unavailable

## Using Beads in ADW Workflows

### Work Selection (Orchestrator)

**Before (GitHub API)**:
```bash
gh issue view $1 --json number,title,labels,body,state
# 150ms+ latency per query
# No dependency graph
# Manual spec file parsing
```

**After (Beads)**:
```typescript
const issue = mcp__plugin_beads_beads__show({
  issue_id: `kota-db-ts-${issueNumber}`,
  workspace_root: "."
});
// Sub-50ms latency
// Dependencies included
// No parsing required
```

### Atomic Work Claim

Prevent concurrent agents from working on same issue:
```typescript
const claimed = mcp__plugin_beads_beads__update({
  issue_id: issue.id,
  status: "in_progress",
  assignee: "claude",
  workspace_root: "."
});

if (!claimed) {
  console.error("Another agent claimed this work");
  process.exit(1);
}
```

### Dependency Validation

Check if dependencies resolved before starting work:
```typescript
for (const depId of issue.dependencies) {
  const dep = mcp__plugin_beads_beads__show({
    issue_id: depId,
    workspace_root: "."
  });

  if (dep.status !== "closed") {
    console.error(`Blocked by ${depId}: ${dep.title}`);
    requireForceFlag = true;
  }
}
```

### Checkpoint Updates

Update beads status at each workflow phase:
```typescript
// After plan phase
mcp__plugin_beads_beads__update({
  issue_id: state.beads_issue_id,
  notes: `Plan: ${state.plan_file}`,
  workspace_root: "."
});

// After build phase
mcp__plugin_beads_beads__update({
  issue_id: state.beads_issue_id,
  notes: `PR: ${prUrl}`,
  workspace_root: "."
});

// After review phase
mcp__plugin_beads_beads__close({
  issue_id: state.beads_issue_id,
  reason: "Completed",
  workspace_root: "."
});
```

## Python Automation Layer

For Python scripts that need beads data, use CLI-based helpers:

```python
from adw_modules.beads_ops import (
    query_ready_issues_cli,
    get_issue_details_cli,
    update_issue_status_cli,
)

# Query ready issues
issues = query_ready_issues_cli(priority=1, limit=10)
if not issues:
    # Fallback to GitHub API
    issues = fetch_github_issues()

# Get issue details
details = get_issue_details_cli("kota-db-ts-303")

# Update status
success = update_issue_status_cli(
    "kota-db-ts-303",
    "in_progress",
    assignee="claude",
)
```

## State Schema Extension

ADW state now includes beads tracking fields:

```json
{
  "adw_id": "orch-303-20251028120000",
  "issue_number": "303",
  "beads_issue_id": "kota-db-ts-303",
  "beads_sync": {
    "last_sync": "2025-10-28T12:00:00Z",
    "source": "beads",
    "beads_available": true
  },
  "worktree_name": "feat-303-beads-integration",
  "branch_name": "feat-303-beads-integration"
}
```

## Beads ↔ GitHub Mapping

| Beads Field | GitHub Equivalent | Notes |
|-------------|------------------|-------|
| `id` | Computed (`kota-db-ts-303`) | Beads primary key |
| `external_ref` | `number` (303) | GitHub issue number |
| `title` | `title` | Synced bidirectionally |
| `status` | `state` | `open` → `OPEN`, `closed` → `CLOSED` |
| `priority` | `priority:X` label | 1-5 scale |
| `issue_type` | `type:X` label | `bug`, `feature`, `task`, etc. |
| `dependencies` | `Depends On: #X` | Parsed from issue body |
| `dependents` | `Blocks: #X` | Parsed from issue body |

## Sync Strategy

Beads uses JSONL for git-based sync:

1. **Manual sync**: `bd sync` (exports SQLite → JSONL, commits changes)
2. **Auto-import**: Beads detects newer JSONL on `git pull` and imports automatically
3. **Conflict resolution**: Last-write-wins (SQLite timestamp-based)

## Fallback Strategy

When beads unavailable:
1. Check `beads_available` flag in state
2. Fall back to GitHub API queries
3. Log warning: "Beads unavailable, using GitHub API (slower)"
4. Update `beads_sync.source` to "github"

## Performance Comparison

| Operation | GitHub API | Beads | Improvement |
|-----------|-----------|-------|-------------|
| Get issue details | 150ms+ | 5ms | 30x faster |
| List 100 issues | 500ms+ | 20ms | 25x faster |
| Dependency traversal | 150ms per dep | 5ms per dep | 30x faster |
| Ready work query | 500ms+ | 20ms | 25x faster |

## Troubleshooting

### "Beads CLI not found"
- Install beads: `uv tool install beads`
- Verify: `bd --version`

### "Issue not found in beads"
- Sync beads: `bd sync`
- Check JSONL: `cat .beads/issues.jsonl`
- Verify external_ref: `bd show <issue_id>`

### "Atomic claim failed"
- Check if issue already claimed: `bd show <issue_id>`
- Verify status: Should be `open`, not `in_progress`
- Check worktree isolation: Ensure agents in separate worktrees

### "Dependency sync delay"
- Beads auto-imports JSONL if newer than database
- Force import: `bd import .beads/issues.jsonl`
- Check freshness: Compare JSONL timestamp with database

## Best Practices

1. **Always sync before workflows**: `bd sync` before `/orchestrator` or `/issues:prioritize`
2. **Use beads IDs in logs**: Include `beads_issue_id` in execution logs for traceability
3. **Track sync source**: Record whether data came from beads or GitHub API
4. **Handle unavailability gracefully**: Always provide GitHub API fallback
5. **Update beads at checkpoints**: Sync beads status after each phase completion
6. **Commit JSONL changes**: Include `.beads/issues.jsonl` in workflow commits

## Related Documentation

- Beads Phase 1 (issue #301): Initial beads CLI integration
- Orchestrator Guide (`.claude/commands/workflows/orchestrator.md`): Workflow phases
- Issue Relationships (`.claude/commands/docs/issue-relationships.md`): Dependency types
- Anti-Mock Philosophy (`docs/testing-setup.md`): Real-service testing principles

## Future Work (Phase 3+)

- Real-time sync via GitHub webhooks
- Automatic JSONL commit on `bd update`
- Beads browser extension for GitHub issues
- Multi-user conflict resolution (CRDT-based)
- Performance monitoring dashboard (beads vs GitHub API latency)
