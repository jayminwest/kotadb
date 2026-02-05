/**
 * Run manifest for automation workflow execution tracking
 * 
 * Manages a JSON manifest of workflow runs at automation/.data/manifest.json.
 * Supports concurrent access via atomic writes (write .tmp, rename).
 */
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { mkdirSync } from "node:fs";

export interface ManifestEntry {
  issueNumber: number;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  worktreePath?: string;
  branch?: string;
  currentPhase?: string;
  prUrl?: string;
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
}

function getManifestPath(projectRoot: string): string {
  return join(projectRoot, "automation", ".data", "manifest.json");
}

/**
 * Read manifest from disk, return empty array if not found
 */
export function readManifest(projectRoot: string): ManifestEntry[] {
  const manifestPath = getManifestPath(projectRoot);
  if (!existsSync(manifestPath)) {
    return [];
  }

  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as ManifestEntry[];
  } catch {
    process.stderr.write(`Warning: Failed to read manifest, returning empty\n`);
    return [];
  }
}

/**
 * Update or insert a manifest entry (upsert by issueNumber + startedAt)
 * Uses atomic write (write .tmp, rename) for concurrent safety
 */
export function updateManifest(
  projectRoot: string,
  entry: Partial<ManifestEntry> & { issueNumber: number; startedAt: string }
): void {
  const manifestPath = getManifestPath(projectRoot);
  const dir = dirname(manifestPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const entries = readManifest(projectRoot);

  // Find existing entry by issueNumber + startedAt
  const existingIdx = entries.findIndex(
    (e) => e.issueNumber === entry.issueNumber && e.startedAt === entry.startedAt
  );

  if (existingIdx >= 0) {
    // Merge update into existing entry
    const existing = entries[existingIdx]!;
    entries[existingIdx] = { ...existing, ...entry };
  } else {
    // Insert new entry with defaults
    entries.push({
      status: "running",
      ...entry
    } as ManifestEntry);
  }

  // Atomic write: write to .tmp file then rename
  const tmpPath = manifestPath + ".tmp";
  try {
    writeFileSync(tmpPath, JSON.stringify(entries, null, 2) + "\n", {
      encoding: "utf-8",
      mode: 0o600
    });
    renameSync(tmpPath, manifestPath);
  } catch (error) {
    process.stderr.write(`Warning: Failed to write manifest: ${error}\n`);
    // Clean up tmp file if rename failed
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Remove completed/failed runs older than maxAgeDays
 * Returns the number of entries pruned
 */
export function pruneManifest(projectRoot: string, maxAgeDays = 7): number {
  const entries = readManifest(projectRoot);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const kept: ManifestEntry[] = [];
  let pruned = 0;

  for (const entry of entries) {
    const startedMs = new Date(entry.startedAt).getTime();
    const isTerminal = entry.status === "completed" || entry.status === "failed" || entry.status === "cancelled";

    if (isTerminal && startedMs < cutoff) {
      pruned++;
    } else {
      kept.push(entry);
    }
  }

  if (pruned > 0) {
    const manifestPath = getManifestPath(projectRoot);
    const tmpPath = manifestPath + ".tmp";
    try {
      writeFileSync(tmpPath, JSON.stringify(kept, null, 2) + "\n", {
        encoding: "utf-8",
        mode: 0o600
      });
      renameSync(tmpPath, manifestPath);
    } catch (error) {
      process.stderr.write(`Warning: Failed to write pruned manifest: ${error}\n`);
      try {
        if (existsSync(tmpPath)) {
          unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return pruned;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "-";
  const seconds = ms / 1000;
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}m ${secs}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

/**
 * Format cost in USD to string with 4 decimal places
 */
function formatCost(cost: number | undefined): string {
  if (cost === undefined) return "-";
  return `$${cost.toFixed(4)}`;
}

/**
 * Pad or truncate a string to fit a column width
 */
function padCol(value: string, width: number): string {
  if (value.length > width) {
    return value.substring(0, width - 1) + "\u2026";
  }
  return value.padEnd(width);
}

/**
 * Pretty-print manifest for --status CLI flag
 * 
 * Output format:
 * Issue  | Status    | Phase     | Duration  | Cost    | PR
 * #123   | completed | pr        | 45.2s     | $0.1234 | https://...
 */
export function formatManifestTable(entries: ManifestEntry[]): string {
  if (entries.length === 0) {
    return "No workflow runs found.\n";
  }

  const headers = {
    issue: 7,
    status: 10,
    phase: 10,
    duration: 10,
    cost: 9,
    pr: 40
  };

  const lines: string[] = [];

  // Header
  lines.push(
    `${padCol("Issue", headers.issue)}| ${padCol("Status", headers.status)}| ${padCol("Phase", headers.phase)}| ${padCol("Duration", headers.duration)}| ${padCol("Cost", headers.cost)}| PR`
  );

  // Separator
  const sep = `${"-".repeat(headers.issue)}|${"-".repeat(headers.status + 1)}|${"-".repeat(headers.phase + 1)}|${"-".repeat(headers.duration + 1)}|${"-".repeat(headers.cost + 1)}|${"-".repeat(headers.pr + 1)}`;
  lines.push(sep);

  // Rows (most recent first)
  const sorted = [...entries].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  for (const entry of sorted) {
    const issue = `#${entry.issueNumber}`;
    const status = entry.status;
    const phase = entry.currentPhase ?? "-";
    const duration = formatDuration(entry.durationMs);
    const cost = formatCost(entry.costUsd);
    const pr = entry.prUrl ?? "-";

    lines.push(
      `${padCol(issue, headers.issue)}| ${padCol(status, headers.status)}| ${padCol(phase, headers.phase)}| ${padCol(duration, headers.duration)}| ${padCol(cost, headers.cost)}| ${pr}`
    );
  }

  return lines.join("\n") + "\n";
}
