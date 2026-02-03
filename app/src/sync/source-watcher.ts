/**
 * Source code file watcher for automatic re-indexing
 *
 * Watches indexed repositories for source file changes and triggers
 * incremental re-indexing when files are created, modified, or deleted.
 *
 * Features:
 * - Debounced indexing (500ms delay to batch rapid changes)
 * - Ignores: node_modules, .git, .kotadb, dist, build directories
 * - Tracks changed/added/deleted files separately
 * - Integrates with the incremental indexing workflow
 *
 * Issue: #35 - Automatic indexing (source file watching)
 */

import { watch, type FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@logging/logger.js";
import { indexChangedFiles, type ChangedFile } from "@indexer/incremental.js";

const logger = createLogger({ module: "source-watcher" });

/**
 * Directories to ignore when watching for changes
 */
const IGNORED_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".kotadb",
	"dist",
	"build",
	".next",
	".cache",
	"coverage",
	"__pycache__",
	".pytest_cache",
]);

/**
 * File extensions to watch for source code changes
 */
const WATCHED_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".rs",
	".go",
	".java",
	".kt",
	".swift",
	".c",
	".cpp",
	".h",
	".hpp",
	".cs",
	".rb",
	".php",
	".vue",
	".svelte",
]);

/**
 * Change type for file system events
 */
export type ChangeType = "add" | "change" | "delete";

/**
 * File change event
 */
export interface FileChangeEvent {
	type: ChangeType;
	path: string;
	timestamp: number;
}

/**
 * Source watcher options
 */
export interface SourceWatcherOptions {
	repositoryPath: string;
	repositoryId: string;
	debounceMs?: number;
	onChanges?: ChangeHandler;
}

/**
 * Callback for when changes are ready to be processed
 */
export type ChangeHandler = (
	repositoryPath: string,
	repositoryId: string,
	changes: {
		added: string[];
		modified: string[];
		deleted: string[];
	},
) => Promise<void>;

/**
 * SourceWatcher - Watches a repository directory for source code changes
 */
export class SourceWatcher {
	private watcher: FSWatcher | null = null;
	private pendingChanges: Map<string, FileChangeEvent> = new Map();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly repositoryPath: string;
	private readonly repositoryId: string;
	private readonly debounceMs: number;
	private readonly onChanges: ChangeHandler;

	constructor(options: SourceWatcherOptions) {
		this.repositoryPath = options.repositoryPath;
		this.repositoryId = options.repositoryId;
		this.debounceMs = options.debounceMs ?? 500;
		this.onChanges = options.onChanges ?? defaultChangeHandler;
	}

	/**
	 * Start watching the repository
	 */
	start(): void {
		if (this.watcher) {
			logger.warn("Watcher already started", { path: this.repositoryPath });
			return;
		}

		if (!existsSync(this.repositoryPath)) {
			throw new Error("Repository path not found: " + this.repositoryPath);
		}

		this.watcher = watch(
			this.repositoryPath,
			{ recursive: true },
			(eventType, filename) => {
				if (!filename) return;
				this.handleFileEvent(eventType, filename);
			},
		);

		logger.info("Source watcher started", {
			path: this.repositoryPath,
			repositoryId: this.repositoryId,
		});
	}

