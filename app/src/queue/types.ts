/**
 * pg-boss Job Payload Types
 *
 * TypeScript interfaces for job payloads and results.
 * These types ensure type safety when enqueuing and processing jobs.
 */

/**
 * Index Repository Job Payload
 * Data passed to the indexing worker when processing a repository
 */
export interface IndexRepoJobPayload {
	/**
	 * Database ID of the index_jobs table row tracking this job
	 */
	indexJobId: string;

	/**
	 * Database ID of the repository being indexed
	 */
	repositoryId: string;

	/**
	 * Git commit SHA to index (optional, defaults to HEAD of specified ref)
	 */
	commitSha?: string;
}

/**
 * Job Result
 * Result data returned by worker after job completion
 */
export interface JobResult {
	/**
	 * Whether the job completed successfully
	 */
	success: boolean;

	/**
	 * Number of files processed during indexing (on success)
	 */
	filesProcessed?: number;

	/**
	 * Number of symbols extracted during indexing (on success)
	 */
	symbolsExtracted?: number;

	/**
	 * Error message if job failed
	 */
	error?: string;
}
