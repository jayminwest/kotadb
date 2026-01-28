// IMPORTANT: Import instrumentation first before all other imports
// This ensures Sentry can properly trace and capture errors
import { Sentry } from "./instrument.js";
import { createExpressApp } from "@api/routes";
import { createLogger } from "@logging/logger";
import { getEnvironmentConfig } from "@config/environment";

const PORT = Number(process.env.PORT ?? 3000);
const logger = createLogger();

async function bootstrap() {
	// Detect environment mode (local vs cloud)
	const envConfig = getEnvironmentConfig();
	logger.info("Application starting (local-only mode)", {
		mode: envConfig.mode,
		localDbPath: envConfig.localDbPath,
	});

	// Local-only mode - no Supabase, no queue, no billing
	logger.info("Local-only mode: Using SQLite database");

	// Create Express app
	logger.info("Creating Express app");
	const app = createExpressApp();
	logger.info("Express app created");

	// Start server
	const server = app.listen(PORT, () => {
		logger.info("Server started", {
			port: PORT,
			mode: envConfig.mode,
			local_db_path: envConfig.localDbPath,
		});
	});

	// Global error handlers for unhandled errors (after server starts)
	process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
		logger.error("Unhandled promise rejection", reason instanceof Error ? reason : undefined, {
			promise: String(promise),
		});
		Sentry.captureException(reason);
	});

	process.on("uncaughtException", (error: Error) => {
		logger.error("Uncaught exception", error);
		Sentry.captureException(error);
		// Exit process after logging - uncaught exceptions leave app in undefined state
		process.exit(1);
	});

	// Graceful shutdown
	process.on("SIGTERM", async () => {
		logger.info("SIGTERM signal received - closing HTTP server");

		// Close HTTP server
		server.close(() => {
			logger.info("HTTP server closed");
			process.exit(0);
		});
	});
}

bootstrap().catch((error) => {
	logger.error("Failed to start server", error instanceof Error ? error : undefined);
	process.exit(1);
});
