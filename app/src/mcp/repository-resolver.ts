/**
 * Repository identifier resolution utilities
 *
 * Supports both UUID and full_name formats for user convenience
 */

import { getGlobalDatabase } from "@db/sqlite/index.js";

/** UUID v4 pattern */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID
 */
export function isUUID(value: string): boolean {
	return UUID_PATTERN.test(value);
}

/**
 * Resolve a repository identifier (UUID or full_name) to a repository ID
 *
 * @param identifier - Repository UUID or full_name (e.g., "local/kotadb")
 * @returns Repository ID or null if not found
 */
export function resolveRepositoryParam(identifier: string | undefined): string | null {
	const db = getGlobalDatabase();

	if (!identifier) {
		// Fall back to most recently created repository
		const repo = db.queryOne<{ id: string }>(
			"SELECT id FROM repositories ORDER BY created_at DESC LIMIT 1",
			[],
		);
		return repo?.id ?? null;
	}

	// Check if it's a UUID - return as-is without validation
	if (isUUID(identifier)) {
		return identifier;
	}

	// Treat as full_name
	const repo = db.queryOne<{ id: string }>(
		"SELECT id FROM repositories WHERE full_name = ?",
		[identifier],
	);
	return repo?.id ?? null;
}

/**
 * Alias for resolveRepositoryParam for backward compatibility
 */
export const resolveRepositoryIdentifier = resolveRepositoryParam;

/**
 * Resolve a repository identifier with detailed error information
 *
 * @param identifier - Repository UUID or full_name
 * @returns Object with id (if found) or error message
 */
export function resolveRepositoryIdentifierWithError(
	identifier: string | undefined,
): { id: string } | { error: string } {
	const db = getGlobalDatabase();

	if (!identifier) {
		const repo = db.queryOne<{ id: string }>(
			"SELECT id FROM repositories ORDER BY created_at DESC LIMIT 1",
			[],
		);
		if (!repo) {
			return { error: "No repositories found. Please index a repository first using index_repository tool." };
		}
		return { id: repo.id };
	}

	// Check if it's a UUID - return as-is without validation
	if (isUUID(identifier)) {
		return { id: identifier };
	}

	// Treat as full_name
	const repo = db.queryOne<{ id: string }>(
		"SELECT id FROM repositories WHERE full_name = ?",
		[identifier],
	);
	if (!repo) {
		return { error: `Repository not found: ${identifier}. Use a valid repository UUID or full_name.` };
	}
	return { id: repo.id };
}
