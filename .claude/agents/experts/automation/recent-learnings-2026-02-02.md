# Automation Expertise Learnings (2026-02-02)

## Summary of Recent Changes

Analysis of git commits from the past 2 weeks reveals four major enhancements to the automation layer:

1. **GitHub Issue Content Fetching** (Issue #77, commit 6e37270)
2. **Automated PR Creation** (Issue #81, commit ca54809)  
3. **PR Formatting Improvements** (Issue #88, commit d4ecd73)
4. **Git Worktree Isolation** (Issue #64, commit f1f3911)
5. **Console Output Transparency** (Issue #65, commit 79fe4a5)

## 1. GitHub Issue Content Fetching

### Problem Solved
Claude was hallucinating issue requirements because analysis phase prompted "analyze GitHub issue #X" without fetching actual issue content.

### Implementation
- Added `fetchIssueContent()` function using gh CLI with JSON output
- Fetches title, body, labels, state fields
- Includes issue data in analysis phase prompt
- Added FETCH_ISSUE and ISSUE_FETCHED logging events

### Key Learnings
- **Always fetch real data**: Never ask Claude to "analyze issue #X" without providing the actual content
- **Use gh CLI JSON format**: `gh issue view N --json title,body,labels,state` provides structured data
- **Include in prompt**: Analysis prompt must contain the full issue context
- **Log for observability**: Track issue fetching as a distinct workflow event

### Code Pattern
```typescript
interface GitHubIssue {
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  state: string;
}

async function fetchIssueContent(issueNumber: number): Promise<GitHubIssue> {
  const proc = Bun.spawn(
    ["gh", "issue", "view", String(issueNumber), "--json", "title,body,labels,state"],
    { stdout: "pipe", stderr: "pipe" }
  );
  
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to fetch issue #${issueNumber}: ${stderr}`);
  }
  
  return JSON.parse(output);
}
```

## 2. Automated PR Creation

### Problem Solved
After workflow completion, implementation had to be manually committed and PR created, slowing down automation velocity.

### Implementation
- Added Phase 5 (PR creation) to workflow
- New `automation/src/pr.ts` module with:
  - `commitChanges()` - stages and commits implementation
  - `pushBranch()` - pushes to origin with -u flag  
  - `createPullRequest()` - creates PR via gh CLI
  - `handlePRCreation()` - orchestrates PR workflow
- Conventional commit format: `type(domain): implement issue #N`
- PR body includes Summary, Metrics table, "Fixes #N"
- Respects --dry-run flag
- Non-fatal failures (log warning, preserve worktree)

### Key Learnings
- **Separate concerns**: PR creation is Phase 5, distinct from improve phase
- **Conventional commits**: Extract issue type from analysis for correct prefix (feat/fix/chore/refactor)
- **Non-fatal failures**: PR creation failures shouldn't fail entire workflow
- **Preserve worktrees**: Keep worktree on both success (for PR review) and failure (for debugging)
- **Dry-run respect**: Log actions without executing in dry-run mode

### Code Pattern
```typescript
export interface PRCreationOptions {
  worktreePath: string;
  branchName: string;
  issueNumber: number;
  issueType: IssueType;
  issueTitle: string;
  domain: string;
  filesModified: string[];
  dryRun: boolean;
  metrics?: { inputTokens, outputTokens, totalCostUsd, durationMs };
}

async function handlePRCreation(options: PRCreationOptions): Promise<PRCreationResult> {
  // Commit implementation
  const implCommit = await commitChanges(...);
  
  // Commit expertise separately  
  const expertiseCommit = await commitExpertiseChanges(...);
  
  // Push branch
  await pushBranch(worktreePath, branchName);
  
  // Create PR
  const prTitle = formatPRTitle(issueType, domain, issueTitle, issueNumber);
  const prBody = buildPRBody(issueNumber, domain, filesModified, metrics);
  
  const proc = Bun.spawn(
    ["gh", "pr", "create", "--title", prTitle, "--body", prBody, "--base", "develop"],
    { cwd: worktreePath, stdout: "pipe" }
  );
  
  const output = await new Response(proc.stdout).text();
  const prUrl = output.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || null;
  
  return { success: true, prUrl, commitSha: implCommit, errorMessage: null };
}
```

## 3. PR Formatting Improvements

### Problem Solved
Initial PR implementation had generic formatting, long titles, mixed commits for expertise and implementation.

### Implementation
- Added `commitExpertiseChanges()` function that:
  - Filters git status for expertise.yaml and docs/specs/ files
  - Commits only expertise files with `chore(expertise): update {domain} expertise from #{issue}`
  - Returns commit SHA for verification
- Added `formatPRTitle()` that:
  - Uses conventional commit format: `type(domain): title (#issue)`
  - Truncates long titles to stay under 70 chars
  - Includes issue number in parentheses
- Added `buildPRBody()` that:
  - Structures body with Summary (bullets), Metrics (table), Test plan (checkboxes)
  - Makes test plan actionable with specific verification steps
  - Adds Claude Code attribution at bottom
- Extract issue type and domain from analysis for proper prefixes

### Key Learnings
- **Separate expertise commits**: Track expertise evolution separately from implementation in git history
- **70 char PR titles**: GitHub recommendation, improves readability
- **Actionable test plans**: Checkbox format with specific steps helps reviewers
- **Extract metadata early**: Get issue type, title, domain during analysis phase
- **Filter git status**: Use `git status --porcelain` and filter for specific paths

### Code Pattern
```typescript
export async function commitExpertiseChanges(
  worktreePath: string,
  domain: string,
  issueNumber: number
): Promise<string | null> {
  const { stdout: status } = await execCommand(
    ["git", "status", "--porcelain"],
    worktreePath
  );
  
  const expertiseFiles = status
    .split("\n")
    .filter((line) => line.includes("expertise.yaml") || line.includes("docs/specs/"))
    .map((line) => line.substring(3).trim());
  
  if (expertiseFiles.length === 0) return null;
  
  await execCommand(["git", "add", ...expertiseFiles], worktreePath);
  
  const commitMessage = `chore(expertise): update ${domain} expertise from #${issueNumber}`;
  await execCommand(["git", "commit", "-m", commitMessage], worktreePath);
  
  const { stdout: sha } = await execCommand(["git", "rev-parse", "HEAD"], worktreePath);
  return sha;
}

function formatPRTitle(
  issueType: IssueType,
  domain: string,
  issueTitle: string,
  issueNumber: number
): string {
  const maxLength = 70;
  const prefix = `${issueType}(${domain}): `;
  const suffix = ` (#${issueNumber})`;
  const availableLength = maxLength - prefix.length - suffix.length;
  
  const truncatedTitle = issueTitle.length > availableLength
    ? issueTitle.substring(0, availableLength - 3) + "..."
    : issueTitle;
    
  return `${prefix}${truncatedTitle}${suffix}`;
}

function buildPRBody(
  issueNumber: number,
  domain: string,
  filesModified: string[],
  metrics?: PRMetrics
): string {
  const lines = [];
  
  lines.push("## Summary");
  lines.push(`- Auto-generated implementation for issue #${issueNumber}`);
  lines.push(`- Domain: ${domain}`);
  lines.push(`- Files modified: ${filesModified.length}`);
  lines.push("");
  
  if (metrics) {
    lines.push("## Metrics");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Input Tokens | ${metrics.inputTokens.toLocaleString()} |`);
    lines.push(`| Output Tokens | ${metrics.outputTokens.toLocaleString()} |`);
    lines.push(`| Cost | $${metrics.totalCostUsd.toFixed(4)} |`);
    lines.push(`| Duration | ${formatDuration(metrics.durationMs)} |`);
    lines.push("");
  }
  
  lines.push("## Test plan");
  lines.push("- [ ] Verify implementation matches issue requirements");
  lines.push("- [ ] Run `bun test` to validate changes");
  lines.push("- [ ] Review modified files for correctness");
  lines.push("");
  lines.push(`Fixes #${issueNumber}`);
  lines.push("");
  lines.push("🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  
  return lines.join("\n");
}
```

## 4. Git Worktree Isolation

### Problem Solved
Workflows executing in user's working directory could conflict with local changes and prevented parallel execution.

### Implementation
- New `automation/src/worktree.ts` module
- `createWorktree()` creates isolated worktree at `automation/.worktrees/{issue}-{timestamp}/`
- Branch naming: `automation/{issue}-{timestamp}`
- `formatWorktreeTimestamp()` creates filesystem-safe timestamps (colons -> hyphens)
- Graceful fallback to projectRoot if worktree creation fails
- Preservation strategy: Keep worktrees on both success and failure
- Skip worktree creation in dry-run mode
- See `.claude/agents/experts/automation/worktree-learnings.md` for full details

### Key Learnings
- **Filesystem-safe timestamps**: Replace colons with hyphens for cross-platform compatibility
- **Graceful fallback**: try-catch with stderr warning, continue with projectRoot
- **Preserve for debugging**: Don't auto-delete worktrees, useful for failure investigation
- **Skip in dry-run**: No side effects in dry-run mode
- **Use --porcelain format**: Parse `git worktree list --porcelain` for structured data

### Code Pattern
```typescript
export function formatWorktreeTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
}

export async function createWorktree(config: WorktreeConfig): Promise<WorktreeInfo> {
  const worktreeName = `${issueNumber}-${timestamp}`;
  const branchName = `automation/${issueNumber}-${timestamp}`;
  const worktreePath = join(projectRoot, "automation", ".worktrees", worktreeName);
  
  const proc = Bun.spawn(
    ["git", "worktree", "add", "-b", branchName, worktreePath, baseBranch],
    { cwd: projectRoot, stdout: "pipe", stderr: "pipe" }
  );
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to create worktree: ${stderr}`);
  }
  
  return { path: worktreePath, branch: branchName, created: true };
}
```

## 5. Console Output Transparency

### Problem Solved
SDK default output (dots) provided minimal visibility into workflow progress. Need detailed action logging without overwhelming output.

### Implementation
- See existing expertise.yaml for full SDK hook integration patterns
- Covered in expertise convergence notes from 2026-02-01

## Expertise Sections to Update

### key_operations (New Entries)
1. `fetch_github_issue_content` - Using gh CLI to fetch real issue data
2. `automate_pr_creation` - Phase 5 PR automation workflow
3. `commit_expertise_changes` - Separate commits for expertise evolution
4. `format_conventional_commits` - Conventional commit and PR title formatting
5. `build_pr_body_with_test_plan` - Structured PR body creation

### decision_trees (New Entries)
1. `github_issue_analysis` - When/how to fetch and use issue content
2. `pr_creation_strategy` - When/how to create PRs, handle failures
3. `worktree_management` - When to use worktrees, fallback strategy

### patterns (New Entries)
1. `github_issue_fetch_pattern` - gh CLI JSON output pattern
2. `pr_automation_pattern` - Separate commits, push, PR creation
3. `expertise_commit_pattern` - Filter git status, commit expertise separately
4. `conventional_commit_pattern` - type(scope): description with truncation

### best_practices (New Sections)
1. `github_integration` - Issue fetching, JSON format, logging
2. `pr_automation` - Separate commits, conventional format, test plans, dry-run
3. `worktree_management` - Timestamp format, fallback, preservation

### known_issues (Updates)
1. Add: PR creation auth failures (non-fatal, log warning)
2. Add: Worktree creation conflicts (resolved by timestamp naming)

### stability/convergence_indicators (Update)
- Update last_reviewed to 2026-02-02
- Note recent implementations: #77 (issue fetching), #81 (PR automation), #88 (formatting), #64 (worktrees), #65 (console transparency)
- insight_rate_trend: still "converging" as PR automation adds new patterns
- contradiction_count: 0 (no conflicts with existing patterns)

## File Structure Changes

### New Files
- `automation/src/pr.ts` (310 lines) - PR creation and expertise commit logic

### Modified Files
- `automation/src/orchestrator.ts` - Added GitHub issue fetching, Phase 5 PR creation, issue type/title extraction
- `automation/src/index.ts` - Worktree creation integration
- `automation/src/workflow.ts` - workingDirectory parameter
- `.claude/agents/experts/automation/worktree-learnings.md` - Worktree patterns (already documented)

## Implementation Quality Notes

- All new features respect --dry-run flag
- All failures are non-fatal where appropriate (PR creation, worktree creation)
- Logging added for all new operations (observability)
- Graceful degradation (fallback to projectRoot if worktrees fail)
- Conventional commit formatting standardized
- Test plans made actionable with checkboxes
- Expertise commits separated from implementation

## Next Steps

These learnings should be integrated into expertise.yaml with careful attention to:
1. YAML syntax (quote strings with colons)
2. Indentation consistency (2 spaces)
3. Code example formatting (use | for multiline strings)
4. Line count management (currently 719, target under 800)

