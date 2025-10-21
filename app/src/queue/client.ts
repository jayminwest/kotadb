/**
 * pg-boss Queue Client
 *
 * Manages the lifecycle of the pg-boss job queue:
 * - Initialization with Supabase Postgres connection
 * - Graceful startup and shutdown
 * - Health check for monitoring
 */

import PgBoss from "pg-boss";
import {
	RETRY_LIMIT,
	RETRY_DELAY,
	RETRY_BACKOFF,
	EXPIRE_IN_HOURS,
	ARCHIVE_COMPLETED_AFTER,
} from "@queue/config";

/**
 * Global pg-boss instance (singleton pattern)
 * Initialized once on server startup, shared across all modules
 */
let queueInstance: PgBoss | null = null;

/**
 * Get the queue instance
 * Throws error if queue has not been started
 */
export function getQueue(): PgBoss {
	if (!queueInstance) {
		throw new Error("Queue not initialized. Call startQueue() first.");
	}
	return queueInstance;
}

/**
 * Start the job queue
 * Connects to Supabase Postgres and initializes pg-boss schema
 *
 * @throws {Error} If SUPABASE_DB_URL environment variable is missing
 * @throws {Error} If pg-boss fails to start (connection errors, etc.)
 */
export async function startQueue(): Promise<void> {
	const dbUrl = process.env.SUPABASE_DB_URL;

	if (!dbUrl) {
		throw new Error(
			"SUPABASE_DB_URL environment variable is required for job queue. " +
				"Format: postgresql://postgres:password@host:port/postgres",
		);
	}

	console.log(
		`[${new Date().toISOString()}] Starting job queue with connection: ${dbUrl.replace(/:[^:@]+@/, ":***@")}`,
	);

	try {
		// Initialize pg-boss with connection string and configuration
		// Note: retry/expiration options are per-queue defaults, applied when sending jobs
		queueInstance = new PgBoss(dbUrl);

		// Start pg-boss (creates pgboss schema and tables)
		await queueInstance.start();

		console.log(`[${new Date().toISOString()}] Job queue started successfully`);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		console.error(
			`[${new Date().toISOString()}] Failed to start job queue: ${errorMessage}`,
		);
		throw new Error(`Job queue startup failed: ${errorMessage}`);
	}
}

/**
 * Stop the job queue gracefully
 * Drains in-flight jobs before shutting down
 *
 * @throws {Error} If queue has not been started
 */
export async function stopQueue(): Promise<void> {
	if (!queueInstance) {
		throw new Error("Queue not started. Call startQueue() first.");
	}

	console.log(
		`[${new Date().toISOString()}] Stopping job queue (draining in-flight jobs)...`,
	);

	try {
		await queueInstance.stop();
		queueInstance = null;
		console.log(`[${new Date().toISOString()}] Job queue stopped successfully`);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		console.error(
			`[${new Date().toISOString()}] Error stopping job queue: ${errorMessage}`,
		);
		throw new Error(`Job queue shutdown failed: ${errorMessage}`);
	}
}

/**
 * Check queue health
 * Returns true if queue is running and responsive
 *
 * @returns {boolean} True if queue is healthy, false otherwise
 */
export async function checkQueueHealth(): Promise<boolean> {
	if (!queueInstance) {
		return false;
	}

	try {
		// Query queue stats to verify connectivity
		// This will throw if the database connection is broken
		await queueInstance.getQueue("index-repo");
		return true;
	} catch (error) {
		console.error(
			`[${new Date().toISOString()}] Queue health check failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

/**
 * Get default job send options from configuration
 * These options are applied to each job when enqueueing
 *
 * @returns {object} Default send options with retry and expiration config
 */
export function getDefaultSendOptions() {
	return {
		retryLimit: RETRY_LIMIT,
		retryDelay: RETRY_DELAY,
		retryBackoff: RETRY_BACKOFF,
		expireInHours: EXPIRE_IN_HOURS,
	};
}
