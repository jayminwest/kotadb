/**
 * Gitignore management utility for KotaDB.
 * 
 * Ensures .kotadb/ directory is properly ignored by Git to prevent
 * accidental commits of local database and export files.
 * 
 * @module @config/gitignore
 */

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "gitignore" });

/**
 * Ensure .kotadb/ is added to project's .gitignore.
 * If gitignore is malformed or inaccessible, logs warning but does not fail.
 * 
 * @param projectRoot - Absolute path to project root
 * @returns True if successfully ensured, false on error
 * 
 * @example
 * const projectRoot = findProjectRoot();
 * if (projectRoot) {
 *   ensureKotadbIgnored(projectRoot);
 * }
 */
export function ensureKotadbIgnored(projectRoot: string): boolean {
	const gitignorePath = join(projectRoot, ".gitignore");
	
	try {
		// Check if .kotadb/ is already ignored
		if (existsSync(gitignorePath)) {
			const content = readFileSync(gitignorePath, "utf-8");
			
			// Check for exact match or pattern
			const patterns = [
				/^\.kotadb\/$/m,        // Exact: .kotadb/
				/^\.kotadb$/m,          // Without trailing slash
				/^\.kotadb\*$/m,        // Pattern: .kotadb*
				/^\/\.kotadb\/$/m,      // With leading slash: /.kotadb/
			];
			
			if (patterns.some(pattern => pattern.test(content))) {
				logger.debug(".kotadb/ already in .gitignore", { path: gitignorePath });
				return true;
			}
		}
		
		// Append .kotadb/ entry
		const entry = "\n# KotaDB local storage\n.kotadb/\n";
		appendFileSync(gitignorePath, entry);
		
		logger.info("Added .kotadb/ to .gitignore", { path: gitignorePath });
		return true;
		
	} catch (error) {
		// Non-fatal: log warning and continue
		const errorMessage = error instanceof Error ? error.message : String(error);
		process.stderr.write(`[WARN] Could not update .gitignore (non-fatal)\n  path: ${gitignorePath}\n  error: ${errorMessage}\n`);
		logger.warn("Could not update .gitignore (non-fatal)", {
			path: gitignorePath,
			error: errorMessage,
		});
		return false;
	}
}
