import { createExpressApp } from "@api/routes";
import { getServiceClient } from "@db/client";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { startIndexWorker } from "@queue/workers/index-repo";

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
		console.warn(
			"[Warning] GITHUB_WEBHOOK_SECRET not configured. Webhook endpoint will reject all requests.",
		);
	} else if (webhookSecret.length < 16) {
		console.warn(
			"[Warning] GITHUB_WEBHOOK_SECRET is too short (minimum 16 characters recommended).",
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

	// Start job queue
	try {
		await startQueue();
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		console.error(`Failed to start job queue: ${errorMessage}`);
		throw error;
	}

	// Start indexing worker
	try {
		const queue = getQueue();
		await startIndexWorker(queue);
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		console.error(`Failed to start indexing worker: ${errorMessage}`);
		throw error;
	}

	// Create Express app
	const app = createExpressApp(supabase);

	// Start server
	const server = app.listen(PORT, () => {
		console.log(`KotaDB server listening on http://localhost:${PORT}`);
		console.log(`Connected to Supabase at ${supabaseUrl}`);
	});

	// Graceful shutdown
	process.on("SIGTERM", async () => {
		console.log("SIGTERM signal received: closing HTTP server");

		// Stop queue first (drains in-flight jobs)
		try {
			await stopQueue();
		} catch (error) {
			console.error(
				`Error stopping queue: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Then close HTTP server
		server.close(() => {
			console.log("HTTP server closed");
			process.exit(0);
		});
	});
}

bootstrap().catch((error) => {
	console.error("Failed to start server", error);
	process.exit(1);
});
