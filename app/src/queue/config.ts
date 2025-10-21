/**
 * pg-boss Queue Configuration
 *
 * Centralized configuration for job queue behavior:
 * - Retry policy (exponential backoff: 60s, 120s, 180s)
 * - Job expiration and archival windows
 * - Worker concurrency settings
 */

/**
 * Queue Names
 * Enum of all job queue names in the system
 */
export const QUEUE_NAMES = {
	INDEX_REPO: "index-repo",
} as const;

/**
 * Retry Configuration
 * Maximum number of retry attempts before job is moved to dead letter queue
 */
export const RETRY_LIMIT = 3;

/**
 * Retry Delay (seconds)
 * Initial delay before first retry (subsequent retries use exponential backoff)
 */
export const RETRY_DELAY = 60;

/**
 * Retry Backoff
 * Enable exponential backoff for retry delays (60s → 120s → 180s)
 */
export const RETRY_BACKOFF = true;

/**
 * Job Expiration (hours)
 * Jobs older than this will be automatically deleted from the queue
 */
export const EXPIRE_IN_HOURS = 24;

/**
 * Archive Completed Jobs (seconds)
 * How long to keep completed jobs before archival (3600 = 1 hour)
 */
export const ARCHIVE_COMPLETED_AFTER = 3600;

/**
 * Worker Team Size
 * Number of concurrent workers processing jobs from this queue
 * Note: This will be used by the worker implementation in issue #237
 */
export const WORKER_TEAM_SIZE = 3;
