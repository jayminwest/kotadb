/**
 * Project root detection utility for KotaDB.
 * 
 * Walks up the directory tree to find the project root marker (.git directory).
 * Used for determining the project-local .kotadb/ storage location.
 * 
 * @module @config/project-root
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "project-root" });

/**
 * Find the project root by walking up the directory tree.
 * Looks for .git directory as the project root marker.
 * 
 * @param startDir - Starting directory (default: process.cwd())
 * @returns Absolute path to project root, or null if not found
 * 
 * @example
 * // From /path/to/project/app/src
 * findProjectRoot(); // Returns /path/to/project
 * 
 * // From non-project directory
 * findProjectRoot(); // Returns null
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
	let current = startDir;
	
	// Walk up until we hit the filesystem root
	while (true) {
		const gitDir = join(current, ".git");
		if (existsSync(gitDir)) {
			logger.debug("Found project root", { path: current, marker: ".git" });
			return current;
		}
		
		// Move up one directory
		const parent = dirname(current);
		if (parent === current) {
			// We've reached the root (dirname returns the same path)
			break;
		}
		current = parent;
	}
	
	logger.debug("No project root found", { startDir });
	return null;
}
