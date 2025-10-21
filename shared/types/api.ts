/**
 * API request and response types for KotaDB HTTP endpoints.
 *
 * These types define the contracts for all REST API endpoints.
 * They are shared between backend (app/) and frontend consumers.
 */

/**
 * Request payload for POST /index endpoint.
 * Triggers indexing of a repository.
 */
export interface IndexRequest {
	/** Repository identifier (e.g., "owner/repo" or local path) */
	repository: string;

	/** Git ref to index (branch, tag, or commit SHA). Defaults to repository's default branch. */
	ref?: string;

	/** Local filesystem path (for local repositories instead of remote clones) */
	localPath?: string;
}

/**
 * Response from POST /index endpoint.
 * Returns index job identifier for status tracking.
 */
export interface IndexResponse {
	/** Index job UUID for tracking status */
	jobId: string;

	/** Initial job status (always 'pending' when job is created) */
	status: string;
}

/**
 * Request query parameters for GET /search endpoint.
 * Searches indexed file content.
 */
export interface SearchRequest {
	/** Search term to match in file content */
	term: string;

	/** Optional repository ID filter (UUID) */
	repository?: string;

	/** Maximum number of results to return (default: 20, max: 100) */
	limit?: number;
}

/**
 * Single search result from GET /search endpoint.
 * Contains file metadata and matching content snippet.
 */
export interface SearchResult {
	/** File UUID */
	id?: string;

	/** Repository UUID (aliased as projectRoot for compatibility) */
	projectRoot: string;

	/** File path relative to repository root */
	path: string;

	/** File content */
	content: string;

	/** Package dependencies extracted from file */
	dependencies: string[];

	/** Timestamp when file was indexed */
	indexedAt: Date;

	/** Content snippet with search term context */
	snippet?: string;
}

/**
 * Response from GET /search endpoint.
 * Returns array of matching files with snippets.
 */
export interface SearchResponse {
	/** Array of search results */
	results: SearchResult[];
}

/**
 * Response from GET /files/recent endpoint.
 * Returns recently indexed files.
 */
export interface RecentFilesResponse {
	/** Array of recently indexed files */
	results: SearchResult[];
}

/**
 * Response from GET /health endpoint.
 * Simple health check for service availability.
 */
export interface HealthResponse {
	/** Service status ("ok" if healthy) */
	status: string;

	/** ISO 8601 timestamp of health check */
	timestamp: string;
}
