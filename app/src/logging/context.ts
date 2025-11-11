/**
 * Correlation context utilities for tracking requests across async boundaries
 */

import { randomUUID } from "node:crypto";
import type { LogContext } from "./logger";

/**
 * Generate a unique request ID for correlation
 */
export function generateRequestId(): string {
	return randomUUID();
}

/**
 * Generate a unique job ID for queue job correlation
 */
export function generateJobId(): string {
	return randomUUID();
}

/**
 * Create a correlation context from request metadata
 */
export function createRequestContext(requestId: string, userId?: string, keyId?: string): LogContext {
	const context: LogContext = { request_id: requestId };
	if (userId) context.user_id = userId;
	if (keyId) context.key_id = keyId;
	return context;
}

/**
 * Create a correlation context for queue jobs
 */
export function createJobContext(jobId: string, userId?: string): LogContext {
	const context: LogContext = { job_id: jobId };
	if (userId) context.user_id = userId;
	return context;
}

/**
 * Extend existing context with additional fields
 */
export function extendContext(base: LogContext, additional: LogContext): LogContext {
	return { ...base, ...additional };
}