	/**
	 * Stop watching
	 */
	stop(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
			logger.info("Source watcher stopped", { path: this.repositoryPath });
		}
	}

	/**
	 * Handle a file system event
	 */
	private handleFileEvent(eventType: string, filename: string): void {
		// Skip ignored directories
		const pathParts = filename.split("/");
		for (const part of pathParts) {
			if (IGNORED_DIRECTORIES.has(part)) {
				return;
			}
		}

		// Check file extension
		const ext = "." + filename.split(".").pop();
		if (!WATCHED_EXTENSIONS.has(ext)) {
			return;
		}

		// Determine change type
		const fullPath = join(this.repositoryPath, filename);
		let changeType: ChangeType;

		if (!existsSync(fullPath)) {
			changeType = "delete";
		} else {
			// Check if file or rename event
			const isNew = !this.pendingChanges.has(filename);
			changeType = eventType === "rename" && isNew ? "add" : "change";
		}

		// Record the change
		this.pendingChanges.set(filename, {
			type: changeType,
			path: filename,
			timestamp: Date.now(),
		});

		logger.debug("File change detected", {
			type: changeType,
			file: filename,
			repositoryId: this.repositoryId,
		});

		// Schedule processing
		this.scheduleProcess();
	}

	/**
	 * Schedule change processing with debouncing
	 */
	private scheduleProcess(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.processChanges().catch((error) => {
				logger.error(
					"Failed to process changes",
					error instanceof Error ? error : new Error(String(error)),
					{ repositoryId: this.repositoryId },
				);
			});
		}, this.debounceMs);
	}

	/**
	 * Process accumulated changes
	 */
	private async processChanges(): Promise<void> {
		if (this.pendingChanges.size === 0) {
			return;
		}

		// Collect changes
		const added: string[] = [];
		const modified: string[] = [];
		const deleted: string[] = [];

		for (const [path, change] of this.pendingChanges) {
			switch (change.type) {
				case "add":
					added.push(path);
					break;
				case "change":
					modified.push(path);
					break;
				case "delete":
					deleted.push(path);
					break;
			}
		}

		// Clear pending changes
		this.pendingChanges.clear();

		logger.info("Processing file changes", {
			repositoryId: this.repositoryId,
			added: added.length,
			modified: modified.length,
			deleted: deleted.length,
		});

		// Call the change handler
		await this.onChanges(this.repositoryPath, this.repositoryId, {
			added,
			modified,
			deleted,
		});
	}

	/**
	 * Get watcher status
	 */
	getStatus(): {
		running: boolean;
		repositoryPath: string;
		repositoryId: string;
		pendingChanges: number;
	} {
		return {
			running: this.watcher !== null,
			repositoryPath: this.repositoryPath,
			repositoryId: this.repositoryId,
			pendingChanges: this.pendingChanges.size,
		};
	}
}

/**
 * Default change handler that performs incremental re-indexing
 * using the indexer's incremental API.
 */
export async function defaultChangeHandler(
	repositoryPath: string,
	repositoryId: string,
	changes: {
		added: string[];
		modified: string[];
		deleted: string[];
	},
): Promise<void> {
	// Convert to ChangedFile format expected by indexChangedFiles
	const changedFiles: ChangedFile[] = [
		...changes.deleted.map((path) => ({ path, status: "deleted" as const })),
		...changes.added.map((path) => ({ path, status: "added" as const })),
		...changes.modified.map((path) => ({ path, status: "modified" as const })),
	];

	if (changedFiles.length === 0) {
		return;
	}

	// Use incremental indexing API
	const result = await indexChangedFiles(repositoryId, repositoryPath, changedFiles);

	logger.info("Incremental re-indexing completed", {
		repositoryId,
		filesUpdated: result.filesUpdated,
		filesDeleted: result.filesDeleted,
		symbolsExtracted: result.symbolsExtracted,
		referencesExtracted: result.referencesExtracted,
		errors: result.errors.length,
	});

	if (result.errors.length > 0) {
		logger.warn("Some files failed to re-index", {
			errors: result.errors.slice(0, 5), // Limit to first 5 errors
		});
	}
}

// ============================================================================
// Module-level API (singleton pattern for easy integration)
// ============================================================================

const watchers: Map<string, SourceWatcher> = new Map();

/**
 * Create a new source watcher
 */
export function createSourceWatcher(options: SourceWatcherOptions): SourceWatcher {
	return new SourceWatcher(options);
}

/**
 * Start watching a repository
 */
export function startWatching(repositoryPath: string, repositoryId: string): void {
	if (watchers.has(repositoryPath)) {
		logger.warn("Already watching repository", { path: repositoryPath });
		return;
	}

	const watcher = new SourceWatcher({
		repositoryPath,
		repositoryId,
	});
	watcher.start();
	watchers.set(repositoryPath, watcher);
}

/**
 * Stop watching a repository
 */
export function stopWatching(repositoryPath: string): void {
	const watcher = watchers.get(repositoryPath);
	if (watcher) {
		watcher.stop();
		watchers.delete(repositoryPath);
	}
}

/**
 * Stop all watchers
 */
export function stopAll(): void {
	for (const watcher of watchers.values()) {
		watcher.stop();
	}
	watchers.clear();
	logger.info("All source watchers stopped");
}

/**
 * Get all watched paths
 */
export function getWatchedPaths(): string[] {
	return Array.from(watchers.keys());
}

/**
 * Check if a path is being watched
 */
export function isWatching(repositoryPath: string): boolean {
	return watchers.has(repositoryPath);
}
