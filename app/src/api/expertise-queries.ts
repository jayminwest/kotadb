/**
 * Database queries for Dynamic Expertise feature
 * 
 * Provides domain-specific file discovery based on dependency graph analysis.
 * Key files are identified by how many other files depend on them (dependents).
 * 
 * @module @api/expertise-queries
 */

import { getGlobalDatabase, type KotaDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "expertise-queries" });

/**
 * Domain to path pattern mappings for expertise routing.
 * 
 * Each domain maps to an array of SQL LIKE patterns that identify
 * files belonging to that domain within the repository.
 */
export const DOMAIN_PATH_PATTERNS: Record<string, string[]> = {
	"database": [
		"src/db/%",
		"app/src/db/%",
	],
	"api": [
		"src/api/%",
		"src/mcp/%",
		"app/src/api/%",
		"app/src/mcp/%",
	],
	"indexer": [
		"src/indexer/%",
		"app/src/indexer/%",
	],
	"testing": [
		"tests/%",
		"app/tests/%",
		"__tests__/%",
	],
	"claude-config": [
		".claude/%",
	],
	"agent-authoring": [
		".claude/agents/%",
	],
	"automation": [
		".claude/commands/automation/%",
	],
	"github": [
		".github/%",
	],
	"documentation": [
		"web/docs/%",
		"docs/%",
	],
};

/**
 * Result type for domain key files query
 */
export interface DomainKeyFile {
	/** File path relative to repository root */
	path: string;
	/** Number of files that depend on this file */
	dependentCount: number;
	/** Repository ID the file belongs to */
	repositoryId: string;
}

/**
 * Get the most-depended-on files for a domain (key files).
 * 
 * Key files are identified by counting how many other files import them.
 * This helps identify the core infrastructure files for each domain.
 * 
 * @param domain - Domain name (e.g., "database", "api", "indexer")
 * @param limit - Maximum number of files to return (default: 10)
 * @param repositoryId - Optional repository filter
 * @returns Array of key files sorted by dependent count (descending)
 * 
 * @example
 * ```ts
 * const keyFiles = getDomainKeyFiles("database", 5);
 * // Returns top 5 most-imported files from src/db/
 * ```
 */
export function getDomainKeyFiles(
	domain: string,
	limit: number = 10,
	repositoryId?: string,
): DomainKeyFile[] {
	const db = getGlobalDatabase();
	return getDomainKeyFilesInternal(db, domain, limit, repositoryId);
}

/**
 * Internal implementation that accepts a database parameter.
 * Used for testing with injected database instances.
 */
function getDomainKeyFilesInternal(
	db: KotaDatabase,
	domain: string,
	limit: number = 10,
	repositoryId?: string,
): DomainKeyFile[] {
	const patterns = DOMAIN_PATH_PATTERNS[domain];
	
	if (!patterns || patterns.length === 0) {
		logger.warn("Unknown domain or no patterns defined", { domain });
		return [];
	}
	
	// Build WHERE clause for path patterns
	const pathConditions = patterns.map(() => "f.path LIKE ?").join(" OR ");
	
	// Build repository filter condition
	const repoCondition = repositoryId ? "AND f.repository_id = ?" : "";
	
	const sql = `
		SELECT 
			f.path,
			f.repository_id,
			COUNT(DISTINCT r.file_id) AS dependent_count
		FROM indexed_files f
		JOIN indexed_references r ON f.path = r.target_file_path
		WHERE r.reference_type = 'import'
			AND (${pathConditions})
			${repoCondition}
		GROUP BY f.id
		ORDER BY dependent_count DESC
		LIMIT ?
	`;
	
	// Build params array
	const params: (string | number)[] = [...patterns];
	if (repositoryId) {
		params.push(repositoryId);
	}
	params.push(limit);
	
	const rows = db.query<{
		path: string;
		repository_id: string;
		dependent_count: number;
	}>(sql, params);
	
	logger.debug("Retrieved domain key files", {
		domain,
		count: rows.length,
		limit,
		repositoryId,
	});
	
	return rows.map(row => ({
		path: row.path,
		dependentCount: row.dependent_count,
		repositoryId: row.repository_id,
	}));
}

/**
 * Get all files for a domain (without dependency ranking).
 * 
 * Returns all indexed files matching the domain's path patterns.
 * Useful when you need the full list rather than just key files.
 * 
 * @param domain - Domain name
 * @param limit - Maximum number of files (default: 100)
 * @param repositoryId - Optional repository filter
 * @returns Array of file paths
 */
export function getDomainFiles(
	domain: string,
	limit: number = 100,
	repositoryId?: string,
): string[] {
	const db = getGlobalDatabase();
	return getDomainFilesInternal(db, domain, limit, repositoryId);
}

/**
 * Internal implementation for getDomainFiles.
 */
function getDomainFilesInternal(
	db: KotaDatabase,
	domain: string,
	limit: number = 100,
	repositoryId?: string,
): string[] {
	const patterns = DOMAIN_PATH_PATTERNS[domain];
	
	if (!patterns || patterns.length === 0) {
		logger.warn("Unknown domain or no patterns defined", { domain });
		return [];
	}
	
	const pathConditions = patterns.map(() => "path LIKE ?").join(" OR ");
	const repoCondition = repositoryId ? "AND repository_id = ?" : "";
	
	const sql = `
		SELECT path
		FROM indexed_files
		WHERE (${pathConditions})
			${repoCondition}
		ORDER BY indexed_at DESC
		LIMIT ?
	`;
	
	const params: (string | number)[] = [...patterns];
	if (repositoryId) {
		params.push(repositoryId);
	}
	params.push(limit);
	
	const rows = db.query<{ path: string }>(sql, params);
	
	return rows.map(row => row.path);
}

/**
 * Get available domains that have indexed files.
 * 
 * Checks which domains have at least one file matching their patterns.
 * Useful for determining which expertise areas are available.
 * 
 * @param repositoryId - Optional repository filter
 * @returns Array of domain names that have files
 */
export function getAvailableDomains(repositoryId?: string): string[] {
	const db = getGlobalDatabase();
	const availableDomains: string[] = [];
	
	for (const domain of Object.keys(DOMAIN_PATH_PATTERNS)) {
		const files = getDomainFilesInternal(db, domain, 1, repositoryId);
		if (files.length > 0) {
			availableDomains.push(domain);
		}
	}
	
	logger.debug("Retrieved available domains", {
		count: availableDomains.length,
		domains: availableDomains,
		repositoryId,
	});
	
	return availableDomains;
}

/**
 * @deprecated Use getDomainKeyFiles() directly
 * Backward-compatible alias that accepts db parameter for testing.
 */
export function getDomainKeyFilesLocal(
	db: KotaDatabase,
	domain: string,
	limit: number = 10,
	repositoryId?: string,
): DomainKeyFile[] {
	return getDomainKeyFilesInternal(db, domain, limit, repositoryId);
}

/**
 * @deprecated Use getDomainFiles() directly
 * Backward-compatible alias that accepts db parameter for testing.
 */
export function getDomainFilesLocal(
	db: KotaDatabase,
	domain: string,
	limit: number = 100,
	repositoryId?: string,
): string[] {
	return getDomainFilesInternal(db, domain, limit, repositoryId);
}
