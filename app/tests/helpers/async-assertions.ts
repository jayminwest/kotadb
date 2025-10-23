/**
 * Async assertion helpers for testing asynchronous operations
 *
 * These utilities help write deterministic tests for async operations by polling
 * for expected conditions instead of using fixed delays. This is especially
 * important in CI environments where I/O operations may be slower than local development.
 */

/**
 * Options for configuring polling behavior in waitForCondition
 */
export interface WaitForConditionOptions {
	/**
	 * Maximum time to wait in milliseconds before timing out
	 * @default 3000
	 */
	timeout?: number;

	/**
	 * Interval between condition checks in milliseconds
	 * @default 50
	 */
	interval?: number;

	/**
	 * Optional error message to include in timeout error
	 */
	message?: string;
}

/**
 * Wait for a condition to become true by polling at regular intervals.
 *
 * This is useful for testing asynchronous operations like:
 * - Database writes that may not be immediately visible due to transaction isolation
 * - Job queue operations that happen via queueMicrotask() or background workers
 * - External service calls that have unpredictable latency
 *
 * The function polls the condition at the specified interval and returns as soon
 * as the condition becomes true. If the timeout is reached before the condition
 * is satisfied, an error is thrown.
 *
 * @param condition - Async function that returns true when the expected state is reached
 * @param options - Configuration for timeout, polling interval, and error messaging
 * @returns Promise that resolves when condition is true
 * @throws Error if timeout is reached before condition becomes true
 *
 * @example
 * ```typescript
 * // Wait for database record to be visible
 * await waitForCondition(
 *   async () => {
 *     const { data } = await supabase.from('jobs').select('*').eq('id', jobId);
 *     return data && data.length > 0;
 *   },
 *   { timeout: 3000, interval: 50, message: 'Job not found in database' }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Wait for job status to update
 * await waitForCondition(
 *   async () => {
 *     const { data } = await supabase.from('jobs').select('status').eq('id', jobId).single();
 *     return data?.status === 'completed';
 *   },
 *   { timeout: 5000, interval: 100 }
 * );
 * ```
 */
export async function waitForCondition(
	condition: () => Promise<boolean>,
	options: WaitForConditionOptions = {}
): Promise<void> {
	const { timeout = 3000, interval = 50, message } = options;

	const startTime = Date.now();

	while (true) {
		// Check if condition is satisfied
		const result = await condition();
		if (result) {
			return; // Early return on success to avoid unnecessary delays
		}

		// Check if we've exceeded the timeout
		const elapsed = Date.now() - startTime;
		if (elapsed >= timeout) {
			const errorMessage = message
				? `Timeout waiting for condition: ${message} (waited ${elapsed}ms)`
				: `Timeout waiting for condition (waited ${elapsed}ms)`;
			throw new Error(errorMessage);
		}

		// Wait for the specified interval before next check
		await new Promise(resolve => setTimeout(resolve, interval));
	}
}
