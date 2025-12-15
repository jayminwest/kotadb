/**
 * Tests for JSONL Merge Driver - Custom git merge driver for conflict resolution
 * 
 * Following antimocking philosophy: uses real file system operations
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMergeDriver } from "@sync/merge-driver.js";

describe("JSONL Merge Driver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "merge-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("merges with no conflicts (same data)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    const data = JSON.stringify({ id: "1", name: "Alice" }) + "\n";
    writeFileSync(base, data);
    writeFileSync(ours, data);
    writeFileSync(theirs, data);

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    expect(merged).toBe(data);
  });

  test("prefers THEIRS on conflict (same ID, different data)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, JSON.stringify({ id: "1", name: "Alice" }) + "\n");
    writeFileSync(ours, JSON.stringify({ id: "1", name: "Alice Local" }) + "\n");
    writeFileSync(theirs, JSON.stringify({ id: "1", name: "Alice Remote" }) + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Alice Remote"); // THEIRS wins
  });

  test("keeps OURS-only entries", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, JSON.stringify({ id: "1", name: "Local Only" }) + "\n");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Local Only");
  });

  test("keeps THEIRS-only entries", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, "");
    writeFileSync(theirs, JSON.stringify({ id: "1", name: "Remote Only" }) + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const parsed = JSON.parse(merged.trim());
    expect(parsed.name).toBe("Remote Only");
  });

  test("handles deleted entries (absent in both OURS and THEIRS)", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, JSON.stringify({ id: "1", name: "Deleted" }) + "\n");
    writeFileSync(ours, "");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    expect(merged.trim()).toBe(""); // No entries
  });

  test("merges multiple entries with mixed conflicts", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    // Base has 3 entries
    writeFileSync(base, [
      JSON.stringify({ id: "1", name: "Alice" }),
      JSON.stringify({ id: "2", name: "Bob" }),
      JSON.stringify({ id: "3", name: "Charlie" })
    ].join("\n") + "\n");

    // OURS: modified 1, deleted 2, added 4
    writeFileSync(ours, [
      JSON.stringify({ id: "1", name: "Alice Local" }),
      JSON.stringify({ id: "3", name: "Charlie" }),
      JSON.stringify({ id: "4", name: "David Local" })
    ].join("\n") + "\n");

    // THEIRS: modified 1 (different), kept 2, added 5
    writeFileSync(theirs, [
      JSON.stringify({ id: "1", name: "Alice Remote" }),
      JSON.stringify({ id: "2", name: "Bob" }),
      JSON.stringify({ id: "3", name: "Charlie" }),
      JSON.stringify({ id: "5", name: "Eve Remote" })
    ].join("\n") + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const lines = merged.trim().split("\n");
    expect(lines.length).toBe(5);

    const entries = lines.map(line => JSON.parse(line));
    
    // Should prefer THEIRS for id=1
    expect(entries.find(e => e.id === "1")?.name).toBe("Alice Remote");
    
    // Should keep id=2 from THEIRS
    expect(entries.find(e => e.id === "2")?.name).toBe("Bob");
    
    // Should keep id=3 (same in both)
    expect(entries.find(e => e.id === "3")?.name).toBe("Charlie");
    
    // Should keep id=4 from OURS (not in THEIRS)
    expect(entries.find(e => e.id === "4")?.name).toBe("David Local");
    
    // Should keep id=5 from THEIRS (not in OURS)
    expect(entries.find(e => e.id === "5")?.name).toBe("Eve Remote");
  });

  test("sorts merged entries by ID for deterministic output", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, JSON.stringify({ id: "z", name: "Last" }) + "\n");
    writeFileSync(theirs, JSON.stringify({ id: "a", name: "First" }) + "\n");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const lines = merged.trim().split("\n");
    const entries = lines.map(line => JSON.parse(line));
    
    // Should be sorted: a, z
    expect(entries[0]?.id).toBe("a");
    expect(entries[1]?.id).toBe("z");
  });

  test("handles entries without ID gracefully", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, [
      JSON.stringify({ id: "1", name: "Valid" }),
      JSON.stringify({ name: "No ID" }) // Missing ID - should be skipped
    ].join("\n") + "\n");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const lines = merged.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    
    const parsed = JSON.parse(lines[0] || "{}");
    expect(parsed.id).toBe("1");
  });

  test("handles malformed JSON gracefully", () => {
    const base = join(tempDir, "base.jsonl");
    const ours = join(tempDir, "ours.jsonl");
    const theirs = join(tempDir, "theirs.jsonl");

    writeFileSync(base, "");
    writeFileSync(ours, [
      JSON.stringify({ id: "1", name: "Valid" }),
      "{ invalid json }" // Malformed - should be skipped
    ].join("\n") + "\n");
    writeFileSync(theirs, "");

    const exitCode = runMergeDriver(base, ours, theirs, "7");
    expect(exitCode).toBe(0);

    const merged = readFileSync(ours, "utf-8");
    const lines = merged.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    
    const parsed = JSON.parse(lines[0] || "{}");
    expect(parsed.id).toBe("1");
  });
});
