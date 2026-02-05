/**
 * Retry utility with exponential backoff for transient failures
 * Only retries on API timeouts, rate limits, and connection errors
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalRetryDelayMs: number;
}

const DEFAULT_RETRYABLE_PATTERNS = [
  /timeout/i,
  /rate.limit/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /503/i,
  /429/i,
  /overloaded/i,
];

/**
 * Promisified sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable based on its message
 */
function isRetryableError(
  error: unknown,
  customPatterns?: string[]
): boolean {
  const message =
    error instanceof Error ? error.message : String(error);

  // Check default patterns
  for (const pattern of DEFAULT_RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }

  // Check custom patterns
  if (customPatterns) {
    for (const pattern of customPatterns) {
      if (message.includes(pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * Only retries on transient errors (API timeouts, rate limits, connection errors).
 * SDK logic failures (tool errors, permission errors) are not retried.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<RetryResult<T>> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 30_000;
  const maxDelayMs = options?.maxDelayMs ?? 120_000;
  const backoffMultiplier = options?.backoffMultiplier ?? 2;
  const retryableErrors = options?.retryableErrors;

  let attempt = 1;
  let totalRetryDelayMs = 0;

  while (true) {
    try {
      const result = await fn();
      return { result, attempts: attempt, totalRetryDelayMs };
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableError(error, retryableErrors)) {
        throw error;
      }

      const delayMs = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs
      );

      const errorMsg =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[retry] Attempt ${attempt}/${maxAttempts} failed: ${errorMsg}\n` +
          `[retry] Retrying in ${Math.round(delayMs / 1000)}s...\n`
      );

      await sleep(delayMs);
      totalRetryDelayMs += delayMs;
      attempt++;
    }
  }
}
