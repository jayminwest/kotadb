/**
 * Sentry SDK Instrumentation
 * IMPORTANT: This file must be imported first in index.ts before all other imports
 * to ensure proper tracing and error capture.
 */

import * as Sentry from "@sentry/node";
import { expressErrorHandler } from "@sentry/node";

// Test environment guard: disable Sentry in tests to prevent test errors from polluting dashboard
if (process.env.NODE_ENV !== "test") {
	// Determine environment from Vercel or Node environment
	const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

	// Environment-specific sampling rates
	const isDevelopment = environment === "development";
	const tracesSampleRate = isDevelopment ? 1.0 : 0.1;

	// Initialize Sentry SDK
	try {
		Sentry.init({
			dsn: process.env.SENTRY_DSN,
			environment,
			tracesSampleRate,

			// Privacy compliance: don't send IP addresses or user agents automatically
			sendDefaultPii: false,

			// Enable debug mode in development
			debug: isDevelopment,

			// Scrub sensitive headers before sending to Sentry
			beforeSend(event, hint) {
				// Remove sensitive headers
				if (event.request?.headers) {
					const headers = event.request.headers;
					if (headers.authorization) headers.authorization = "[REDACTED]";
					if (headers["x-api-key"]) headers["x-api-key"] = "[REDACTED]";
				}

				// Add request_id from Express request for correlation with structured logs
				const originalException = hint.originalException as Error & { req?: { requestId?: string } };
				if (originalException?.req?.requestId) {
					event.tags = {
						...event.tags,
						request_id: originalException.req.requestId,
					};
				}

				return event;
			},

			// Filter out health check endpoints from transaction tracking
			beforeSendTransaction(event) {
				// Exclude /health endpoint from performance tracking
				if (event.transaction === "GET /health") {
					return null;
				}
				return event;
			},
		});

		if (isDevelopment && process.env.SENTRY_DSN) {
			process.stdout.write(
				JSON.stringify({
					timestamp: new Date().toISOString(),
					level: "info",
					message: "Sentry SDK initialized",
					environment,
					tracesSampleRate,
				}) + "\n",
			);
		}
	} catch (error) {
		// Log warning but don't crash - observability failures should not cause outages
		process.stderr.write(
			JSON.stringify({
				timestamp: new Date().toISOString(),
				level: "warn",
				message: "Failed to initialize Sentry SDK",
				error: error instanceof Error ? error.message : String(error),
			}) + "\n",
		);
	}
}

// Export Sentry instance and Express error handler for use in other modules
export { Sentry, expressErrorHandler };
