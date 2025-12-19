// IMPORTANT: Import instrumentation first before all other imports
// This ensures Sentry can properly trace and capture errors
import { Sentry } from "./instrument.js";
import { createExpressApp } from "@api/routes";
import { getServiceClient } from "@db/client";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";
import { QUEUE_NAMES } from "@queue/config";
import { createLogger } from "@logging/logger";
import { getEnvironmentConfig, isLocalMode } from "@config/environment";

const PORT = Number(process.env.PORT ?? 3000);
const logger = createLogger();

async function bootstrap() {
	// Detect environment mode (local vs cloud)
	const envConfig = getEnvironmentConfig();
	logger.info("Application starting", {
		mode: envConfig.mode,
		localDbPath: envConfig.localDbPath,
		supabaseUrl: envConfig.supabaseUrl,
	});

	// Check for GitHub webhook secret (warn if missing, not fatal)
	const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!webhookSecret) {
		logger.warn("GITHUB_WEBHOOK_SECRET not configured - webhook endpoint will reject all requests");
	} else if (webhookSecret.length < 16) {
		logger.warn("GITHUB_WEBHOOK_SECRET is too short (minimum 16 characters recommended)");
	}

	// Validate Stripe configuration (optional - warn if incomplete)
	const billingEnabled = process.env.ENABLE_BILLING === "true";
	logger.info("Billing feature flag", { enabled: billingEnabled });

	if (billingEnabled) {
		const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
		const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
		const stripeSoloPriceId = process.env.STRIPE_SOLO_PRICE_ID;
		const stripeTeamPriceId = process.env.STRIPE_TEAM_PRICE_ID;

		const stripeConfigPresent =
			stripeSecretKey || stripeWebhookSecret || stripeSoloPriceId || stripeTeamPriceId;

		if (stripeConfigPresent) {
			const missingVars: string[] = [];
			if (!stripeSecretKey) missingVars.push("STRIPE_SECRET_KEY");
			if (!stripeWebhookSecret) missingVars.push("STRIPE_WEBHOOK_SECRET");
			if (!stripeSoloPriceId) missingVars.push("STRIPE_SOLO_PRICE_ID");
			if (!stripeTeamPriceId) missingVars.push("STRIPE_TEAM_PRICE_ID");

			if (missingVars.length > 0) {
				logger.warn("Partial Stripe configuration detected", {
					missing_vars: missingVars,
				});
			} else {
				logger.info("Stripe configuration validated");
			}
		} else {
			logger.info("Stripe not configured - subscription features disabled");
		}
	} else {
		logger.info("Billing disabled by feature flag - subscription features unavailable");
	}

	// Initialize Supabase client (cloud mode only)
	const supabase = !isLocalMode() ? getServiceClient() : undefined;

	// Test database connection (cloud mode only)
	if (supabase) {
		const { error: healthError } = await supabase
			.from("migrations")
			.select("id")
			.limit(1);
		if (healthError) {
			throw new Error(`Supabase connection failed: ${healthError.message}`);
		}
		logger.info("Supabase connection successful");
	} else {
		logger.info("Supabase disabled in local mode");
	}

	// Start job queue (cloud mode only)
	if (!isLocalMode()) {
		try {
			await startQueue();

			// Create queues before registering workers
			// pg-boss requires queues to exist before workers can be registered
			const queue = getQueue();
			await queue.createQueue(QUEUE_NAMES.INDEX_REPO);
			logger.info("Job queue started and index-repo queue created");
		} catch (error) {
			logger.error("Failed to start job queue", error instanceof Error ? error : undefined);
			throw error;
		}

		// Start indexing worker
		try {
			const queue = getQueue();
			await startIndexWorker(queue);
			logger.info("Indexing worker registered");
		} catch (error) {
			logger.error("Failed to start indexing worker", error instanceof Error ? error : undefined);
			throw error;
		}
	} else {
		logger.info("Queue disabled in local mode (SQLite only)");
	}

	// Create Express app
	logger.info("Creating Express app");
	const app = createExpressApp(supabase);
	logger.info("Express app created");

	// Start server
	const server = app.listen(PORT, () => {
		logger.info("Server started", {
			port: PORT,
			mode: envConfig.mode,
			supabase_url: envConfig.supabaseUrl,
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

		// Stop queue first (drains in-flight jobs) - cloud mode only
		if (!isLocalMode()) {
			try {
				await stopQueue();
			} catch (error) {
				logger.error("Error stopping queue", error instanceof Error ? error : undefined);
			}
		}

		// Then close HTTP server
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
