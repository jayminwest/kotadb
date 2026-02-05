/**
 * Batch runner for concurrent multi-issue workflow execution
 * Uses a semaphore pattern for concurrency control (no external deps)
 */
import { runWorkflow } from "./workflow.ts";
import {
  createWorktree,
  formatWorktreeTimestamp,
  type WorktreeInfo,
} from "./worktree.ts";

export interface BatchOptions {
  concurrency: number; // default: 3
  failFast: boolean; // default: false (continue-on-error)
  dryRun: boolean;
  verbose: boolean;
  accumulateContext: boolean;
  skipComment: boolean;
}

export interface BatchIssueResult {
  issueNumber: number;
  success: boolean;
  prUrl?: string;
  error?: string;
  durationMs: number;
  costUsd: number;
}

export interface BatchResult {
  results: BatchIssueResult[];
  totalDurationMs: number;
  totalCostUsd: number;
  successCount: number;
  failureCount: number;
}

/**
 * Simple semaphore for concurrency limiting
 * No external dependencies — just a queue + counter
 */
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

/**
 * Run multiple issues concurrently with concurrency limiting
 */
export async function runBatch(
  issues: number[],
  options: BatchOptions,
  projectRoot: string
): Promise<BatchResult> {
  const batchStart = performance.now();
  const semaphore = new Semaphore(options.concurrency);
  let cancelled = false;

  process.stderr.write(
    `[batch] Starting batch run: ${issues.length} issues, concurrency=${options.concurrency}\n`
  );

  const tasks = issues.map((issueNumber) => {
    return async (): Promise<BatchIssueResult> => {
      if (cancelled) {
        return {
          issueNumber,
          success: false,
          error: "Cancelled (fail-fast)",
          durationMs: 0,
          costUsd: 0,
        };
      }

      await semaphore.acquire();
      const issueStart = performance.now();

      try {
        if (cancelled) {
          return {
            issueNumber,
            success: false,
            error: "Cancelled (fail-fast)",
            durationMs: 0,
            costUsd: 0,
          };
        }

        process.stderr.write(`[batch] Starting issue #${issueNumber}\n`);

        // Each issue gets its own worktree
        let worktreeInfo: WorktreeInfo | null = null;
        if (!options.dryRun) {
          try {
            const timestamp = formatWorktreeTimestamp(new Date());
            worktreeInfo = await createWorktree({
              issueNumber,
              projectRoot,
              baseBranch: "develop",
              timestamp,
            });
          } catch (error) {
            process.stderr.write(
              `[batch] Warning: Failed to create worktree for #${issueNumber}: ${error}\n`
            );
          }
        }

        const result = await runWorkflow({
          issueNumber,
          dryRun: options.dryRun,
          verbose: options.verbose,
          accumulateContext: options.accumulateContext,
          workingDirectory: worktreeInfo?.path ?? projectRoot,
          mainProjectRoot: projectRoot,
          branchName: worktreeInfo?.branch,
        });

        const durationMs = Math.round(performance.now() - issueStart);

        const issueResult: BatchIssueResult = {
          issueNumber,
          success: result.success,
          prUrl: result.prUrl ?? undefined,
          error: result.errorMessage ?? undefined,
          durationMs,
          costUsd: result.totalCostUsd,
        };

        process.stderr.write(
          `[batch] Completed issue #${issueNumber}: ${result.success ? "SUCCESS" : "FAILED"}\n`
        );

        if (options.failFast && !result.success) {
          cancelled = true;
        }

        return issueResult;
      } catch (error) {
        const durationMs = Math.round(performance.now() - issueStart);
        const errorMsg =
          error instanceof Error ? error.message : String(error);

        process.stderr.write(
          `[batch] Issue #${issueNumber} threw: ${errorMsg}\n`
        );

        if (options.failFast) {
          cancelled = true;
        }

        return {
          issueNumber,
          success: false,
          error: errorMsg,
          durationMs,
          costUsd: 0,
        };
      } finally {
        semaphore.release();
      }
    };
  });

  // Run all tasks with Promise.allSettled for independent failure handling
  const settled = await Promise.allSettled(tasks.map((t) => t()));

  const results: BatchIssueResult[] = settled.map((s) => {
    if (s.status === "fulfilled") {
      return s.value;
    }
    // Should not happen since we catch within tasks, but handle gracefully
    return {
      issueNumber: 0,
      success: false,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      durationMs: 0,
      costUsd: 0,
    };
  });

  const totalDurationMs = Math.round(performance.now() - batchStart);
  const totalCostUsd = results.reduce((sum, r) => sum + r.costUsd, 0);
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  return {
    results,
    totalDurationMs,
    totalCostUsd,
    successCount,
    failureCount,
  };
}

/**
 * Discover issues with a specific label via gh CLI
 */
export async function discoverIssuesByLabel(
  label: string
): Promise<number[]> {
  const proc = Bun.spawn(
    [
      "gh",
      "issue",
      "list",
      "--label",
      label,
      "--state",
      "open",
      "--json",
      "number",
      "--limit",
      "50",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `Failed to discover issues with label "${label}": ${stderr}`
    );
  }

  const parsed = JSON.parse(output) as Array<{ number: number }>;
  return parsed.map((item) => item.number).sort((a, b) => a - b);
}

/**
 * Format batch results as summary table
 */
export function formatBatchSummary(result: BatchResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("=== Batch Execution Summary ===");
  lines.push("");

  // Header
  const header = padRight("Issue", 10) +
    padRight("Status", 10) +
    padRight("Duration", 14) +
    padRight("Cost", 12) +
    "PR";
  lines.push(header);
  lines.push("-".repeat(70));

  // Per-issue rows
  for (const r of result.results) {
    const status = r.success ? "OK" : "FAIL";
    const duration = formatDuration(r.durationMs);
    const cost = `$${r.costUsd.toFixed(4)}`;
    const pr = r.prUrl ?? (r.error ? `err: ${truncate(r.error, 30)}` : "-");

    lines.push(
      padRight(`#${r.issueNumber}`, 10) +
        padRight(status, 10) +
        padRight(duration, 14) +
        padRight(cost, 12) +
        pr
    );
  }

  // Totals
  lines.push("-".repeat(70));
  const totalDuration = formatDuration(result.totalDurationMs);
  const totalCost = `$${result.totalCostUsd.toFixed(4)}`;
  lines.push(
    padRight("TOTAL", 10) +
      padRight(`${result.successCount}ok/${result.failureCount}fail`, 10) +
      padRight(totalDuration, 14) +
      padRight(totalCost, 12)
  );
  lines.push("");

  return lines.join("\n");
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function padRight(str: string, width: number): string {
  if (str.length >= width) return str;
  return str + " ".repeat(width - str.length);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + "...";
}
