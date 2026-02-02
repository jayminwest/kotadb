/**
 * PR creation module for automated workflow completion
 * Commits changes, pushes branch, and creates PR via gh CLI
 */

export type IssueType = "feat" | "fix" | "chore" | "refactor";

export interface PRCreationOptions {
  worktreePath: string;
  branchName: string;
  issueNumber: number;
  issueType: IssueType;
  issueTitle: string;
  domain: string;
  filesModified: string[];
  dryRun: boolean;
  metrics?: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    durationMs: number;
  };
}

export interface PRCreationResult {
  success: boolean;
  prUrl: string | null;
  commitSha: string | null;
  errorMessage: string | null;
}

/**
 * Execute a git/gh command and return result
 */
async function execCommand(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Commit expertise.yaml changes after improve phase
 * Checks for uncommitted changes and commits them with a descriptive message
 * @returns Commit SHA on success, null if no changes or on failure
 */
export async function commitExpertiseChanges(
  worktreePath: string,
  domain: string,
  issueNumber: number
): Promise<string | null> {
  try {
    // Check for uncommitted changes
    const { stdout: status, exitCode: statusExitCode } = await execCommand(
      ["git", "status", "--porcelain"],
      worktreePath
    );

    if (statusExitCode !== 0) {
      process.stderr.write(`Failed to check git status\n`);
      return null;
    }

    // Filter for expertise.yaml files and spec files
    const lines = status.split("\n").filter((line) => line.trim());
    const expertiseFiles = lines
      .filter((line) => line.includes("expertise.yaml") || line.includes("docs/specs/"))
      .map((line) => line.substring(3).trim()); // Remove status prefix (e.g., " M " or "?? ")

    if (expertiseFiles.length === 0) {
      return null; // No expertise changes
    }

    process.stdout.write(`Found ${expertiseFiles.length} expertise/spec file(s) to commit\n`);

    // Stage expertise files
    const { exitCode: addExitCode, stderr: addStderr } = await execCommand(
      ["git", "add", ...expertiseFiles],
      worktreePath
    );

    if (addExitCode !== 0) {
      process.stderr.write(`Failed to stage expertise files: ${addStderr}\n`);
      return null;
    }

    // Create commit
    const commitMessage = `chore(expertise): update ${domain} expertise from #${issueNumber}`;
    const { exitCode: commitExitCode, stderr: commitStderr } = await execCommand(
      ["git", "commit", "-m", commitMessage],
      worktreePath
    );

    if (commitExitCode !== 0) {
      if (commitStderr.includes("nothing to commit")) return null;
      process.stderr.write(`Failed to commit expertise changes: ${commitStderr}\n`);
      return null;
    }

    // Get commit SHA
    const { stdout: sha, exitCode: shaExitCode } = await execCommand(
      ["git", "rev-parse", "HEAD"],
      worktreePath
    );

    if (shaExitCode !== 0) return null;

    process.stdout.write(`Committed expertise changes: ${sha.substring(0, 7)} (${commitMessage})\n`);
    return sha;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Expertise commit failed: ${errorMessage}\n`);
    return null;
  }
}

/**
 * Format PR title following conventional commits, under 70 chars
 */
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

/**
 * Stage and commit all modified files
 * @returns Commit SHA on success, null on failure
 */
export async function commitChanges(
  worktreePath: string,
  issueNumber: number,
  issueType: IssueType,
  domain: string,
  filesModified: string[]
): Promise<string | null> {
  try {
    // Stage all modified files
    if (filesModified.length > 0) {
      const { exitCode: addExitCode, stderr: addStderr } = await execCommand(
        ["git", "add", ...filesModified],
        worktreePath
      );
      if (addExitCode !== 0) {
        process.stderr.write(`Failed to stage files: ${addStderr}\n`);
        // Fallback to staging all changes
        const { exitCode: addAllExitCode, stderr: addAllStderr } = await execCommand(
          ["git", "add", "-A"],
          worktreePath
        );
        if (addAllExitCode !== 0) {
          process.stderr.write(`Failed to stage all changes: ${addAllStderr}\n`);
          return null;
        }
      }
    } else {
      // No specific files, stage all changes
      const { exitCode, stderr } = await execCommand(
        ["git", "add", "-A"],
        worktreePath
      );
      if (exitCode !== 0) {
        process.stderr.write(`Failed to stage changes: ${stderr}\n`);
        return null;
      }
    }

    // Create commit with proper conventional commit format
    const commitMessage = `${issueType}(${domain}): implement issue #${issueNumber}

Auto-generated by KotaDB automation workflow.`;

    const { exitCode: commitExitCode, stderr: commitStderr } = await execCommand(
      ["git", "commit", "-m", commitMessage],
      worktreePath
    );

    if (commitExitCode !== 0) {
      process.stderr.write(`Failed to create commit: ${commitStderr}\n`);
      return null;
    }

    // Get commit SHA
    const { stdout: sha, exitCode: shaExitCode } = await execCommand(
      ["git", "rev-parse", "HEAD"],
      worktreePath
    );

    if (shaExitCode !== 0) {
      process.stderr.write(`Failed to get commit SHA\n`);
      return null;
    }

    process.stdout.write(`Created commit ${sha.substring(0, 7)} for #${issueNumber}\n`);
    return sha;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Commit failed: ${errorMessage}\n`);
    return null;
  }
}

/**
 * Push branch to origin
 * @returns true on success, false on failure
 */
export async function pushBranch(
  worktreePath: string,
  branchName: string
): Promise<boolean> {
  try {
    process.stdout.write(`Pushing branch ${branchName} to origin...\n`);

    const { exitCode, stderr } = await execCommand(
      ["git", "push", "-u", "origin", branchName],
      worktreePath
    );

    if (exitCode !== 0) {
      process.stderr.write(`Failed to push branch: ${stderr}\n`);
      return false;
    }

    process.stdout.write(`Branch ${branchName} pushed to origin\n`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Push failed: ${errorMessage}\n`);
    return false;
  }
}

