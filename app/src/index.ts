import { createExpressApp } from "@api/routes";
import { getServiceClient } from "@db/client";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";
import { QUEUE_NAMES } from "@queue/config";
import { createLogger } from "@logging/logger";

const PORT = Number(process.env.PORT ?? 3000);
const logger = createLogger();

async function bootstrap() {
	// Verify Supabase environment variables
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error(
			"Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set. " +
				"Please copy .env.sample to .env and configure your Supabase credentials.",
		);
	}

	// Check for GitHub webhook secret (warn if missing, not fatal)
	const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!webhookSecret) {
		logger.warn("GITHUB_WEBHOOK_SECRET not configured - webhook endpoint will reject all requests");
	} else if (webhookSecret.length < 16) {
		logger.warn("GITHUB_WEBHOOK_SECRET is too short (minimum 16 characters recommended)");
	}

	// Validate Stripe configuration (optional - warn if incomplete)
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

	// Initialize Supabase client
	const supabase = getServiceClient();

	// Test database connection
	const { error: healthError } = await supabase
		.from("migrations")
		.select("id")
		.limit(1);
	if (healthError) {
		throw new Error(`Supabase connection failed: ${healthError.message}`);
	}
	logger.info("Supabase connection successful");

	// Start job queue
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

	// Create Express app
	logger.info("Creating Express app");
	const app = createExpressApp(supabase);
	logger.info("Express app created");

	// Start server
	const server = app.listen(PORT, () => {
		logger.info("Server started", {
			port: PORT,
			supabase_url: supabaseUrl,
		});
	});

	// Graceful shutdown
	process.on("SIGTERM", async () => {
		logger.info("SIGTERM signal received - closing HTTP server");

		// Stop queue first (drains in-flight jobs)
		try {
			await stopQueue();
		} catch (error) {
			logger.error("Error stopping queue", error instanceof Error ? error : undefined);
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
