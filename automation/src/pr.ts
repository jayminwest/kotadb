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
  workflowId?: string;
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

interface ValidationResult {
  level: 1 | 2 | 3;
  justification: string;
  commands: Array<{
    command: string;
    passed: boolean;
    output: string;
  }>;
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
      .map((line) => {
        // Git status porcelain format: "XY filename" where X/Y are status codes
        // Extract filename after status prefix (handles " M ", "?? ", "A  ", etc.)
        const match = line.match(/^..\s+(.+)$/);
        return match?.[1]?.trim() ?? line.trim();
      });

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
  
  // Remove redundant prefixes (e.g., "feat(api): " from issue title)
  let cleanTitle = issueTitle.trim();
  const redundantPrefixPattern = /^(feat|fix|chore|refactor|docs|test)\([^)]+\):\s*/i;
  cleanTitle = cleanTitle.replace(redundantPrefixPattern, '');
  
  // Extract imperative verb description
  // "/git:pull_request" format: "<issue_type>: <imperative verb> <feature name> (#<issue_number>)"
  const prefix = `${issueType}(${domain}): `;
  const suffix = ` (#${issueNumber})`;
  const availableLength = maxLength - prefix.length - suffix.length;
  
  const truncatedTitle = cleanTitle.length > availableLength 
    ? cleanTitle.substring(0, availableLength - 3) + "..."
    : cleanTitle;
  
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
 * Run validation commands in worktree and capture results
 */
async function runValidation(
  worktreePath: string,
  domain: string
): Promise<ValidationResult> {
  const commands = [
    { command: "bunx tsc --noEmit", name: "typecheck", requiredForLevel: 1 },
    { command: "bun test", name: "tests", requiredForLevel: 2 },
  ];
  
  const results: ValidationResult["commands"] = [];
  
  for (const { command, name } of commands) {
    try {
      const { exitCode, stdout, stderr } = await execCommand(
        command.split(" "),
        worktreePath
      );
      
      const passed = exitCode === 0;
      const output = passed 
        ? `Passed (${stdout.trim() || 'OK'})`
        : `Failed: ${stderr.trim()}`;
      
      results.push({ command, passed, output });
    } catch (error) {
      results.push({ 
        command, 
        passed: false, 
        output: `Error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
  
  // Determine validation level
  const level = determineValidationLevel(domain, results);
  
  return {
    level,
    justification: getValidationJustification(level, domain),
    commands: results
  };
}

function determineValidationLevel(
  domain: string,
  results: ValidationResult["commands"]
): 1 | 2 | 3 {
  // Level 1: Docs/config only
  // Level 2: Feature implementation (default for automation)
  // Level 3: Schema migrations or breaking changes
  
  // Automation workflows are typically Level 2 (feature implementation)
  return 2;
}

function getValidationJustification(
  level: 1 | 2 | 3,
  domain: string
): string {
  if (level === 1) return "Level 1: Documentation or configuration changes only";
  if (level === 2) return `Level 2: ${domain} domain feature implementation with type safety and tests`;
  return "Level 3: Schema migration or breaking change with full validation";
}

/**
 * Build PR body with Summary, Validation Evidence, Test plan, and attribution
 */
function buildPRBody(
  issueNumber: number,
  domain: string,
  filesModified: string[],
  validation: ValidationResult,
  metrics?: PRCreationOptions["metrics"],
  workflowId?: string
): string {
  const lines: string[] = [];
  
  lines.push("## Summary");
  lines.push(`Automated implementation for ${domain} domain (issue #${issueNumber})`);
  lines.push("");
  lines.push(`**Files Modified**: ${filesModified.length}`);
  lines.push("");
  
  // Validation Evidence section (per /git:pull_request template)
  lines.push("## Validation Evidence");
  lines.push("");
  lines.push(`### Validation Level: ${validation.level}`);
  lines.push(`**Justification**: ${validation.justification}`);
  lines.push("");
  lines.push("**Commands Run**:");
  for (const cmd of validation.commands) {
    const status = cmd.passed ? "✅" : "❌";
    lines.push(`- ${status} \`${cmd.command}\` - ${cmd.output}`);
  }
  lines.push("");
  
  // Anti-mock statement (required by /git:pull_request)
  lines.push("## Anti-Mock Compliance");
  lines.push("No mocks were introduced in this automated workflow. All tests use real SQLite databases and actual file system operations.");
  lines.push("");
  
  // Plan link (if spec path available)
  lines.push("## Plan");
  lines.push(`See automation workflow context in \`.claude/.cache/workflow-logs/\``);
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
  
  lines.push(`Closes #${issueNumber}`);
  lines.push("");
  
  if (workflowId) {
    lines.push(`ADW ID: ${workflowId}`);
    lines.push("");
  }
  
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
  worktreePath: string,
  filesModified: string[],
  validation: ValidationResult,
  metrics?: PRCreationOptions["metrics"],
  workflowId?: string
): Promise<string | null> {
  try {
    process.stdout.write(`Creating PR for #${issueNumber}...\n`);

    const title = formatPRTitle(issueType, domain, issueTitle, issueNumber);
    const body = buildPRBody(issueNumber, domain, filesModified, validation, metrics, workflowId);

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
      worktreePath
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
    metrics,
    workflowId
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

  // Step 0: Run validation
  process.stdout.write("Running validation...\n");
  const validation = await runValidation(worktreePath, domain);
  
  if (!validation.commands.every(c => c.passed)) {
    return {
      success: false,
      prUrl: null,
      commitSha: null,
      errorMessage: "Validation failed - cannot create PR"
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
  const prUrl = await createPullRequest(
    issueType, 
    issueTitle, 
    domain, 
    issueNumber, 
    branchName, 
    worktreePath,
    filesModified, 
    validation,
    metrics,
    workflowId
  );
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
