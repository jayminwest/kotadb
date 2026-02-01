/**
 * Git worktree management for isolated agent runs
 * 
 * Enables parallel execution and change isolation by creating dedicated
 * working directories for each workflow execution.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface WorktreeConfig {
  issueNumber: number;
  projectRoot: string;
  baseBranch: string; // "develop"
  timestamp: string;  // ISO format, filesystem-safe
}

export interface WorktreeInfo {
  path: string;           // Absolute path to worktree
  branch: string;         // Branch name (automation/{issue}-{timestamp})
  created: boolean;       // Whether worktree was created (false in dry-run)
}

export interface WorktreeCleanupOptions {
  force?: boolean;        // Force removal even if uncommitted changes exist
  removeBranch?: boolean; // Also delete the branch
}

/**
 * Create isolated git worktree for workflow execution
 * 
 * Location: automation/.worktrees/{issue-number}-{timestamp}/
 * Branch: automation/{issue}-{timestamp}
 * Base: develop
 * 
 * @throws Error if worktree creation fails
 */
export async function createWorktree(
  config: WorktreeConfig
): Promise<WorktreeInfo> {
  const { issueNumber, projectRoot, baseBranch, timestamp } = config;
  
  // Format names
  const worktreeName = `${issueNumber}-${timestamp}`;
  const branchName = `automation/${issueNumber}-${timestamp}`;
  const worktreePath = join(
    projectRoot, 
    "automation", 
    ".worktrees", 
    worktreeName
  );
  
  // Ensure .worktrees directory exists
  const worktreesDir = join(projectRoot, "automation", ".worktrees");
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }
  
  // Create worktree
  const proc = Bun.spawn(
    [
      "git", "worktree", "add",
      "-b", branchName,  // Create new branch
      worktreePath,      // At this path
      baseBranch         // Based on develop
    ],
    {
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to create worktree: ${stderr}`);
  }
  
  return {
    path: worktreePath,
    branch: branchName,
    created: true
  };
}

/**
 * Remove worktree and optionally its branch
 * 
 * Handles cases:
 * - Worktree has uncommitted changes (requires force)
 * - Worktree path doesn't exist (no-op)
 * - Branch deletion (if removeBranch: true)
 * 
 * @throws Error only on critical failures
 */
export async function removeWorktree(
  worktreePath: string,
  options: WorktreeCleanupOptions = {}
): Promise<void> {
  const { force = false, removeBranch = false } = options;
  
  // Check if worktree exists
  if (!await worktreeExists(worktreePath)) {
    return; // Already removed, no-op
  }
  
  // Get worktree info before removal
  let branchName: string | null = null;
  if (removeBranch) {
    const info = await getWorktreeInfo(worktreePath);
    branchName = info?.branch ?? null;
  }
  
  // Remove worktree
  const args = ["git", "worktree", "remove"];
  if (force) args.push("--force");
  args.push(worktreePath);
  
  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe"
  });
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    // Non-fatal: log warning but don't throw
    process.stderr.write(
      `Warning: Failed to remove worktree ${worktreePath}: ${stderr}\n`
    );
    return;
  }
  
  // Remove branch if requested
  if (removeBranch && branchName) {
    const branchProc = Bun.spawn(
      ["git", "branch", "-D", branchName],
      {
        stdout: "pipe",
        stderr: "pipe"
      }
    );
    
    const branchExit = await branchProc.exited;
    if (branchExit !== 0) {
      const stderr = await new Response(branchProc.stderr).text();
      process.stderr.write(
        `Warning: Failed to delete branch ${branchName}: ${stderr}\n`
      );
    }
  }
}

/**
 * Check if worktree exists at path
 */
export async function worktreeExists(
  worktreePath: string
): Promise<boolean> {
  const proc = Bun.spawn(
    ["git", "worktree", "list", "--porcelain"],
    {
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  
  const output = await new Response(proc.stdout).text();
  return output.includes(worktreePath);
}

/**
 * Get worktree info from git worktree list
 * Returns null if not found
 */
export async function getWorktreeInfo(
  worktreePath: string
): Promise<{ branch: string; commit: string } | null> {
  const proc = Bun.spawn(
    ["git", "worktree", "list", "--porcelain"],
    {
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  
  const output = await new Response(proc.stdout).text();
  const lines = output.split("\n");
  
  let inWorktree = false;
  let branch: string | null = null;
  let commit: string | null = null;
  
  for (const line of lines) {
    if (line.startsWith("worktree ") && line.includes(worktreePath)) {
      inWorktree = true;
    } else if (inWorktree && line.startsWith("branch ")) {
      branch = line.replace("branch ", "").trim();
    } else if (inWorktree && line.startsWith("HEAD ")) {
      commit = line.replace("HEAD ", "").trim();
    } else if (line === "") {
      if (inWorktree && branch && commit) {
        return { branch, commit };
      }
      inWorktree = false;
      branch = null;
      commit = null;
    }
  }
  
  return null;
}

/**
 * Format timestamp for filesystem and git branch names
 * Example: "2026-02-01T07-59-00Z"
 */
export function formatWorktreeTimestamp(date: Date): string {
  // ISO format with colons replaced for filesystem safety
  return date.toISOString().replace(/:/g, "-").replace(/\..+/, "Z");
}
