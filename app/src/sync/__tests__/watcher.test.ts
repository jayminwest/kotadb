/**
 * Tests for SyncWatcher - File watcher for automatic JSONL import
 * 
 * Following antimocking philosophy: uses real file systems and databases
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SyncWatcher, createWatcher } from "@sync/watcher.js";
import { createDatabase, type KotaDatabase } from "@db/sqlite/sqlite-client.js";
import { createExporter } from "@db/sqlite/jsonl-exporter.js";

describe("SyncWatcher", () => {
  let tempDir: string;
  let exportDir: string;
  let watcher: SyncWatcher | null = null;
  let db: KotaDatabase | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "watcher-test-"));
    exportDir = join(tempDir, "export");
    mkdirSync(exportDir, { recursive: true });
  });

  afterEach(() => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    if (db) {
      db.close();
      db = null;
    }
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("start() begins watching export directory", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();

    const state = watcher.getState();
    expect(state.isRunning).toBe(true);
  });

  test("stop() ceases watching cleanly", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();
    
    const stateBefore = watcher.getState();
    expect(stateBefore.isRunning).toBe(true);
    
    watcher.stop();

    const stateAfter = watcher.getState();
    expect(stateAfter.isRunning).toBe(false);
  });

  test("non-JSONL file changes are ignored", async () => {
    watcher = new SyncWatcher(exportDir, 100);
    watcher.start();

    const txtPath = join(exportDir, "readme.txt");
    writeFileSync(txtPath, "hello world");

    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = watcher.getState();
    expect(state.pendingFiles.length).toBe(0);
  });

  test("watcher state reports correctly", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();

    const state = watcher.getState();
    expect(state.isRunning).toBe(true);
    expect(state.lastImportAt).toBeDefined();
    expect(state.pendingFiles).toEqual([]);
  });

  test("createWatcher factory function starts watcher automatically", () => {
    watcher = createWatcher(exportDir, 100);

    const state = watcher.getState();
    expect(state.isRunning).toBe(true);
  });

  test("watcher throws error if export directory does not exist", () => {
    const nonExistentDir = join(tempDir, "nonexistent");
    watcher = new SyncWatcher(nonExistentDir);

    expect(() => watcher!.start()).toThrow("Export directory not found");
  });

  test("watcher ignores .deletions.jsonl changes", async () => {
    watcher = new SyncWatcher(exportDir, 100);
    watcher.start();

    const deletionsPath = join(exportDir, ".deletions.jsonl");
    writeFileSync(deletionsPath, JSON.stringify({ table: "test", id: "1", deleted_at: new Date().toISOString() }) + "\n");

    await new Promise((resolve) => setTimeout(resolve, 200));

    const state = watcher.getState();
    expect(state.pendingFiles.length).toBe(0);
  });

  test("start() warns if watcher already started", () => {
    watcher = new SyncWatcher(exportDir);
    watcher.start();
    
    // Starting again should not throw, but will log warning
    watcher.start();
    
    const state = watcher.getState();
    expect(state.isRunning).toBe(true);
  });
});
