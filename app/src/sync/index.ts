/**
 * Sync layer module exports
 * 
 * @module @sync
 */

export { SyncWatcher, createWatcher } from "./watcher.js";
export { runMergeDriver } from "./merge-driver.js";
export {
  recordDeletion,
  loadDeletionManifest,
  applyDeletionManifest,
  clearDeletionManifest,
  trackDeletions,
  type DeletionEntry
} from "./deletion-manifest.js";
export {
  SourceWatcher,
  createSourceWatcher,
  startWatching,
  stopWatching,
  stopAll,
  getWatchedPaths,
  type ChangeType,
  type FileChangeEvent,
  type SourceWatcherOptions,
} from "./source-watcher.js";
