/**
 * Test server lifecycle helpers for Express app testing.
 */

import type { Server } from "node:http";
import { createExpressApp } from "@api/routes";
import type { Express } from "express";
import { getSupabaseTestClient } from "./db";
import { startQueue, stopQueue, getQueue } from "@queue/client";
import { QUEUE_NAMES } from "@queue/config";
import { startIndexWorker } from "@queue/workers/index-repo";

/**
 * Start a test server instance
 *
 * @returns Server instance, Express app, and base URL
 */
export async function startTestServer(): Promise<{
	app: Express;
	server: Server;
	url: string;
}> {
	const supabase = getSupabaseTestClient();

	// Start job queue
	await startQueue();

	// Create queues before registering workers
	const queue = getQueue();
	await queue.createQueue(QUEUE_NAMES.INDEX_REPO);

	// Start indexing worker
	await startIndexWorker(queue);

	const app = createExpressApp(supabase);

	// Use a random port for parallel test execution
	const port = 0; // 0 = assign random available port

	return new Promise((resolve, reject) => {
		const server = app.listen(port, () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to get server address"));
				return;
			}

			const url = `http://localhost:${address.port}`;
			console.log(`Test server started on ${url}`);
			resolve({ app, server, url });
		});

		server.on("error", reject);
	});
}

/**
 * Stop a test server instance
 *
 * @param server - Server instance to stop
 */
export async function stopTestServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close(async (err) => {
			if (err) {
				reject(err);
			} else {
				// Stop job queue
				try {
					await stopQueue();
				} catch (error) {
					// Ignore errors if queue was already stopped
				}
				console.log("Test server stopped");
				resolve();
			}
		});
	});
}
