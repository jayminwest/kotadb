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
