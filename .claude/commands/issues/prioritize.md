# Prioritize Open GitHub Issues

Analyze and prioritize open GitHub issues using relationship-aware dependency management. This command helps identify the highest-value unblocked work based on dependencies, labels, and strategic alignment.

## Steps

1. **Sync repo state**
   - `git fetch --all --prune`
   - `git pull --rebase` (ensure you have latest issue metadata)
<<<<<<< HEAD
   - `bd sync` (sync beads database with .beads/issues.jsonl from git)

2. **Fetch all open issues**

**Primary Source: Beads** (local SQLite database, sub-50ms queries)
```typescript
// Query beads for open issues (Phase 2 integration)
const beadsIssues = mcp__plugin_beads_beads__list({
  workspace_root: ".",
  status: "open",  // or "in_progress" to include claimed work
  limit: 100
});

// Beads provides full metadata including dependencies
const issues = beadsIssues.issues.map(issue => ({
  number: issue.external_ref,  // GitHub issue number
  title: issue.title,
  status: issue.status,  // open, in_progress, blocked, closed
  priority: issue.priority,  // 1-5 (where 1=highest)
  type: issue.issue_type,  // bug, feature, task, chore, epic
  dependencies: issue.dependencies,  // Beads IDs (e.g., ["kota-db-ts-25", "kota-db-ts-26"])
  dependents: issue.dependents,  // Issues blocking on this
  labels: issue.labels,
  assignee: issue.assignee,
}));
```

**Fallback Source: GitHub API** (if beads unavailable or not synced)
```bash
gh issue list --limit 100 --state open --json number,title,labels,body,createdAt,updatedAt
```

Filter options:
- Filter by assignee: `--assignee @me` or `--assignee <username>` (GitHub API)
- Filter by priority: `--priority 1` or `--priority 2` (beads MCP)
- Filter by labels: `--label "component:backend"` (GitHub API)

3. **Parse relationship metadata**

**Primary: Beads Dependency Graph** (local, instant queries)
```typescript
// Beads provides dependencies/dependents directly
for (const issue of beadsIssues.issues) {
  // Dependencies: Issues this depends on (blockers)
  const blockers = issue.dependencies.map(depId => {
    return mcp__plugin_beads_beads__show({ issue_id: depId, workspace_root: "." });
  });

  // Dependents: Issues blocked by this (high-leverage)
  const dependents = issue.dependents.map(depId => {
    return mcp__plugin_beads_beads__show({ issue_id: depId, workspace_root: "." });
  });
}
```

**Fallback: Parse Issue Bodies** (GitHub API)
- Review issue bodies for `## Issue Relationships` section (see `.claude/commands/docs/issue-relationships.md`)
- Extract relationship types:
  - **Depends On**: Issues that MUST be completed before work can start (blockers)
  - **Related To**: Issues providing context or sharing technical concerns
  - **Blocks**: Issues waiting on current work to complete
  - **Supersedes**: Issues that replace or deprecate previous work
  - **Child Of**: Issues that are part of larger epics
  - **Follow-Up**: Planned next steps after current work completes
- Check corresponding spec files in `docs/specs/` for additional relationship context
- Use `gh issue view <number>` to inspect individual issues for relationship details

4. **Build dependency graph**

**Primary: Beads** (dependencies already in structured format)
```typescript
// Identify unblocked issues
const unblocked = beadsIssues.issues.filter(issue => {
  return issue.dependencies.every(depId => {
    const dep = mcp__plugin_beads_beads__show({ issue_id: depId, workspace_root: "." });
    return dep && dep.status === "closed";
  });
});

// Identify high-leverage issues (blocking multiple downstream)
const highLeverage = beadsIssues.issues
  .filter(issue => issue.dependents.length > 0)
  .sort((a, b) => b.dependents.length - a.dependents.length);

// Identify isolated issues (no dependencies, safe for parallel execution)
const isolated = beadsIssues.issues.filter(issue =>
  issue.dependencies.length === 0 && issue.dependents.length === 0
);
```

**Fallback: GitHub API** (manual graph building)
- Identify unblocked issues (no unresolved "Depends On" references)
- Identify high-leverage issues (blocking multiple downstream tasks via "Blocks" relationships)
- Identify isolated issues (no dependencies, safe for parallel execution)
- Check if "Depends On" issues are closed/merged before marking an issue as unblocked
=======

2. **Fetch all open issues**
   - `gh issue list --limit 100 --state open --json number,title,labels,body,createdAt,updatedAt`
   - Filter by assignee if needed: `--assignee @me` or `--assignee <username>`
   - Filter by labels if needed: `--label "priority:high"` or `--label "component:backend"`