/**
 * Build PR body with Summary, Test plan, and attribution
 */
function buildPRBody(
  issueNumber: number,
  domain: string,
  filesModified: string[],
  metrics?: PRCreationOptions["metrics"]
): string {
  const lines: string[] = [];
  
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
  lines.push(`Closes #${issueNumber}`);
  lines.push("");
  lines.push("---");
  lines.push("🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  
  return lines.join("\n");
}

/**
 * Create PR via gh CLI
 * @returns PR URL on success, null on failure
 */
export async function createPullRequest(
  issueType: IssueType,
  issueTitle: string,
  domain: string,
  issueNumber: number,
  branchName: string,
  filesModified: string[],
  metrics?: PRCreationOptions["metrics"]
): Promise<string | null> {
  try {
    process.stdout.write(`Creating PR for #${issueNumber}...\n`);

    const title = formatPRTitle(issueType, domain, issueTitle, issueNumber);
    const body = buildPRBody(issueNumber, domain, filesModified, metrics);

    const { stdout, stderr, exitCode } = await execCommand(
      [
        "gh",
        "pr",
        "create",
        "--base",
        "develop",
        "--head",
        branchName,
        "--title",
        title,
        "--body",
        body,
      ],
      process.cwd()
    );

    if (exitCode !== 0) {
      process.stderr.write(`Failed to create PR: ${stderr}\n`);
      return null;
    }

    // gh pr create outputs the PR URL on success
    const prUrl = stdout;
    process.stdout.write(`PR created: ${prUrl}\n`);
    return prUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`PR creation failed: ${errorMessage}\n`);
    return null;
  }
}

/**
 * Main orchestrator-facing function for PR creation
 * Handles the full workflow: commit, push, create PR
 */
export async function handlePRCreation(
  options: PRCreationOptions
): Promise<PRCreationResult> {
  const { 
    worktreePath, 
    branchName, 
    issueNumber, 
    issueType,
    issueTitle,
    domain,
    filesModified, 
    dryRun, 
    metrics 
  } = options;

  // Handle dry-run mode
  if (dryRun) {
    process.stdout.write(`[dry-run] Would commit changes for #${issueNumber}\n`);
    process.stdout.write(`[dry-run] Would push branch ${branchName} to origin\n`);
    process.stdout.write(`[dry-run] Would create PR targeting develop branch\n`);
    return {
      success: true,
      prUrl: null,
      commitSha: null,
      errorMessage: null,
    };
  }

  // Step 1: Commit changes
  const commitSha = await commitChanges(worktreePath, issueNumber, issueType, domain, filesModified);
  if (!commitSha) {
    return {
      success: false,
      prUrl: null,
      commitSha: null,
      errorMessage: "Failed to commit changes",
    };
  }

  // Step 2: Push branch
  const pushSuccess = await pushBranch(worktreePath, branchName);
  if (!pushSuccess) {
    return {
      success: false,
      prUrl: null,
      commitSha,
      errorMessage: "Failed to push branch to origin",
    };
  }

  // Step 3: Create PR
  const prUrl = await createPullRequest(issueType, issueTitle, domain, issueNumber, branchName, filesModified, metrics);
  if (!prUrl) {
    return {
      success: false,
      prUrl: null,
      commitSha,
      errorMessage: "Failed to create pull request",
    };
  }

  return {
    success: true,
    prUrl,
    commitSha,
    errorMessage: null,
  };
}
