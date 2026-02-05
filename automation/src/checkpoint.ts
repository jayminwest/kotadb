/**
 * Checkpoint module for workflow resume support
 * Stores checkpoint data at automation/.data/checkpoints/{issueNumber}.json
 * Uses atomic writes (write .tmp then rename) for safety
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHECKPOINT_DIR = join(
  import.meta.dir,
  "..",
  ".data",
  "checkpoints"
);

export interface CheckpointData {
  issueNumber: number;
  workflowId: string | null;
  completedPhases: string[];
  domain: string;
  specPath: string | null;
  filesModified: string[];
  worktreePath: string | null;
  branchName: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ensure checkpoint directory exists
 */
function ensureDir(): void {
  if (!existsSync(CHECKPOINT_DIR)) {
    mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

/**
 * Get checkpoint file path for an issue
 */
function checkpointPath(issueNumber: number): string {
  return join(CHECKPOINT_DIR, `${issueNumber}.json`);
}

/**
 * Write checkpoint data atomically (write .tmp then rename)
 */
export function writeCheckpoint(data: CheckpointData): void {
  ensureDir();
  const filePath = checkpointPath(data.issueNumber);
  const tmpPath = `${filePath}.tmp`;

  const payload = JSON.stringify(data, null, 2);
  writeFileSync(tmpPath, payload, "utf-8");
  renameSync(tmpPath, filePath);
}

/**
 * Read the latest checkpoint for an issue, or null if none exists
 */
export function readLatestCheckpoint(
  issueNumber: number
): CheckpointData | null {
  const filePath = checkpointPath(issueNumber);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const text = readFileSync(filePath, "utf-8");
    return JSON.parse(text) as CheckpointData;
  } catch {
    process.stderr.write(
      `[checkpoint] Warning: Failed to read checkpoint for issue #${issueNumber}\n`
    );
    return null;
  }
}

/**
 * Clear (delete) checkpoint for an issue
 */
export function clearCheckpoint(issueNumber: number): void {
  const filePath = checkpointPath(issueNumber);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

/**
 * List all active checkpoints
 */
export function listCheckpoints(): CheckpointData[] {
  ensureDir();
  const checkpoints: CheckpointData[] = [];

  const files = readdirSync(CHECKPOINT_DIR).filter((f) =>
    f.endsWith(".json")
  );

  for (const file of files) {
    try {
      const filePath = join(CHECKPOINT_DIR, file);
      const text = readFileSync(filePath, "utf-8");
      checkpoints.push(JSON.parse(text) as CheckpointData);
    } catch {
      // Skip invalid checkpoint files
    }
  }

  return checkpoints;
}
