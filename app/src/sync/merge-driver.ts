/**
 * Custom git merge driver for JSONL files
 * 
 * Resolves conflicts in .jsonl files using line-based reconciliation:
 * - Lines with same ID: use THEIRS (assume remote is authoritative)
 * - Lines unique to OURS: keep them
 * - Lines unique to THEIRS: keep them
 * 
 * Algorithm:
 * 1. Parse BASE, OURS, THEIRS into ID-keyed maps
 * 2. Collect all unique IDs across versions
 * 3. For each ID, choose THEIRS if present, else OURS
 * 4. Sort by ID for deterministic output
 * 5. Write merged JSONL to OURS path
 * 
 * Installation:
 * ```bash
 * # Add to .git/config or ~/.gitconfig
 * [merge "jsonl"]
 *   name = JSONL merge driver
 *   driver = bun run src/sync/merge-driver.ts %O %A %B %L
 * ```
 * 
 * @module @sync/merge-driver
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "merge-driver" });

/**
 * Parsed JSONL entry with ID
 */
interface JSONLEntry {
  id: string;
  line: string;
  data: Record<string, unknown>;
}

/**
 * Parse JSONL file into ID-keyed map
 */
function parseJSONL(filepath: string): Map<string, JSONLEntry> {
  const content = readFileSync(filepath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = new Map<string, JSONLEntry>();

  for (const line of lines) {
    try {
      const data = JSON.parse(line) as Record<string, unknown>;
      const id = data.id as string;

      if (!id) {
        logger.warn("JSONL entry missing ID, skipping", { line });
        continue;
      }

      entries.set(id, { id, line, data });
    } catch (error) {
      logger.error(
        "Failed to parse JSONL line",
        error instanceof Error ? error : new Error(String(error)),
        { line }
      );
    }
  }

  return entries;
}

/**
 * Merge three JSONL versions (base, ours, theirs)
 * 
 * Strategy: THEIRS-preferred merge
 * - If ID in THEIRS: use THEIRS
 * - Else if ID in OURS: use OURS
 * - Else: skip (was deleted in both)
 */
function mergeJSONL(
  basePath: string,
  oursPath: string,
  theirsPath: string
): string {
  const base = parseJSONL(basePath);
  const ours = parseJSONL(oursPath);
  const theirs = parseJSONL(theirsPath);

  // Collect all IDs
  const allIds = new Set<string>([
    ...base.keys(),
    ...ours.keys(),
    ...theirs.keys()
  ]);

  // Merge: prefer THEIRS, fallback to OURS
  const merged: JSONLEntry[] = [];
  for (const id of allIds) {
    if (theirs.has(id)) {
      merged.push(theirs.get(id)!);
    } else if (ours.has(id)) {
      merged.push(ours.get(id)!);
    }
    // If neither has it, ID was deleted in both - skip
  }

  // Sort by ID for deterministic output
  merged.sort((a, b) => a.id.localeCompare(b.id));

  // Format as JSONL
  return merged.map((entry) => entry.line).join("\n") + "\n";
}

/**
 * Main merge driver entry point
 * 
 * Git invokes as: merge-driver %O %A %B %L
 * - %O: base version path
 * - %A: ours version path (current branch)
 * - %B: theirs version path (incoming branch)
 * - %L: conflict marker size (unused)
 */
export function runMergeDriver(
  basePath: string,
  oursPath: string,
  theirsPath: string,
  _markerSize: string
): number {
  logger.info("JSONL merge driver invoked", {
    base: basePath,
    ours: oursPath,
    theirs: theirsPath
  });

  try {
    const merged = mergeJSONL(basePath, oursPath, theirsPath);

    // Write merged result to OURS path
    writeFileSync(oursPath, merged, "utf-8");

    logger.info("JSONL merge completed successfully", {
      output: oursPath
    });

    return 0; // Success
  } catch (error) {
    logger.error(
      "JSONL merge failed",
      error instanceof Error ? error : new Error(String(error)),
      {
        base: basePath,
        ours: oursPath,
        theirs: theirsPath
      }
    );

    return 1; // Conflict (git will mark file as conflicted)
  }
}

// CLI entry point (when run via `bun run merge-driver.ts`)
if (import.meta.main) {
  const [basePath, oursPath, theirsPath, markerSize] = process.argv.slice(2);

  if (!basePath || !oursPath || !theirsPath) {
    process.stderr.write("Usage: merge-driver.ts <base> <ours> <theirs> <marker-size>\n");
    process.exit(1);
  }

  const exitCode = runMergeDriver(basePath, oursPath, theirsPath, markerSize || "7");
  process.exit(exitCode);
}
