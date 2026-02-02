# Worktree Management Learnings (Issue #64)

## Overview
Git worktree isolation enables parallel workflow execution without conflicts.
Implementation adds `automation/src/worktree.ts` with graceful fallback patterns.

## Key Operations Added

### manage_git_worktrees
- **When**: Enabling isolated workflow execution with parallel safety
- **Location**: `automation/.worktrees/{issue-number}-{timestamp}/`
- **Branch**: `automation/{issue}-{timestamp}`
- **Graceful Fallback**: try-catch with stderr warning, continue with projectRoot
- **Preservation**: Keep on success (PR merge cleanup) and failure (debugging)
- **Dry-run**: Skip worktree creation entirely

**Code Pattern**:
```typescript
const timestamp = formatWorktreeTimestamp(new Date());
let worktreeInfo = null;
if (!dryRun) {
  try {
    worktreeInfo = await createWorktree({
      issueNumber, projectRoot, baseBranch: "develop", timestamp
    });
  } catch (error) {
    process.stderr.write(`Failed, falling back to current directory\n`);
  }
}
await runWorkflow(issueNumber, dryRun, verbose, worktreeInfo?.path ?? projectRoot);
```

### format_worktree_timestamp
- **When**: Creating filesystem and git-safe timestamp identifiers
- **Format**: ISO 8601 with colons replaced by hyphens
- **Result**: `2026-02-01T07-59-00Z` (filesystem-safe, sortable)

**Code**:
```typescript
export function formatWorktreeTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
}
```

### execute_git_worktree_commands
- Use `Bun.spawn` with `git worktree` subcommands
- Parse `--porcelain` output for structured data
- Handle failures gracefully with stderr capture
- Non-fatal failures for removal operations

## Patterns

### worktree_isolation_pattern
- **Structure**: Create isolated worktree, pass path to workflow, preserve on failure
- **Usage**: Enable parallel workflow execution without conflicts
- **Trade-offs**: Disk space and git overhead vs isolation and safety

### timestamp_naming_pattern
- **Structure**: ISO format with filesystem-safe character substitution
- **Usage**: Unique, sortable, cross-platform worktree identifiers
- **Trade-offs**: Timestamp length vs readability and sorting

### graceful_fallback_pattern
- **Structure**: Try worktree creation, catch and warn, continue with projectRoot
- **Usage**: Maintain backward compatibility when worktrees unavailable
- **Trade-offs**: Degraded isolation vs workflow reliability

## Best Practices

- Always use `formatWorktreeTimestamp` for consistency
- Create `.worktrees` directory with recursive option (`mkdir -p`)
- Implement graceful fallback to projectRoot on failure
- Skip worktree creation in dry-run mode
- Preserve worktrees on both success (PR review) and failure (debugging)
- Use `--porcelain` format for parsing `git worktree list`
- Make removal operations non-fatal
- Pass worktree path through workflow layers (index → workflow → logger)

## Pitfalls

- Not handling worktree creation failure causes workflow abort
- Missing `.worktrees` directory prevents creation (mkdir -p required)
- Not using filesystem-safe timestamp breaks on Windows
- Not preserving worktrees on failure complicates debugging
- Forgetting dry-run check creates unnecessary worktrees
- Not using `--porcelain` gives unparseable output

## File Changes

- **New**: `automation/src/worktree.ts` - Git worktree management module
- **Modified**: `automation/src/index.ts` - CLI integration with worktree creation
- **Modified**: `automation/src/workflow.ts` - Added `workingDirectory` parameter

## Integration Points

1. **CLI** (`index.ts`): Create worktree before workflow, preserve on success/failure
2. **Workflow** (`workflow.ts`): Accept optional `workingDirectory` parameter
3. **Logger** (`logger.ts`): Write logs to worktree location when provided
4. **Dry-run**: Skip worktree creation entirely in dry-run mode
5. **Fallback**: Continue with projectRoot if worktree creation fails

