/**
 * Job queue types for index job tracking and pg-boss integration
 *
 * These types support the job status tracking layer that maintains source of truth
 * in index_jobs table while bridging pg-boss queue operations.
 */

/**
 * Job status enum matching index_jobs.status column constraint
 *
 * Lifecycle: pending → processing → completed/failed
 * - pending: Job created, not yet picked up by worker
 * - processing: Worker actively indexing repository
 * - completed: Indexing finished successfully
 * - failed: Indexing failed with error
 * - skipped: Job skipped (repository already indexed at same commit)
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

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
 * Metadata for job completion (passed to updateJobStatus)
 *
 * @property error - Error message when job fails
 * @property stats - Job statistics (files indexed, symbols extracted, etc.)
 */
export interface JobMetadata {
  error?: string;
  stats?: {
    files_indexed?: number;
    symbols_extracted?: number;
    references_found?: number;
    dependencies_extracted?: number;
    chunks_completed?: number;
    current_chunk?: number;
  };
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