3. **Parse relationship metadata**
   - Review issue bodies for `## Issue Relationships` section (see `.claude/commands/docs/issue-relationships.md`)
   - Extract relationship types:
     - **Depends On**: Issues that MUST be completed before work can start (blockers)
     - **Related To**: Issues providing context or sharing technical concerns
     - **Blocks**: Issues waiting on current work to complete
     - **Supersedes**: Issues that replace or deprecate previous work
     - **Child Of**: Issues that are part of larger epics
     - **Follow-Up**: Planned next steps after current work completes
   - Check corresponding spec files in `docs/specs/` for additional relationship context
   - Use `gh issue view <number>` to inspect individual issues for relationship details

4. **Build dependency graph**
   - Identify unblocked issues (no unresolved "Depends On" references)
   - Identify high-leverage issues (blocking multiple downstream tasks via "Blocks" relationships)
   - Identify isolated issues (no dependencies, safe for parallel execution)
   - Check if "Depends On" issues are closed/merged before marking an issue as unblocked
>>>>>>> origin/main

5. **Apply prioritization strategy**
   - **Label-based priority**:
     - `priority:critical` > `priority:high` > `priority:medium` > `priority:low`
   - **Effort-based quick wins**:
     - Prefer `effort:small` for quick wins when priority is equal
     - Balance high-priority large efforts with small quick wins
   - **Strategic alignment**:
     - Issues with `Child Of` relationships to active epics
     - Issues referenced in recent project discussions or OKRs
   - **Unblocked status**:
     - ONLY recommend issues with no unresolved dependencies
     - Verify "Depends On" issues are closed before recommending

6. **Generate prioritization report**
   - List top 5-10 highest-priority unblocked issues
   - For each issue, include:
     - Issue number and title
     - Priority, effort, and component labels
     - Dependency status (unblocked, blocked by #X, blocks #Y)
     - Strategic context (epic membership, related work)
     - Recommended action (start immediately, wait for dependencies, needs investigation)
   - Separate sections for:
     - **Ready to Start**: Unblocked issues sorted by priority/effort
     - **Blocked**: Issues waiting on dependencies (with blocker details)
     - **High-Leverage**: Issues blocking multiple downstream tasks

7. **Validate recommendations**
   - For each recommended issue, verify:
     - All "Depends On" issues are closed/merged
     - Labels are complete (component, priority, effort, status)
     - Issue is not already assigned (unless filtering by assignee)
   - If issues are missing metadata, note them for cleanup in report

## Reporting

Provide a structured prioritization report with:
- **Executive Summary**: Top 3 recommended issues with rationale
- **Ready to Start**: Full list of unblocked issues (sorted by priority/effort)
- **Blocked**: Issues waiting on dependencies (with estimated unblock timeline)
- **High-Leverage**: Issues that would unblock the most downstream work
- **Metadata Issues**: Issues missing labels or relationship documentation
- **Dependency Visualization**: Simple text-based graph showing issue relationships

## Output Schema

This command's output is validated against the following schema:

```json
{
  "type": "object",
  "properties": {
    "ready_to_start": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "priority": { "type": "string" },
          "effort": { "type": "string" },
          "component": { "type": "string" },
          "rationale": { "type": "string" }
        },
        "required": ["number", "title", "priority", "effort", "rationale"]
      }
    },
    "blocked": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "blocked_by": {
            "type": "array",
            "items": { "type": "number" }
          }
        },
        "required": ["number", "title", "blocked_by"]
      }
    },
    "high_leverage": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "number": { "type": "number" },
          "title": { "type": "string" },
          "blocks_count": { "type": "number" }
        },
        "required": ["number", "title", "blocks_count"]
      }
    },
    "summary": { "type": "string" }
  },
  "required": ["ready_to_start", "summary"]
}
```

The output should be a JSON object containing arrays of ready-to-start, blocked, and high-leverage issues, along with a summary of recommendations.

## Examples

### Example: High-priority unblocked feature
Issue #145 (feat: add MCP server foundation):
- Priority: high, Effort: medium, Component: backend
- Depends On: #25 (closed), #26 (closed)
- Blocks: #148, #150
- Rationale: Unblocked after API key and rate limiting merged. Unblocks 2 downstream features.

### Example: Blocked issue
Issue #110 (feat: multi-agent framework Phase 1):
- Priority: high, Effort: large, Component: automation
- Depends On: #105 (open), #108 (open)
- Rationale: Blocked until log analysis and state management are merged.

### Example: Quick win
Issue #52 (chore: add migration validation script):
- Priority: medium, Effort: small, Component: ci-cd
- Depends On: None
- Rationale: Low effort, isolated work, improves CI reliability. Good quick win.
