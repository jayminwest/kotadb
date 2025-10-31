import { createExpressApp } from "@api/routes";
import { getServiceClient } from "@db/client";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";
import { QUEUE_NAMES } from "@queue/config";

const PORT = Number(process.env.PORT ?? 3000);

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
		process.stderr.write(
			"[Warning] GITHUB_WEBHOOK_SECRET not configured. Webhook endpoint will reject all requests.\n",
		);
	} else if (webhookSecret.length < 16) {
		process.stderr.write(
			"[Warning] GITHUB_WEBHOOK_SECRET is too short (minimum 16 characters recommended).\n",
		);
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
			process.stderr.write(
				`[Warning] Partial Stripe configuration detected. Missing: ${missingVars.join(", ")}. ` +
					"Subscription endpoints will fail until all Stripe variables are configured.\n",
			);
		} else {
			process.stdout.write("✓ Stripe configuration validated\n");
		}
	} else {
		process.stdout.write(
			"[Info] Stripe not configured. Subscription features disabled.\n",
		);
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
	process.stdout.write(`[${new Date().toISOString()}] ✓ Supabase connection successful\n`);

	// Start job queue
	try {
		await startQueue();

		// Create queues before registering workers
		// pg-boss requires queues to exist before workers can be registered
		const queue = getQueue();
		await queue.createQueue(QUEUE_NAMES.INDEX_REPO);
		process.stdout.write(`[${new Date().toISOString()}] ✓ Job queue started and index-repo queue created\n`);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		process.stderr.write(`Failed to start job queue: ${errorMessage}\n`);
		throw error;
	}

	// Start indexing worker
	try {
		const queue = getQueue();
		await startIndexWorker(queue);
		process.stdout.write(`[${new Date().toISOString()}] ✓ Indexing worker registered\n`);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		process.stderr.write(`Failed to start indexing worker: ${errorMessage}\n`);
		throw error;
	}

	// Create Express app
	process.stdout.write(`[${new Date().toISOString()}] Creating Express app...\n`);
	const app = createExpressApp(supabase);
	process.stdout.write(`[${new Date().toISOString()}] ✓ Express app created\n`);

	// Start server
	const server = app.listen(PORT, () => {
		process.stdout.write(`KotaDB server listening on http://localhost:${PORT}\n`);
		process.stdout.write(`Connected to Supabase at ${supabaseUrl}\n`);
	});

	// Graceful shutdown
	process.on("SIGTERM", async () => {
		process.stdout.write("SIGTERM signal received: closing HTTP server\n");

		// Stop queue first (drains in-flight jobs)
		try {
			await stopQueue();
		} catch (error) {
			process.stderr.write(
				`Error stopping queue: ${error instanceof Error ? error.message : String(error)}\n`,
			);
		}

		// Then close HTTP server
		server.close(() => {
			process.stdout.write("HTTP server closed\n");
			process.exit(0);
		});
	});
}

bootstrap().catch((error) => {
	// Extract error details for better diagnostics
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorStack = error instanceof Error ? error.stack : undefined;
	const errorName = error instanceof Error ? error.name : "Unknown";

	process.stderr.write("Failed to start server:\n");
	process.stderr.write(`  Error: ${errorName}\n`);
	process.stderr.write(`  Message: ${errorMessage}\n`);
	if (errorStack) {
		process.stderr.write(`  Stack:\n${errorStack}\n`);
	}
	process.exit(1);
});
