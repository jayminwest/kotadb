/**
 * Express middleware for request/response logging with correlation IDs
 */

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";
import { generateRequestId, createRequestContext } from "./context";
import type { Logger } from "./logger";

// Extend Express Request to include logger
declare global {
	namespace Express {
		interface Request {
			logger: Logger;
			requestId: string;
		}
	}
}

/**
 * Express middleware that:
 * - Generates unique request_id for each request
 * - Attaches logger instance to req.logger with correlation context
 * - Logs incoming requests and outgoing responses
 * - Captures errors with stack traces
 */
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
	const startTime = Date.now();
	const requestId = generateRequestId();

	// Attach request ID to request object
	req.requestId = requestId;

	// Create base logger with request_id
	const baseContext = createRequestContext(requestId);
	req.logger = createLogger(baseContext);

	// Log incoming request
	req.logger.info("Incoming request", {
		method: req.method,
		url: req.url,
		path: req.path,
		ip: req.ip,
		userAgent: req.get("user-agent"),
	});

	// Capture response finish event for logging
	const originalSend = res.send;
	res.send = function (body) {
		// Log response
		const duration = Date.now() - startTime;
		const level = res.statusCode >= 400 ? "warn" : "info";

		if (level === "warn") {
			req.logger.warn("Request completed with error", {
				method: req.method,
				url: req.url,
				status: res.statusCode,
				duration_ms: duration,
			});
		} else {
			req.logger.info("Request completed", {
				method: req.method,
				url: req.url,
				status: res.statusCode,
				duration_ms: duration,
			});
		}

		return originalSend.call(this, body);
	};

	// Capture errors
	const originalNext = next;
	next = function (error?: unknown) {
		if (error instanceof Error) {
			req.logger.error("Request error", error);
		}
		return originalNext(error);
	};

	next();
}

/**
 * Error handling middleware to log unhandled errors
 */
export function errorLoggingMiddleware(error: Error, req: Request, res: Response, next: NextFunction): void {
	// Log error with full stack trace
	if (req.logger) {
		req.logger.error("Unhandled error", error, {
			method: req.method,
			url: req.url,
			path: req.path,
		});
	} else {
		// Fallback if logger not attached
		const logger = createLogger({ request_id: req.requestId || "unknown" });
		logger.error("Unhandled error (no logger attached)", error, {
			method: req.method,
			url: req.url,
			path: req.path,
		});
	}

	next(error);
}
